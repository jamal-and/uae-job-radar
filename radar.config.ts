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
];

export const profile = {
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
