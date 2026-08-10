import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT = path.resolve('reports/kidult100-wave1');
const PORTAL = path.resolve('../../apps/kidults-enterprise-staging/public/data');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PORTAL, { recursive: true });
const UA = 'KIDULTS-Wave1/1.2 (internal intelligence validation)';
const hash = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

async function json(url, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    try {
      const r = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) {
        const error = new Error(`HTTP_${r.status}:${url}`);
        error.status = r.status;
        throw error;
      }
      return { body: await r.json(), latencyMs: Date.now() - started, attempts: attempt };
    } catch (error) {
      lastError = error;
      const transient = !error?.status || TRANSIENT_HTTP.has(error.status);
      if (!transient || attempt === maxAttempts) break;
      await sleep(250 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

const runs = [];
const errors = [];
const records = [];
function add(source, category, item, id, title, url, license, extra = {}) {
  if (!id || !title) return;
  records.push({
    source,
    category,
    sourceRecordId: String(id),
    canonicalTitle: String(title),
    sourceUrl: url,
    license,
    observedAt: new Date().toISOString(),
    payloadHash: hash(item),
    ...extra,
  });
}

async function loc(category, q) {
  const url = `https://www.loc.gov/search/?q=${encodeURIComponent(q)}&fo=json&c=50`;
  const { body, latencyMs, attempts } = await json(url);
  const xs = Array.isArray(body.results) ? body.results : [];
  for (const x of xs) {
    add(
      'LIBRARY_OF_CONGRESS',
      category,
      x,
      x.id || x.url,
      x.title,
      x.id || x.url,
      'LOC_API_METADATA_TERMS_APPLY',
      { date: x.date || null, partof: x.partof || null },
    );
  }
  runs.push({ source: 'LIBRARY_OF_CONGRESS', category, url, count: xs.length, latencyMs, attempts });
  return xs.length;
}

async function vpic() {
  const url = 'https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json';
  const { body, latencyMs, attempts } = await json(url);
  const xs = Array.isArray(body.Results) ? body.Results : [];
  for (const x of xs) {
    add(
      'NHTSA_VPIC',
      'Automobiles & Mobility',
      x,
      x.MakeId,
      x.MakeName,
      url,
      'US_GOV_PUBLIC_DATA_LICENSE_REVIEWED_FOR_IDENTITY_ONLY',
      { vehicleType: x.VehicleTypeName || 'car' },
    );
  }
  runs.push({ source: 'NHTSA_VPIC', category: 'Automobiles & Mobility', url, count: xs.length, latencyMs, attempts });
}

async function wikidata(category, queries, fallbackFor = null) {
  let total = 0;
  for (const query of queries) {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=50&origin=*`;
    const { body, latencyMs, attempts } = await json(url);
    const xs = Array.isArray(body.search) ? body.search : [];
    for (const x of xs) {
      add(
        'WIKIDATA_CC0',
        category,
        x,
        x.id,
        x.label,
        `https://www.wikidata.org/wiki/${x.id}`,
        'CC0_STRUCTURED_DATA',
        { description: x.description || null, discoveryQuery: query },
      );
    }
    total += xs.length;
    runs.push({
      source: 'WIKIDATA_CC0',
      category,
      url,
      count: xs.length,
      latencyMs,
      attempts,
      fallbackFor,
    });
  }
  return total;
}

async function locWithFallback(category, locQuery, fallbackQueries) {
  try {
    const count = await loc(category, locQuery);
    if (count > 0) return count;
    errors.push(`PRIMARY_EMPTY:${category}:LIBRARY_OF_CONGRESS`);
  } catch (error) {
    errors.push(`PRIMARY_FAILED:${category}:LIBRARY_OF_CONGRESS:${String(error?.message || error)}`);
  }
  const fallbackCount = await wikidata(category, fallbackQueries, 'LIBRARY_OF_CONGRESS');
  if (fallbackCount === 0) throw new Error(`FALLBACK_EMPTY:${category}:WIKIDATA_CC0`);
  return fallbackCount;
}

const jobs = [
  () => locWithFallback('Gaming / Music / Screen Culture', 'video game console', ['video game console', 'arcade game', 'handheld game console']),
  () => locWithFallback('Cards / Comics / Memorabilia', 'comic book', ['comic book', 'trading card', 'sports memorabilia']),
  () => locWithFallback('Technology & Cameras', 'camera', ['camera', 'vintage camera', 'film camera']),
  () => locWithFallback('Fashion & Accessories', 'fashion design', ['fashion design', 'handbag', 'sneaker']),
  () => vpic(),
  () => wikidata('Design & Furniture', ['furniture design', 'designer chair', 'industrial design furniture', 'modern furniture']),
  () => wikidata('Toys & Models', ['collectible toy', 'model car toy', 'designer toy']),
  () => wikidata('Watches & Jewelry', ['wristwatch', 'luxury watch', 'mechanical watch']),
];
for (const job of jobs) {
  try {
    await job();
  } catch (error) {
    errors.push(String(error?.message || error));
  }
}

const unique = new Map();
for (const r of records) unique.set(`${r.source}:${r.sourceRecordId}`, r);
const values = [...unique.values()];
const counts = {};
for (const r of values) counts[r.category] = (counts[r.category] || 0) + 1;
const verticals = [
  'Toys & Models',
  'Watches & Jewelry',
  'Automobiles & Mobility',
  'Fashion & Accessories',
  'Design & Furniture',
  'Technology & Cameras',
  'Gaming / Music / Screen Culture',
  'Cards / Comics / Memorabilia',
];
const covered = verticals.filter((v) => (counts[v] || 0) > 0);
const provenance = values.length
  ? values.filter((r) => r.sourceUrl && r.license && r.payloadHash && r.observedAt).length / values.length
  : 0;
const report = {
  schemaVersion: '1.2.0',
  mode: 'REAL_EXTERNAL_WAVE1_SOURCE_EXPANSION',
  generatedAt: new Date().toISOString(),
  runs,
  errors,
  metrics: {
    uniqueCandidates: values.length,
    verticalsCovered: covered.length,
    verticalCoverage: covered,
    categoryCounts: counts,
    provenanceCoverage: provenance,
    fallbackRuns: runs.filter((run) => Boolean(run.fallbackFor)).length,
    retriedRuns: runs.filter((run) => (run.attempts || 1) > 1).length,
  },
  records: values,
  claims: {
    stage1AtLeast100: values.length >= 100,
    eightVerticalCoverage: covered.length === 8,
    provenanceComplete: provenance === 1,
    marketTransactionCertified: false,
    finalKidult100Certified: false,
  },
};
fs.writeFileSync(path.join(OUT, 'wave1-live-latest.json'), JSON.stringify(report, null, 2));

const topCandidates = verticals.flatMap((category) =>
  values
    .filter((r) => r.category === category)
    .slice(0, 5)
    .map((r, i) => ({
      category,
      title: r.canonicalTitle,
      source: r.source,
      sourceUrl: r.sourceUrl,
      license: r.license,
      rankWithinVertical: i + 1,
      observedAt: r.observedAt,
    })),
);
const portal = {
  schemaVersion: '1.0.0',
  mode: 'LIVE_POC',
  generatedAt: report.generatedAt,
  truth: {
    label: 'LIVE POC',
    provenanceCoverage: provenance,
    rightsClassified: values.length ? values.filter((r) => Boolean(r.license)).length / values.length : 0,
    verticalsCovered: covered.length,
    totalVerticals: 8,
    uniqueCandidates: values.length,
    marketTransactionCertified: false,
    finalKidult100Certified: false,
  },
  verticals: verticals.map((name) => ({
    name,
    count: counts[name] || 0,
    status: (counts[name] || 0) > 0 ? 'LIVE' : 'GAP',
  })),
  candidates: topCandidates,
};
fs.writeFileSync(path.join(PORTAL, 'kidults-live.json'), JSON.stringify(portal, null, 2));
console.log(`Wave1 live: unique=${values.length} verticals=${covered.length}/8 provenance=${provenance} fallbackRuns=${report.metrics.fallbackRuns} retriedRuns=${report.metrics.retriedRuns}`);
console.log(JSON.stringify(counts));
if (values.length < 100 || covered.length < 8 || provenance !== 1) process.exit(1);
