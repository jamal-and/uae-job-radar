# UAE job radar

Sends new job openings in the UAE that match your profile to Telegram, a few minutes after they're posted.

Every ten minutes, a GitHub Actions run reads the public job boards of the companies in [`radar.config.ts`](radar.config.ts), keeps the jobs in the UAE, and scores each new one against your profile. A match arrives as its own message, with an Apply button.

## How it works

```
company boards → same shape → UAE only → not seen before → score → Telegram
```

- **Sources.** Companies publish their openings through applicant tracking systems: Greenhouse, Lever, Ashby, Workable, and SmartRecruiters. Each has a public JSON API, the same one the company's careers page loads, so the radar needs no keys and scrapes nothing. One adapter per system lives in [`src/sources`](src/sources/index.ts).
- **Scoring.** Points for keywords in the title (Flutter, Dart, Mobile, iOS…), more for seniority, half for titles with no engineering word ("Mobile Marketing Manager"), and zero for excluded words (Intern, Junior). Jobs at `minScore` or above are sent. Everything is in [`radar.config.ts`](radar.config.ts).
- **Seen jobs.** [`data/seen.json`](data/seen.json) holds the id of every job seen, plus a fingerprint of company, title, and city, so the same opening on two boards is sent once. The workflow commits it back after each run, but only when something changed.
- **First run.** Every job is new the first time, so instead of a flood the radar sends one message listing what matches right now. After that, only new jobs.

## Setup

1. **Create the bot.** In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and follow the steps. It replies with a token.
2. **Find your chat id.** Send your new bot any message. Then put the token in `.env` (copy `.env.example`) and run:
   ```bash
   npm run chat-id
   ```
3. **Add the secrets on GitHub.** In the repository, open Settings → Secrets and variables → Actions, and add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
4. **Start it.** Open Actions → Radar → Run workflow. The first run sends the "radar is on" message, and the schedule takes over from there.

## Running locally

```bash
npm install
npm run radar      # with no Telegram values in .env, prints what it would send and saves nothing
npm test
npm run typecheck
```

Node 24 or later runs the TypeScript directly, so the radar itself has no dependencies.

## Adding a company

Find out which board system it uses:

```bash
npm run discover -- kitopi property-finder propertyfinder
```

Each hit prints a line to paste into `companies` in `radar.config.ts`, with its number of UAE jobs.

## Limits

- GitHub may start scheduled runs a few minutes late when it is busy.
- In a private repository, the free plan includes 2,000 Actions minutes a month. A run every ten minutes uses about 4,300, so for a private repository set the schedule to every 30 minutes. Public repositories have no limit.
- Many large employers in the UAE use systems without a public API (Workday, SuccessFactors, Oracle), and job sites like LinkedIn and Bayt aren't covered yet. The next phase reads the job-alert emails those sites send.
