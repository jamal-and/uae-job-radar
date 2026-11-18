# UAE job radar

Sends new job openings in the UAE that match your profile to Telegram, a few minutes after they're posted.

Every ten minutes, a GitHub Actions run reads its sources, keeps the jobs in the UAE, and scores each new one against your profile:

- the public job boards of the companies in [`radar.config.ts`](radar.config.ts), including large employers on Workday and Oracle Cloud;
- the [RemoteDXB](https://www.remotedxb.com) feed of remote roles open to UAE residents;
- Google for Jobs, which covers LinkedIn, Bayt, Indeed, GulfTalent, and company sites, through JSearch;
- job-alert emails from LinkedIn, Bayt, Indeed, Naukrigulf, and GulfTalent.
 A match arrives as its own message, with an Apply button.

## How it works

```
company boards ─┐
RemoteDXB      ─┤
Google Jobs    ─┼→ same shape → UAE only → not seen before → score → Telegram
alert emails   ─┘
```

- **Sources.** Companies publish their openings through applicant tracking systems: Greenhouse, Lever, Ashby, Workable, and SmartRecruiters. Each has a public JSON API, the same one the company's careers page loads, so the radar needs no keys and scrapes nothing. One adapter per system lives in [`src/sources`](src/sources/index.ts). Workday and Oracle, which large employers use, hold every job a global company has, so the radar runs one keyword search per `searchTerms` entry instead, once an hour, with a pause between searches ([`enterprise.ts`](src/sources/enterprise.ts)). Their endpoints are the ones the companies' careers pages use; they aren't documented, so a company may stop answering, and one that rate-limits the radar is simply skipped that run.
- **Google for Jobs.** [JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) searches it for jobs in the UAE. Its free plan allows 200 requests a month, so the radar runs its three queries every 12 hours (`jsearch` in the config), about 180 a month. Google also lists aggregators that copy postings, and some of them ask for payment before you can apply, so only jobs with a link to a trusted site (`trustedHosts`: company careers systems and known job sites) are kept, and that link is the one sent. For mobile roles in the UAE, most of Google's results are aggregators, so expect few jobs from here.
- **Alert emails.** Job sites don't offer an API, but they all email alerts. The radar reads them from a mailbox kept for them, over IMAP, and finds each job by its link: every alert links to its jobs, whatever the layout. The title is the link's text, and the company and location come from the lines under it. It's in [`src/email`](src/email/parse.ts). An email that gives jobs is marked read; one that gives none stays unread and is reported in the run's log, since it usually means a site changed its layout.
- **Scoring.** Points for keywords in the title (Flutter, Dart, Mobile, iOS…), more for seniority, half for titles with no engineering word ("Mobile Marketing Manager"), and zero for excluded words (Intern, Junior). Jobs at `minScore` or above are sent. Everything is in [`radar.config.ts`](radar.config.ts).
- **Seen jobs.** [`data/seen.json`](data/seen.json) holds the id of every job seen, plus a fingerprint of company, title, and city, so the same opening on two boards is sent once. The workflow commits it back after each run, but only when something changed.
- **First run, and new sources.** Every job is new the first time, so instead of a flood the radar sends one message listing what matches right now. The same goes for a source added later, such as a new company: one message with what it has open, then only its new jobs.

## Setup

1. **Create the bot.** In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and follow the steps. It replies with a token.
2. **Find your chat id.** Send your new bot any message. Then put the token in `.env` (copy `.env.example`) and run:
   ```bash
   npm run chat-id
   ```
3. **Add the secrets on GitHub.** In the repository, open Settings → Secrets and variables → Actions, and add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
4. **Optional: Google for Jobs.** Sign up at [RapidAPI](https://rapidapi.com), subscribe to JSearch's free plan, copy your key, and add it as the `JSEARCH_API_KEY` secret.
5. **Optional: alert emails.** See below.
6. **Start it.** Open Actions → Radar → Run workflow. The first run sends the "radar is on" message, and the schedule takes over from there.

## Alert emails

1. **Create a Gmail address just for alerts.** Its inbox should hold nothing else.
2. **Turn on 2-Step Verification** for it, then create an app password: Google Account → Security → 2-Step Verification → App passwords. Google shows it once.
3. **Set up alerts** with that address on LinkedIn, Bayt, Indeed, Naukrigulf, and GulfTalent: your keywords (such as Flutter, Mobile developer), the UAE as location, and daily or instant frequency where a site offers it.
4. **Check them locally.** Put `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env` once alerts have arrived, then:
   ```bash
   npm run inbox            # what the radar finds in each alert, changing nothing
   npm run inbox -- --save  # also saves each email to samples/, which git ignores
   ```
5. **Add `GMAIL_USER` and `GMAIL_APP_PASSWORD`** as repository secrets.

## Running locally

```bash
npm install
npm run radar      # with no Telegram values in .env, prints what it would send and saves nothing
npm test
npm run typecheck
```

Node 24 or later runs the TypeScript directly, with no build step.

## Adding a company

Find out which board system it uses:

```bash
npm run discover -- kitopi property-finder propertyfinder
```

Each hit prints a line to paste into `companies` in `radar.config.ts`, with its number of UAE jobs.

For a company on Workday or Oracle, open any of its jobs and copy the slug from the address:

| Address | Entry |
|---|---|
| `https://visa.wd5.myworkdayjobs.com/en-US/Visa/job/...` | `{ name: 'Visa', ats: 'workday', slug: 'visa.wd5/Visa' }` |
| `https://ehpv.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/...` | `{ name: 'DP World', ats: 'oracle', slug: 'ehpv.fa.em2/CX_1' }` |

## Limits

- GitHub may start scheduled runs a few minutes late when it is busy.
- In a private repository, the free plan includes 2,000 Actions minutes a month. A run every ten minutes uses about 4,300, so for a private repository set the schedule to every 30 minutes. Public repositories have no limit.
- Many large employers in the UAE use systems without a public API (Workday, SuccessFactors, Oracle). Their jobs reach the radar only through the job sites' alerts.
- An alert arrives when the site sends it, which can be hours after the job is posted, depending on the site and the frequency you chose.
