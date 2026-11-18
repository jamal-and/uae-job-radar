// Finds which job board a company uses. Pass guesses at its slug (usually the company name, in lower
// case, sometimes with dashes) and it tries each on every supported system:
//
//   npm run discover -- careem kitopi property-finder
//
// Each hit prints a line ready to paste into radar.config.ts, with how many of its jobs are in the UAE.
import { guessable, sources } from '../src/sources/index.ts';
import { inUae } from '../src/match.ts';

const slugs = process.argv.slice(2);
if (slugs.length === 0) {
  console.error('Usage: npm run discover -- <slug> [<slug> ...]');
  process.exit(1);
}

const tries = slugs.flatMap((slug) => guessable.map((ats) => ({ slug, ats })));
const results = await Promise.allSettled(tries.map(({ slug, ats }) => sources[ats]({ name: slug, ats, slug }, { searchTerms: [] })));

let found = 0;
results.forEach((result, i) => {
  if (result.status !== 'fulfilled' || result.value.length === 0) return;
  const { slug, ats } = tries[i]!;
  const uae = result.value.filter((job) => inUae(job, { includeRegionalRemote: true })).length;
  found++;
  console.log(`{ name: '${slug}', ats: '${ats}', slug: '${slug}' },   // ${result.value.length} jobs, ${uae} in the UAE`);
});
if (found === 0) console.log('No public board found for those names.');
