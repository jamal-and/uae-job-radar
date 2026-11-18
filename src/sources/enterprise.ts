// Workday and Oracle Cloud, the systems most large employers in the UAE use. Their careers pages load
// jobs from a JSON endpoint that needs no login; the radar asks it the same questions the page does.
// These endpoints aren't documented, so a tenant may answer differently or change without notice.
//
// Both systems hold every job a global company has, so instead of reading thousands, the radar runs
// one keyword search per search term and keeps the UAE results.
import type { Company, Job, SourceOptions } from '../types.ts';
import { getJson } from '../http.ts';

/** A pause between one company's searches, so the radar asks at the pace of a person browsing. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 2000));

/** `visa.wd5/Visa` → host `visa.wd5.myworkdayjobs.com`, tenant `visa`, site `Visa`. */
function workdayParts(slug: string) {
  const [hostPrefix = '', site = ''] = slug.split('/');
  return { host: `${hostPrefix}.myworkdayjobs.com`, tenant: hostPrefix.split('.')[0]!, site };
}

/** "Posted Today", "Posted Yesterday", "Posted 3 Days Ago"; "30+ Days" is too vague to use. */
export function workdayPostedAt(postedOn: string | undefined, now = new Date()): string | undefined {
  if (!postedOn) return undefined;
  const days = /today/i.test(postedOn) ? 0 : /yesterday/i.test(postedOn) ? 1 : Number(postedOn.match(/(\d+) days? ago/i)?.[1] ?? NaN);
  if (Number.isNaN(days) || /\+/.test(postedOn)) return undefined;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export async function workday(company: Company, { searchTerms }: SourceOptions): Promise<Job[]> {
  const { host, tenant, site } = workdayParts(company.slug);
  const api = `https://${host}/wday/cxs/${tenant}/${site}`;
  type Posting = { title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[] };

  const postings = new Map<string, Posting>();
  for (const [i, term] of searchTerms.entries()) {
    if (i > 0) await pause();
    const page = await getJson<{ jobPostings?: Posting[] }>(`${api}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: term }),
    });
    for (const posting of page.jobPostings ?? []) postings.set(posting.externalPath, posting);
  }

  const jobs: Job[] = [];
  for (const posting of postings.values()) {
    let location = posting.locationsText ?? '';
    // A job in several places only says "3 Locations" in the list; its own page names them.
    if (/^\d+ locations$/i.test(location)) {
      try {
        await pause();
        const detail = await getJson<{ jobPostingInfo?: { location?: string; additionalLocations?: string[] } }>(`${api}${posting.externalPath}`);
        location = [detail.jobPostingInfo?.location, ...(detail.jobPostingInfo?.additionalLocations ?? [])].filter(Boolean).join(' / ');
      } catch {
        // Keep "3 Locations": the job is dropped as not in the UAE, which is the safe side.
      }
    }
    jobs.push({
      id: `workday:${company.slug}:${posting.bulletFields?.[0] ?? posting.externalPath}`,
      source: 'workday',
      company: company.name,
      title: posting.title,
      location,
      url: `https://${host}/en-US/${site}${posting.externalPath}`,
      postedAt: workdayPostedAt(posting.postedOn),
    });
  }
  return jobs;
}

/** `fa-evlo-saasfaprod1.fa.ocs/CX_1` → host `fa-evlo-saasfaprod1.fa.ocs.oraclecloud.com`, site `CX_1`. */
export async function oracle(company: Company, { searchTerms }: SourceOptions): Promise<Job[]> {
  const [hostPrefix = '', site = 'CX_1'] = company.slug.split('/');
  const host = `${hostPrefix}.oraclecloud.com`;
  type Requisition = {
    Id: string;
    Title: string;
    PrimaryLocation?: string;
    PrimaryLocationCountry?: string;
    PostedDate?: string;
    WorkplaceType?: string;
    secondaryLocations?: { Name?: string; CountryCode?: string }[];
  };

  const requisitions = new Map<string, Requisition>();
  for (const [i, term] of searchTerms.entries()) {
    if (i > 0) await pause();
    const finder = `findReqs;siteNumber=${site},limit=25,keyword="${term}",sortBy=POSTING_DATES_DESC`;
    const data = await getJson<{ items?: { requisitionList?: Requisition[] }[] }>(
      `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=${encodeURIComponent(finder)}`,
    );
    for (const requisition of data.items?.[0]?.requisitionList ?? []) requisitions.set(requisition.Id, requisition);
  }

  return [...requisitions.values()].map((requisition) => {
    const secondary = requisition.secondaryLocations ?? [];
    const inUae = requisition.PrimaryLocationCountry === 'AE' || secondary.some((location) => location.CountryCode === 'AE');
    return {
      id: `oracle:${company.slug}:${requisition.Id}`,
      source: 'oracle',
      company: company.name,
      title: requisition.Title,
      location: [requisition.PrimaryLocation, ...secondary.map((location) => location.Name)].filter(Boolean).join(' / '),
      country: inUae ? 'ae' : requisition.PrimaryLocationCountry?.toLowerCase(),
      remote: /remote/i.test(requisition.WorkplaceType ?? ''),
      url: `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${requisition.Id}`,
      postedAt: requisition.PostedDate ? new Date(requisition.PostedDate).toISOString() : undefined,
    };
  });
}
