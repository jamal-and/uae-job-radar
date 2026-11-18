// What the radar watches and what counts as a match. Edit this file to change either; the next run
// picks it up.
import type { Company } from './src/types.ts';

/**
 * Company boards to read. Each was checked to have UAE openings on its public board in November 2026.
 * To add one, find its board slug with `npm run discover -- <guess> <guess>`.
 */
export const companies: Company[] = [
  { name: 'Careem', ats: 'greenhouse', slug: 'careem' },
  { name: 'Tamara', ats: 'greenhouse', slug: 'tamara' },
  { name: 'Deliveroo', ats: 'greenhouse', slug: 'deliveroo' },
  { name: 'Binance', ats: 'greenhouse', slug: 'binance' },
  { name: 'Binance', ats: 'lever', slug: 'binance' },
  { name: 'Bybit', ats: 'greenhouse', slug: 'bybit' },
  { name: 'Aldar', ats: 'lever', slug: 'aldar' },
  { name: 'Spotify', ats: 'lever', slug: 'spotify' },
  { name: 'Ziina', ats: 'ashby', slug: 'ziina' },
  { name: 'Lean Technologies', ats: 'ashby', slug: 'leantech' },
  { name: 'Delivery Hero (talabat)', ats: 'smartrecruiters', slug: 'deliveryhero' },
  { name: 'Namshi', ats: 'smartrecruiters', slug: 'namshi' },
  { name: 'Foodics', ats: 'workable', slug: 'foodics' },
  { name: 'SmartCrowd', ats: 'workable', slug: 'smartcrowd' },
  { name: 'ElevenLabs', ats: 'ashby', slug: 'elevenlabs' },
  { name: 'Poolside', ats: 'ashby', slug: 'poolside' },
  { name: 'Sardine', ats: 'ashby', slug: 'sardine' },
  { name: 'OKX', ats: 'greenhouse', slug: 'okx' },
  { name: 'Rondo Energy', ats: 'greenhouse', slug: 'rondoenergy' },
  { name: 'Toptal', ats: 'lever', slug: 'toptal' },

  // Large employers, searched by `searchTerms` below. The slug is copied from the careers address:
  // https://visa.wd5.myworkdayjobs.com/en-US/Visa/...  → 'visa.wd5/Visa'
  // https://xyz.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/... → 'xyz.fa.em2/CX_1'
  { name: 'Visa', ats: 'workday', slug: 'visa.wd5/Visa' },
  { name: 'Thomson Reuters', ats: 'workday', slug: 'thomsonreuters.wd5/External_Career_Site' },
  { name: 'Emirates NBD', ats: 'oracle', slug: 'fa-evlo-saasfaprod1.fa.ocs/CX_1' },
  { name: 'DP World', ats: 'oracle', slug: 'ehpv.fa.em2/CX_1' },
];

/** Job boards searched as a whole rather than one company at a time. */
export const feeds = {
  /** RemoteDXB's feed of remote roles open to people living in the UAE. Every run. */
  remotedxb: true,
  /**
   * Workable's own job search (jobs.workable.com), which covers every company on Workable, searched
   * with `profile.searchTerms`. Every 30 minutes, to stay well within its rate limit.
   */
  workableSearch: { enabled: true, everyMinutes: 30 },
  /**
   * Getro boards: the job boards investment funds run for the startups they back, with links to each
   * company's own careers page. Searched with `profile.searchTerms` every 30 minutes. To add one,
   * find `"network":{"id":"…"` in the source of the board's /jobs page.
   */
  getro: {
    everyMinutes: 30,
    boards: [
      { name: 'Hub71', id: 9266 }, // jobs.hub71.com, Abu Dhabi's startup hub
      { name: 'MEVP', id: 1034 }, // jobs.mevp.com, Middle East Venture Partners
    ],
  },
};

/**
 * Google for Jobs through JSearch (RapidAPI). Needs JSEARCH_API_KEY. Each query is one request, and
 * the free plan allows 200 a month: three queries every 12 hours is about 180.
 *
 * In November 2026, Google's UAE results for mobile roles came almost entirely from aggregators that
 * copy postings, which `trustedHosts` drops, so this source finds little for now. It costs nothing
 * to leave on, and it picks up the occasional job on LinkedIn or a company site.
 */
export const jsearch = {
  queries: ['flutter developer', 'mobile developer', 'mobile engineer'],
  everyHours: 12,
  /** How far back to look: 'today', '3days', 'week', or 'month'. */
  datePosted: '3days',
  /**
   * Only jobs with a link on one of these sites are sent; aggregators that copy postings (some ask
   * for payment to apply) are dropped. Subdomains count, so 'greenhouse.io' covers boards.greenhouse.io.
   */
  trustedHosts: [
    // Job sites
    'linkedin.com', 'bayt.com', 'indeed.com', 'gulftalent.com', 'naukrigulf.com', 'glassdoor.com',
    'glassdoor.ae', 'dubizzle.com', 'wellfound.com', 'remotedxb.com',
    // Company careers systems
    'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'smartrecruiters.com', 'myworkdayjobs.com',
    'oraclecloud.com', 'bamboohr.com', 'recruitee.com', 'teamtailor.com', 'breezy.hr', 'zohorecruit.com',
    'personio.de', 'personio.com', 'jobvite.com', 'icims.com', 'successfactors.com', 'taleo.net',
    // Recruitment agencies in the UAE
    'michaelpage.ae', 'hays.ae', 'robertwalters.ae', 'charterhouseme.ae',
  ],
};

/**
 * Workday and Oracle boards are searched once an hour rather than every run: they belong to large
 * companies that post less often, and their servers limit how often they can be asked.
 */
export const enterpriseEveryMinutes = 60;

export const profile = {
  /** What to search for on systems that are searched rather than read whole (Workday, Oracle). */
  searchTerms: ['flutter', 'mobile', 'ios', 'android'],
  /** Points for each word or phrase found in the title or department. */
  keywords: {
    flutter: 10,
    dart: 6,
    mobile: 5,
    ios: 3,
    android: 3,
    'react native': 2,
    swift: 2,
    kotlin: 2,
  } as Record<string, number>,
  /** Added on top, but only when a keyword matched. */
  seniority: {
    senior: 3,
    lead: 3,
    staff: 3,
    principal: 2,
    head: 2,
  } as Record<string, number>,
  /**
   * Words that mark a hands-on tech role. A title with none of them, such as "Mobile Marketing
   * Manager", keeps only half its score.
   */
  roles: ['engineer', 'engineering', 'developer', 'development', 'programmer', 'architect', 'sde', 'swe'],
  /** Any of these in the title rules the job out. */
  exclude: ['intern', 'internship', 'junior', 'graduate', 'trainee', 'working student'],
  /** Jobs scoring at least this are sent straight away. */
  minScore: 5,
  /** Also count remote roles open to the region (MENA, GCC, EMEA, Middle East). */
  includeRegionalRemote: true,
};

export type Profile = typeof profile;
