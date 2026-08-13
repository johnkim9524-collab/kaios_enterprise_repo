import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CANDIDATE_PATH = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-right-data');
const OUT_PATH = path.join(OUT_DIR, 'open-evidence-latest.json');
const CACHE_PATH = path.join(OUT_DIR, 'wikidata-resolution-cache.json');
const ENGINEERING_DIR = path.join(ROOT, 'reports', 'engineering-hardening');
const LATENCY_PATH = path.join(ENGINEERING_DIR, 'open-right-data-latency-latest.json');
const RANKING_DIR = path.join(ROOT, 'reports', 'kidult100-ranking');
const LIVE_OPEN_DATA_PATH = path.join(ROOT, 'reports', 'live-open-data', 'live-open-data-latest.json');
const CONTACT_URL = 'https://github.com/johnkim9524-collab/kaios_enterprise_repo';
const UA = `KIDULTS-Kidult100-Bot/1.3 (${CONTACT_URL}; rights-classified CC0 evidence client)`;
const MIN_REQUEST_INTERVAL_MS = 650;
const MAX_RETRIES = 4;
const STAGE_TIMEOUT_MS = 90_000;
const STAGE_STARTED_AT = Date.now();
let stageSettled = false;
let stageTimer;

function removeFile(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Cleanup is best-effort; the process still exits fail-closed.
  }
}

function purgeDownstreamEvidence() {
  const rightDataFiles = [
    'open-evidence-latest.json',
    'wikimedia-demand-evidence-latest.json',
    'canon-evidence-latest.json',
    'market-provider-onboarding-preflight-latest.json',
    'market-source-qualification-latest.json',
    'market-no-procurement-qualification-latest.json',
    'market-capability-gap-router-latest.json',
    'normalized-market-provider-evidence-latest.json',
    'validated-provider-evidence-latest.json',
    'market-evidence-acquisition-plan-latest.json',
    'scarcity-materialized-evidence-latest.json',
    'right-data-pre-scarcity-materialization.json',
    'scarcity-materialization-delta-invariant-latest.json',
    'right-data-latest.json',
    'right-data-gap-latest.json',
    'stage2-certification-latest.json',
  ];
  for (const fileName of rightDataFiles) removeFile(path.join(OUT_DIR, fileName));

  try {
    for (const entry of fs.readdirSync(RANKING_DIR)) {
      if (entry.endsWith('.json')) removeFile(path.join(RANKING_DIR, entry));
    }
  } catch {
    // Directory may not exist yet in a clean CI checkout.
  }
  removeFile(LIVE_OPEN_DATA_PATH);
}

function writeLatencyDiagnostic(status, exitCode) {
  fs.mkdirSync(ENGINEERING_DIR, { recursive: true });
  const elapsedMs = Date.now() - STAGE_STARTED_AT;
  const diagnostic = {
    stage: 'OPEN_CC0_SCARCITY_DEMAND_EVIDENCE_COLLECTION',
    status,
    exitCode,
    elapsedMs,
    elapsedSeconds: Number((elapsedMs / 1000).toFixed(3)),
    timeoutSeconds: STAGE_TIMEOUT_MS / 1000,
    partialEvidenceAccepted: false,
    staleOutputPurgedBeforeRun: true,
    staleDownstreamPurgedOnFailure: exitCode !== 0,
  };
  fs.writeFileSync(LATENCY_PATH, `${JSON.stringify(diagnostic, null, 2)}\n`);
}

function failClosed(status, exitCode, error) {
  if (stageSettled) return;
  stageSettled = true;
  if (stageTimer) clearTimeout(stageTimer);
  purgeDownstreamEvidence();
  writeLatencyDiagnostic(status, exitCode);
  console.error(`Open Right Data stage ${status}: ${String(error?.message || error || 'unknown failure')}`);
  process.exit(exitCode);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(ENGINEERING_DIR, { recursive: true });
removeFile(OUT_PATH);
stageTimer = setTimeout(
  () => failClosed('TIMEOUT_FAIL_CLOSED', 124, new Error(`stage exceeded ${STAGE_TIMEOUT_MS}ms hard budget`)),
  STAGE_TIMEOUT_MS,
);
stageTimer.unref();
process.on('uncaughtException', (error) => failClosed('FAIL_CLOSED', 1, error));
process.on('unhandledRejection', (error) => failClosed('FAIL_CLOSED', 1, error));

if (!fs.existsSync(CANDIDATE_PATH)) throw new Error(`Missing candidate report: ${CANDIDATE_PATH}`);

const report = JSON.parse(fs.readFileSync(CANDIDATE_PATH, 'utf8'));
const candidates = Array.isArray(report.candidates) ? report.candidates : [];
const relevantCandidates = candidates.filter((candidate) => candidate.semanticRelevant);

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestAt = 0;
const requestMetrics = {
  httpRequests: 0,
  retries: 0,
  rateLimitResponses: 0,
  cacheHits: 0,
  cacheMisses: 0,
};

async function waitForRequestSlot() {
  const elapsed = Date.now() - lastRequestAt;
  const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - elapsed);
  if (waitMs > 0) await sleep(waitMs);
  lastRequestAt = Date.now();
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(15000, retryAfter * 1000);
  return Math.min(12000, 1000 * (2 ** attempt));
}

async function getJson(url) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await waitForRequestSlot();
    requestMetrics.httpRequests += 1;
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) return response.json();

      if (response.status === 429 || response.status >= 500) {
        if (response.status === 429) requestMetrics.rateLimitResponses += 1;
        if (attempt < MAX_RETRIES) {
          requestMetrics.retries += 1;
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
      }
      throw new Error(`HTTP_${response.status}:${url}`);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      const transient = /HTTP_(429|5\d\d)|timeout|fetch failed|ECONNRESET|ETIMEDOUT/i.test(message);
      if (transient && attempt < MAX_RETRIES) {
        requestMetrics.retries += 1;
        await sleep(Math.min(12000, 1000 * (2 ** attempt)));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error(`REQUEST_FAILED:${url}`);
}

function loadResolutionCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const persistedCache = loadResolutionCache();
const runResolutionCache = new Map();

async function resolveWikidataId(candidate) {
  const existingId = String(candidate.sourceRecordId || '');
  if (candidate.source === 'wikidata' && /^Q\d+$/.test(existingId)) {
    return { id: existingId, method: 'SOURCE_NATIVE', confidence: 1 };
  }

  const title = String(candidate.canonicalTitle || '').trim();
  if (!title) return null;
  const cacheKey = normalize(title);
  if (!cacheKey) return null;

  if (runResolutionCache.has(cacheKey)) {
    requestMetrics.cacheHits += 1;
    return runResolutionCache.get(cacheKey);
  }
  if (Object.prototype.hasOwnProperty.call(persistedCache, cacheKey)) {
    requestMetrics.cacheHits += 1;
    const cached = persistedCache[cacheKey]?.resolved ?? null;
    runResolutionCache.set(cacheKey, cached);
    return cached;
  }

  requestMetrics.cacheMisses += 1;
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=en&format=json&limit=5&origin=*`;
  const body = await getJson(url);
  const target = normalize(title);
  const rows = Array.isArray(body.search) ? body.search : [];
  const exact = rows.find((row) => /^Q\d+$/.test(String(row.id || '')) && normalize(row.label) === target);
  const resolved = exact ? {
    id: exact.id,
    method: 'EXACT_NORMALIZED_LABEL',
    confidence: 0.95,
    matchedLabel: exact.label || null,
    description: exact.description || null,
  } : null;

  runResolutionCache.set(cacheKey, resolved);
  persistedCache[cacheKey] = {
    resolved,
    cachedAt: new Date().toISOString(),
  };
  return resolved;
}

function bestQuantity(entity, propertyId) {
  const statements = Array.isArray(entity?.claims?.[propertyId]) ? entity.claims[propertyId] : [];
  const ranked = statements
    .filter((statement) => statement?.mainsnak?.snaktype === 'value')
    .sort((a, b) => (a.rank === 'preferred' ? -1 : 0) - (b.rank === 'preferred' ? -1 : 0));
  for (const statement of ranked) {
    const value = statement?.mainsnak?.datavalue?.value;
    const amount = Number(value?.amount);
    if (Number.isFinite(amount) && amount >= 0) {
      return {
        amount,
        unit: value?.unit || null,
        lowerBound: value?.lowerBound ? Number(value.lowerBound) : null,
        upperBound: value?.upperBound ? Number(value.upperBound) : null,
        rank: statement.rank || 'normal',
        statementId: statement.id || null,
        referencesPresent: Array.isArray(statement.references) && statement.references.length > 0,
      };
    }
  }
  return null;
}

function evidenceRecord(candidate, primitive, entityId, evidenceClass, value, entityLink) {
  const sourceUrl = `https://www.wikidata.org/wiki/${entityId}`;
  return {
    candidateKey: candidate.candidateKey,
    primitive,
    source: 'wikidata',
    sourceUrl,
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: new Date().toISOString(),
    payloadHash: hash({ entityId, primitive, value }),
    evidenceClass,
    value,
    entityLink,
    safety: {
      openDataOnly: true,
      synthetic: false,
      estimated: false,
      marketTransactionClaim: false,
      sourceLicense: 'CC0_STRUCTURED_DATA',
    },
  };
}

const sourceErrors = [];
const entityLinks = new Map();

for (const candidate of relevantCandidates) {
  try {
    const resolved = await resolveWikidataId(candidate);
    if (resolved) entityLinks.set(candidate.candidateKey, resolved);
  } catch (error) {
    sourceErrors.push({
      candidateKey: candidate.candidateKey,
      canonicalTitle: candidate.canonicalTitle || null,
      stage: 'ENTITY_RESOLUTION',
      error: String(error?.message || error),
    });
  }
}

fs.writeFileSync(CACHE_PATH, JSON.stringify(persistedCache, null, 2));

const ids = [...new Set([...entityLinks.values()].map((link) => link.id))];
const entityById = new Map();
for (let i = 0; i < ids.length; i += 40) {
  const batch = ids.slice(i, i + 40);
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(batch.join('|'))}&props=claims|sitelinks&format=json&origin=*`;
  try {
    const body = await getJson(url);
    for (const [id, entity] of Object.entries(body.entities || {})) entityById.set(id, entity);
  } catch (error) {
    sourceErrors.push({ ids: batch, stage: 'ENTITY_FETCH', error: String(error?.message || error) });
  }
}

const evidence = [];
const candidateEvidenceSummary = [];

for (const candidate of relevantCandidates) {
  const entityLink = entityLinks.get(candidate.candidateKey);
  if (!entityLink) continue;
  const entity = entityById.get(entityLink.id);
  if (!entity || entity.missing !== undefined) continue;

  const candidateEvidence = [];
  const totalProduced = bestQuantity(entity, 'P1092');
  if (totalProduced && totalProduced.amount > 0) {
    candidateEvidence.push(evidenceRecord(candidate, 'SCARCITY', entityLink.id, 'INDEPENDENT_VERIFICATION', {
      signalType: 'TOTAL_PRODUCED',
      property: 'P1092',
      totalProduced,
      interpretation: 'Explicit production quantity evidence only; no scarcity score is inferred.',
    }, entityLink));
  }

  const unitsSold = bestQuantity(entity, 'P2664');
  const sitelinkCount = Object.keys(entity.sitelinks || {}).length;
  if (unitsSold && unitsSold.amount > 0) {
    candidateEvidence.push(evidenceRecord(candidate, 'DEMAND_ATTENTION', entityLink.id, 'DEMAND_CULTURAL_SIGNAL', {
      signalType: 'UNITS_SOLD_REFERENCE',
      property: 'P2664',
      unitsSold,
      interpretation: 'Structured units-sold reference; not a current transaction, liquidity, price or willingness-to-pay signal.',
    }, entityLink));
  } else if (sitelinkCount >= 3) {
    candidateEvidence.push(evidenceRecord(candidate, 'DEMAND_ATTENTION', entityLink.id, 'DEMAND_CULTURAL_SIGNAL', {
      signalType: 'CULTURAL_ATTENTION_PROXY',
      sitelinkCount,
      interpretation: 'Cross-wiki cultural attention breadth only; explicitly not market demand, transaction volume, liquidity or willingness-to-pay.',
    }, entityLink));
  }

  evidence.push(...candidateEvidence);
  candidateEvidenceSummary.push({
    candidateKey: candidate.candidateKey,
    canonicalTitle: candidate.canonicalTitle,
    semanticRelevanceScore: candidate.semanticRelevanceScore ?? null,
    wikidataId: entityLink.id,
    entityLinkMethod: entityLink.method,
    entityLinkConfidence: entityLink.confidence,
    scarcityEvidence: candidateEvidence.some((row) => row.primitive === 'SCARCITY'),
    demandAttentionEvidence: candidateEvidence.some((row) => row.primitive === 'DEMAND_ATTENTION'),
    sitelinkCount,
  });
}

const scarcityCount = evidence.filter((row) => row.primitive === 'SCARCITY').length;
const demandCount = evidence.filter((row) => row.primitive === 'DEMAND_ATTENTION').length;
const nativeLinks = [...entityLinks.values()].filter((link) => link.method === 'SOURCE_NATIVE').length;
const exactTitleLinks = [...entityLinks.values()].filter((link) => link.method === 'EXACT_NORMALIZED_LABEL').length;

const output = {
  schemaVersion: '1.3.0',
  mode: 'KIDULT100_OPEN_RIGHT_DATA_EVIDENCE',
  generatedAt: new Date().toISOString(),
  policy: {
    rightsMode: 'CC0_STRUCTURED_DATA_ONLY',
    syntheticEvidenceAllowed: false,
    estimatedMarketEvidenceAllowed: false,
    transactionComparableProduced: false,
    liquidityProduced: false,
    inferredScarcityAllowed: false,
    demandAttentionProxyMayRepresentMarketDemand: false,
    entityLinking: 'SOURCE_NATIVE_OR_EXACT_NORMALIZED_LABEL_ONLY',
    requestPolicy: {
      minimumIntervalMs: MIN_REQUEST_INTERVAL_MS,
      maximumRetries: MAX_RETRIES,
      retry429: true,
      exponentialBackoff: true,
      persistentTitleCache: true,
      descriptiveBotUserAgent: true,
      contactUrl: CONTACT_URL,
    },
  },
  source: {
    id: 'wikidata',
    license: 'CC0_STRUCTURED_DATA',
    properties: {
      scarcity: 'P1092 total produced',
      demandReference: 'P2664 units sold when present',
      attentionProxy: 'Wikidata sitelink count when >=3',
    },
  },
  metrics: {
    normalizedCandidates: candidates.length,
    semanticRelevantCandidates: relevantCandidates.length,
    linkedCandidates: entityLinks.size,
    nativeWikidataLinks: nativeLinks,
    exactTitleLinks,
    entitiesFetched: entityById.size,
    evidenceRecords: evidence.length,
    scarcityEvidenceRecords: scarcityCount,
    demandAttentionEvidenceRecords: demandCount,
    sourceErrorCount: sourceErrors.length,
    requestMetrics,
  },
  evidence,
  candidateEvidenceSummary,
  sourceErrors,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
if (stageTimer) clearTimeout(stageTimer);
stageSettled = true;
writeLatencyDiagnostic('PASS', 0);
console.log(`Open Right Data v1.3: relevant=${relevantCandidates.length} linked=${entityLinks.size} entities=${entityById.size} evidence=${evidence.length}`);
console.log(`nativeLinks=${nativeLinks} exactTitleLinks=${exactTitleLinks} scarcity=${scarcityCount} demandAttention=${demandCount} errors=${sourceErrors.length}`);
console.log(`requests=${requestMetrics.httpRequests} retries=${requestMetrics.retries} rateLimits=${requestMetrics.rateLimitResponses} cacheHits=${requestMetrics.cacheHits} cacheMisses=${requestMetrics.cacheMisses}`);
console.log(`Open Right Data stage latency: ${(Date.now() - STAGE_STARTED_AT) / 1000}s / ${STAGE_TIMEOUT_MS / 1000}s hard budget`);
console.log('No inferred scarcity, transaction comparable or liquidity evidence was fabricated.');
