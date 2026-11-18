// Reads job-alert emails from a mailbox kept just for them, over IMAP. Gmail needs an app password:
// Google Account → Security → 2-Step Verification → App passwords.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { Job, Site } from '../types.ts';
import { parseAlert, siteFor } from './parse.ts';

export interface Alert {
  uid: number;
  site: Site;
  subject: string;
  receivedAt: Date;
  html: string;
}

export interface Inbox {
  jobs: Job[];
  /** Alerts from a known site in which the parser found no jobs: a sign its layout changed. */
  unparsed: Alert[];
  /** Marks the alerts that gave jobs as read, so the next run skips them, and disconnects. */
  done(options: { markRead: boolean }): Promise<void>;
}

export interface MailboxLogin {
  user: string;
  password: string;
  host?: string;
}

export function connect({ user, password, host = 'imap.gmail.com' }: MailboxLogin): ImapFlow {
  // Gmail shows app passwords in groups of four; spaces are fine to paste but not to send.
  return new ImapFlow({ host, port: 993, secure: true, auth: { user, pass: password.replace(/\s+/g, '') }, logger: false });
}

/** Fetches alerts from known job sites, newest last. */
export async function fetchAlerts(client: ImapFlow, query: { seen?: boolean; since: Date }): Promise<Alert[]> {
  const uids = (await client.search({ ...query }, { uid: true })) || [];
  const alerts: Alert[] = [];
  if (uids.length === 0) return alerts;
  for await (const message of client.fetch(uids, { uid: true, envelope: true, source: true }, { uid: true })) {
    const from = message.envelope?.from?.[0]?.address ?? '';
    const site = siteFor(from);
    if (!site || !message.source) continue;
    const mail = await simpleParser(message.source);
    const html = typeof mail.html === 'string' ? mail.html : (mail.textAsHtml ?? '');
    alerts.push({ uid: message.uid, site, subject: mail.subject ?? '', receivedAt: mail.date ?? new Date(), html });
  }
  return alerts;
}

/**
 * Reads unread alerts from the last week and parses them into jobs. A week covers alerts that piled
 * up before the mailbox was connected; jobs already seen are skipped either way.
 */
export async function readInbox(login: MailboxLogin, days = 7): Promise<Inbox> {
  const client = connect(login);
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const alerts = await fetchAlerts(client, { seen: false, since: new Date(Date.now() - days * 86_400_000) });
    const jobs: Job[] = [];
    const unparsed: Alert[] = [];
    const parsed: number[] = [];
    for (const alert of alerts) {
      const found = parseAlert(alert.site, alert.html, alert.receivedAt);
      if (found.length === 0) unparsed.push(alert);
      else {
        jobs.push(...found);
        parsed.push(alert.uid);
      }
    }
    return {
      jobs,
      unparsed,
      async done({ markRead }) {
        try {
          if (markRead && parsed.length) await client.messageFlagsAdd(parsed, ['\\Seen'], { uid: true });
        } finally {
          lock.release();
          await client.logout();
        }
      },
    };
  } catch (error) {
    lock.release();
    await client.logout().catch(() => {});
    throw error;
  }
}
