// The layouts here are made up, in the shapes these sites tend to use: a card per job, the same job
// linked from its logo, title, and button, and links wrapped in click trackers. Real alert emails
// saved with `npm run inbox -- --save` are the better test once they exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAlert, siteFor } from '../src/email/parse.ts';

test('knows each site by its sender', () => {
  assert.equal(siteFor('jobalerts-noreply@linkedin.com'), 'linkedin');
  assert.equal(siteFor('Indeed <alert@indeed.com>'), 'indeed');
  assert.equal(siteFor('noreply@mail.bayt.com'), 'bayt');
  assert.equal(siteFor('jobs@naukrigulf.com'), 'naukrigulf');
  assert.equal(siteFor('alerts@gulftalent.com'), 'gulftalent');
  assert.equal(siteFor('no-reply@accounts.google.com'), null);
  assert.equal(siteFor('someone@notlinkedin.com'), null);
});

test('LinkedIn: one job per card, with company and location from the line under the title', () => {
  const card = (id: string, title: string, line: string) => `
    <table><tr><td>
      <a href="https://www.linkedin.com/comm/jobs/view/${id}/?trackingId=abc&refId=x"><img alt="logo"></a>
    </td><td>
      <a href="https://www.linkedin.com/comm/jobs/view/${id}/?trackingId=abc">${title}</a>
      <p>${line}</p>
      <p>Actively recruiting</p>
      <a href="https://www.linkedin.com/comm/jobs/view/${id}/apply">Easy Apply</a>
    </td></tr></table>`;
  const html = `<html><body><h1>Your job alert for flutter developer</h1>
    ${card('4012345678', 'Senior Flutter Developer', 'Careem · Dubai, United Arab Emirates')}
    ${card('4087654321', 'Mobile Engineer', 'Tabby · Dubai, United Arab Emirates (On-site)')}
    <a href="https://www.linkedin.com/comm/jobs/search?keywords=flutter">See all jobs</a>
  </body></html>`;

  const jobs = parseAlert('linkedin', html, new Date('2026-11-18T06:00:00Z'));
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs[0], {
    id: 'linkedin:4012345678',
    source: 'linkedin',
    title: 'Senior Flutter Developer',
    company: 'Careem',
    location: 'Dubai, United Arab Emirates',
    url: 'https://www.linkedin.com/jobs/view/4012345678',
    postedAt: '2026-11-18T06:00:00.000Z',
  });
  assert.equal(jobs[1]!.company, 'Tabby');
});

test('Indeed: links through a click tracker, company and location on separate lines', () => {
  const html = `
    <div>
      <a href="https://click.indeed.com/track?u=${encodeURIComponent('https://ae.indeed.com/rc/clk/dl?jk=1a2b3c4d5e6f7a8b&from=ja')}">Flutter Developer</a>
      <div>Noon</div>
      <div>Dubai</div>
      <div>2 days ago</div>
    </div>`;
  const [job] = parseAlert('indeed', html);
  assert.equal(job?.id, 'indeed:1a2b3c4d5e6f7a8b');
  assert.equal(job?.title, 'Flutter Developer');
  assert.equal(job?.company, 'Noon');
  assert.equal(job?.location, 'Dubai');
  assert.equal(job?.url, 'https://ae.indeed.com/viewjob?jk=1a2b3c4d5e6f7a8b');
});

test('Bayt: job id from the end of the path, tracking dropped', () => {
  const html = `<div><a href="https://www.bayt.com/en/uae/jobs/senior-mobile-developer-flutter-5123456/?utm_source=alert">Senior Mobile Developer (Flutter)</a><br>Emirates NBD - Dubai</div>`;
  const [job] = parseAlert('bayt', html);
  assert.equal(job?.id, 'bayt:5123456');
  assert.equal(job?.url, 'https://www.bayt.com/en/uae/jobs/senior-mobile-developer-flutter-5123456/');
  assert.equal(job?.company, 'Emirates NBD');
  assert.equal(job?.location, 'Dubai');
});

test('an email with no job links gives no jobs', () => {
  assert.deepEqual(parseAlert('linkedin', '<p>Confirm your email address</p><a href="https://www.linkedin.com/feed">Open</a>'), []);
});
