import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataDir = path.join(root, 'data');
const publicDir = path.join(root, 'public', 'public-enterprise-preview');
const reportsDir = path.join(publicDir, 'reports');
const archiveDir = path.join(publicDir, 'archive-data');
const apiDir = path.join(publicDir, 'api', 'v1');

const readJson = async (file) => JSON.parse(await readFile(path.join(dataDir, file), 'utf8'));
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function monthLabel(edition) {
  const [year, month] = edition.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const kidult100 = await readJson('kidult100.json');
const categories = await readJson('categories.json');
const signals = await readJson('signals.json');
const archive = await readJson(path.join('archive', 'index.json'));

assert(/^\d{4}-\d{2}$/.test(kidult100.edition), 'Edition must use YYYY-MM');
assert(kidult100.edition === categories.edition, 'Edition mismatch: kidult100/categories');
assert(kidult100.edition === signals.edition, 'Edition mismatch: kidult100/signals');
assert(categories.categories.length === kidult100.headline.categories, 'Headline category count mismatch');
assert(archive.editions.some((item) => item.id === kidult100.edition), 'Current edition missing from archive registry');

const edition = kidult100.edition;
const title = `${monthLabel(edition)} Intelligence`;
const lead = categories.categories.find((item) => item.leadSignal) ?? categories.categories[0];
const positiveMovers = signals.movers.filter((item) => Number(item.change) > 0);
const negativeMovers = signals.movers.filter((item) => Number(item.change) < 0);

const monthly = {
  schemaVersion: '1.0.0',
  edition,
  title,
  status: kidult100.status,
  updated: kidult100.updated,
  methodologyVersion: kidult100.methodologyVersion,
  headline: kidult100.headline,
  executiveSummary: {
    leadCategory: lead?.name ?? null,
    leadScore: lead?.score ?? null,
    positiveMoverCount: positiveMovers.length,
    negativeMoverCount: negativeMovers.length,
    strongestMover: positiveMovers[0] ?? null,
    watchCondition: negativeMovers[0] ?? null
  },
  categories: categories.categories,
  signals: {
    signalMix: signals.signalMix,
    confidenceDistribution: signals.confidenceDistribution,
    sourceComposition: signals.sourceComposition,
    geography: signals.geography,
    movers: signals.movers,
    lifecycle: signals.lifecycle,
    correlation: signals.correlation
  }
};

const reportHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — KIDULTS</title>
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
  <div class="topline"><span><strong>KIDULTS</strong> · Global Collectibles Intelligence</span><span>Research · Evidence · Decision</span></div>
  <header><a class="brand" href="../">KIDULTS</a><nav><a href="../intelligence.html">Intelligence</a><a href="../research.html">Research</a><a href="../reports.html">Reports</a><a href="../archive.html">Archive</a><a href="../methodology.html">Methodology</a><a href="../api.html">API</a></nav></header>
  <main>
    <section class="page-hero shell">
      <p class="eyebrow">MONTHLY INTELLIGENCE · ${escapeHtml(edition)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>Governed interpretation of category movement, evidence quality and watch conditions.</p>
    </section>
    <section class="page-grid two shell">
      <article class="panel"><p class="eyebrow">KIDULT 100</p><h3>${escapeHtml(kidult100.headline.kidult100)}</h3><p>30-day change: ${escapeHtml(kidult100.headline.change30d)}% · Confidence: ${escapeHtml(kidult100.headline.confidence)}%</p></article>
      <article class="panel"><p class="eyebrow">LEAD SIGNAL</p><h3>${escapeHtml(lead?.name ?? 'Pending')}</h3><p>Score ${escapeHtml(lead?.score ?? '—')} · ${escapeHtml(lead?.state ?? 'Pending')}</p></article>
    </section>
    <section class="shell"><h2>Category intelligence</h2><div class="page-grid two">${categories.categories.map((item) => `<article class="panel" id="${escapeHtml(item.id)}"><h3>${escapeHtml(item.name)}</h3><p>Score ${escapeHtml(item.score)} · Confidence ${escapeHtml(item.confidence)} · Velocity ${escapeHtml(item.velocity)} · Liquidity ${escapeHtml(item.liquidity)}</p><strong>${escapeHtml(item.state)}</strong></article>`).join('')}</div></section>
  </main>
  <footer><strong>KIDULTS</strong><span>${escapeHtml(title)}</span><span>© 2026 KIDULTS</span></footer>
</body>
</html>\n`;

await mkdir(reportsDir, { recursive: true });
await mkdir(archiveDir, { recursive: true });
await mkdir(apiDir, { recursive: true });

await writeJson(path.join(reportsDir, `${edition}.json`), monthly);
await writeFile(path.join(reportsDir, `${edition}.html`), reportHtml);
await writeJson(path.join(archiveDir, `${edition}.json`), monthly);

const reportFiles = (await readdir(reportsDir)).filter((file) => /^\d{4}-\d{2}\.json$/.test(file)).sort().reverse();
const reportManifest = reportFiles.map((file) => {
  const id = file.replace('.json', '');
  return {
    id,
    title: `${monthLabel(id)} Intelligence`,
    json: `reports/${file}`,
    html: `reports/${id}.html`
  };
});

await writeJson(path.join(reportsDir, 'index.json'), reportManifest);
await writeJson(path.join(apiDir, 'monthly.json'), monthly);
await writeJson(path.join(apiDir, 'reports.json'), reportManifest);

console.log(`KIDULTS Sprint 21 operations build complete: ${edition}`);
