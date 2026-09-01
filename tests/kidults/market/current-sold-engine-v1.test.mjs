import test from 'node:test';
import assert from 'node:assert/strict';
import { admitCurrentSoldBatch, normalizeCurrentSoldObservation } from '../../../scripts/kidults/market/current-sold-engine-v1.mjs';

const NOW = new Date('2026-09-01T05:00:00.000Z');
const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;

function valid(overrides = {}) {
  return {
    canonical_object_id: 'vehicle:ferrari:f40:1989:example',
    source_id: 'auction_house_a',
    source_event_id: 'lot-42',
    source_url: 'https://example.com/results/lot-42',
    source_owner: 'Auction House A',
    venue: 'Monterey',
    transaction_status: 'SOLD',
    sold_at: '2026-08-30T20:00:00.000Z',
    observed_at: '2026-08-31T00:00:00.000Z',
    realized_consideration: 1800000,
    currency: 'USD',
    fee_semantics: 'SOURCE_REPORTED_UNKNOWN_FEE_BASIS',
    provenance_digest: DIGEST_A,
    acquisition_receipt_id: 'acq-run-1',
    rights_receipt_id: 'rights-1',
    rights_decision: 'ALLOW_PRIVATE_CURRENT_SOLD',
    confidence: 0.98,
    ...overrides
  };
}

test('admits one genuine current SOLD event and produces deterministic owned id', () => {
  const a = normalizeCurrentSoldObservation(valid(), { now: NOW });
  const b = normalizeCurrentSoldObservation(valid(), { now: NOW });
  assert.equal(a.event_id, b.event_id);
  assert.match(a.event_id, /^cs_[a-f0-9]{24}$/);
  assert.equal(a.transaction_status, 'SOLD');
  assert.equal(a.rights_decision, 'ALLOW_PRIVATE_CURRENT_SOLD');
});

test('rejects ASKING/listing state as terminal SOLD', () => {
  assert.throws(() => normalizeCurrentSoldObservation(valid({ transaction_status: 'ASKING' }), { now: NOW }), /CURRENT_SOLD_NOT_TERMINAL_SOLD/);
});

test('rejects event with rights HOLD', () => {
  assert.throws(() => normalizeCurrentSoldObservation(valid({ rights_decision: 'HOLD' }), { now: NOW }), /CURRENT_SOLD_RIGHTS_NOT_ALLOWED/);
});

test('rejects stale transaction older than bounded current window', () => {
  assert.throws(() => normalizeCurrentSoldObservation(valid({ sold_at: '2026-07-01T00:00:00.000Z' }), { now: NOW }), /CURRENT_SOLD_NOT_CURRENT/);
});

test('rejects missing acquisition provenance receipt', () => {
  assert.throws(() => normalizeCurrentSoldObservation(valid({ acquisition_receipt_id: '' }), { now: NOW }), /CURRENT_SOLD_MISSING_ACQUISITION_RECEIPT_ID/);
});

test('deduplicates identical source transaction deterministically', () => {
  const result = admitCurrentSoldBatch([valid(), valid()], { now: NOW });
  assert.equal(result.admitted_count, 1);
  assert.equal(result.rejected_count, 0);
  assert.equal(result.status, 'PASS');
});

test('fails closed on conflicting payload for same source transaction identity', () => {
  const result = admitCurrentSoldBatch([
    valid(),
    valid({ provenance_digest: DIGEST_B, realized_consideration: 1900000 })
  ], { now: NOW });
  assert.equal(result.admitted_count, 1);
  assert.equal(result.rejected_count, 1);
  assert.equal(result.status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(result.rejected[0].reason, 'CURRENT_SOLD_SOURCE_IDENTITY_CONFLICT');
});

test('never grants Public, Production, or G5 authority', () => {
  const result = admitCurrentSoldBatch([valid()], { now: NOW });
  assert.equal(result.claim_boundary.owned_intelligence_product, true);
  assert.equal(result.claim_boundary.public, 'HOLD');
  assert.equal(result.claim_boundary.production, 'HOLD');
  assert.equal(result.claim_boundary.g5, 'HOLD');
});
