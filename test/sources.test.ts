import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRemoteDxb } from '../src/sources/feeds.ts';
import { fromJSearch } from '../src/sources/jsearch.ts';
import { workdayPostedAt } from '../src/sources/enterprise.ts';

test('RemoteDXB: reads title, company, link, and date from each RSS item', () => {
  const xml = `<rss><channel>
    <item>
      <title><![CDATA[Senior iOS Engineer, Core & Discovery]]></title>
      <link>https://www.remotedxb.com/job/senior-ios-engineer-acme--3632001</link>
      <pubDate>Wed, 18 Nov 2026 07:20:05 +0000</pubDate>
      <category>Software Development</category>
      <remoteDxb:companyName><![CDATA[Acme]]></remoteDxb:companyName>
    </item>
    <item><title><![CDATA[No link]]></title></item>
  </channel></rss>`;
  const jobs = parseRemoteDxb(xml);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    id: 'remotedxb:3632001',
    source: 'remotedxb',
    company: 'Acme',
    title: 'Senior iOS Engineer, Core & Discovery',
    location: 'Remote, open to UAE residents',
    country: 'ae',
    department: 'Software Development',
    remote: true,
    url: 'https://www.remotedxb.com/job/senior-ios-engineer-acme--3632001',
    postedAt: '2026-11-18T07:20:05.000Z',
  });
});

test('JSearch: maps a result and keeps the site Google found it on', () => {
  const job = fromJSearch({
    job_id: 'abc123==',
    job_title: 'Flutter Developer',
    employer_name: 'Noon',
    job_publisher: 'LinkedIn',
    job_apply_link: 'https://www.linkedin.com/jobs/view/1',
    job_city: 'Dubai',
    job_country: 'AE',
    job_posted_at_timestamp: 1_789_000_000,
  });
  assert.equal(job?.id, 'google:abc123==');
  assert.equal(job?.via, 'LinkedIn');
  assert.equal(job?.location, 'Dubai, AE');
  assert.equal(job?.country, 'ae');
  assert.equal(job?.postedAt, new Date(1_789_000_000_000).toISOString());
  assert.equal(fromJSearch({ job_id: 'x', job_title: 'No link' }), null);

  const now = new Date('2026-11-18T12:00:00Z');
  const relative = fromJSearch({ job_id: 'y', job_title: 'Flutter', job_apply_link: 'https://x', job_location: 'Dubai  •  via LinkedIn', job_posted_at: '3 days ago' }, now);
  assert.equal(relative?.location, 'Dubai');
  assert.equal(relative?.postedAt, '2026-11-15T12:00:00.000Z');
});

test('Workday: turns "Posted N Days Ago" into a date, and gives up on "30+"', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  assert.equal(workdayPostedAt('Posted Today', now), now.toISOString());
  assert.equal(workdayPostedAt('Posted Yesterday', now), '2026-11-17T12:00:00.000Z');
  assert.equal(workdayPostedAt('Posted 3 Days Ago', now), '2026-11-15T12:00:00.000Z');
  assert.equal(workdayPostedAt('Posted 30+ Days Ago', now), undefined);
});
