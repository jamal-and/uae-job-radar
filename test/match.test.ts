import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, inUae, score } from '../src/match.ts';
import { profile } from '../radar.config.ts';
import type { Job } from '../src/types.ts';

const job = (fields: Partial<Job>): Job => ({
  id: 'greenhouse:acme:1',
  source: 'greenhouse',
  company: 'Acme',
  title: 'Engineer',
  location: 'Dubai, United Arab Emirates',
  url: 'https://example.com/1',
  ...fields,
});

test('finds UAE jobs by city, country, or country code', () => {
  assert.ok(inUae(job({ location: 'Abu Dhabi' }), profile));
  assert.ok(inUae(job({ location: 'Remote / UAE' }), profile));
  assert.ok(inUae(job({ location: 'Ras Al Khaimah' }), profile));
  assert.ok(inUae(job({ location: '', country: 'ae' }), profile));
  assert.ok(!inUae(job({ location: 'Riyadh, Saudi Arabia' }), profile));
  assert.ok(!inUae(job({ location: 'London' }), profile));
});

test('counts regional remote roles only when the profile says so', () => {
  const remote = job({ location: 'Remote - MENA', remote: true });
  assert.ok(inUae(remote, { includeRegionalRemote: true }));
  assert.ok(!inUae(remote, { includeRegionalRemote: false }));
  assert.ok(!inUae(job({ location: 'MENA' }), { includeRegionalRemote: true }), 'not remote');
});

test('a senior Flutter role scores high', () => {
  const result = score(job({ title: 'Senior Flutter Developer' }), profile);
  assert.equal(result.score, 13);
  assert.deepEqual(result.matched, ['flutter']);
});

test('mobile engineering roles pass, mobile marketing does not', () => {
  assert.ok(score(job({ title: 'Mobile Engineer (iOS/Android)' }), profile).score >= profile.minScore);
  assert.ok(score(job({ title: 'Mobile Marketing Manager' }), profile).score < profile.minScore);
});

test('excluded words and unrelated roles score zero', () => {
  assert.equal(score(job({ title: 'Flutter Intern' }), profile).score, 0);
  assert.equal(score(job({ title: 'Junior Mobile Developer' }), profile).score, 0);
  assert.equal(score(job({ title: 'Account Manager' }), profile).score, 0);
});

test('keywords match whole words only', () => {
  // "ios" inside "Bios" or "Kotlin" inside "Kotlinx" must not count.
  assert.equal(score(job({ title: 'Bios Engineer' }), profile).score, 0);
});

test('the same opening on two boards shares a fingerprint', () => {
  const a = job({ id: 'greenhouse:binance:1', company: 'Binance', title: 'Senior Flutter Engineer', location: 'Dubai, UAE' });
  const b = job({ id: 'lever:binance:x', source: 'lever', company: 'Binance', title: 'Senior Flutter Engineer (Mobile)', location: 'Dubai' });
  assert.equal(fingerprint(a), fingerprint(b));
  assert.notEqual(fingerprint(a), fingerprint(job({ ...a, location: 'Abu Dhabi' })));
});
