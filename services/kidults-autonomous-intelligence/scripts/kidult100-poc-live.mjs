import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-poc-source-plan.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-poc');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONTACT_URL = 'https://github.com/johnkim9524-collab/kaios_enterprise_repo';
const UA = `KIDULTS-Kidult100-Bot/2.7 (${CONTACT_URL}; two-stage semantic discovery)`;
const WIKIDATA_MIN_INTERVAL_MS = 0;
const WIKIDATA_MAX_RETRIES = 4;
const WIKIDATA_MAXLAG_SECONDS = 5;
const WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD = 3;
let lastWikidataRequestAt = 0;
const wikidataRuntime = {
  requests: 0,
  retries: 0,
  rateLimits: 0,
  maxlagResponses: 0,
  backpressureSignals: 0,
  consecutiveBackpressureSignals: 0,
  maxConsecutiveBackpressureSignals: 0,
  backpressureCircuitThreshold: WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD,
  backpressureCircuitOpened: false,
  backpressureCircuitReason: null,
  contactUrl: CONTACT_URL,
  pacingMode: 'SERIAL_SERVER_DRIVEN_BACKPRESSURE',
  fixedInterRequestDelayMs: WIKIDATA_MIN_INTERVAL_MS,
  maxlagSeconds: WIKIDATA_MAXLAG_SECONDS,
  retriesOnlyOnExplicitBackpressure: true,
  gzipRequested: true,
};
const sourceAccessRuntime = Object.fromEntries((CONFIG.sources || []).map((source) => [source.id, {
  configuredActive: source.active !== false,
  attempts: 0,
  successfulAttempts: 0,
  failedAttempts: 0,
  elapsedMs: 0,
  maxAttemptMs: 0,
  blockedForRun: false,
  blockedReason: null,
}]));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function getJson(url, { wikidata = false } = {}) {
  if (!wikidata) {
    const started = Date.now();
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': UA, 'AIC-User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
    return { body: await response.json(), latencyMs: Date.now() - started };
  }

  for (let attempt = 0; attempt <= WIKIDATA_MAX_RETRIES; attempt += 1) {
    const elapsed = Date.now() - lastWikidataRequestAt;
    if (WIKIDATA_MIN_INTERVAL_MS > 0 && elapsed < WIKIDATA_MIN_INTERVAL_MS) await sleep(WIKIDATA_MIN_INTERVAL_MS - elapsed);

    const started = Date.now();
    lastWikidataRequestAt = Date.now();
    wikidataRuntime.requests += 1;
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'accept-encoding': 'gzip,deflate', 'user-agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => null);
    const maxlag = body?.error?.code === 'maxlag';

    if (response.ok && !maxlag) {
      wikidataRuntime.consecutiveBackpressureSignals = 0;
      return { body, latencyMs: Date.now() - started };
    }

    if (maxlag) wikidataRuntime.maxlagResponses += 1;
    if (maxlag || response.status === 429) {
      if (response.status === 429) wikidataRuntime.rateLimits += 1;
      wikidataRuntime.backpressureSignals += 1;
      wikidataRuntime.consecutiveBackpressureSignals += 1;
      wikidataRuntime.maxConsecutiveBackpressureSignals = Math.max(
        wikidataRuntime.maxConsecutiveBackpressureSignals,
        wikidataRuntime.consecutiveBackpressureSignals,
      );
      if (wikidataRuntime.consecutiveBackpressureSignals >= WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD) {
        const reason = maxlag ? 'MAXLAG' : `HTTP_${response.status}`;
        wikidataRuntime.backpressureCircuitOpened = true;
        wikidataRuntime.backpressureCircuitReason = reason;
        throw new Error(`WIKIDATA_BACKPRESSURE_CIRCUIT_OPEN:${reason}:${url}`);
      }
      if (attempt < WIKIDATA_MAX_RETRIES) {
        wikidataRuntime.retries += 1;
        const retryAfterSeconds = Number(response.headers.get('retry-after'));
        const reportedLagSeconds = Number(body?.error?.lag);
        const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : maxlag && Number.isFinite(reportedLagSeconds) && reportedLagSeconds > 0
            ? Math.ceil(reportedLagSeconds * 1000)
            : Math.min(10000, 900 * (2 ** attempt));
        await sleep(retryAfterMs);
        continue;
      }
    }

    throw new Error(maxlag ? `WIKIDATA_MAXLAG:${url}` : `HTTP_${response.status}:${url}`);
  }

  throw new Error(`WIKIDATA_RETRY_EXHAUSTED:${url}`);
}

async function searchWikidata(query, vertical) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=8&origin=*&maxlag=${WIKIDATA_MAXLAG_SECONDS}`;
  const { body, latencyMs } = await getJson(url, { wikidata: true });
  const rows = Array.isArray(body.search) ? body.search : [];
  return rows.map((row) => ({
    candidateKey: `wikidata:${row.id}`,
    vertical,
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: row.id,
    canonicalTitle: row.label || null,
    description: row.description || null,
    creator: null,
    objectDate: null,
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

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return normalize(value).split(/\s+/).filter((token) => token.length >= 2);
}

const GENERIC_QUERY_TOKENS = new Set([
  'classic', 'vintage', 'archive', 'design', 'figure', 'record', 'card', 'comic', 'watch', 'camera',
  'chair', 'automobile', 'furniture', 'toy', 'toys', 'model', 'models', 'memorabilia', 'sports', 'movie',
  'prop', 'game', 'gaming', 'music', 'screen', 'fashion', 'accessories', 'sneaker', 'industrial', 'mid', 'century',
]);

const VERTICAL_CONTEXT = {
  'toys-models': ['toy', 'toys', 'model', 'miniature', 'doll', 'figure', 'action figure', 'construction set', 'building set', 'lego', 'barbie', 'gundam', 'hot wheels'],
  'watches-jewelry': ['watch', 'wristwatch', 'timepiece', 'chronograph', 'jewelry', 'jewellery', 'rolex', 'omega', 'cartier', 'patek', 'audemars'],
  'automobiles-mobility': ['automobile', 'car', 'vehicle', 'sports car', 'roadster', 'coupe', 'ferrari', 'porsche', 'lamborghini', 'toyota', 'mercedes'],
  'fashion-accessories': ['fashion', 'handbag', 'bag', 'trunk', 'shoe', 'sneaker', 'accessory', 'apparel', 'hermes', 'chanel', 'jordan', 'vuitton'],
  'design-furniture': ['chair', 'furniture', 'table', 'stool', 'desk', 'sofa', 'design', 'industrial design', 'eames', 'jacobsen', 'sottsass', 'corbusier'],
  'technology-cameras': ['camera', 'computer', 'macintosh', 'walkman', 'electronics', 'technology', 'leica', 'polaroid', 'sony', 'apple', 'braun'],
  'gaming-music-screen': ['video game', 'console', 'game', 'arcade', 'record', 'vinyl', 'film', 'movie', 'prop', 'nintendo', 'playstation', 'game boy'],
  'cards-comics-memorabilia': ['card', 'trading card', 'comic', 'memorabilia', 'baseball card', 'pokemon', 'marvel', 'dc comics', 'sports memorabilia'],
};

const ARCHIVE_NEGATIVE_OBJECT_TERMS = new Set([
  'textile', 'painting', 'drawing', 'print', 'photograph', 'sculpture', 'vessel', 'fragment', 'manuscript',
  'tapestry', 'ceramic', 'glass', 'coin', 'medal', 'armor', 'weapon',
]);

function containsPhrase(haystack, phrase) {
  const normalizedHaystack = ` ${normalize(haystack)} `;
  const normalizedPhrase = normalize(phrase);
  return normalizedPhrase.length > 0 && normalizedHaystack.includes(` ${normalizedPhrase} `);
}

function semanticTwoStage(item) {
  const query = normalize(item.query);
  const title = normalize(item.canonicalTitle);
  const description = normalize(item.description);
  const creator = normalize(item.creator);
  if (!query || !title) {
    return {
      relevant: false,
      score: 0,
      version: 'SEMANTIC_V2_2_TWO_STAGE',
      stageA: { passed: false, reasons: ['MISSING_QUERY_OR_TITLE'] },
      stageB: { passed: false, reasons: ['NOT_EVALUATED'] },
    };
  }

  const queryTokens = tokens(query);
  const informativeAnchors = queryTokens.filter((token) => !GENERIC_QUERY_TOKENS.has(token));
  const anchors = informativeAnchors.length ? informativeAnchors : queryTokens;
  const titleTokens = new Set(tokens(title));
  const descriptionTokens = new Set(tokens(description));
  const creatorTokens = new Set(tokens(creator));

  const titleAnchorHits = anchors.filter((token) => titleTokens.has(token));
  const descriptionAnchorHits = anchors.filter((token) => descriptionTokens.has(token));
  const creatorAnchorHits = anchors.filter((token) => creatorTokens.has(token));
  const exactTitleQuery = title === query;
  const queryPhraseInTitle = containsPhrase(title, query);
  const allAnchorsInTitle = anchors.length > 0 && anchors.every((token) => titleTokens.has(token));

  const contextPhrases = VERTICAL_CONTEXT[item.vertical] || [];
  const contextText = `${item.canonicalTitle || ''} ${item.description || ''} ${item.creator || ''}`;
  const verticalContextHits = contextPhrases.filter((phrase) => containsPhrase(contextText, phrase));
  const hasVerticalContext = verticalContextHits.length > 0;
  const sourceNativeEntity = item.source === 'wikidata' && /^Q\d+$/.test(String(item.sourceRecordId || ''));

  const stageAReasons = [];
  if (exactTitleQuery) stageAReasons.push('EXACT_TITLE_QUERY');
  if (queryPhraseInTitle) stageAReasons.push('QUERY_PHRASE_IN_TITLE');
  if (allAnchorsInTitle) stageAReasons.push('ALL_ANCHORS_IN_TITLE');
  if (titleAnchorHits.length > 0) stageAReasons.push('TITLE_ANCHOR');
  if (descriptionAnchorHits.length > 0) stageAReasons.push('DESCRIPTION_ANCHOR');
  if (creatorAnchorHits.length > 0) stageAReasons.push('CREATOR_ANCHOR');
  if (hasVerticalContext) stageAReasons.push('VERTICAL_CONTEXT');
  if (sourceNativeEntity) stageAReasons.push('SOURCE_NATIVE_WIKIDATA');

  const stageAPassed = stageAReasons.length > 0;

  const stageBReasons = [];
  let stageBPassed = stageAPassed;
  const institutionalArchive = item.sourceClass === 'INSTITUTION_ARCHIVE';
  const negativeArchiveObjectTerms = [...ARCHIVE_NEGATIVE_OBJECT_TERMS].filter((term) => containsPhrase(description, term));
  const archiveHasIndependentContext = hasVerticalContext || descriptionAnchorHits.length > 0 || creatorAnchorHits.length > 0;
  const archiveTitleOnly = institutionalArchive && !archiveHasIndependentContext && (exactTitleQuery || queryPhraseInTitle || titleAnchorHits.length > 0);
  const archiveObjectMismatch = institutionalArchive
    && negativeArchiveObjectTerms.length > 0
    && !hasVerticalContext
    && descriptionAnchorHits.length === 0
    && creatorAnchorHits.length === 0;

  if (!stageAPassed) {
    stageBPassed = false;
    stageBReasons.push('NO_DEFENSIBLE_RECALL_SIGNAL');
  } else if (archiveObjectMismatch) {
    stageBPassed = false;
    stageBReasons.push('ARCHIVE_OBJECT_TYPE_MISMATCH');
  } else if (archiveTitleOnly) {
    stageBPassed = false;
    stageBReasons.push('ARCHIVE_TITLE_ONLY_FALSE_POSITIVE_RISK');
  } else {
    stageBReasons.push('PRECISION_VERIFIED');
  }

  let score = 0;
  if (exactTitleQuery) score += 0.35;
  else if (queryPhraseInTitle) score += 0.30;
  else if (allAnchorsInTitle) score += 0.26;
  else if (titleAnchorHits.length > 0) score += Math.min(0.24, 0.12 * titleAnchorHits.length);
  if (descriptionAnchorHits.length > 0) score += Math.min(0.16, 0.08 * descriptionAnchorHits.length);
  if (creatorAnchorHits.length > 0) score += Math.min(0.10, 0.05 * creatorAnchorHits.length);
  if (hasVerticalContext) score += 0.22;
  if (sourceNativeEntity) score += 0.18;
  if (item.sourceClass === 'REFERENCE_PUBLIC_DATA') score += 0.08;
  if (stageBPassed) score += 0.08;
  score = Math.max(0, Math.min(1, Number(score.toFixed(4))));

  return {
    relevant: stageAPassed && stageBPassed,
    score,
    version: 'SEMANTIC_V2_2_TWO_STAGE',
    stageA: {
      name: 'BROAD_RECALL_GATE',
      passed: stageAPassed,
      reasons: stageAReasons,
    },
    stageB: {
      name: 'PRECISION_VERIFIER',
      passed: stageBPassed,
      reasons: stageBReasons,
    },
    diagnostics: {
      titleAnchorHits,
      descriptionAnchorHits,
      creatorAnchorHits,
      verticalContextHits,
      negativeArchiveObjectTerms,
      archiveTitleOnly,
      archiveObjectMismatch,
      sourceNativeEntity,
    },
  };
}

const collectors = [
  { id: 'wikidata', run: searchWikidata },
  { id: 'met', run: searchMet },
  { id: 'aic', run: searchAic },
];
const configuredActiveSources = new Set((CONFIG.sources || []).filter((source) => source.active !== false).map((source) => source.id));
const blockedSources = new Set();
const sourceErrors = [];
const raw = [];
for (const vertical of CONFIG.coreVerticals) {
  for (const query of vertical.discoveryQueries) {
    for (const collector of collectors) {
      if (!configuredActiveSources.has(collector.id) || blockedSources.has(collector.id)) continue;
      if (!sourceAccessRuntime[collector.id]) {
        sourceAccessRuntime[collector.id] = {
          configuredActive: true,
          attempts: 0,
          successfulAttempts: 0,
          failedAttempts: 0,
          elapsedMs: 0,
          maxAttemptMs: 0,
          blockedForRun: false,
          blockedReason: null,
        };
      }
      const runtime = sourceAccessRuntime[collector.id];
      runtime.attempts += 1;
      const attemptStarted = Date.now();
      try {
        const collected = await collector.run(query, vertical.id);
        const attemptElapsedMs = Date.now() - attemptStarted;
        runtime.successfulAttempts += 1;
        runtime.elapsedMs += attemptElapsedMs;
        runtime.maxAttemptMs = Math.max(runtime.maxAttemptMs, attemptElapsedMs);
        raw.push(...collected);
      } catch (error) {
        const attemptElapsedMs = Date.now() - attemptStarted;
        runtime.failedAttempts += 1;
        runtime.elapsedMs += attemptElapsedMs;
        runtime.maxAttemptMs = Math.max(runtime.maxAttemptMs, attemptElapsedMs);
        const message = String(error?.message || error);
        sourceErrors.push({ vertical: vertical.id, query, collector: collector.run.name, source: collector.id, error: message });
        const circuitReason = /^HTTP_(401|403):/.test(message)
          ? message.split(':', 1)[0]
          : /^WIKIDATA_BACKPRESSURE_CIRCUIT_OPEN:/.test(message)
            ? 'WIKIDATA_BACKPRESSURE_CIRCUIT_OPEN'
            : null;
        if (circuitReason) {
          blockedSources.add(collector.id);
          runtime.blockedForRun = true;
          runtime.blockedReason = circuitReason;
        }
      }
    }
  }
}

const exactKeyCounts = new Map();
for (const item of raw) exactKeyCounts.set(item.candidateKey, (exactKeyCounts.get(item.candidateKey) || 0) + 1);
const duplicateRawObservations = [...exactKeyCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
const rawDuplicateObservationRate = raw.length ? duplicateRawObservations / raw.length : 0;

const deduped = new Map();
for (const item of raw) {
  if (!item.canonicalTitle || !item.sourceRecordId || !item.sourceUrl || !item.rightsClass) continue;
  if (!deduped.has(item.candidateKey)) deduped.set(item.candidateKey, item);
}

const candidates = [...deduped.values()].map((item) => {
  const semantic = semanticTwoStage(item);
  return {
    ...item,
    semanticRelevant: semantic.relevant,
    semanticRelevanceScore: semantic.score,
    semanticRelevanceVersion: semantic.version,
    semanticStageA: semantic.stageA,
    semanticStageB: semantic.stageB,
    semanticRelevanceDiagnostics: semantic.diagnostics,
  };
});

const acceptedKeyCount = new Set(candidates.map((c) => c.candidateKey)).size;
const acceptedDuplicateContamination = candidates.length ? (candidates.length - acceptedKeyCount) / candidates.length : 0;
const recallCandidates = candidates.filter((candidate) => candidate.semanticStageA?.passed);
const relevantCandidates = candidates.filter((candidate) => candidate.semanticRelevant);
const precisionRejectedCandidates = recallCandidates.filter((candidate) => !candidate.semanticStageB?.passed);

const byVertical = Object.fromEntries(CONFIG.coreVerticals.map((v) => [v.id, candidates.filter((c) => c.vertical === v.id).length]));
const recallByVertical = Object.fromEntries(CONFIG.coreVerticals.map((v) => [v.id, recallCandidates.filter((c) => c.vertical === v.id).length]));
const relevantByVertical = Object.fromEntries(CONFIG.coreVerticals.map((v) => [v.id, relevantCandidates.filter((c) => c.vertical === v.id).length]));
const bySource = Object.fromEntries(CONFIG.sources.map((s) => [s.id, candidates.filter((c) => c.source === s.id).length]));
const relevantBySource = Object.fromEntries(CONFIG.sources.map((s) => [s.id, relevantCandidates.filter((c) => c.source === s.id).length]));
const provenanceCoverage = candidates.length ? candidates.filter((c) => c.sourceUrl && c.observedAt && c.payloadHash).length / candidates.length : 0;
const rightsClassificationCoverage = candidates.length ? candidates.filter((c) => Boolean(c.rightsClass)).length / candidates.length : 0;
const semanticRelevanceCoverage = candidates.length ? relevantCandidates.length / candidates.length : 0;

const report = {
  schemaVersion: '2.7.0',
  mode: CONFIG.mode,
  generatedAt: new Date().toISOString(),
  target: {
    candidates: CONFIG.stage2Gate.minimumUniqueCandidates,
    coreVerticals: CONFIG.stage2Gate.requiredCoreVerticalCoverage,
    minimumCandidatesPerVertical: CONFIG.stage2Gate.minimumCandidatesPerVertical,
  },
  semanticPolicy: {
    version: 'SEMANTIC_V2_2_TWO_STAGE',
    stageA: 'BROAD_RECALL_GATE',
    stageB: 'PRECISION_VERIFIER',
    archiveTitleOnlyAccepted: false,
    archiveObjectMismatchAccepted: false,
    principle: 'Recover defensible recall first, then reject only explicit archive title-only and object-type mismatches.',
  },
  accessPolicy: {
    descriptiveBotUserAgent: true,
    contactUrl: CONTACT_URL,
    wikidataMinimumIntervalMs: WIKIDATA_MIN_INTERVAL_MS,
    wikidataMaximumRetries: WIKIDATA_MAX_RETRIES,
    wikidataMaxlagSeconds: WIKIDATA_MAXLAG_SECONDS,
    serialWikidataReadRequests: true,
    serverDrivenBackpressure: true,
    wikidataRetriesOnlyOnExplicitBackpressure: true,
    wikidataBackpressureCircuitBreaker: true,
    wikidataBackpressureCircuitThreshold: WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD,
    gzipRequested: true,
    sourceConfigurationRespected: true,
    accessDenialCircuitBreaker: true,
    accessDenialStatuses: [401, 403],
  },
  metrics: {
    rawObservations: raw.length,
    uniqueNormalizedCandidates: candidates.length,
    semanticRecallCandidates: recallCandidates.length,
    semanticPrecisionRejectedCandidates: precisionRejectedCandidates.length,
    semanticRelevantCandidates: relevantCandidates.length,
    provenanceCoverage,
    rightsClassificationCoverage,
    semanticRelevanceCoverage,
    rawDuplicateObservationRate,
    acceptedDuplicateContamination,
    sourceErrorCount: sourceErrors.length,
    byVertical,
    recallByVertical,
    relevantByVertical,
    bySource,
    relevantBySource,
    wikidataRuntime,
    sourceAccessRuntime,
  },
  candidateBuild: {
    outcome: 'BUILT_NOT_CERTIFIED',
    note: 'Stage A maximizes defensible recall. Stage B removes explicit archive title-only and object-type mismatches. Wikidata reads remain serial, retry only explicit maxlag/429 server backpressure, and stop Wikidata for the run after repeated consecutive backpressure instead of consuming the full Stage 2 budget. Access-denied sources are also stopped for the remainder of the run. Missing source data remains missing and Stage 2 certification remains downstream.',
  },
  claims: {
    liveExternalNetworkCollection: true,
    normalizedCandidateUniverseBuilt: true,
    twoStageSemanticGateApplied: true,
    decisionGradeRightDataCertified: false,
    finalKidult100Certified: false,
    marketPriceIntelligenceCertified: false,
    whyCausalityCertified: false,
  },
  candidates,
  sourceErrors,
};

fs.writeFileSync(path.join(OUT_DIR, 'kidult100-poc-latest.json'), JSON.stringify(report, null, 2));
console.log(`Kidult100 candidate build v2.7: raw=${raw.length} unique=${candidates.length} recall=${recallCandidates.length} precisionRejected=${precisionRejectedCandidates.length} relevant=${relevantCandidates.length} errors=${sourceErrors.length}`);
console.log(`provenance=${provenanceCoverage} rights=${rightsClassificationCoverage} semantic=${semanticRelevanceCoverage}`);
console.log(`rawDuplicateObservationRate=${rawDuplicateObservationRate} acceptedDuplicateContamination=${acceptedDuplicateContamination}`);
console.log(`recallVerticals=${JSON.stringify(recallByVertical)}`);
console.log(`relevantVerticals=${JSON.stringify(relevantByVertical)}`);
console.log(`relevantSources=${JSON.stringify(relevantBySource)}`);
console.log(`wikidataRuntime=${JSON.stringify(wikidataRuntime)}`);
console.log(`sourceAccessRuntime=${JSON.stringify(sourceAccessRuntime)}`);