// Turns a job-alert email into jobs. Each site sends its own layout, so instead of relying on it, the
// parser looks for links to job pages (which every alert has), and reads the title, company, and
// location from the text around each link.
import { parse, type HTMLElement } from 'node-html-parser';
import type { Job, Site } from '../types.ts';

interface SiteRule {
  /** Matches the sender's domain. */
  from: RegExp;
  /** Finds a job page link and returns the job's id on that site. */
  jobId: (url: URL) => string | null;
  /** A clean link to the job, without tracking. */
  canonical: (id: string, url: URL) => string;
}

const lastPathNumber = (url: URL, min = 5) => url.pathname.match(new RegExp(`(\\d{${min},})/?$`))?.[1] ?? null;

export const SITES: Record<Site, SiteRule> = {
  linkedin: {
    from: /(^|\.)linkedin\.com$/i,
    jobId: (url) => (/linkedin\.com$/i.test(url.hostname) ? (url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/)?.[1] ?? null) : null),
    canonical: (id) => `https://www.linkedin.com/jobs/view/${id}`,
  },
  indeed: {
    from: /(^|\.)(indeed\.com|indeedemail\.com)$/i,
    jobId: (url) => (/indeed\.com$/i.test(url.hostname) ? (url.searchParams.get('jk') ?? url.searchParams.get('vjk')) : null),
    canonical: (id) => `https://ae.indeed.com/viewjob?jk=${id}`,
  },
  bayt: {
    from: /(^|\.)bayt\.com$/i,
    jobId: (url) => (/bayt\.com$/i.test(url.hostname) && /\/jobs\//.test(url.pathname) ? lastPathNumber(url) : null),
    canonical: (_id, url) => `https://www.bayt.com${url.pathname}`,
  },
  naukrigulf: {
    from: /(^|\.)naukrigulf\.com$/i,
    jobId: (url) =>
      /naukrigulf\.com$/i.test(url.hostname) ? (url.pathname.match(/jid-(\d{6,})/)?.[1] ?? url.searchParams.get('jid') ?? null) : null,
    canonical: (_id, url) => `https://www.naukrigulf.com${url.pathname}`,
  },
  gulftalent: {
    from: /(^|\.)gulftalent\.com$/i,
    jobId: (url) => (/gulftalent\.com$/i.test(url.hostname) && /\/jobs?\//.test(url.pathname) ? lastPathNumber(url, 4) : null),
    canonical: (_id, url) => `https://www.gulftalent.com${url.pathname}`,
  },
};

/** Which site sent this email, from its From address. */
export function siteFor(fromAddress: string): Site | null {
  const domain = fromAddress.split('@').pop()?.toLowerCase().replace(/>$/, '') ?? '';
  for (const [site, rule] of Object.entries(SITES) as [Site, SiteRule][]) if (rule.from.test(domain)) return site;
  return null;
}

/**
 * Alert links often go through a click tracker first, with the real address in a parameter. Returns
 * the link itself and any address found inside it.
 */
function candidates(href: string): URL[] {
  const urls: URL[] = [];
  try {
    const url = new URL(href);
    urls.push(url);
    for (const value of url.searchParams.values()) if (/^https?%3A|^https?:/i.test(value)) urls.push(...candidates(decodeURIComponent(value)));
  } catch {
    // Not an absolute link, such as mailto: or a fragment.
  }
  return urls;
}

/** Text that is a button or boilerplate, never a job title. */
const NOISE = /^(apply|apply now|easy apply|view( job)?|view details|see (all|more)( jobs)?|more jobs|save|unsubscribe|new|promoted|actively recruiting|be an early applicant|\d+ (applicants?|connections?).*|\d+\s*(min|minutes?|h|hours?|d|days?|weeks?) ago|just now|today)$/i;
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The text lines of the smallest block around the link that holds more than the title. */
function contextLines(anchor: HTMLElement, title: string): string[] {
  let node: HTMLElement | null = anchor.parentNode;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentNode) {
    const lines = node.structuredText
      .split('\n')
      .map(clean)
      .filter((line) => line && !NOISE.test(line));
    const at = lines.findIndex((line) => line.includes(title));
    if (at !== -1 && lines.length > at + 1) return lines.slice(at + 1, at + 4);
  }
  return [];
}

/** Company and location from the lines after the title, which sites write in a few different ways. */
function companyAndLocation(lines: string[]): { company: string; location: string } {
  const [first = '', second = ''] = lines;
  // "Company · Dubai, United Arab Emirates" or "Company - Dubai"
  const split = first.split(/\s+[·•|–-]\s+/);
  if (split.length >= 2) return { company: split[0]!, location: split.slice(1).join(', ') };
  return { company: first, location: second };
}

/** Extracts the jobs from one alert email. Returns an empty list if it finds no job links. */
export function parseAlert(site: Site, html: string, receivedAt?: Date): Job[] {
  const rule = SITES[site];
  const root = parse(html);
  const byId = new Map<string, { url: URL; anchors: HTMLElement[] }>();

  for (const anchor of root.querySelectorAll('a[href]')) {
    for (const url of candidates(anchor.getAttribute('href') ?? '')) {
      const id = rule.jobId(url);
      if (!id) continue;
      const entry = byId.get(id) ?? { url, anchors: [] };
      entry.anchors.push(anchor);
      byId.set(id, entry);
      break;
    }
  }

  const jobs: Job[] = [];
  for (const [id, { url, anchors }] of byId) {
    // One job usually has several links: its logo, its title, an Apply button. The title is the
    // longest text that isn't a button.
    const titled = anchors
      .map((anchor) => ({ anchor, text: clean(anchor.text) }))
      .filter(({ text }) => text.length > 2 && !NOISE.test(text))
      .sort((a, b) => b.text.length - a.text.length);
    const best = titled[0];
    if (!best) continue;

    const { company, location } = companyAndLocation(contextLines(best.anchor, best.text));
    jobs.push({
      id: `${site}:${id}`,
      source: site,
      company,
      title: best.text,
      location,
      url: rule.canonical(id, url),
      postedAt: receivedAt?.toISOString(),
    });
  }
  return jobs;
}
