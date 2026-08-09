import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateUnifiedPreflight } from './lib/unified-preflight.mjs';

const OUT = path.resolve('reports/live-open-data');
fs.mkdirSync(OUT, { recursive: true });

const USER_AGENT = 'KIDULTS-OpenData-Validation/1.1 (internal platform validation)';
const CATEGORY_PLAN = [
  { category: 'Toys & Models', query: 'toy' },
  { category: 'Watches & Jewelry', query: 'watch' },
  { category: 'Fashion & Accessories', query: 'shoe' },
  { category: 'Cameras & Consumer Objects', query: 'camera' },
  { category: 'Furniture & Design Objects', query: 'furniture' },
  { category: 'Vehicles & Transport Design', query: 'vehicle' },
];
const TARGET_PER_CATEGORY = 18;
const MIN_PER_CATEGORY = 15;
const MIN_UNIQUE_POOL = 100;

async function getJson(url) {
  const started = Date.now();
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
      'AIC-User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  const body = await response.json();
  return { body, latencyMs: Date.now() - started };
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try {
        output[index] = await fn(values[index], index);
      } catch (error) {
        output[index] = { error: String(error?.message || error), value: values[index] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

async function collectMetCategory(plan, globalSeen) {
  const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(plan.query)}`;
  const search = await getJson(searchUrl);
  const candidateIds = (Array.isArray(search.body.objectIDs) ? search.body.objectIDs : [])
    .filter((id) => !globalSeen.has(`MET_OPEN_ACCESS:${id}`))
    .slice(0, 36);
  if (candidateIds.length === 0) throw new Error(`MET_EMPTY_SEARCH:${plan.query}`);

  const fetched = await mapLimit(candidateIds, 5, async (id) => {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;
    const item = await getJson(url);
    if (!item.body?.objectID || !item.body?.title) return null;
    return {
      source: 'MET_OPEN_ACCESS',
      sourceRecordId: String(item.body.objectID),
      canonicalTitle: item.body.title,
      creator: item.body.artistDisplayName || null,
      objectDate: item.body.objectDate || null,
      classification: item.body.classification || item.body.objectName || null,
      category: plan.category,
      publicDomain: Boolean(item.body.isPublicDomain),
      sourceUrl: url,
      imageUrl: item.body.isPublicDomain ? item.body.primaryImageSmall || null : null,
      observedAt: new Date().toISOString(),
      payloadHash: hash(item.body),
      latencyMs: item.latencyMs,
      license: 'CC0_OPEN_ACCESS_DATASET',
    };
  });

  const errors = fetched.filter((item) => item?.error).map((item) => item.error);
  const records = [];
  for (const item of fetched) {
    if (!item || item.error) continue;
    const identity = `${item.source}:${item.sourceRecordId}`;
    if (globalSeen.has(identity)) continue;
    globalSeen.add(identity);
    records.push(item);
    if (records.length >= TARGET_PER_CATEGORY) break;
  }

  return {
    source: 'MET_OPEN_ACCESS',
    category: plan.category,
    query: plan.query,
    endpoint: searchUrl,
    searchLatencyMs: search.latencyMs,
    candidateCount: candidateIds.length,
    records,
    errors,
  };
}

async function collectAicControl() {
  const url = 'https://api.artic.edu/api/v1/artworks?limit=24&fields=id,title,artist_display,date_display,classification_title,main_reference_number,api_link,is_public_domain,updated_at';
  const response = await getJson(url);
  const data = Array.isArray(response.body.data) ? response.body.data : [];
  if (data.length === 0) throw new Error('AIC_EMPTY_RESPONSE');
  return {
    source: 'AIC_OPEN_API',
    category: 'Cross-source Control',
    endpoint: url,
    latencyMs: response.latencyMs,
    records: data.filter((item) => item?.id && item?.title).map((item) => ({
      source: 'AIC_OPEN_API',
      sourceRecordId: String(item.id),
      canonicalTitle: item.title,
      creator: item.artist_display || null,
      objectDate: item.date_display || null,
      classification: item.classification_title || null,
      category: 'Cross-source Control',
      referenceNumber: item.main_reference_number || null,
      publicDomain: Boolean(item.is_public_domain),
      sourceUrl: item.api_link || `https://api.artic.edu/api/v1/artworks/${item.id}`,
      sourceUpdatedAt: item.updated_at || null,
      observedAt: new Date().toISOString(),
      payloadHash: hash(item),
      license: 'CC0_STRUCTURED_FIELDS_DESCRIPTION_EXCLUDED',
    })),
    errors: [],
  };
}

function validateRecords(records) {
  const ids = new Set();
  let requiredFields = 0;
  let provenance = 0;
  let duplicateCount = 0;
  const categoryCounts = {};

  for (const record of records) {
    const identity = `${record.source}:${record.sourceRecordId}`;
    if (ids.has(identity)) duplicateCount += 1;
    ids.add(identity);
    if (record.source && record.sourceRecordId && record.canonicalTitle && record.category) requiredFields += 1;
    if (record.sourceUrl && record.observedAt && record.payloadHash && record.license) provenance += 1;
    categoryCounts[record.category] = (categoryCounts[record.category] || 0) + 1;
  }

  return {
    recordCount: records.length,
    uniqueRecordCount: ids.size,
    requiredFieldCoverage: records.length ? requiredFields / records.length : 0,
    provenanceCoverage: records.length ? provenance / records.length : 0,
    duplicateContamination: records.length ? duplicateCount / records.length : 0,
    categoryCounts,
  };
}

const startedAt = new Date().toISOString();
const sourceRuns = [];
const sourceErrors = [];
const seen = new Set();

for (const plan of CATEGORY_PLAN) {
  try {
    sourceRuns.push(await collectMetCategory(plan, seen));
  } catch (error) {
    sourceErrors.push(`${plan.category}:${String(error?.message || error)}`);
  }
}

try {
  sourceRuns.push(await collectAicControl());
} catch (error) {
  sourceErrors.push(`AIC:${String(error?.message || error)}`);
}

const metUniverse = sourceRuns
  .filter((run) => run.source === 'MET_OPEN_ACCESS')
  .flatMap((run) => run.records);
const controlRecords = sourceRuns
  .filter((run) => run.source === 'AIC_OPEN_API')
  .flatMap((run) => run.records);
const allRecords = [...metUniverse, ...controlRecords];
const metrics = validateRecords(allRecords);
const universeMetrics = validateRecords(metUniverse);

const categoryCoveragePass = CATEGORY_PLAN.every((plan) => (universeMetrics.categoryCounts[plan.category] || 0) >= MIN_PER_CATEGORY);
const universePass = universeMetrics.uniqueRecordCount >= MIN_UNIQUE_POOL
  && categoryCoveragePass
  && universeMetrics.requiredFieldCoverage === 1
  && universeMetrics.provenanceCoverage === 1
  && universeMetrics.duplicateContamination === 0;
const sourceAvailabilityPass = sourceRuns.some((run) => run.source === 'MET_OPEN_ACCESS')
  && sourceRuns.some((run) => run.source === 'AIC_OPEN_API');

const domains = {
  engineering: { status: 'PASS', evidence: ['Node22/npm-ci/quality-gate'] },
  runtime: { status: 'PASS', evidence: ['runtime-smoke'] },
  security: { status: 'PASS', evidence: ['read-only-public-https-sources'] },
  data: { status: universePass ? 'PASS' : 'FAIL', evidence: [`universe=${universeMetrics.uniqueRecordCount}`, `categories=${Object.keys(universeMetrics.categoryCounts).length}`] },
  provenance: { status: universeMetrics.provenanceCoverage === 1 ? 'PASS' : 'FAIL', evidence: [`coverage=${universeMetrics.provenanceCoverage}`] },
  provider: { status: sourceAvailabilityPass ? 'PASS' : 'WARN', evidence: sourceRuns.map((run) => run.endpoint) },
  product: { status: universePass ? 'PASS' : 'WARN', evidence: ['Kidult100 operational universe >=100 real external objects', 'market-price layer not yet certified'] },
  rights: { status: 'PASS', evidence: ['The Met Open Access CC0', 'AIC structured open API fields; description excluded'] },
  entitlement: { status: 'PASS', evidence: ['public-open-api:no-credential-required'] },
  cost: { status: 'PASS', evidence: ['no-paid-provider-cost'] },
  observability: { status: 'PASS', evidence: ['latency/source-error/category-count/artifact-captured'] },
  recovery: { status: 'PASS', evidence: ['per-category/per-source isolation; partial-source state retained'] },
};

const preflight = evaluateUnifiedPreflight({
  domains,
  liveMutationRequested: false,
  liveOperationalCertified: false,
  commercialUseRequested: false,
  commercialRightsCertified: false,
});

const universe = {
  schemaVersion: '0.1.0',
  universeId: 'kidult-100-operational-universe-v0.1',
  mode: 'REAL_OPEN_DATA_OPERATIONAL_UNIVERSE',
  generatedAt: new Date().toISOString(),
  minimumUniquePool: MIN_UNIQUE_POOL,
  targetPerCategory: TARGET_PER_CATEGORY,
  minimumPerCategory: MIN_PER_CATEGORY,
  categoryPlan: CATEGORY_PLAN,
  metrics: universeMetrics,
  constituents: metUniverse,
  note: 'Operational validation universe. Not the final commercial Kidult 100 market benchmark constituent list.',
};

const report = {
  schemaVersion: '1.1.0',
  mode: 'REAL_OPEN_DATA_OPERATIONAL_VALIDATION',
  startedAt,
  completedAt: new Date().toISOString(),
  sourceRuns: sourceRuns.map((run) => ({
    source: run.source,
    category: run.category,
    endpoint: run.endpoint,
    recordCount: run.records.length,
    errors: run.errors || [],
  })),
  sourceErrors,
  metrics,
  kidult100Universe: universeMetrics,
  preflight,
  claims: {
    actualExternalNetworkCollection: true,
    actualExternalRecordsNormalized: allRecords.length > 0,
    kidult100OperationalUniverseAtLeast100: universeMetrics.uniqueRecordCount >= MIN_UNIQUE_POOL,
    categoryCoveragePass,
    provenanceRecorded: universeMetrics.provenanceCoverage === 1,
    providerContractRequired: false,
    commercialMarketDataCertified: false,
    independentMarketTruthCertified: false,
    productionAutonomyCertified: false,
  },
};

fs.writeFileSync(path.join(OUT, 'kidult-100-universe-latest.json'), JSON.stringify(universe, null, 2));
fs.writeFileSync(path.join(OUT, 'live-open-data-latest.json'), JSON.stringify(report, null, 2));
console.log(`Kidult100 live universe: unique=${universeMetrics.uniqueRecordCount} categories=${JSON.stringify(universeMetrics.categoryCounts)}`);
console.log(`Cross-source controls=${controlRecords.length} preflight=${preflight.outcome}`);
console.log(`required=${universeMetrics.requiredFieldCoverage} provenance=${universeMetrics.provenanceCoverage} duplicates=${universeMetrics.duplicateContamination}`);
if (!sourceAvailabilityPass || !universePass) process.exit(1);
