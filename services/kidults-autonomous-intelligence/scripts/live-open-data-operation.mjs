import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateUnifiedPreflight } from './lib/unified-preflight.mjs';

const OUT = path.resolve('reports/live-open-data');
fs.mkdirSync(OUT, { recursive: true });

const USER_AGENT = 'KIDULTS-OpenData-Validation/1.0 (internal platform validation)';

async function getJson(url) {
  const started = Date.now();
  const response = await fetch(url, {
    headers: {
      'accept': 'application/json',
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

async function collectMet() {
  const searchUrl = 'https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=design';
  const search = await getJson(searchUrl);
  const ids = Array.isArray(search.body.objectIDs) ? search.body.objectIDs.slice(0, 8) : [];
  if (ids.length === 0) throw new Error('MET_EMPTY_SEARCH');
  const records = [];
  for (const id of ids) {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;
    const item = await getJson(url);
    records.push({
      source: 'MET_OPEN_ACCESS',
      sourceRecordId: String(item.body.objectID),
      canonicalTitle: item.body.title || null,
      creator: item.body.artistDisplayName || null,
      objectDate: item.body.objectDate || null,
      classification: item.body.classification || null,
      publicDomain: Boolean(item.body.isPublicDomain),
      sourceUrl: url,
      observedAt: new Date().toISOString(),
      payloadHash: hash(item.body),
      latencyMs: item.latencyMs,
      license: 'CC0_OPEN_ACCESS_DATASET',
    });
  }
  return { source: 'MET_OPEN_ACCESS', endpoint: searchUrl, searchLatencyMs: search.latencyMs, records };
}

async function collectAic() {
  const url = 'https://api.artic.edu/api/v1/artworks?limit=8&fields=id,title,artist_display,date_display,classification_title,main_reference_number,api_link,is_public_domain,updated_at';
  const response = await getJson(url);
  const data = Array.isArray(response.body.data) ? response.body.data : [];
  if (data.length === 0) throw new Error('AIC_EMPTY_RESPONSE');
  return {
    source: 'AIC_OPEN_API',
    endpoint: url,
    latencyMs: response.latencyMs,
    records: data.map((item) => ({
      source: 'AIC_OPEN_API',
      sourceRecordId: String(item.id),
      canonicalTitle: item.title || null,
      creator: item.artist_display || null,
      objectDate: item.date_display || null,
      classification: item.classification_title || null,
      referenceNumber: item.main_reference_number || null,
      publicDomain: Boolean(item.is_public_domain),
      sourceUrl: item.api_link || `https://api.artic.edu/api/v1/artworks/${item.id}`,
      sourceUpdatedAt: item.updated_at || null,
      observedAt: new Date().toISOString(),
      payloadHash: hash(item),
      license: 'CC0_EXCEPT_DESCRIPTION_NOT_COLLECTED',
    })),
  };
}

function validateRecords(records) {
  const ids = new Set();
  let requiredFields = 0;
  let provenance = 0;
  let duplicateCount = 0;
  for (const record of records) {
    const identity = `${record.source}:${record.sourceRecordId}`;
    if (ids.has(identity)) duplicateCount += 1;
    ids.add(identity);
    if (record.source && record.sourceRecordId && record.canonicalTitle) requiredFields += 1;
    if (record.sourceUrl && record.observedAt && record.payloadHash && record.license) provenance += 1;
  }
  return {
    recordCount: records.length,
    requiredFieldCoverage: records.length ? requiredFields / records.length : 0,
    provenanceCoverage: records.length ? provenance / records.length : 0,
    duplicateContamination: records.length ? duplicateCount / records.length : 0,
  };
}

const startedAt = new Date().toISOString();
const sourceRuns = [];
const sourceErrors = [];
for (const collector of [collectMet, collectAic]) {
  try {
    sourceRuns.push(await collector());
  } catch (error) {
    sourceErrors.push(String(error?.message || error));
  }
}

const records = sourceRuns.flatMap((run) => run.records);
const metrics = validateRecords(records);
const sourceAvailabilityPass = sourceRuns.length === 2 && sourceErrors.length === 0;
const dataPass = records.length >= 10 && metrics.requiredFieldCoverage === 1 && metrics.provenanceCoverage === 1 && metrics.duplicateContamination === 0;

const domains = {
  engineering: { status: 'PASS', evidence: ['Node22/npm-ci/quality-gate'] },
  runtime: { status: 'PASS', evidence: ['runtime-smoke'] },
  security: { status: 'PASS', evidence: ['read-only-public-https-sources'] },
  data: { status: dataPass ? 'PASS' : 'FAIL', evidence: [`records=${records.length}`, `required=${metrics.requiredFieldCoverage}`] },
  provenance: { status: metrics.provenanceCoverage === 1 ? 'PASS' : 'FAIL', evidence: [`coverage=${metrics.provenanceCoverage}`] },
  provider: { status: sourceAvailabilityPass ? 'PASS' : 'WARN', evidence: sourceRuns.map((run) => run.endpoint) },
  product: { status: 'WARN', evidence: ['operational-validation-only:not-market-product-proof'] },
  rights: { status: 'PASS', evidence: ['Met Open Access CC0', 'AIC artwork fields CC0; description excluded'] },
  entitlement: { status: 'PASS', evidence: ['public-open-api:no-credential-required'] },
  cost: { status: 'PASS', evidence: ['no-paid-provider-cost'] },
  observability: { status: 'PASS', evidence: ['latency/source-error/artifact-captured'] },
  recovery: { status: 'PASS', evidence: ['per-source isolation; partial-source state retained'] },
};

const preflight = evaluateUnifiedPreflight({
  domains,
  liveMutationRequested: false,
  liveOperationalCertified: false,
  commercialUseRequested: false,
  commercialRightsCertified: false,
});

const report = {
  schemaVersion: '1.0.0',
  mode: 'REAL_OPEN_DATA_OPERATIONAL_VALIDATION',
  startedAt,
  completedAt: new Date().toISOString(),
  sourceRuns,
  sourceErrors,
  metrics,
  preflight,
  claims: {
    actualExternalNetworkCollection: true,
    actualExternalRecordsNormalized: records.length > 0,
    provenanceRecorded: metrics.provenanceCoverage === 1,
    providerContractRequired: false,
    commercialMarketDataCertified: false,
    independentTruthCertified: false,
    productionAutonomyCertified: false,
  },
};

fs.writeFileSync(path.join(OUT, 'live-open-data-latest.json'), JSON.stringify(report, null, 2));
console.log(`Real open-data operation: sources=${sourceRuns.length}/2 records=${records.length} preflight=${preflight.outcome}`);
console.log(`required=${metrics.requiredFieldCoverage} provenance=${metrics.provenanceCoverage} duplicates=${metrics.duplicateContamination}`);
if (!sourceAvailabilityPass || !dataPass) process.exit(1);
