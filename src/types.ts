/** The applicant tracking systems whose public job-board APIs the radar reads. */
export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters';

/** The job sites whose alert emails the radar reads. */
export type Site = 'linkedin' | 'bayt' | 'indeed' | 'naukrigulf' | 'gulftalent';

/** One company board to watch: which system it uses, and its name in that system's URLs. */
export interface Company {
  name: string;
  ats: Ats;
  slug: string;
}

/** A job opening, in the same shape whatever system it came from. */
export interface Job {
  /** Stable across runs: `{ats}:{slug}:{id}` for a company board, `{site}:{id}` for a job site. */
  id: string;
  /** Where the radar found it. */
  source: Ats | Site;
  company: string;
  title: string;
  /** Free text from the source, such as "Dubai, United Arab Emirates". */
  location: string;
  /** ISO country code when the source gives one, lower case ("ae"). */
  country?: string;
  department?: string;
  remote?: boolean;
  url: string;
  /** When the source says it was published, as an ISO date. */
  postedAt?: string;
}

/** Turns one company board into jobs. Throws when the board can't be read. */
export type Source = (company: Company) => Promise<Job[]>;
