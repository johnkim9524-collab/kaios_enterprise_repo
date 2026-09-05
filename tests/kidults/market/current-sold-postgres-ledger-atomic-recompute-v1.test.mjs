import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalCurrentSoldAdmissionDigest,
  canonicalCurrentSoldBatchReceiptId,
  canonicalJsonDigest
} from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import { admitCurrentSoldBatch } from '../../../scripts/kidults/market/current-sold-engine-v1.mjs';
import { transformCurrentSoldEventsToEvidence, currentSoldEvidenceDigest } from '../../../scripts/kidults/market/current-sold-evidence-v1.mjs';
import { appendCurrentSoldBundle } from '../../../scripts/kidults/market/current-sold-postgres-ledger-v1.mjs';
import {
  NOW,
  batchEnvelope,
  rawObservation,
  receiptRegistryFor,
  sealObservation
} from './current-sold-test-helpers-v1.mjs';

function forgeBaseOnlyPassBundle() {
  const input = sealObservation(rawObservation({
    sold_at: '2026-08-24T20:00:00.000Z',
    observed_at: '2026-08-25T00:00:00.000Z'
  }));
  const envelope = batchEnvelope([input]);
  const receiptRegistry = receiptRegistryFor(input);
  const admission = admitCurrentSoldBatch(envelope.observations, { now: NOW, receiptRegistry });
  assert.equal(admission.status, 'PASS');
  assert.equal(admission.admitted_count, 1);

  const eventVersions = [...admission.superseded, ...admission.admitted];
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
    evaluated_at: NOW.toISOString(),
    envelope_digest: envelopeDigest,
    receipt_registry_digest: receiptRegistryDigest,
    event_versions_digest: eventVersionsDigest,
    evidence_digest: evidenceDigest,
    admission_digest: admissionDigest
  };
  const receipt = {
    schema_version: 'current-sold-batch-receipt-v1',
    receipt_id: canonicalCurrentSoldBatchReceiptId(receiptIdentity),
    receipt_type: 'CURRENT_SOLD_BATCH_ADMISSION',
    status: 'PASS',
    batch_id: envelope.batch_id,
    created_at: envelope.created_at,
    evaluated_at: NOW.toISOString(),
    source_sha: envelope.source_sha,
    canonical_run_id: envelope.canonical_run_id,
    envelope_digest: envelopeDigest,
    receipt_registry_digest: receiptRegistryDigest,
    event_versions_digest: eventVersionsDigest,
    evidence_digest: evidenceDigest,
    admission_digest: admissionDigest,
    counts: {
      input: 1,
      admitted: 1,
      rejected: 0,
      quarantined: 0,
      superseded: 0,
      evidence: evidence.length
    },
    ledger: { write_eligible: true, state: 'ELIGIBLE_NOT_ATTEMPTED' },
    claim_boundary: { empirical_global_current_sold_claim: 'UNSET', public: 'HOLD', production: 'HOLD', g5: 'HOLD' }
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

test('PostgreSQL boundary independently re-applies strict 7-day atomic admission before SQL', async () => {
  const bundle = forgeBaseOnlyPassBundle();
  let sqlCalls = 0;
  const client = { async query() { sqlCalls += 1; throw new Error('SQL_MUST_NOT_RUN'); } };
  await assert.rejects(
    () => appendCurrentSoldBundle(client, bundle, { now: NOW }),
    /CURRENT_SOLD_LEDGER_ADMISSION_RECOMPUTE_MISMATCH/
  );
  assert.equal(sqlCalls, 0);
});
