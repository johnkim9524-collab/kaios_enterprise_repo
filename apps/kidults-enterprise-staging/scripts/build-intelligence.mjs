import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataDir = path.join(root, 'data');
const publicDir = path.join(root, 'public', 'public-enterprise-preview');
const apiDir = path.join(publicDir, 'api', 'v1');

const readJson = async (file) => JSON.parse(await readFile(path.join(dataDir, file), 'utf8'));
const sum = (items) => items.reduce((total, item) => total + Number(item.value || 0), 0);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const kidult100 = await readJson('kidult100.json');
const categories = await readJson('categories.json');
const signals = await readJson('signals.json');
const archive = await readJson(path.join('archive', 'index.json'));

assert(kidult100.edition === categories.edition, 'Edition mismatch: kidult100/categories');
assert(kidult100.edition === signals.edition, 'Edition mismatch: kidult100/signals');
assert(categories.categories.length > 0, 'No categories found');
assert(new Set(categories.categories.map((item) => item.id)).size === categories.categories.length, 'Duplicate category id');
assert(sum(signals.signalMix) === 100, 'Signal mix must total 100');
assert(sum(signals.confidenceDistribution) === 100, 'Confidence distribution must total 100');
assert(sum(signals.sourceComposition) === 100, 'Source composition must total 100');
assert(sum(signals.geography) === 100, 'Geography must total 100');
assert(new Set(kidult100.trend.map((item) => item.period)).size === kidult100.trend.length, 'Duplicate trend period');
assert(archive.editions.some((item) => item.id === kidult100.edition), 'Current edition missing from archive registry');

const payload = {
  status: kidult100.status,
  label: kidult100.status === 'illustrative' ? 'Illustrative staging data' : 'Current edition',
  updated: kidult100.updated,
  methodologyVersion: kidult100.methodologyVersion,
  headline: {
    ...kidult100.headline,
    categories: categories.categories.length
  },
  trend: kidult100.trend,
  categoriesData: categories.categories,
  ...signals
};

const searchIndex = [
  { title: 'Kidult 100', href: 'intelligence.html', type: 'Intelligence', text: 'Global collectibles benchmark demand liquidity cultural durability' },
  { title: 'Monthly Intelligence', href: 'reports.html', type: 'Research', text: 'Monthly category movement evidence watch conditions' },
  { title: 'Historical Archive', href: 'archive.html', type: 'Archive', text: 'Retained editions longitudinal comparison records' },
  { title: 'Methodology', href: 'methodology.html', type: 'Evidence', text: 'Scoring confidence provenance limitations release controls' },
  { title: 'API', href: 'api.html', type: 'Enterprise', text: 'Structured delivery approved enterprise use cases' },
  ...categories.categories.map((item) => ({
    title: item.name,
    href: `intelligence.html#${item.id}`,
    type: 'Category',
    text: `${item.state} score ${item.score} confidence ${item.confidence} velocity ${item.velocity} liquidity ${item.liquidity}`
  }))
];

await mkdir(apiDir, { recursive: true });
await writeFile(path.join(publicDir, 'intelligence-data.json'), `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(path.join(publicDir, 'search-index.json'), `${JSON.stringify(searchIndex, null, 2)}\n`);
await writeFile(path.join(apiDir, 'kidult100.json'), `${JSON.stringify({ edition: kidult100.edition, updated: kidult100.updated, methodologyVersion: kidult100.methodologyVersion, ...kidult100.headline, trend: kidult100.trend }, null, 2)}\n`);
await writeFile(path.join(apiDir, 'categories.json'), `${JSON.stringify(categories, null, 2)}\n`);
await writeFile(path.join(apiDir, 'signals.json'), `${JSON.stringify(signals, null, 2)}\n`);
await writeFile(path.join(apiDir, 'archive.json'), `${JSON.stringify(archive, null, 2)}\n`);

console.log(`KIDULTS V1.1 build complete: ${kidult100.edition}`);
