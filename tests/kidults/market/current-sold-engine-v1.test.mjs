import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitCurrentSoldBatch,
  canonicalContentDigest,
  canonicalEventId,
  normalizeCurrentSoldObservation
} from '../../../scripts/kidults/market/current-sold-engine-v1.mjs';

const NOW = new Date('2026-09-01T05:00:00.000Z');
const SOURCE_SHA = '1'.repeat(40);
const RUN_ID = 'current-sold-run-20260901-001';
const PROVENANCE = `sha256:${'a'.repeat(64)}`;

function raw(overrides = {}) {
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
    hammer_price: null,
    all_in_price: null,
    normalized_price: null,
    normalized_currency: null,
    fee_semantics: 'SOURCE_REPORTED_UNKNOWN_FEE_BASIS',
    lot_or_listing_id: 'lot-42',
    provenance_digest: PROVENANCE,
    acquisition_receipt_id: 'acq-1',
    rights_receipt_id: 'rights-1',
    rights_decision: 'ALLOW_PRIVATE_CURRENT_SOLD',
    confidence: 0.98,
    correction_state: 'ORIGINAL',
    supersedes_event_id: null,
    supersedes_content_digest: null,
    source_sha: SOURCE_SHA,
    canonical_run_id: RUN_ID,
    ...overrides
  };
}

function seal(value) {
  const copy = structuredClone(value);
  copy.content_digest = canonicalContentDigest(copy, { now: NOW });
  return copy;
}

function registryFor(...inputs) {
  const acquisitions = [];
  const rightsById = new Map();
  for (const input of inputs) {
    acquisitions.push({
      receipt_id: input.acquisition_receipt_id,
      receipt_type: 'ACQUISITION',
      status: 'PASS',
      source_id: input.source_id,
      source_event_id: input.source_event_id,
      source_url: input.source_url,
      provenance_digest: input.provenance_digest,
      content_digest: input.content_digest,
      source_sha: input.source_sha,
      canonical_run_id: input.canonical_run_id
    });
    rightsById.set(input.rights_receipt_id, {
      receipt_id: input.rights_receipt_id,
      receipt_type: 'RIGHTS',
      status: 'PASS',
      source_id: input.source_id,
      decision: 'ALLOW_PRIVATE_CURRENT_SOLD',
      purpose: 'PRIVATE_CURRENT_SOLD',
      source_sha: input.source_sha,
      canonical_run_id: input.canonical_run_id,
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: '2026-12-31T23:59:59.999Z'
    });
  }
  return { acquisitions, rights: [...rightsById.values()] };
}

function fixture(overrides = {}) {
  const input = seal(raw(overrides));
  return { input, receiptRegistry: registryFor(input) };
}

test('admits a bound genuine current SOLD event', () => {
  const { input, receiptRegistry } = fixture();
  const event = normalizeCurrentSoldObservation(input, { now: NOW, receiptRegistry });
  assert.match(event.event_id, /^cs_[a-f0-9]{24}$/);
  assert.match(event.content_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(event.source_sha, SOURCE_SHA);
  assert.equal(event.canonical_run_id, RUN_ID);
});

test('event id is stable source transaction identity and independent of content', () => {
  const a = raw();
  const b = raw({ realized_consideration: 1900000, currency: 'EUR' });
  assert.equal(canonicalEventId(a), canonicalEventId(b));
  assert.notEqual(canonicalContentDigest(a, { now: NOW }), canonicalContentDigest(b, { now: NOW }));
});

test('rejects arbitrary unregistered receipt ids', () => {
  const { input, receiptRegistry } = fixture();
  input.acquisition_receipt_id = 'made-up-receipt';
  assert.throws(
    () => normalizeCurrentSoldObservation(input, { now: NOW, receiptRegistry }),
    /CURRENT_SOLD_ACQUISITION_RECEIPT_NOT_REGISTERED/
  );
});

test('rejects receipt binding drift', () => {
  const { input, receiptRegistry } = fixture();
  receiptRegistry.acquisitions[0].source_event_id = 'lot-99';
  assert.throws(
    () => normalizeCurrentSoldObservation(input, { now: NOW, receiptRegistry }),
    /CURRENT_SOLD_ACQUISITION_EVENT_BINDING_MISMATCH/
  );
});


test('rejects acquisition source URL binding drift and malformed HTTPS references', () => {
  const { input, receiptRegistry } = fixture();
  receiptRegistry.acquisitions[0].source_url = 'https://example.com/results/other-lot';
  assert.throws(
    () => normalizeCurrentSoldObservation(input, { now: NOW, receiptRegistry }),
    /CURRENT_SOLD_ACQUISITION_URL_BINDING_MISMATCH/
  );
  assert.throws(
    () => canonicalContentDigest(raw({ source_url: 'https://' }), { now: NOW }),
    /CURRENT_SOLD_INVALID_SOURCE_URL/
  );
});


test('evaluates rights validity at observation time rather than historic sale time', () => {
  const { input, receiptRegistry } = fixture();
  receiptRegistry.rights[0].valid_from = '2026-08-30T22:00:00.000Z';
  assert.doesNotThrow(() => normalizeCurrentSoldObservation(input, { now: NOW, receiptRegistry }));
  receiptRegistry.rights[0].valid_until = '2026-08-30T23:00:00.000Z';
  assert.throws(
    () => normalizeCurrentSoldObservation(input, { now: NOW, receiptRegistry }),
    /CURRENT_SOLD_RIGHTS_EXPIRED/
  );
});

test('quarantines every related row when one source transaction changes object identity', () => {
  const a = seal(raw({ acquisition_receipt_id: 'acq-a', rights_receipt_id: 'rights-a' }));
  const b = seal(raw({
    canonical_object_id: 'vehicle:ferrari:enzo:2003:other',
    acquisition_receipt_id: 'acq-b',
    rights_receipt_id: 'rights-b'
  }));
  const result = admitCurrentSoldBatch([a, b], { now: NOW, receiptRegistry: registryFor(a, b) });
  assert.equal(result.admitted_count, 0);
  assert.equal(result.quarantined_count, 2);
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.deepEqual(new Set(result.quarantined.map(row => row.reason)), new Set(['CURRENT_SOLD_OBJECT_IDENTITY_CONFLICT']));
});

test('quarantines uncorrected content changes for the same source transaction', () => {
  const a = seal(raw({ acquisition_receipt_id: 'acq-a', rights_receipt_id: 'rights-a' }));
  const b = seal(raw({
    realized_consideration: 1900000,
    acquisition_receipt_id: 'acq-b',
    rights_receipt_id: 'rights-b'
  }));
  const result = admitCurrentSoldBatch([a, b], { now: NOW, receiptRegistry: registryFor(a, b) });
  assert.equal(result.admitted_count, 0);
  assert.equal(result.quarantined_count, 2);
  assert.equal(result.quarantined[0].reason, 'CURRENT_SOLD_CONTENT_IDENTITY_CONFLICT');
});

test('rejects invalid fee-price semantics', () => {
  const input = raw({ fee_semantics: 'HAMMER', hammer_price: 1700000 });
  assert.throws(() => canonicalContentDigest(input, { now: NOW }), /CURRENT_SOLD_HAMMER_SEMANTICS_MISMATCH/);
});

test('rejects lowercase or malformed currency instead of silently normalizing', () => {
  const input = raw({ currency: 'usd' });
  assert.throws(() => canonicalContentDigest(input, { now: NOW }), /CURRENT_SOLD_INVALID_CURRENCY/);
});

test('rejects malformed correction lineage', () => {
  const input = raw({ correction_state: 'CORRECTED', supersedes_event_id: 'cs_wrong', supersedes_content_digest: PROVENANCE });
  assert.throws(() => canonicalContentDigest(input, { now: NOW }), /CURRENT_SOLD_CORRECTION_EVENT_ID_MISMATCH/);
});

test('requires exact source sha and canonical run binding', () => {
  assert.throws(() => canonicalContentDigest(raw({ source_sha: null }), { now: NOW }), /CURRENT_SOLD_MISSING_SOURCE_SHA/);
  assert.throws(() => canonicalContentDigest(raw({ canonical_run_id: 'x' }), { now: NOW }), /CURRENT_SOLD_INVALID_CANONICAL_RUN_ID/);
});

test('deduplicates byte-equivalent source transaction rows', () => {
  const { input, receiptRegistry } = fixture();
  const result = admitCurrentSoldBatch([input, structuredClone(input)], { now: NOW, receiptRegistry });
  assert.equal(result.admitted_count, 1);
  assert.equal(result.rejected_count, 0);
  assert.equal(result.quarantined_count, 0);
  assert.equal(result.status, 'PASS');
});

test('rejects non-SOLD, stale, or rights-HOLD observations', () => {
  assert.throws(() => canonicalContentDigest(raw({ transaction_status: 'ASKING' }), { now: NOW }), /CURRENT_SOLD_NOT_TERMINAL_SOLD/);
  assert.throws(() => canonicalContentDigest(raw({ sold_at: '2026-07-01T00:00:00.000Z' }), { now: NOW }), /CURRENT_SOLD_NOT_CURRENT/);
  const { input, receiptRegistry } = fixture({ rights_decision: 'HOLD' });
  assert.throws(() => normalizeCurrentSoldObservation(input, { now: NOW, receiptRegistry }), /CURRENT_SOLD_RIGHTS_NOT_ALLOWED/);
});

test('never grants Public, Production, or G5 authority', () => {
  const { input, receiptRegistry } = fixture();
  const result = admitCurrentSoldBatch([input], { now: NOW, receiptRegistry });
  assert.equal(result.claim_boundary.public, 'HOLD');
  assert.equal(result.claim_boundary.production, 'HOLD');
  assert.equal(result.claim_boundary.g5, 'HOLD');
});
