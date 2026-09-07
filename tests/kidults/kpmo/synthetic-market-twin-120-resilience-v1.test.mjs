import test from 'node:test';
import assert from 'node:assert/strict';
import { admitCurrentSoldBatch, canonicalContentDigest, canonicalEventId } from '../../../scripts/kidults/market/current-sold-engine-v1.mjs';
import { admitAtomicCurrentSoldBatch } from '../../../scripts/kidults/market/current-sold-atomic-batch-v1.mjs';
import { runSyntheticDownstreamControlBatch } from '../../../scripts/kidults/runtime/synthetic-downstream-control-engine-v1.mjs';

const NOW = new Date('2026-09-01T05:00:00.000Z');
const SHA = '7'.repeat(40);
const RUN = 'kir-fixture-resilience-1';
const digest = char => `sha256:${char.repeat(64)}`;

function raw(overrides = {}) {
  return {
    canonical_object_id:'kir-fixture:resilience:object-01',
    source_id:'kir-fixture-source-resilience', source_event_id:'kir-fixture-event-resilience-01',
    source_url:'https://kir-fixture.invalid/resilience/sold/01', source_owner:'KIR SYNTHETIC',
    venue:'SYNTHETIC', transaction_status:'SOLD', sold_at:'2026-08-31T05:00:00.000Z',
    observed_at:'2026-09-01T04:00:00.000Z', realized_consideration:1000, currency:'USD',
    hammer_price:null, all_in_price:null, normalized_price:null, normalized_currency:null,
    fee_semantics:'SOURCE_REPORTED_UNKNOWN_FEE_BASIS', lot_or_listing_id:'kir-fixture-lot-01',
    provenance_digest:digest('a'), acquisition_receipt_id:'kir-fixture-acq-01',
    rights_receipt_id:'kir-fixture-rights-01', rights_decision:'ALLOW_PRIVATE_CURRENT_SOLD', confidence:0.98,
    correction_state:'ORIGINAL', supersedes_event_id:null, supersedes_content_digest:null,
    source_sha:SHA, canonical_run_id:RUN, ...overrides
  };
}

function seal(value, now = NOW) {
  const copy = structuredClone(value);
  delete copy.content_digest;
  copy.content_digest = canonicalContentDigest(copy, {now});
  return copy;
}

function registryFor(...rows) {
  return {
    acquisitions:rows.map(row => ({
      receipt_id:row.acquisition_receipt_id, receipt_type:'ACQUISITION', status:'PASS', source_id:row.source_id,
      source_event_id:row.source_event_id, source_url:row.source_url, provenance_digest:row.provenance_digest,
      content_digest:row.content_digest, source_sha:row.source_sha, canonical_run_id:row.canonical_run_id
    })),
    rights:[...new Map(rows.map(row => [row.rights_receipt_id, {
      receipt_id:row.rights_receipt_id, receipt_type:'RIGHTS', status:'PASS', source_id:row.source_id,
      decision:'ALLOW_PRIVATE_CURRENT_SOLD', purpose:'PRIVATE_CURRENT_SOLD', source_sha:row.source_sha,
      canonical_run_id:row.canonical_run_id, valid_from:'2026-01-01T00:00:00.000Z', valid_until:'2026-12-31T23:59:59.999Z'
    }])).values()]
  };
}

test('clock-skew and out-of-order observations fail closed', () => {
  assert.throws(() => canonicalContentDigest(raw({sold_at:'2026-09-01T07:00:00.000Z', observed_at:'2026-09-01T07:01:00.000Z'}), {now:NOW}), /CURRENT_SOLD_SALE_IN_FUTURE/);
  assert.throws(() => canonicalContentDigest(raw({observed_at:'2026-08-30T05:00:00.000Z'}), {now:NOW}), /CURRENT_SOLD_OBSERVED_BEFORE_SALE/);
});

test('hammer and all-in fee semantics cannot silently drift', () => {
  assert.throws(() => canonicalContentDigest(raw({fee_semantics:'HAMMER', hammer_price:900}), {now:NOW}), /CURRENT_SOLD_HAMMER_SEMANTICS_MISMATCH/);
  assert.throws(() => canonicalContentDigest(raw({fee_semantics:'ALL_IN', all_in_price:1100}), {now:NOW}), /CURRENT_SOLD_ALL_IN_SEMANTICS_MISMATCH/);
});

test('valid correction supersedes exactly one original and admits only the head', () => {
  const original = seal(raw());
  const corrected = seal(raw({observed_at:'2026-09-01T04:30:00.000Z', realized_consideration:1100,
    acquisition_receipt_id:'kir-fixture-acq-02', correction_state:'CORRECTED',
    supersedes_event_id:canonicalEventId(original), supersedes_content_digest:original.content_digest}));
  const result = admitCurrentSoldBatch([corrected, original], {now:NOW, receiptRegistry:registryFor(original, corrected)});
  assert.equal(result.status, 'PASS');
  assert.equal(result.admitted_count, 1);
  assert.equal(result.superseded_count, 1);
  assert.equal(result.admitted[0].realized_consideration, 1100);
});

test('out-of-order correction lineage is quarantined', () => {
  const original = seal(raw({observed_at:'2026-09-01T04:30:00.000Z'}));
  const corrected = seal(raw({observed_at:'2026-09-01T04:00:00.000Z', realized_consideration:1100,
    acquisition_receipt_id:'kir-fixture-acq-02', correction_state:'CORRECTED',
    supersedes_event_id:canonicalEventId(original), supersedes_content_digest:original.content_digest}));
  const result = admitCurrentSoldBatch([original, corrected], {now:NOW, receiptRegistry:registryFor(original, corrected)});
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.admitted_count, 0);
  assert.equal(result.quarantined_count, 2);
});

test('cancelled and relisted events remain non-SOLD and fail closed', () => {
  for (const transaction_status of ['CANCELLED','RELISTED']) {
    assert.throws(() => canonicalContentDigest(raw({transaction_status}), {now:NOW}), /CURRENT_SOLD_NOT_TERMINAL_SOLD/);
  }
});

test('byte-identical replay is idempotent', () => {
  const row = seal(raw());
  const result = admitCurrentSoldBatch([row, structuredClone(row), structuredClone(row)], {now:NOW, receiptRegistry:registryFor(row)});
  assert.equal(result.status, 'PASS');
  assert.equal(result.admitted_count, 1);
  assert.equal(result.rejected_count, 0);
});

test('one invalid row prevents partial batch admission', () => {
  const valid = seal(raw());
  const invalid = structuredClone(valid);
  invalid.source_event_id = 'kir-fixture-event-resilience-02';
  invalid.canonical_object_id = 'kir-fixture:resilience:object-02';
  invalid.acquisition_receipt_id = 'kir-fixture-acq-02';
  invalid.content_digest = digest('0');
  const result = admitAtomicCurrentSoldBatch([valid, invalid], {now:NOW, receiptRegistry:registryFor(valid, invalid)});
  assert.equal(result.status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(result.admitted_count, 0);
  assert.equal(result.diagnostic_candidates.length, 1);
});

test('parallel control runs are deterministic and share no mutable state', async () => {
  const records = Array.from({length:120}, (_, index) => ({
    canonical_object_id:`kir-fixture:parallel-${Math.floor(index / 15) + 1}:object-${String(index % 15 + 1).padStart(2, '0')}`,
    provenance_digest:digest((index % 10).toString())
  }));
  const runs = await Promise.all(Array.from({length:8}, async () => runSyntheticDownstreamControlBatch(records)));
  assert.equal(new Set(runs.map(run => JSON.stringify(run))).size, 1);
  assert.equal(runs.every(run => Object.isFrozen(run) && run.length === 120), true);
});

test('downstream backpressure boundary and duplicate fan-in fail closed', () => {
  const one = {canonical_object_id:'kir-fixture:pressure:object-01', provenance_digest:digest('b')};
  assert.throws(() => runSyntheticDownstreamControlBatch([]), /SMT_DOWNSTREAM_BATCH_SIZE/);
  assert.throws(() => runSyntheticDownstreamControlBatch(Array.from({length:10001}, () => one)), /SMT_DOWNSTREAM_BATCH_SIZE/);
  assert.throws(() => runSyntheticDownstreamControlBatch([one, structuredClone(one)]), /SMT_DOWNSTREAM_DUPLICATE_OBJECT/);
});
