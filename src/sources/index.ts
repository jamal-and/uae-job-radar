// One adapter per applicant tracking system. Each reads the system's public job-board API: the same
// JSON the company's own careers page loads, with no key needed.
import type { Ats, Company, Job, Source } from '../types.ts';
import { getJson } from '../http.ts';

const id = (company: Company, native: string | number) => `${company.ats}:${company.slug}:${native}`;

const greenhouse: Source = async (company) => {
  const data = await getJson<{
    jobs: { id: number; title: string; absolute_url: string; location?: { name?: string }; first_published?: string; updated_at?: string }[];
  }>(`https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`);
  return data.jobs.map((job) => ({
    id: id(company, job.id),
    source: 'greenhouse',
    company: company.name,
    title: job.title,
    location: job.location?.name ?? '',
    url: job.absolute_url,
    postedAt: job.first_published ?? job.updated_at,
  }));
};

const lever: Source = async (company) => {
  const data = await getJson<
    {
      id: string;
      text: string;
      hostedUrl: string;
      createdAt?: number;
      country?: string;
      workplaceType?: string;
      categories?: { location?: string; allLocations?: string[]; department?: string; team?: string };
    }[]
  >(`https://api.lever.co/v0/postings/${company.slug}?mode=json`);
  return data.map((job) => ({
    id: id(company, job.id),
    source: 'lever',
    company: company.name,
    title: job.text,
    location: (job.categories?.allLocations ?? [job.categories?.location ?? '']).join(' / '),
    country: job.country?.toLowerCase(),
    department: job.categories?.department ?? job.categories?.team,
    remote: job.workplaceType === 'remote',
    url: job.hostedUrl,
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
  }));
};

const ashby: Source = async (company) => {
  const data = await getJson<{
    jobs: {
      id: string;
      title: string;
      jobUrl: string;
      location?: string;
      secondaryLocations?: { location?: string }[];
      department?: string;
      isRemote?: boolean;
      publishedAt?: string;
      isListed?: boolean;
      address?: { postalAddress?: { addressCountry?: string } } | null;
    }[];
  }>(`https://api.ashbyhq.com/posting-api/job-board/${company.slug}`);
  return data.jobs
    .filter((job) => job.isListed !== false)
    .map((job) => ({
      id: id(company, job.id),
      source: 'ashby',
      company: company.name,
      title: job.title,
      location: [job.location, ...(job.secondaryLocations ?? []).map((l) => l.location), job.address?.postalAddress?.addressCountry]
        .filter(Boolean)
        .join(' / '),
      department: job.department,
      remote: job.isRemote,
      url: job.jobUrl,
      postedAt: job.publishedAt,
    }));
};

const workable: Source = async (company) => {
  const data = await getJson<{
    jobs: { shortcode: string; title: string; url: string; city?: string; state?: string; country?: string; department?: string; telecommuting?: boolean; published_on?: string; created_at?: string }[];
  }>(`https://apply.workable.com/api/v1/widget/accounts/${company.slug}`);
  return data.jobs.map((job) => ({
    id: id(company, job.shortcode),
    source: 'workable',
    company: company.name,
    title: job.title,
    location: [job.city, job.state, job.country].filter(Boolean).join(', '),
    department: job.department,
    remote: job.telecommuting,
    url: job.url,
    postedAt: job.published_on ?? job.created_at,
  }));
};

const smartrecruiters: Source = async (company) => {
  type Page = {
    totalFound: number;
    content: { id: string; name: string; releasedDate?: string; location?: { city?: string; country?: string; remote?: boolean }; department?: { label?: string } }[];
  };
  // Big employers list thousands of jobs worldwide, so ask for the UAE only, a page at a time.
  const jobs: Page['content'] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await getJson<Page>(`https://api.smartrecruiters.com/v1/companies/${company.slug}/postings?country=ae&limit=100&offset=${offset}`);
    jobs.push(...page.content);
    if (jobs.length >= page.totalFound || page.content.length === 0) break;
  }
  return jobs.map((job) => ({
    id: id(company, job.id),
    source: 'smartrecruiters',
    company: company.name,
    title: job.name,
    location: job.location?.city ?? '',
    country: job.location?.country?.toLowerCase(),
    department: job.department?.label,
    remote: job.location?.remote,
    url: `https://jobs.smartrecruiters.com/${company.slug}/${job.id}`,
    postedAt: job.releasedDate,
  }));
};

export const sources: Record<Ats, Source> = { greenhouse, lever, ashby, workable, smartrecruiters };

/** Reads every board at once. A board that fails is reported, and the rest still count. */
export async function fetchAll(companies: Company[]): Promise<{ jobs: Job[]; failures: { company: Company; error: string }[] }> {
  const results = await Promise.allSettled(companies.map((company) => sources[company.ats](company)));
  const jobs: Job[] = [];
  const failures: { company: Company; error: string }[] = [];
  results.forEach((result, i) => {
    const company = companies[i]!;
    if (result.status === 'fulfilled') jobs.push(...result.value);
    else failures.push({ company, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  });
  return { jobs, failures };
}
