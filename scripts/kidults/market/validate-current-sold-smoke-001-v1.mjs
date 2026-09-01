import fs from 'node:fs';
import assert from 'node:assert/strict';
import { admitCurrentSoldBatch } from './current-sold-engine-v1.mjs';

const path = 'coordination/kidults/market/current-sold-smoke-001-v1.json';
const doc = JSON.parse(fs.readFileSync(path, 'utf8'));

assert.equal(doc.state, 'SMOKE_EMPIRICAL_REFERENCE_ONLY');
assert.equal(doc.rights_receipt.decision, 'ALLOW_PRIVATE_CURRENT_SOLD');
assert.equal(doc.rights_receipt.collector_market_representativeness, 'NOT_ESTABLISHED');
assert.equal(doc.acquisition_receipt.credential_used, false);
assert.equal(doc.acquisition_receipt.bid_or_purchase, false);
assert.equal(doc.claim_boundary.collector_current_sold_market_evidence_count, 0);
assert.equal(doc.claim_boundary.track_b_official_input, false);
assert.equal(doc.claim_boundary.public, 'HOLD');
assert.equal(doc.claim_boundary.production, 'HOLD');
assert.equal(doc.claim_boundary.g5, 'HOLD');

const now = new Date('2026-09-01T06:23:44.000Z');
const result = admitCurrentSoldBatch([doc.observation], { now });
assert.equal(result.status, 'PASS');
assert.equal(result.admitted_count, 1);
assert.equal(result.rejected_count, 0);

const event = result.admitted[0];
assert.equal(event.transaction_status, 'SOLD');
assert.equal(event.source_id, 'us-state-department-online-auction');
assert.equal(event.source_event_id, '646ef583-4bb8-43a6-b3d5-a5909e1452a5::AW7607L');
assert.equal(event.realized_consideration, 9);
assert.equal(event.currency, 'EUR');
assert.equal(event.fee_semantics, 'SOURCE_REPORTED_UNKNOWN_FEE_BASIS');
assert.equal(event.rights_decision, 'ALLOW_PRIVATE_CURRENT_SOLD');
assert.equal(event.acquisition_receipt_id, doc.acquisition_receipt.receipt_id);
assert.equal(event.rights_receipt_id, doc.rights_receipt.receipt_id);
assert.equal(event.provenance_digest, doc.acquisition_receipt.provenance_digest);
assert.equal(result.claim_boundary.owned_intelligence_product, true);
assert.equal(result.claim_boundary.public, 'HOLD');
assert.equal(result.claim_boundary.production, 'HOLD');
assert.equal(result.claim_boundary.g5, 'HOLD');

console.log(JSON.stringify({
  state: 'CURRENT_SOLD_SMOKE_001_PASS',
  admitted_count: result.admitted_count,
  event_id: event.event_id,
  collector_market_evidence_count: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
