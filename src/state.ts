// Which jobs the radar has already seen, kept in a JSON file that the scheduled run commits back.
// It only changes when something new appears, so the history stays quiet.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

export interface State {
  version: 1;
  /** Job ids and fingerprints, each with the date it was first seen. */
  seen: Record<string, string>;
  /** When rationed sources last ran, such as `jsearch`. */
  lastRun?: Record<string, string>;
  /** Every source that has answered so far, such as `greenhouse:careem` or `remotedxb`. */
  sources?: string[];
}

/** Forget entries after this long, so the file doesn't grow forever. */
const KEEP_DAYS = 180;

/** Returns null when there is no file yet: the first run. */
export async function loadState(path: string): Promise<State | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as State;
}

export async function saveState(path: string, state: State, now = new Date()): Promise<void> {
  const cutoff = now.getTime() - KEEP_DAYS * 86_400_000;
  const seen = Object.fromEntries(
    Object.entries(state.seen)
      .filter(([, date]) => new Date(date).getTime() >= cutoff)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(path, `${JSON.stringify({ version: 1, ...(state.lastRun && { lastRun: state.lastRun }), ...(state.sources && { sources: state.sources }), seen }, null, 2)}\n`);
}
