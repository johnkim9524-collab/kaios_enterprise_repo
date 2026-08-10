import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-poc-source-plan.json'), 'utf8'));
const POLICY = JSON.parse(fs.readFileSync(path.join(ROOT, 'policy', 'kidult100-intelligence-value-policy.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-poc');
fs.mkdirSync(OUT_DIR, { recursive: true });

const UA = 'KIDULTS-Kidult100-POC/2.0 (decision-grade right-data validation)';
const REQUIRED_RIGHT_DATA = CONFIG.requiredRightDataPrimitives || POLICY.intelligencePrimitives;
const GATE = CONFIG.stage2Gate;

async function getJson(url) {
  const started = Date.now();
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': UA, 'AIC-User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  return { body: await response.json(), latencyMs: Date.now() - started };
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function searchWikidata(query, vertical) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=8&origin=*`;
  const { body, latencyMs } = await getJson(url);
  const rows = Array.isArray(body.search) ? body.search : [];
  return rows.map((row) => ({
    candidateKey: `wikidata:${row.id}`,
    vertical,
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: row.id,
    canonicalTitle: row.label || null,
    description: row.description || null,
    sourceUrl: row.concepturi || `https://www.wikidata.org/wiki/${row.id}`,
    observedAt: new Date().toISOString(),
    rightsClass: 'CC0_STRUCTURED_DATA',
    intelligencePrimitives: ['IDENTITY', 'CANON_CULTURAL_STRENGTH'],
    query,
    latencyMs,
    payloadHash: hash(row),
  }));
}

async function searchMet(query, vertical) {
  const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`;
  const { body } = await getJson(searchUrl);
  const ids = Array.isArray(body.objectIDs) ? body.objectIDs.slice(0, 3) : [];
  const results = [];
  for (const id of ids) {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;
    const item = await getJson(url);
    results.push({
      candidateKey: `met:${item.body.objectID}`,
      vertical,
      source: 'met',
      sourceClass: 'INSTITUTION_ARCHIVE',
      sourceRecordId: String(item.body.objectID),
      canonicalTitle: item.body.title || null,
      description: item.body.objectName || item.body.classification || null,
      creator: item.body.artistDisplayName || null,
      objectDate: item.body.objectDate || null,
      sourceUrl: item.body.objectURL || url,
      observedAt: new Date().toISOString(),
      rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      intelligencePrimitives: ['IDENTITY', 'CANON_CULTURAL_STRENGTH'],
      query,
      latencyMs: item.latencyMs,
      payloadHash: hash(item.body),
    });
  }
  return results;
}

async function searchAic(query, vertical) {
  const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&limit=3&fields=id,title,artist_display,date_display,classification_title,api_link,is_public_domain`;
  const { body, latencyMs } = await getJson(url);
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.map((row) => ({
    candidateKey: `aic:${row.id}`,
    vertical,
    source: 'aic',
    sourceClass: 'INSTITUTION_ARCHIVE',
    sourceRecordId: String(row.id),
    canonicalTitle: row.title || null,
    description: row.classification_title || null,
    creator: row.artist_display || null,
    objectDate: row.date_display || null,
    sourceUrl: row.api_link || `https://api.artic.edu/api/v1/artworks/${row.id}`,
    observedAt: new Date().toISOString(),
    rightsClass: 'CC0_EXCEPT_DESCRIPTION_EXCLUDED',
    intelligencePrimitives: ['IDENTITY', 'CANON_CULTURAL_STRENGTH'],
    query,
    latencyMs,
    payloadHash: hash(row),
  }));
}

function normalizeTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function semanticRelevance(item) {
  const queryTokens = normalizeTokens(item.query);
  const candidateTokens = new Set(normalizeTokens(`${item.canonicalTitle || ''} ${item.description || ''} ${item.creator || ''}`));
  if (!queryTokens.length || !candidateTokens.size) return false;
  const informative = queryTokens.filter((token) => !['classic', 'vintage', 'archive', 'design', 'figure', 'record', 'card', 'comic', 'watch', 'camera', 'chair', 'automobile', 'furniture'].includes(token));
  const anchors = informative.length ? informative : queryTokens;
  return anchors.some((token) => candidateTokens.has(token));
}

function primitiveSet(item) {
  const primitives = new Set(Array.isArray(item.intelligencePrimitives) ? item.intelligencePrimitives : []);
  const rightData = item.rightData || {};
  if (rightData.identity) primitives.add('IDENTITY');
  if (rightData.scarcity) primitives.add('SCARCITY');
  if (rightData.transactionPriceComparable) primitives.add('TRANSACTION_PRICE_COMPARABLE');
  if (rightData.liquidity) primitives.add('LIQUIDITY');
  if (rightData.demandAttention) primitives.add('DEMAND_ATTENTION');
  if (rightData.canonCulturalStrength) primitives.add('CANON_CULTURAL_STRENGTH');
  if (rightData.riskConfidence) primitives.add('RISK_CONFIDENCE');
  return primitives;
}

function rightDataFraction(item) {
  const primitives = primitiveSet(item);
  return REQUIRED_RIGHT_DATA.filter((primitive) => primitives.has(primitive)).length / REQUIRED_RIGHT_DATA.length;
}

function hasMarketEvidence(item) {
  const primitives = primitiveSet(item);
  return primitives.has('TRANSACTION_PRICE_COMPARABLE') && primitives.has('LIQUIDITY');
}

const collectors = [searchWikidata, searchMet, searchAic];
const sourceErrors = [];
const raw = [];
for (const vertical of CONFIG.coreVerticals) {
  for (const query of vertical.discoveryQueries) {
    for (const collector of collectors) {
      try {
        raw.push(...await collector(query, vertical.id));
      } catch (error) {
        sourceErrors.push({ vertical: vertical.id, query, collector: collector.name, error: String(error?.message || error) });
      }
    }
  }
}

const exactKeyCounts = new Map();
for (const item of raw) exactKeyCounts.set(item.candidateKey, (exactKeyCounts.get(item.candidateKey) || 0) + 1);
const duplicateObservations = [...exactKeyCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
const exactDuplicateContamination = raw.length ? duplicateObservations / raw.length : 0;

const deduped = new Map();
for (const item of raw) {
  if (!item.canonicalTitle || !item.sourceRecordId || !item.sourceUrl || !item.rightsClass) continue;
  if (!deduped.has(item.candidateKey)) deduped.set(item.candidateKey, item);
}
const candidates = [...deduped.values()].map((item) => ({
  ...item,
  semanticRelevant: semanticRelevance(item),
  requiredRightDataCoverage: rightDataFraction(item),
  marketEvidencePresent: hasMarketEvidence(item),
}));

const byVertical = Object.fromEntries(CONFIG.coreVerticals.map((v) => [v.id, candidates.filter((c) => c.vertical === v.id).length]));
const bySource = Object.fromEntries(CONFIG.sources.map((s) => [s.id, candidates.filter((c) => c.source === s.id).length]));
const coveredVerticals = Object.values(byVertical).filter((count) => count > 0).length;
const balancedVerticals = Object.values(byVertical).filter((count) => count >= GATE.minimumCandidatesPerVertical).length;
const provenanceCoverage = candidates.length ? candidates.filter((c) => c.sourceUrl && c.observedAt && c.payloadHash).length / candidates.length : 0;
const rightsClassificationCoverage = candidates.length ? candidates.filter((c) => Boolean(c.rightsClass)).length / candidates.length : 0;
const semanticRelevanceCoverage = candidates.length ? candidates.filter((c) => c.semanticRelevant).length / candidates.length : 0;
const requiredRightDataCoverage = candidates.length ? candidates.reduce((sum, c) => sum + c.requiredRightDataCoverage, 0) / candidates.length : 0;
const marketEvidenceCoverage = candidates.length ? candidates.filter((c) => c.marketEvidencePresent).length / candidates.length : 0;

const gateChecks = {
  candidateUniverse300Plus: candidates.length >= GATE.minimumUniqueCandidates,
  coreVerticalCoverage8of8: coveredVerticals >= GATE.requiredCoreVerticalCoverage,
  minimumPerVertical: balancedVerticals >= GATE.requiredCoreVerticalCoverage,
  provenanceCoverage: provenanceCoverage >= GATE.minimumProvenanceCoverage,
  rightsClassificationCoverage: rightsClassificationCoverage >= GATE.minimumRightsClassificationCoverage,
  exactDuplicateContamination: exactDuplicateContamination <= GATE.maximumExactDuplicateContamination,
  semanticRelevanceCoverage: semanticRelevanceCoverage >= GATE.minimumSemanticRelevanceCoverage,
  requiredRightDataCoverage: requiredRightDataCoverage >= GATE.minimumRequiredRightDataCoverage,
  marketEvidenceCoverage: marketEvidenceCoverage >= GATE.minimumMarketEvidenceCoverage,
};
const stage2Passed = Object.values(gateChecks).every(Boolean);

const report = {
  schemaVersion: '2.0.0',
  mode: CONFIG.mode,
  generatedAt: new Date().toISOString(),
  target: {
    candidates: GATE.minimumUniqueCandidates,
    coreVerticals: GATE.requiredCoreVerticalCoverage,
    minimumCandidatesPerVertical: GATE.minimumCandidatesPerVertical,
    requiredRightDataCoverage: GATE.minimumRequiredRightDataCoverage,
    marketEvidenceCoverage: GATE.minimumMarketEvidenceCoverage,
  },
  metrics: {
    rawObservations: raw.length,
    uniqueDiscoveryCandidates: candidates.length,
    coveredVerticals,
    balancedVerticals,
    provenanceCoverage,
    rightsClassificationCoverage,
    exactDuplicateContamination,
    semanticRelevanceCoverage,
    requiredRightDataCoverage,
    marketEvidenceCoverage,
    sourceErrorCount: sourceErrors.length,
    byVertical,
    bySource,
  },
  stage2Gate: {
    outcome: stage2Passed ? 'PASS' : GATE.failureDisposition,
    checks: gateChecks,
  },
  claims: {
    liveExternalNetworkCollection: true,
    decisionGradeRightDataCertified: stage2Passed,
    finalKidult100Certified: false,
    marketPriceIntelligenceCertified: false,
    whyCausalityCertified: false,
  },
  candidates,
  sourceErrors,
};

fs.writeFileSync(path.join(OUT_DIR, 'kidult100-poc-latest.json'), JSON.stringify(report, null, 2));
console.log(`Kidult100 Stage2: raw=${raw.length} unique=${candidates.length} errors=${sourceErrors.length}`);
console.log(`verticals=${coveredVerticals}/8 balanced=${balancedVerticals}/8 provenance=${provenanceCoverage} rights=${rightsClassificationCoverage}`);
console.log(`semantic=${semanticRelevanceCoverage} rightData=${requiredRightDataCoverage} marketEvidence=${marketEvidenceCoverage} duplicates=${exactDuplicateContamination}`);
console.log(`stage2=${report.stage2Gate.outcome} checks=${JSON.stringify(gateChecks)}`);

if (!stage2Passed) process.exit(1);
