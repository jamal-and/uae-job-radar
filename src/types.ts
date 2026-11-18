/** The applicant tracking systems whose public job-board APIs the radar reads. */
export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters';

/** One company board to watch: which system it uses, and its name in that system's URLs. */
export interface Company {
  name: string;
  ats: Ats;
  slug: string;
}

/** A job opening, in the same shape whatever system it came from. */
export interface Job {
  /** Stable across runs: `{ats}:{slug}:{id in that system}`. */
  id: string;
  ats: Ats;
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
