// Job boards that publish a feed. RemoteDXB lists remote roles open to people living in the UAE.
import type { Job } from '../types.ts';

const USER_AGENT = 'uae-job-radar/0.1 (personal job alerts)';

const decode = (text: string) =>
  text
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();

/** One tag's text inside an RSS item, CDATA or not. */
const tag = (item: string, name: string) => {
  const match = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decode(match[1]!) : '';
};

/** Parses the RemoteDXB RSS feed. Kept apart from the fetch so tests can feed it a sample. */
export function parseRemoteDxb(xml: string): Job[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.flatMap((item) => {
    const url = tag(item, 'link');
    const id = url.match(/-(\d+)\/?$/)?.[1] ?? url;
    const title = tag(item, 'title');
    if (!url || !title) return [];
    const published = tag(item, 'pubDate');
    return [
      {
        id: `remotedxb:${id}`,
        source: 'remotedxb' as const,
        company: tag(item, 'remoteDxb:companyName'),
        title,
        location: 'Remote, open to UAE residents',
        country: 'ae',
        department: tag(item, 'category'),
        remote: true,
        url,
        postedAt: published ? new Date(published).toISOString() : undefined,
      },
    ];
  });
}

export async function remoteDxb(): Promise<Job[]> {
  const response = await fetch('https://www.remotedxb.com/rss', {
    headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from RemoteDXB`);
  return parseRemoteDxb(await response.text());
}

/** One job from Workable's own job search, jobs.workable.com, which covers every company on Workable. */
interface WorkableSearchJob {
  id: string;
  title: string;
  url: string;
  created?: string;
  workplace?: string;
  location?: { city?: string; subregion?: string | null; countryName?: string };
  company?: { title?: string };
}

export function fromWorkableSearch(job: WorkableSearchJob): Job {
  const location = [job.location?.city, job.location?.countryName].filter(Boolean).join(', ');
  return {
    id: `workable-search:${job.id}`,
    source: 'workable',
    company: job.company?.title ?? '',
    title: job.title,
    location,
    country: job.location?.countryName === 'United Arab Emirates' ? 'ae' : undefined,
    remote: job.workplace === 'remote' || /\bremote\b/i.test(job.title),
    url: job.url,
    postedAt: job.created,
  };
}

/**
 * Searches jobs.workable.com once per term for jobs in the UAE: the first page of each, with a pause
 * between searches. Results come by relevance, and a search term narrows them to the roles that
 * matter, so new jobs show up on that first page.
 */
export async function workableSearch(searchTerms: string[]): Promise<Job[]> {
  const jobs = new Map<string, Job>();
  for (const [i, term] of searchTerms.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    const params = new URLSearchParams({ query: term, location: 'United Arab Emirates' });
    const response = await fetch(`https://jobs.workable.com/api/v1/jobs?${params}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from Workable job search`);
    const data = (await response.json()) as { jobs?: WorkableSearchJob[] };
    for (const job of data.jobs ?? []) jobs.set(job.id, fromWorkableSearch(job));
  }
  return [...jobs.values()];
}

/** One job from a Getro board, the job boards investment funds run for their portfolio companies. */
interface GetroJob {
  id: number;
  title: string;
  url: string;
  created_at?: number;
  work_mode?: string;
  locations?: string[];
  searchable_locations?: string[];
  organization?: { name?: string };
}

export function fromGetro(job: GetroJob, board: string): Job {
  const inUae = (job.searchable_locations ?? []).some((place) => /united arab emirates/i.test(place));
  return {
    id: `getro-${board.toLowerCase()}:${job.id}`,
    source: 'getro',
    via: board,
    company: job.organization?.name ?? '',
    title: job.title,
    location: (job.locations ?? []).join(' / '),
    country: inUae ? 'ae' : undefined,
    remote: job.work_mode === 'remote',
    url: job.url,
    postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : undefined,
  };
}

/**
 * Searches one Getro board once per term, newest matches first page only, with a pause between
 * searches. The board's id is in its page source (`"network":{"id":"9266"`).
 */
export async function getro(board: { name: string; id: number }, searchTerms: string[]): Promise<Job[]> {
  const jobs = new Map<number, Job>();
  for (const [i, term] of searchTerms.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await fetch(`https://api.getro.com/api/v2/collections/${board.id}/search/jobs`, {
      method: 'POST',
      headers: { 'user-agent': USER_AGENT, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ hitsPerPage: 20, page: 0, query: term }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from Getro (${board.name})`);
    const data = (await response.json()) as { results?: { jobs?: GetroJob[] } };
    for (const job of data.results?.jobs ?? []) jobs.set(job.id, fromGetro(job, board.name));
  }
  return [...jobs.values()];
}
