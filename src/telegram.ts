// Sends messages through the Telegram Bot API. Without a token and chat id it prints them instead,
// so a local run shows exactly what would have been sent.
import type { Job } from './types.ts';
import type { Score } from './match.ts';

export interface Message {
  html: string;
  /** One button under the message, such as "Apply". */
  button?: { text: string; url: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SOURCE_NAMES: Record<Job['source'], string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  smartrecruiters: 'SmartRecruiters',
  linkedin: 'LinkedIn',
  bayt: 'Bayt',
  indeed: 'Indeed',
  naukrigulf: 'Naukrigulf',
  gulftalent: 'GulfTalent',
};

function age(postedAt: string | undefined, now: Date): string | null {
  if (!postedAt) return null;
  const minutes = Math.round((now.getTime() - new Date(postedAt).getTime()) / 60_000);
  if (Number.isNaN(minutes) || minutes < 0) return null;
  if (minutes < 60) return `posted ${minutes} min ago`;
  if (minutes < 48 * 60) return `posted ${Math.round(minutes / 60)} h ago`;
  return `posted ${Math.round(minutes / 1440)} days ago`;
}

/** One job, as its own message with an Apply button. */
export function jobMessage(job: Job, match: Score, now = new Date()): Message {
  const details = [job.location, age(job.postedAt, now)].filter(Boolean).join(' · ');
  return {
    html: [
      `<b>${escapeHtml(job.title)}</b>`,
      escapeHtml(job.company),
      escapeHtml(details),
      `<i>Score ${match.score} · ${escapeHtml(match.matched.join(', '))} · ${SOURCE_NAMES[job.source]}</i>`,
    ].join('\n'),
    button: { text: 'Apply', url: job.url },
  };
}

/** Several jobs in one message, for the first run and for unusually busy runs. */
export function digestMessage(heading: string, items: { job: Job; match: Score }[], limit = 15): Message {
  const lines = items.slice(0, limit).map(({ job, match }) => `• <a href="${escapeHtml(job.url)}">${escapeHtml(job.title)}</a> · ${escapeHtml(job.company)} · ${match.score}`);
  if (items.length > limit) lines.push(`…and ${items.length - limit} more.`);
  return { html: [heading, '', ...lines].join('\n') };
}

export interface Telegram {
  send(message: Message): Promise<void>;
  readonly dryRun: boolean;
}

export function telegram(token: string | undefined, chatId: string | undefined): Telegram {
  if (!token || !chatId) {
    return {
      dryRun: true,
      async send(message) {
        const text = message.html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        console.log(`\n── would send ──\n${text}${message.button ? `\n[${message.button.text}] ${message.button.url}` : ''}`);
      },
    };
  }

  return {
    dryRun: false,
    async send(message) {
      const body = {
        chat_id: chatId,
        text: message.html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(message.button && { reply_markup: { inline_keyboard: [[message.button]] } }),
      };
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
        const data = (await response.json()) as { ok: boolean; description?: string; parameters?: { retry_after?: number } };
        if (data.ok) break;
        // Telegram says how long to wait when it rate-limits.
        if (response.status === 429 && attempt < 2) {
          await sleep(((data.parameters?.retry_after ?? 5) + 1) * 1000);
          continue;
        }
        throw new Error(`Telegram: ${data.description ?? response.status}`);
      }
      // Stay well under Telegram's limit of about one message a second per chat.
      await sleep(1100);
    },
  };
}
