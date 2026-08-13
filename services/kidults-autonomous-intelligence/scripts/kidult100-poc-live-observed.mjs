import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIAGNOSTIC_DIR = path.join(ROOT, 'reports', 'engineering-hardening');
const PROGRESS_PATH = path.join(DIAGNOSTIC_DIR, 'stage2-source-progress-latest.json');
const TEMP_PROGRESS_PATH = `${PROGRESS_PATH}.tmp`;
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

function writeProgress(phase, current = null) {
  const report = {
    schemaVersion: '1.0.0',
    stage: 'STAGE2_NORMALIZED_CANDIDATE_UNIVERSE_BUILD',
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - stageStartedAt,
    phase,
    observationalOnly: true,
    productionInput: false,
    partialEvidenceAccepted: false,
    requestSequence,
    completedRequests,
    failedRequests,
    current,
    sourceRuntime: cloneRuntime(),
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
    const elapsedMs = Date.now() - startedAt;
    completedRequests += 1;
    sourceRuntime[source].completed += 1;
    sourceRuntime[source].elapsedMs += elapsedMs;
    sourceRuntime[source].maxAttemptMs = Math.max(sourceRuntime[source].maxAttemptMs, elapsedMs);
    sourceRuntime[source].lastHttpStatus = response.status;
    writeProgress('REQUEST_COMPLETED', {
      sequence,
      source,
      query,
      elapsedMs,
      httpStatus: response.status,
    });
    return response;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    failedRequests += 1;
    sourceRuntime[source].failed += 1;
    sourceRuntime[source].elapsedMs += elapsedMs;
    sourceRuntime[source].maxAttemptMs = Math.max(sourceRuntime[source].maxAttemptMs, elapsedMs);
    writeProgress('REQUEST_FAILED', {
      sequence,
      source,
      query,
      elapsedMs,
      errorName: error instanceof Error ? error.name : 'NON_ERROR_THROWN',
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
