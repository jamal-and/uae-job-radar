import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, saveState } from '../src/state.ts';
import { digestMessage, jobMessage } from '../src/telegram.ts';
import type { Job } from '../src/types.ts';

test('no file means first run; saving drops old entries and sorts the rest', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'radar-')), 'seen.json');
  assert.equal(await loadState(path), null);

  const now = new Date('2026-11-18T00:00:00Z');
  await saveState(path, { version: 1, seen: { b: '2026-11-17T00:00:00Z', a: '2026-11-01T00:00:00Z', old: '2026-01-01T00:00:00Z' } }, now);

  assert.deepEqual(Object.keys((await loadState(path))!.seen), ['a', 'b']);
  assert.ok((await readFile(path, 'utf8')).endsWith('\n'));
});

const job: Job = {
  id: 'ashby:acme:1',
  source: 'ashby',
  company: 'Acme & Co',
  title: 'Senior <Flutter> Developer',
  location: 'Dubai',
  url: 'https://example.com/a?b=1&c=2',
  postedAt: '2026-11-17T23:40:00Z',
};

test('messages escape HTML and say how fresh the job is', () => {
  const message = jobMessage(job, { score: 13, matched: ['flutter'] }, new Date('2026-11-18T00:00:00Z'));
  assert.match(message.html, /Senior &lt;Flutter&gt; Developer/);
  assert.match(message.html, /Acme &amp; Co/);
  assert.match(message.html, /posted 20 min ago/);
  assert.deepEqual(message.button, { text: 'Apply', url: job.url });
});

test('a digest lists the top jobs and counts the rest', () => {
  const items = Array.from({ length: 4 }, () => ({ job, match: { score: 13, matched: ['flutter'] } }));
  const message = digestMessage('<b>New</b>', items, 3);
  assert.equal(message.html.match(/•/g)?.length, 3);
  assert.match(message.html, /and 1 more/);
  assert.match(message.html, /href="https:\/\/example\.com\/a\?b=1&amp;c=2"/);
});
