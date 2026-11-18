// Tries the JSearch key with one search (one request of the monthly 200) and prints what comes back.
//
//   npm run jsearch                       # "flutter developer"
//   npm run jsearch -- "mobile engineer"
import { jsearch } from '../src/sources/jsearch.ts';

const key = process.env.JSEARCH_API_KEY?.trim();
if (!key) {
  console.error('Set JSEARCH_API_KEY in .env first.');
  process.exit(1);
}

const query = process.argv[2] ?? 'flutter developer';
const jobs = await jsearch(key, [query], 'month');
console.log(`${jobs.length} jobs for "${query}" in the UAE, last month:`);
for (const job of jobs) console.log(`  • ${job.title} | ${job.company} | ${job.location} | via ${job.via ?? '?'}`);
