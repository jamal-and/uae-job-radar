// Shows what the radar makes of the alert emails in the mailbox, read or not, without changing
// anything. With --save it also writes each email to samples/ (ignored by git), to tune a parser
// against when a site changes its layout.
//
//   npm run inbox            # last 7 days
//   npm run inbox -- --save
import { mkdir, writeFile } from 'node:fs/promises';
import { connect, fetchAlerts } from '../src/email/inbox.ts';
import { parseAlert } from '../src/email/parse.ts';

const user = process.env.GMAIL_USER;
const password = process.env.GMAIL_APP_PASSWORD;
if (!user || !password) {
  console.error('Set GMAIL_USER and GMAIL_APP_PASSWORD in .env first.');
  process.exit(1);
}
const save = process.argv.includes('--save');

const client = connect({ user, password });
await client.connect();
const lock = await client.getMailboxLock('INBOX', { readOnly: true });
try {
  const alerts = await fetchAlerts(client, { since: new Date(Date.now() - 7 * 86_400_000) });
  if (alerts.length === 0) console.log('No alert emails from LinkedIn, Bayt, Indeed, Naukrigulf, or GulfTalent in the last 7 days.');
  if (save) await mkdir(new URL('../samples/', import.meta.url), { recursive: true });

  for (const alert of alerts) {
    const jobs = parseAlert(alert.site, alert.html, alert.receivedAt);
    console.log(`\n${alert.site} · ${alert.receivedAt.toISOString().slice(0, 16)} · ${alert.subject}`);
    if (jobs.length === 0) console.log('  ! no jobs found in this email');
    for (const job of jobs) console.log(`  • ${job.title} | ${job.company || '?'} | ${job.location || '?'} | ${job.url}`);
    if (save) await writeFile(new URL(`../samples/${alert.site}-${alert.uid}.html`, import.meta.url), alert.html);
  }
  if (save && alerts.length) console.log('\nSaved to samples/.');
} finally {
  lock.release();
  await client.logout();
}
