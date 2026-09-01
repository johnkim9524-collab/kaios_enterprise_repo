import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitAtomicCurrentSoldBatch,
  buildAtomicCurrentSoldBatchBundle,
  STRICT_CURRENT_MAX_AGE_DAYS
} from '../../../scripts/kidults/market/current-sold-atomic-batch-v1.mjs';
import { canonicalJsonDigest } from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import {
  NOW,
  batchEnvelope,
  rawObservation,
  receiptRegistryFor,
  sealObservation
} from './current-sold-test-helpers-v1.mjs';

function valid(overrides = {}) {
  return sealObservation(rawObservation(overrides));
}

test('atomic admission preserves a full PASS batch', () => {
  const input = valid();
  const registry = receiptRegistryFor(input);
  const result = admitAtomicCurrentSoldBatch([input], { now: NOW, receiptRegistry: registry });
  assert.equal(result.status, 'PASS');
  assert.equal(result.validated_candidate_count, 1);
  assert.equal(result.admitted_count, 1);
  assert.equal(result.diagnostic_candidates.length, 0);
  assert.equal(result.claim_boundary.atomic_batch_admission, true);
  assert.equal(result.claim_boundary.strict_current_max_age_days, STRICT_CURRENT_MAX_AGE_DAYS);
});

test('one invalid unrelated row withholds every otherwise valid admission', () => {
  const good = valid({
    source_event_id: 'lot-good',
    lot_or_listing_id: 'lot-good',
    source_url: 'https://example.com/results/lot-good',
    acquisition_receipt_id: 'acq-good',
    rights_receipt_id: 'rights-good'
  });
  const bad = valid({
    source_event_id: 'lot-bad',
    lot_or_listing_id: 'lot-bad',
    source_url: 'https://example.com/results/lot-bad',
    acquisition_receipt_id: 'unregistered-acquisition',
    rights_receipt_id: 'rights-good'
  });
  const registry = receiptRegistryFor(good);
  const result = admitAtomicCurrentSoldBatch([good, bad], { now: NOW, receiptRegistry: registry });
  assert.equal(result.status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(result.validated_candidate_count, 1);
  assert.equal(result.admitted_count, 0);
  assert.equal(result.admitted.length, 0);
  assert.equal(result.superseded.length, 0);
  assert.equal(result.diagnostic_candidates.length, 1);
  assert.equal(result.rejected_count, 1);
  assert.equal(result.claim_boundary.batch_admitted_current_sold_count, 0);
});

test('strict Current-SOLD rejects an otherwise valid sale older than seven days', () => {
  const input = valid({
    sold_at: '2026-08-24T04:59:59.000Z',
    observed_at: '2026-08-24T05:30:00.000Z'
  });
  const registry = receiptRegistryFor(input);
  const result = admitAtomicCurrentSoldBatch([input], { now: NOW, receiptRegistry: registry });
  assert.equal(result.status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(result.validated_candidate_count, 1);
  assert.equal(result.admitted_count, 0);
  assert.equal(result.rejected_count, 1);
  assert.equal(result.rejected[0].reason, 'CURRENT_SOLD_NOT_STRICT_CURRENT');
});

test('atomic bundle emits no event versions or Evidence for a non-PASS batch', () => {
  const good = valid({
    source_event_id: 'lot-good-2',
    lot_or_listing_id: 'lot-good-2',
    source_url: 'https://example.com/results/lot-good-2',
    acquisition_receipt_id: 'acq-good-2',
    rights_receipt_id: 'rights-good-2'
  });
  const bad = valid({
    source_event_id: 'lot-bad-2',
    lot_or_listing_id: 'lot-bad-2',
    source_url: 'https://example.com/results/lot-bad-2',
    acquisition_receipt_id: 'missing-acq-2',
    rights_receipt_id: 'rights-good-2'
  });
  const registry = receiptRegistryFor(good);
  const envelope = batchEnvelope([good, bad]);
  const bundle = buildAtomicCurrentSoldBatchBundle(envelope, registry, {
    now: NOW,
    expectedReceiptRegistryDigest: canonicalJsonDigest(registry)
  });
  assert.equal(bundle.receipt.status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(bundle.admission.validated_candidate_count, 1);
  assert.equal(bundle.receipt.counts.admitted, 0);
  assert.equal(bundle.receipt.counts.evidence, 0);
  assert.deepEqual(bundle.event_versions, []);
  assert.deepEqual(bundle.evidence, []);
  assert.equal(bundle.receipt.ledger.write_eligible, false);
  assert.equal(bundle.atomic_control.whole_batch_atomic, true);
});

test('atomic bundle requires a separately supplied exact registry digest', () => {
  const input = valid();
  const registry = receiptRegistryFor(input);
  const envelope = batchEnvelope([input]);
  assert.throws(
    () => buildAtomicCurrentSoldBatchBundle(envelope, registry, { now: NOW }),
    /CURRENT_SOLD_ATOMIC_EXPECTED_REGISTRY_DIGEST_REQUIRED/
  );
  assert.throws(
    () => buildAtomicCurrentSoldBatchBundle(envelope, registry, {
      now: NOW,
      expectedReceiptRegistryDigest: `sha256:${'f'.repeat(64)}`
    }),
    /CURRENT_SOLD_ATOMIC_REGISTRY_DIGEST_MISMATCH/
  );
});
