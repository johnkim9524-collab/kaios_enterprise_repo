import {
  buildCurrentSoldBatchBundle,
  canonicalCurrentSoldAdmissionDigest,
  canonicalCurrentSoldBatchReceiptId,
  canonicalJsonDigest
} from './current-sold-batch-v1.mjs';
import { admitCurrentSoldBatch } from './current-sold-engine-v1.mjs';
import {
  currentSoldEvidenceDigest,
  transformCurrentSoldEventsToEvidence
} from './current-sold-evidence-v1.mjs';

export const STRICT_CURRENT_MAX_AGE_DAYS = 7;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;

function fail(code) {
  throw new Error(code);
}

function validNow(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail('CURRENT_SOLD_ATOMIC_INVALID_NOW');
  return value;
}

function strictCurrentRejection(event) {
  return {
    source_id: event.source_id,
    source_event_id: event.source_event_id,
    canonical_object_id: event.canonical_object_id,
    disposition: 'REJECTED',
    reason: 'CURRENT_SOLD_NOT_STRICT_CURRENT'
  };
}

function strictCurrentViolations(events, now) {
  const violations = [];
  for (const event of events) {
    const soldAt = new Date(event.sold_at);
    if (Number.isNaN(soldAt.getTime())) fail('CURRENT_SOLD_ATOMIC_INVALID_SOLD_AT');
    const ageDays = (now.getTime() - soldAt.getTime()) / 86400000;
    if (ageDays < -1 / 24 || ageDays > STRICT_CURRENT_MAX_AGE_DAYS) {
      violations.push(strictCurrentRejection(event));
    }
  }
  return violations;
}

function diagnosticIdentity(event) {
  return {
    event_id: event.event_id,
    content_digest: event.content_digest
  };
}

export function admitAtomicCurrentSoldBatch(observations, options = {}) {
  if (!Array.isArray(observations)) fail('CURRENT_SOLD_ATOMIC_BATCH_NOT_ARRAY');
  if (observations.length === 0) fail('CURRENT_SOLD_ATOMIC_BATCH_EMPTY');
  const now = validNow(options.now ?? new Date());
  const base = admitCurrentSoldBatch(observations, { ...options, now });
  const validatedCandidates = [...base.admitted];
  const validatedSuperseded = [...base.superseded];
  const freshnessRejected = strictCurrentViolations(validatedCandidates, now);
  const rejected = [...base.rejected, ...freshnessRejected];
  const quarantined = [...base.quarantined];

  const issueCount = rejected.length + quarantined.length;
  const pass = base.status === 'PASS' && issueCount === 0;
  const status = pass
    ? 'PASS'
    : validatedCandidates.length > 0
      ? 'PARTIAL_FAIL_CLOSED'
      : 'FAIL_CLOSED';
  const admitted = pass ? validatedCandidates : [];
  const superseded = pass ? validatedSuperseded : [];

  return {
    engine: 'KIDULTS_CURRENT_SOLD_ATOMIC_ADMISSION_V1',
    status,
    atomic_batch: true,
    strict_current_max_age_days: STRICT_CURRENT_MAX_AGE_DAYS,
    validated_candidate_count: validatedCandidates.length,
    diagnostic_candidates: pass ? [] : validatedCandidates.map(diagnosticIdentity),
    diagnostic_superseded: pass ? [] : validatedSuperseded.map(diagnosticIdentity),
    admitted_count: admitted.length,
    rejected_count: rejected.length,
    quarantined_count: quarantined.length,
    superseded_count: superseded.length,
    admitted,
    rejected,
    quarantined,
    superseded,
    claim_boundary: {
      owned_intelligence_product: true,
      external_sources_are_replaceable_evidence_layers: true,
      atomic_batch_admission: true,
      strict_current_max_age_days: STRICT_CURRENT_MAX_AGE_DAYS,
      validated_candidate_count: validatedCandidates.length,
      batch_admitted_current_sold_count: admitted.length,
      public: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD'
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

function expectedRegistryDigest(value) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    fail('CURRENT_SOLD_ATOMIC_EXPECTED_REGISTRY_DIGEST_REQUIRED');
  }
  return value;
}

export function buildAtomicCurrentSoldBatchBundle(
  envelopeInput,
  receiptRegistryInput,
  { now, expectedReceiptRegistryDigest } = {}
) {
  const legacy = buildCurrentSoldBatchBundle(envelopeInput, receiptRegistryInput, { now });
  const expectedDigest = expectedRegistryDigest(expectedReceiptRegistryDigest);
  const actualDigest = canonicalJsonDigest(legacy.receipt_registry);
  if (actualDigest !== expectedDigest) fail('CURRENT_SOLD_ATOMIC_REGISTRY_DIGEST_MISMATCH');

  const evaluatedAt = new Date(legacy.receipt.evaluated_at);
  const admission = admitAtomicCurrentSoldBatch(legacy.envelope.observations, {
    now: evaluatedAt,
    receiptRegistry: legacy.receipt_registry
  });
  const pass = admission.status === 'PASS';
  const eventVersions = pass ? sortedEventVersions(admission) : [];
  const evidence = pass ? transformCurrentSoldEventsToEvidence(admission.admitted) : [];
  const envelopeDigest = canonicalJsonDigest(legacy.envelope);
  const eventVersionsDigest = canonicalJsonDigest(eventVersions);
  const evidenceDigest = currentSoldEvidenceDigest(evidence);
  const admissionDigest = canonicalCurrentSoldAdmissionDigest(admission);

  const receiptIdentity = {
    batch_id: legacy.envelope.batch_id,
    source_sha: legacy.envelope.source_sha,
    canonical_run_id: legacy.envelope.canonical_run_id,
    evaluated_at: evaluatedAt.toISOString(),
    envelope_digest: envelopeDigest,
    receipt_registry_digest: actualDigest,
    event_versions_digest: eventVersionsDigest,
    evidence_digest: evidenceDigest,
    admission_digest: admissionDigest
  };
  const receipt = {
    schema_version: 'current-sold-batch-receipt-v1',
    receipt_id: canonicalCurrentSoldBatchReceiptId(receiptIdentity),
    receipt_type: 'CURRENT_SOLD_BATCH_ADMISSION',
    status: admission.status,
    batch_id: legacy.envelope.batch_id,
    created_at: legacy.envelope.created_at,
    evaluated_at: evaluatedAt.toISOString(),
    source_sha: legacy.envelope.source_sha,
    canonical_run_id: legacy.envelope.canonical_run_id,
    envelope_digest: envelopeDigest,
    receipt_registry_digest: actualDigest,
    event_versions_digest: eventVersionsDigest,
    evidence_digest: evidenceDigest,
    admission_digest: admissionDigest,
    counts: {
      input: legacy.envelope.observations.length,
      admitted: admission.admitted_count,
      rejected: admission.rejected_count,
      quarantined: admission.quarantined_count,
      superseded: admission.superseded_count,
      evidence: evidence.length
    },
    ledger: {
      write_eligible: pass,
      state: pass ? 'ELIGIBLE_NOT_ATTEMPTED' : 'BLOCKED_BY_ADMISSION'
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
    atomic_control: {
      schema_version: 'current-sold-atomic-control-v1',
      strict_current_max_age_days: STRICT_CURRENT_MAX_AGE_DAYS,
      whole_batch_atomic: true,
      expected_receipt_registry_digest_bound: true
    },
    envelope: legacy.envelope,
    receipt_registry: legacy.receipt_registry,
    event_versions: eventVersions,
    admission,
    evidence,
    receipt
  };
}
