// Google for Jobs, through JSearch on RapidAPI. Google gathers postings from LinkedIn, Bayt, Indeed,
// GulfTalent, and company sites, so one search covers them all. The free plan allows 200 requests a
// month, so the radar searches every few hours instead of every run; see `jsearch` in the config.
import type { Job } from '../types.ts';
import { getJson } from '../http.ts';

interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name?: string;
  job_publisher?: string;
  job_apply_link?: string;
  job_google_link?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_location?: string;
  job_is_remote?: boolean;
  job_posted_at_datetime_utc?: string | null;
  job_posted_at_timestamp?: number | null;
  /** Relative, such as "3 days ago", when the exact time is missing. */
  job_posted_at?: string | null;
}

/** "3 days ago", "5 hours ago", "1 day ago": a date, roughly. */
function fromRelative(text: string | null | undefined, now: Date): string | undefined {
  const match = text?.match(/(\d+)\s*(minute|hour|day|week)s?\s+ago/i);
  if (!match) return undefined;
  const unit = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[match[2]!.toLowerCase() as 'minute'];
  return new Date(now.getTime() - Number(match[1]) * unit).toISOString();
}

/** Maps one JSearch result, whose field names have shifted between versions, onto a job. */
export function fromJSearch(job: JSearchJob, now = new Date()): Job | null {
  const url = job.job_apply_link ?? job.job_google_link;
  if (!job.job_id || !job.job_title || !url) return null;
  const posted =
    job.job_posted_at_datetime_utc ??
    (job.job_posted_at_timestamp ? new Date(job.job_posted_at_timestamp * 1000).toISOString() : fromRelative(job.job_posted_at, now));
  // Google adds the site to the location ("Dubai  •  via LinkedIn"); the site is shown apart.
  const location = (job.job_location ?? [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ')).split('•')[0]!.trim();
  return {
    id: `google:${job.job_id}`,
    source: 'google',
    via: job.job_publisher,
    company: job.employer_name ?? '',
    title: job.job_title,
    location,
    country: job.job_country?.toLowerCase(),
    remote: job.job_is_remote,
    url,
    postedAt: posted,
  };
}

/**
 * Runs each query once (one request each, ten results) for jobs in the UAE posted recently. Google
 * often lists one opening several times, once per site that carries it, sometimes in different
 * emirates; only the first copy is kept.
 */
export async function jsearch(apiKey: string, queries: string[], datePosted: string): Promise<Job[]> {
  const jobs = new Map<string, Job>();
  const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (const query of queries) {
    const params = new URLSearchParams({
      query: `${query} in United Arab Emirates`,
      page: '1',
      num_pages: '1',
      country: 'ae',
      language: 'en',
      date_posted: datePosted,
    });
    const response = await getJson<{ data?: JSearchJob[] | { jobs?: JSearchJob[] } }>(`https://jsearch.p.rapidapi.com/search-v2?${params}`, {
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'jsearch.p.rapidapi.com' },
    });
    const results = Array.isArray(response.data) ? response.data : (response.data?.jobs ?? []);
    for (const result of results) {
      const job = fromJSearch(result);
      const key = job && `${norm(job.company)}|${norm(job.title)}`;
      if (job && key && !jobs.has(key)) jobs.set(key, job);
    }
  }
  return [...jobs.values()];
}
