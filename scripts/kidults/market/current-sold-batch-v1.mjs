import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { admitCurrentSoldBatch } from './current-sold-engine-v1.mjs';
import {
  currentSoldEvidenceDigest,
  transformCurrentSoldEventsToEvidence
} from './current-sold-evidence-v1.mjs';

const SOURCE_SHA_RE = /^[a-f0-9]{40}$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/;
const STRICT_CURRENT_MAX_AGE_DAYS = 7;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function fail(code) {
  throw new Error(code);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

export function canonicalJsonDigest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
}

function string(value, pattern, code) {
  if (typeof value !== 'string' || value.trim() !== value || !pattern.test(value)) fail(code);
  return value;
}

function nonEmptyString(value, code, maxLength = 512) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.trim() !== value) fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== 'string' || value.trim() !== value) fail(code);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(code);
  return date.toISOString();
}

function exactKeys(value, allowed, code) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code);
  }
}

function canonicalTimestamp(value, code) {
  const normalized = timestamp(value, code);
  if (value !== normalized) fail(code);
  return normalized;
}

function validHttpsUrl(value, code) {
  if (typeof value !== 'string' || value.trim() !== value) fail(code);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) fail(code);
  } catch {
    fail(code);
  }
  return value;
}

function validateAcquisitionReceipt(receipt) {
  object(receipt, 'CURRENT_SOLD_BATCH_RECEIPT_NOT_OBJECT');
  exactKeys(receipt, new Set([
    'receipt_id', 'receipt_type', 'status', 'source_id', 'source_event_id', 'source_url',
    'provenance_digest', 'content_digest', 'source_sha', 'canonical_run_id'
  ]), 'CURRENT_SOLD_BATCH_ACQUISITION_RECEIPT_UNKNOWN_FIELD');
  string(receipt.receipt_id, ID_RE, 'CURRENT_SOLD_BATCH_INVALID_RECEIPT_ID');
  if (receipt.receipt_type !== 'ACQUISITION' || receipt.status !== 'PASS') fail('CURRENT_SOLD_BATCH_INVALID_ACQUISITION_RECEIPT');
  nonEmptyString(receipt.source_id, 'CURRENT_SOLD_BATCH_INVALID_ACQUISITION_SOURCE_ID');
  nonEmptyString(receipt.source_event_id, 'CURRENT_SOLD_BATCH_INVALID_ACQUISITION_EVENT_ID');
  validHttpsUrl(receipt.source_url, 'CURRENT_SOLD_BATCH_INVALID_ACQUISITION_SOURCE_URL');
  string(receipt.provenance_digest, SHA256_RE, 'CURRENT_SOLD_BATCH_INVALID_ACQUISITION_PROVENANCE_DIGEST');
  string(receipt.content_digest, SHA256_RE, 'CURRENT_SOLD_BATCH_INVALID_ACQUISITION_CONTENT_DIGEST');
  string(receipt.source_sha, SOURCE_SHA_RE, 'CURRENT_SOLD_BATCH_INVALID_ACQUISITION_SOURCE_SHA');
  string(receipt.canonical_run_id, ID_RE, 'CURRENT_SOLD_BATCH_INVALID_ACQUISITION_RUN_ID');
}

function validateRightsReceipt(receipt) {
  object(receipt, 'CURRENT_SOLD_BATCH_RECEIPT_NOT_OBJECT');
  exactKeys(receipt, new Set([
    'receipt_id', 'receipt_type', 'status', 'source_id', 'decision', 'purpose',
    'source_sha', 'canonical_run_id', 'valid_from', 'valid_until'
  ]), 'CURRENT_SOLD_BATCH_RIGHTS_RECEIPT_UNKNOWN_FIELD');
  string(receipt.receipt_id, ID_RE, 'CURRENT_SOLD_BATCH_INVALID_RECEIPT_ID');
  if (receipt.receipt_type !== 'RIGHTS' || receipt.status !== 'PASS') fail('CURRENT_SOLD_BATCH_INVALID_RIGHTS_RECEIPT');
  nonEmptyString(receipt.source_id, 'CURRENT_SOLD_BATCH_INVALID_RIGHTS_SOURCE_ID');
  if (receipt.decision !== 'ALLOW_PRIVATE_CURRENT_SOLD' || receipt.purpose !== 'PRIVATE_CURRENT_SOLD') {
    fail('CURRENT_SOLD_BATCH_RIGHTS_NOT_ALLOWED');
  }
  string(receipt.source_sha, SOURCE_SHA_RE, 'CURRENT_SOLD_BATCH_INVALID_RIGHTS_SOURCE_SHA');
  string(receipt.canonical_run_id, ID_RE, 'CURRENT_SOLD_BATCH_INVALID_RIGHTS_RUN_ID');
  const validFrom = receipt.valid_from === undefined ? null : canonicalTimestamp(receipt.valid_from, 'CURRENT_SOLD_BATCH_INVALID_RIGHTS_VALID_FROM');
  const validUntil = receipt.valid_until === undefined ? null : canonicalTimestamp(receipt.valid_until, 'CURRENT_SOLD_BATCH_INVALID_RIGHTS_VALID_UNTIL');
  if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) fail('CURRENT_SOLD_BATCH_RIGHTS_INTERVAL_INVERTED');
}

function validateReceiptRegistry(input) {
  const registry = object(input, 'CURRENT_SOLD_BATCH_RECEIPT_REGISTRY_NOT_OBJECT');
  exactKeys(registry, new Set(['schema_version', 'acquisitions', 'rights']), 'CURRENT_SOLD_BATCH_RECEIPT_REGISTRY_UNKNOWN_FIELD');
  if (registry.schema_version !== 'current-sold-receipt-registry-v1') {
    fail('CURRENT_SOLD_BATCH_RECEIPT_REGISTRY_VERSION_MISMATCH');
  }
  if (!Array.isArray(registry.acquisitions) || !Array.isArray(registry.rights)) {
    fail('CURRENT_SOLD_BATCH_RECEIPT_REGISTRY_ARRAYS_REQUIRED');
  }

  const seen = new Set();
  for (const receipt of registry.acquisitions) {
    validateAcquisitionReceipt(receipt);
    if (seen.has(receipt.receipt_id)) fail('CURRENT_SOLD_BATCH_DUPLICATE_RECEIPT_ID');
    seen.add(receipt.receipt_id);
  }
  for (const receipt of registry.rights) {
    validateRightsReceipt(receipt);
    if (seen.has(receipt.receipt_id)) fail('CURRENT_SOLD_BATCH_DUPLICATE_RECEIPT_ID');
    seen.add(receipt.receipt_id);
  }
  return structuredClone(registry);
}

export function validateCurrentSoldBatchEnvelope(input) {
  const value = object(input, 'CURRENT_SOLD_BATCH_ENVELOPE_NOT_OBJECT');
  if (value.schema_version !== 'current-sold-batch-envelope-v1') {
    fail('CURRENT_SOLD_BATCH_ENVELOPE_VERSION_MISMATCH');
  }
  const batchId = string(value.batch_id, ID_RE, 'CURRENT_SOLD_BATCH_INVALID_BATCH_ID');
  const createdAt = timestamp(value.created_at, 'CURRENT_SOLD_BATCH_INVALID_CREATED_AT');
  const sourceSha = string(value.source_sha, SOURCE_SHA_RE, 'CURRENT_SOLD_BATCH_INVALID_SOURCE_SHA');
  const canonicalRunId = string(value.canonical_run_id, ID_RE, 'CURRENT_SOLD_BATCH_INVALID_CANONICAL_RUN_ID');
  if (!Array.isArray(value.observations) || value.observations.length === 0) {
    fail('CURRENT_SOLD_BATCH_OBSERVATIONS_REQUIRED');
  }
  if (value.observations.length > 10000) fail('CURRENT_SOLD_BATCH_TOO_LARGE');

  const observations = value.observations.map((observation, index) => {
    object(observation, 'CURRENT_SOLD_BATCH_OBSERVATION_NOT_OBJECT');
    if (observation.source_sha !== sourceSha) {
      fail(`CURRENT_SOLD_BATCH_SOURCE_SHA_BINDING_MISMATCH_AT_${index}`);
    }
    if (observation.canonical_run_id !== canonicalRunId) {
      fail(`CURRENT_SOLD_BATCH_RUN_BINDING_MISMATCH_AT_${index}`);
    }
    return structuredClone(observation);
  });

  return {
    schema_version: 'current-sold-batch-envelope-v1',
    batch_id: batchId,
    created_at: createdAt,
    source_sha: sourceSha,
    canonical_run_id: canonicalRunId,
    observations
  };
}

function diagnosticIdentity(event) {
  return { event_id: event.event_id, content_digest: event.content_digest };
}

function strictCurrentError(event, now) {
  const soldAt = new Date(event.sold_at);
  const observedAt = new Date(event.observed_at);
  if (Number.isNaN(soldAt.getTime()) || Number.isNaN(observedAt.getTime())) {
    return 'CURRENT_SOLD_BATCH_INVALID_CANONICAL_TIMESTAMP';
  }
  if (soldAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) return 'CURRENT_SOLD_SALE_IN_FUTURE';
  if (observedAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) return 'CURRENT_SOLD_OBSERVED_IN_FUTURE';
  if ((now.getTime() - soldAt.getTime()) / 86400000 > STRICT_CURRENT_MAX_AGE_DAYS) {
    return 'CURRENT_SOLD_NOT_STRICT_CURRENT';
  }
  return null;
}

function atomicAdmission(classified, now) {
  const freshnessRejected = [];
  for (const event of classified.admitted) {
    const reason = strictCurrentError(event, now);
    if (reason) {
      freshnessRejected.push({
        source_id: event.source_id,
        source_event_id: event.source_event_id,
        canonical_object_id: event.canonical_object_id,
        disposition: 'REJECTED',
        reason
      });
    }
  }
  const rejected = [...classified.rejected, ...freshnessRejected];
  const issueCount = rejected.length + classified.quarantined.length;
  const pass = classified.status === 'PASS' && issueCount === 0;
  return {
    ...classified,
    engine: 'KIDULTS_CURRENT_SOLD_BATCH_ATOMIC_V1',
    status: pass ? 'PASS' : classified.admitted.length > 0 ? 'PARTIAL_FAIL_CLOSED' : 'FAIL_CLOSED',
    atomic_batch: true,
    strict_current_max_age_days: STRICT_CURRENT_MAX_AGE_DAYS,
    max_clock_skew_seconds: MAX_CLOCK_SKEW_MS / 1000,
    validated_candidate_count: classified.admitted.length,
    diagnostic_candidates: pass ? [] : classified.admitted.map(diagnosticIdentity),
    diagnostic_superseded: pass ? [] : classified.superseded.map(diagnosticIdentity),
    admitted_count: pass ? classified.admitted.length : 0,
    rejected_count: rejected.length,
    superseded_count: pass ? classified.superseded.length : 0,
    admitted: pass ? classified.admitted : [],
    rejected,
    superseded: pass ? classified.superseded : [],
    claim_boundary: {
      ...classified.claim_boundary,
      atomic_batch_admission: true,
      strict_current_max_age_days: STRICT_CURRENT_MAX_AGE_DAYS,
      batch_admitted_current_sold_count: pass ? classified.admitted.length : 0
    }
  };
}

function sortedEventVersions(admission) {
  const byKey = new Map();
  for (const event of [...admission.superseded, ...admission.admitted]) {
    const key = `${event.event_id}::${event.content_digest}`;
    byKey.set(key, event);
  }
  return [...byKey.values()].sort((a, b) => {
    const identity = a.event_id.localeCompare(b.event_id);
    if (identity !== 0) return identity;
    const observed = new Date(a.observed_at) - new Date(b.observed_at);
    if (observed !== 0) return observed;
    return a.content_digest.localeCompare(b.content_digest);
  });
}

export function currentSoldAdmissionSummary(admission) {
  return {
    status: admission.status,
    admitted_count: admission.admitted_count,
    rejected_count: admission.rejected_count,
    quarantined_count: admission.quarantined_count,
    superseded_count: admission.superseded_count,
    admitted: admission.admitted.map(diagnosticIdentity),
    rejected: admission.rejected,
    quarantined: admission.quarantined,
    superseded: admission.superseded.map(diagnosticIdentity)
  };
}

export function canonicalCurrentSoldAdmissionDigest(admission) {
  return canonicalJsonDigest(currentSoldAdmissionSummary(admission));
}

export function canonicalCurrentSoldBatchReceiptId(receiptIdentity) {
  return `csr_${canonicalJsonDigest(receiptIdentity).slice(7, 31)}`;
}

export function buildCurrentSoldBatchBundle(envelopeInput, receiptRegistryInput, { now } = {}) {
  const envelope = validateCurrentSoldBatchEnvelope(envelopeInput);
  const receiptRegistry = validateReceiptRegistry(receiptRegistryInput);
  const effectiveNow = now === undefined ? new Date(envelope.created_at) : now;
  if (!(effectiveNow instanceof Date) || Number.isNaN(effectiveNow.getTime())) {
    fail('CURRENT_SOLD_BATCH_INVALID_NOW');
  }

  const classified = admitCurrentSoldBatch(envelope.observations, {
    now: effectiveNow,
    receiptRegistry
  });
  const admission = atomicAdmission(classified, effectiveNow);
  const eventVersions = sortedEventVersions(admission);
  const evidence = transformCurrentSoldEventsToEvidence(admission.admitted);
  const envelopeDigest = canonicalJsonDigest(envelope);
  const receiptRegistryDigest = canonicalJsonDigest(receiptRegistry);
  const eventVersionsDigest = canonicalJsonDigest(eventVersions);
  const evidenceDigest = currentSoldEvidenceDigest(evidence);
  const admissionDigest = canonicalCurrentSoldAdmissionDigest(admission);

  const receiptIdentity = {
    batch_id: envelope.batch_id,
    source_sha: envelope.source_sha,
    canonical_run_id: envelope.canonical_run_id,
    evaluated_at: effectiveNow.toISOString(),
    envelope_digest: envelopeDigest,
    receipt_registry_digest: receiptRegistryDigest,
    event_versions_digest: eventVersionsDigest,
    evidence_digest: evidenceDigest,
    admission_digest: admissionDigest
  };
  const receiptId = canonicalCurrentSoldBatchReceiptId(receiptIdentity);
  const writeEligible = admission.status === 'PASS';
  const receipt = {
    schema_version: 'current-sold-batch-receipt-v1',
    receipt_id: receiptId,
    receipt_type: 'CURRENT_SOLD_BATCH_ADMISSION',
    status: admission.status,
    batch_id: envelope.batch_id,
    created_at: envelope.created_at,
    evaluated_at: effectiveNow.toISOString(),
    source_sha: envelope.source_sha,
    canonical_run_id: envelope.canonical_run_id,
    envelope_digest: envelopeDigest,
    receipt_registry_digest: receiptRegistryDigest,
    event_versions_digest: eventVersionsDigest,
    evidence_digest: evidenceDigest,
    admission_digest: admissionDigest,
    counts: {
      input: envelope.observations.length,
      admitted: admission.admitted_count,
      rejected: admission.rejected_count,
      quarantined: admission.quarantined_count,
      superseded: admission.superseded_count,
      evidence: evidence.length
    },
    ledger: {
      write_eligible: writeEligible,
      state: writeEligible ? 'ELIGIBLE_NOT_ATTEMPTED' : 'BLOCKED_BY_ADMISSION'
    },
    claim_boundary: {
      empirical_global_current_sold_claim: 'UNSET',
      public: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD'
    }
  };

  return {
    schema_version: 'current-sold-batch-bundle-v1',
    envelope,
    receipt_registry: receiptRegistry,
    event_versions: eventVersions,
    admission,
    evidence,
    receipt
  };
}

export async function writeCurrentSoldBatchBundle() {
  fail('CURRENT_SOLD_BATCH_RAW_BUNDLE_PERSISTENCE_DISABLED');
}

export async function runCurrentSoldBatchCli() {
  fail('CURRENT_SOLD_BATCH_LEGACY_CLI_DISABLED_USE_PRIVATE_DRY_RUN');
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  runCurrentSoldBatchCli()
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
