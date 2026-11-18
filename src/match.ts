import type { Job } from './types.ts';
import type { Profile } from '../radar.config.ts';

const UAE = /\b(u\.?a\.?e|united arab emirates|dubai|abu dhabi|sharjah|ajman|ras al[ -]?khaimah|fujairah|umm al[ -]?quwain|al ain)\b/i;
const REGION = /\b(mena|gcc|emea|middle east|gulf)\b/i;

/** True when the job is in the UAE, or is remote and open to the region if the profile allows it. */
export function inUae(job: Job, profile: Pick<Profile, 'includeRegionalRemote'>): boolean {
  if (job.country === 'ae' || UAE.test(job.location)) return true;
  return profile.includeRegionalRemote && job.remote === true && REGION.test(job.location);
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, word: string) => new RegExp(`\\b${escape(word)}\\b`, 'i').test(text);

export interface Score {
  score: number;
  /** The keywords that matched, for the message. */
  matched: string[];
}

/** Scores a job against the profile, from its title and department. */
export function score(job: Job, profile: Profile): Score {
  if (profile.exclude.some((word) => has(job.title, word))) return { score: 0, matched: [] };

  const text = `${job.title} ${job.department ?? ''}`;
  const matched = Object.keys(profile.keywords).filter((word) => has(text, word));
  if (matched.length === 0) return { score: 0, matched };

  let total = matched.reduce((sum, word) => sum + profile.keywords[word]!, 0);
  for (const [word, points] of Object.entries(profile.seniority)) if (has(job.title, word)) total += points;
  if (!profile.roles.some((word) => has(text, word))) total /= 2;
  return { score: total, matched };
}

/**
 * The same opening often sits on two boards, with small differences in the title. This key ignores
 * case, punctuation, and the board, so the second copy counts as already seen.
 */
export function fingerprint(job: Job): string {
  const norm = (text: string) =>
    text
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const city = job.location.match(UAE)?.[0]?.toLowerCase() ?? 'uae';
  return `fp:${norm(job.company)}|${norm(job.title)}|${norm(city)}`;
}
