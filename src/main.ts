// One run of the radar: read every source, keep UAE jobs, find the ones not seen before, send the
// ones that match. The scheduled workflow runs this every ten minutes.
//
// Sources, in the order a duplicate is kept: company boards (the most direct link), the RemoteDXB
// feed, Google for Jobs through JSearch (every few hours, to fit its quota), and alert emails.
import { companies, enterpriseEveryMinutes, feeds, jsearch as jsearchConfig, profile } from '../radar.config.ts';
import { fetchAll } from './sources/index.ts';
import { remoteDxb } from './sources/feeds.ts';
import { jsearch } from './sources/jsearch.ts';
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

const warn = (what: string, error: unknown) => console.warn(`! ${what}: ${error instanceof Error ? error.message : error}`);

/** True when a rationed source last ran at least this long ago (with five minutes of slack for late runs). */
const due = (name: string, minutes: number) =>
  now.getTime() - (state.lastRun?.[name] ? new Date(state.lastRun[name]).getTime() : 0) >= (minutes - 5) * 60_000;
const markRan = (name: string) => (state.lastRun = { ...state.lastRun, [name]: now.toISOString() });

const isEnterprise = (company: (typeof companies)[number]) => company.ats === 'workday' || company.ats === 'oracle';
const enterpriseDue = due('enterprise', enterpriseEveryMinutes);
const boards = companies.filter((company) => enterpriseDue || !isEnterprise(company));
const { jobs: boardJobs, failures } = await fetchAll(boards, { searchTerms: profile.searchTerms });
if (enterpriseDue) markRan('enterprise');
for (const { company, error } of failures) warn(`${company.name} (${company.ats}/${company.slug})`, error);

let feedJobs: Job[] = [];
if (feeds.remotedxb) {
  try {
    feedJobs = await remoteDxb();
  } catch (error) {
    warn('RemoteDXB', error);
  }
}

// JSearch runs only when its interval has passed since the last successful search.
const jsearchKey = clean(process.env.JSEARCH_API_KEY);
let googleJobs: Job[] = [];
if (jsearchKey && due('jsearch', jsearchConfig.everyHours * 60)) {
  try {
    googleJobs = await jsearch(jsearchKey, jsearchConfig.queries, jsearchConfig.datePosted, jsearchConfig);
    markRan('jsearch');
  } catch (error) {
    warn('JSearch', error);
  }
}

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

if (failures.length === boards.length && feedJobs.length === 0 && googleJobs.length === 0 && !inbox) {
  console.error('Every source failed; nothing to do.');
  process.exit(1);
}

// Alerts are set up for the UAE already, and often leave the location out, so they only drop jobs
// whose location says somewhere else.
const emailJobs = (inbox?.jobs ?? []).filter((job) => !job.location || inUae(job, profile));
const jobs = [...boardJobs, ...feedJobs, ...googleJobs];
const uae = [...jobs.filter((job) => inUae(job, profile)), ...emailJobs];
// Which sources answered before this run. Read before this run's jobs are marked seen below. Older
// state files have no list of sources; the ids of jobs already seen tell the same story.
const known = new Set(
  state.sources ??
    Object.keys(state.seen)
      .filter((key) => !key.startsWith('fp:'))
      .map((key) => key.slice(0, key.lastIndexOf(':'))),
);

const fresh: Job[] = [];
for (const job of uae) {
  const keys = [job.id, fingerprint(job)];
  if (!keys.some((key) => key in state.seen)) fresh.push(job);
  // Marked as we go, so a copy on a second board in this same run is not new either.
  for (const key of keys) state.seen[key] ??= now.toISOString();
}

/** The source a job came from: its id without the last part, such as `greenhouse:careem`. */
const sourceOf = (job: Job) => job.id.slice(0, job.id.lastIndexOf(':'));
const sourceName = (job: Job) => (job.source === 'remotedxb' ? 'RemoteDXB' : job.source === 'google' ? 'Google Jobs' : job.company);

const scored = (list: Job[]) =>
  list
    .map((job) => ({ job, match: score(job, profile) }))
    .filter(({ match }) => match.score >= profile.minScore)
    .sort((a, b) => b.match.score - a.match.score);

const counts = [
  `${boardJobs.length} jobs on ${boards.length - failures.length}/${boards.length} boards${enterpriseDue ? '' : ' (Workday and Oracle not due)'}`,
  feeds.remotedxb && `${feedJobs.length} on RemoteDXB`,
  jsearchKey && (googleJobs.length || state.lastRun?.jsearch === now.toISOString() ? `${googleJobs.length} on Google Jobs` : 'Google Jobs not due'),
  inbox && `${inbox.jobs.length} in alert emails`,
  `${uae.length} in the UAE`,
  `${fresh.length} new`,
];
console.log(counts.filter(Boolean).join(' · '));

if (firstRun) {
  // Everything is "new" the first time, so instead of a flood, one message with what's open now.
  // `fresh` is every UAE job here, with copies on a second board already dropped.
  const matches = scored(fresh);
  const heading = `<b>UAE job radar is on.</b>\nWatching ${companies.length} company boards${feeds.remotedxb ? ' and RemoteDXB' : ''}, with ${uae.length} UAE openings. From now on, new matches arrive here as they're posted.\n\n${matches.length ? `Open now and matching (${matches.length}):` : 'Nothing open matches your profile right now.'}`;
  await bot.send(matches.length ? digestMessage(heading, matches) : { html: heading });
} else {
  // A source added since the last run (a new company, a feed, Google Jobs) would make everything it
  // has look new. Like a first run, it gets one message with what's open, and only its later jobs
  // arrive one by one. Alert emails are always news, so they never count as a new source.
  const fromEmail = new Set(emailJobs);
  const introduced = fresh.filter((job) => !fromEmail.has(job) && !known.has(sourceOf(job)));
  const regular = fresh.filter((job) => !introduced.includes(job));

  if (introduced.length) {
    const added = [...new Set(introduced.map(sourceName))];
    const intro = scored(introduced);
    console.log(`New sources: ${added.join(', ')} · ${intro.length} matching`);
    if (intro.length) {
      await bot.send(digestMessage(`<b>Now also watching ${added.length} new source${added.length === 1 ? '' : 's'}.</b>\nOpen now and matching (${intro.length}):`, intro));
    }
  }

  const matches = scored(regular);
  if (matches.length > BURST) {
    await bot.send(digestMessage(`<b>${matches.length} new matching jobs</b>`, matches));
  } else {
    for (const { job, match } of matches) await bot.send(jobMessage(job, match, now));
  }
  console.log(`${matches.length} sent`);
}

// Remember every source that answered, so the next run knows which ones are new.
state.sources = [...new Set([...(state.sources ?? []), ...jobs.map(sourceOf)])].sort();

// A local run without Telegram is a preview: it leaves the state alone, so the real first run still
// happens on the schedule.
if (bot.dryRun) {
  console.log('\nDry run (no TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID): state not saved, emails left unread.');
} else {
  await saveState(STATE_PATH, state, now);
}
// Only now that the jobs are sent and remembered: a run that failed before this reads them again.
await inbox?.done({ markRead: !bot.dryRun });
