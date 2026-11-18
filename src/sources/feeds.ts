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
