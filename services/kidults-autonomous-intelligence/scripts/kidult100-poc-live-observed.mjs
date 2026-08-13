import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIAGNOSTIC_DIR = path.join(ROOT, 'reports', 'engineering-hardening');
const PROGRESS_PATH = path.join(DIAGNOSTIC_DIR, 'stage2-source-progress-latest.json');
const TEMP_PROGRESS_PATH = `${PROGRESS_PATH}.tmp`;
const SLOW_REQUEST_LIMIT = 5;
const RETRY_GAP_LIMIT = 5;
const stageStartedAt = Date.now();
const originalFetch = globalThis.fetch;

if (typeof originalFetch !== 'function') {
  throw new Error('GLOBAL_FETCH_UNAVAILABLE');
}

fs.mkdirSync(DIAGNOSTIC_DIR, { recursive: true });

let requestSequence = 0;
let completedRequests = 0;
let failedRequests = 0;
const sourceRuntime = {};
const slowRequests = [];
const wikidataRetryGaps = [];
let lastCompletedRequest = null;

function classifySource(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'www.wikidata.org' || host.endsWith('.wikidata.org')) return 'wikidata';
    if (host === 'collectionapi.metmuseum.org') return 'met';
    if (host === 'api.artic.edu') return 'aic';
    return host || 'unknown';
  } catch {
    return 'unknown';
  }
}

function extractQuery(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('search')
      || parsed.searchParams.get('q')
      || parsed.searchParams.get('query')
      || null;
  } catch {
    return null;
  }
}

function cloneRuntime() {
  return Object.fromEntries(Object.entries(sourceRuntime).map(([source, runtime]) => [source, { ...runtime }]));
}

function buildRequestVolumeObservation(stageElapsedMs) {
  const totalRawFetchElapsedMs = Object.values(sourceRuntime)
    .reduce((sum, runtime) => sum + runtime.elapsedMs, 0);
  const sources = Object.fromEntries(Object.entries(sourceRuntime).map(([source, runtime]) => [source, {
    attempts: runtime.attempts,
    completed: runtime.completed,
    failed: runtime.failed,
    elapsedMs: runtime.elapsedMs,
    averageAttemptMs: runtime.attempts > 0
      ? Math.round((runtime.elapsedMs / runtime.attempts) * 1000) / 1000
      : 0,
    requestShare: requestSequence > 0
      ? Math.round((runtime.attempts / requestSequence) * 1_000_000) / 1_000_000
      : 0,
  }]));

  return {
    observationalOnly: true,
    productionInput: false,
    autoOptimizationAllowed: false,
    interpretation: 'Request-volume diagnostics separate cumulative raw fetch time from stage elapsed time. They are not evidence, a score, or authority to prune, parallelize, or disable a source.',
    totalRequests: requestSequence,
    totalRawFetchElapsedMs,
    estimatedNonFetchElapsedMs: Math.max(0, stageElapsedMs - totalRawFetchElapsedMs),
    sources,
  };
}

function recordSlowRequest(request) {
  slowRequests.push(request);
  slowRequests.sort((a, b) => b.elapsedMs - a.elapsedMs);
  if (slowRequests.length > SLOW_REQUEST_LIMIT) {
    slowRequests.splice(SLOW_REQUEST_LIMIT);
  }
}

function recordWikidataRetryGap(gap) {
  wikidataRetryGaps.push(gap);
  wikidataRetryGaps.sort((a, b) => b.gapMs - a.gapMs);
  if (wikidataRetryGaps.length > RETRY_GAP_LIMIT) {
    wikidataRetryGaps.splice(RETRY_GAP_LIMIT);
  }
}

function writeProgress(phase, current = null) {
  const elapsedMs = Date.now() - stageStartedAt;
  const report = {
    schemaVersion: '1.2.0',
    stage: 'STAGE2_NORMALIZED_CANDIDATE_UNIVERSE_BUILD',
    generatedAt: new Date().toISOString(),
    elapsedMs,
    phase,
    observationalOnly: true,
    productionInput: false,
    partialEvidenceAccepted: false,
    requestSequence,
    completedRequests,
    failedRequests,
    current,
    sourceRuntime: cloneRuntime(),
    requestVolumeObservation: buildRequestVolumeObservation(elapsedMs),
    slowestRequests: slowRequests.map((request) => ({ ...request })),
    wikidataRetryGapObservation: {
      observationalOnly: true,
      productionInput: false,
      autoOptimizationAllowed: false,
      interpretation: 'A consecutive same-query Wikidata raw fetch is treated as an observed retry. gapMs measures time between the prior raw fetch completion and retry start; it may include server-driven backpressure plus minimal local orchestration and is not production evidence.',
      events: wikidataRetryGaps.map((gap) => ({ ...gap })),
    },
  };

  fs.writeFileSync(TEMP_PROGRESS_PATH, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(TEMP_PROGRESS_PATH, PROGRESS_PATH);
}

writeProgress('STARTED');

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : String(input?.url || '');
  const source = classifySource(url);
  const query = extractQuery(url);
  const sequence = ++requestSequence;
  const startedAt = Date.now();

  if (
    source === 'wikidata'
    && lastCompletedRequest?.source === 'wikidata'
    && lastCompletedRequest.query === query
  ) {
    recordWikidataRetryGap({
      previousSequence: lastCompletedRequest.sequence,
      sequence,
      source,
      query,
      gapMs: Math.max(0, startedAt - lastCompletedRequest.completedAt),
    });
  }

  if (!sourceRuntime[source]) {
    sourceRuntime[source] = {
      attempts: 0,
      completed: 0,
      failed: 0,
      elapsedMs: 0,
      maxAttemptMs: 0,
      lastHttpStatus: null,
    };
  }

  sourceRuntime[source].attempts += 1;
  writeProgress('REQUEST_STARTED', {
    sequence,
    source,
    query,
  });

  try {
    const response = await originalFetch(input, init);
    const completedAt = Date.now();
    const elapsedMs = completedAt - startedAt;
    completedRequests += 1;
    sourceRuntime[source].completed += 1;
    sourceRuntime[source].elapsedMs += elapsedMs;
    sourceRuntime[source].maxAttemptMs = Math.max(sourceRuntime[source].maxAttemptMs, elapsedMs);
    sourceRuntime[source].lastHttpStatus = response.status;
    recordSlowRequest({
      sequence,
      source,
      query,
      elapsedMs,
      httpStatus: response.status,
      outcome: 'COMPLETED',
    });
    lastCompletedRequest = {
      sequence,
      source,
      query,
      completedAt,
      httpStatus: response.status,
    };
    writeProgress('REQUEST_COMPLETED', {
      sequence,
      source,
      query,
      elapsedMs,
      httpStatus: response.status,
    });
    return response;
  } catch (error) {
    const completedAt = Date.now();
    const elapsedMs = completedAt - startedAt;
    failedRequests += 1;
    sourceRuntime[source].failed += 1;
    sourceRuntime[source].elapsedMs += elapsedMs;
    sourceRuntime[source].maxAttemptMs = Math.max(sourceRuntime[source].maxAttemptMs, elapsedMs);
    const errorName = error instanceof Error ? error.name : 'NON_ERROR_THROWN';
    recordSlowRequest({
      sequence,
      source,
      query,
      elapsedMs,
      errorName,
      outcome: 'FAILED',
    });
    lastCompletedRequest = {
      sequence,
      source,
      query,
      completedAt,
      errorName,
    };
    writeProgress('REQUEST_FAILED', {
      sequence,
      source,
      query,
      elapsedMs,
      errorName,
    });
    throw error;
  }
};

try {
  await import('./kidult100-poc-live.mjs');
  writeProgress('COMPLETED');
} finally {
  globalThis.fetch = originalFetch;
}
