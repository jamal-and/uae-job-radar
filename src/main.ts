// One run of the radar: read every board and every new alert email, keep UAE jobs, find the ones
// not seen before, send the ones that match. The scheduled workflow runs this every ten minutes.
import { companies, profile } from '../radar.config.ts';
import { fetchAll } from './sources/index.ts';
import { readInbox, type Inbox } from './email/inbox.ts';
import { fingerprint, inUae, score } from './match.ts';
import { loadState, saveState, type State } from './state.ts';
import { digestMessage, jobMessage, telegram } from './telegram.ts';
import type { Job } from './types.ts';

const STATE_PATH = new URL('../data/seen.json', import.meta.url).pathname;
/** More new matches than this in one run arrive as a single digest instead of one message each. */
const BURST = 8;

const now = new Date();
// Pasted secrets often bring spaces, quotes, or a newline along.
const clean = (value: string | undefined) => value?.trim().replace(/^["']|["']$/g, '') || undefined;
const bot = telegram(clean(process.env.TELEGRAM_BOT_TOKEN), clean(process.env.TELEGRAM_CHAT_ID));
const previous = await loadState(STATE_PATH);
const firstRun = previous === null;
const state: State = previous ?? { version: 1, seen: {} };

const { jobs, failures } = await fetchAll(companies);
for (const { company, error } of failures) console.warn(`! ${company.name} (${company.ats}/${company.slug}): ${error}`);

// Alert emails are optional: without a mailbox, the radar reads the boards only.
const gmailUser = clean(process.env.GMAIL_USER);
const gmailPassword = clean(process.env.GMAIL_APP_PASSWORD);
let inbox: Inbox | null = null;
if (gmailUser && gmailPassword) {
  try {
    inbox = await readInbox({ user: gmailUser, password: gmailPassword });
    for (const alert of inbox.unparsed) console.warn(`! No jobs found in a ${alert.site} email: "${alert.subject}". Its layout may have changed.`);
  } catch (error) {
    console.warn(`! Mailbox: ${error instanceof Error ? error.message : error}`);
  }
}

if (failures.length === companies.length && !inbox) {
  console.error('Every source failed; nothing to do.');
  process.exit(1);
}

// Alerts are set up for the UAE already, and often leave the location out, so they only drop jobs
// whose location says somewhere else.
const emailJobs = (inbox?.jobs ?? []).filter((job) => !job.location || inUae(job, profile));
const uae = [...jobs.filter((job) => inUae(job, profile)), ...emailJobs];
const fresh: Job[] = [];
for (const job of uae) {
  const keys = [job.id, fingerprint(job)];
  if (!keys.some((key) => key in state.seen)) fresh.push(job);
  // Marked as we go, so a copy on a second board in this same run is not new either.
  for (const key of keys) state.seen[key] ??= now.toISOString();
}

const scored = (list: Job[]) =>
  list
    .map((job) => ({ job, match: score(job, profile) }))
    .filter(({ match }) => match.score >= profile.minScore)
    .sort((a, b) => b.match.score - a.match.score);

console.log(
  `${jobs.length} jobs on ${companies.length - failures.length}/${companies.length} boards · ${inbox ? `${inbox.jobs.length} in alert emails · ` : ''}${uae.length} in the UAE · ${fresh.length} new`,
);

if (firstRun) {
  // Everything is "new" the first time, so instead of a flood, one message with what's open now.
  // `fresh` is every UAE job here, with copies on a second board already dropped.
  const matches = scored(fresh);
  const heading = `<b>UAE job radar is on.</b>\nWatching ${companies.length} boards with ${uae.length} UAE openings. From now on, new matches arrive here as they're posted.\n\n${matches.length ? `Open now and matching (${matches.length}):` : 'Nothing open matches your profile right now.'}`;
  await bot.send(matches.length ? digestMessage(heading, matches) : { html: heading });
} else {
  const matches = scored(fresh);
  if (matches.length > BURST) {
    await bot.send(digestMessage(`<b>${matches.length} new matching jobs</b>`, matches));
  } else {
    for (const { job, match } of matches) await bot.send(jobMessage(job, match, now));
  }
  console.log(`${matches.length} sent`);
}

// A local run without Telegram is a preview: it leaves the state alone, so the real first run still
// happens on the schedule.
if (bot.dryRun) {
  console.log('\nDry run (no TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID): state not saved, emails left unread.');
} else {
  await saveState(STATE_PATH, state, now);
}
// Only now that the jobs are sent and remembered: a run that failed before this reads them again.
await inbox?.done({ markRead: !bot.dryRun });
