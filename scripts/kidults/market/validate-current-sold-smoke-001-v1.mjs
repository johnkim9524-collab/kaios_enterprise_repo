import fs from 'node:fs';
import assert from 'node:assert/strict';
import { admitCurrentSoldBatch } from './current-sold-engine-v1.mjs';

const fixture = JSON.parse(fs.readFileSync('coordination/kidults/market/current-sold-smoke-001-v1.json', 'utf8'));

assert.equal(fixture.state, 'SMOKE_EMPIRICAL_REFERENCE_ONLY');
assert.equal(fixture.rights_receipt.decision, 'ALLOW_PRIVATE_CURRENT_SOLD');
assert.equal(fixture.rights_receipt.collector_market_representativeness, 'NOT_ESTABLISHED');
assert.equal(fixture.acquisition_receipt.credential_used, false);
assert.equal(fixture.acquisition_receipt.bid_or_purchase, false);
assert.equal(fixture.claim_boundary.collector_current_sold_market_evidence_count, 0);
assert.equal(fixture.claim_boundary.track_b_official_input, false);

const result = admitCurrentSoldBatch([fixture.observation], { now: new Date('2026-09-01T06:23:44.000Z') });
assert.equal(result.status, 'PASS');
assert.equal(result.admitted_count, 1);
assert.equal(result.rejected_count, 0);
const event = result.admitted[0];
assert.equal(event.transaction_status, 'SOLD');
assert.equal(event.source_id, 'us-state-department-online-auction');
assert.equal(event.source_event_id, '646ef583-4bb8-43a6-b3d5-a5909e1452a5::AW7607L');
assert.equal(event.realized_consideration, 9);
assert.equal(event.currency, 'EUR');
assert.equal(event.rights_decision, 'ALLOW_PRIVATE_CURRENT_SOLD');
assert.equal(event.provenance_digest, fixture.acquisition_receipt.provenance_digest);
assert.equal(result.claim_boundary.public, 'HOLD');
assert.equal(result.claim_boundary.production, 'HOLD');
assert.equal(result.claim_boundary.g5, 'HOLD');

console.log(JSON.stringify({
  state: 'CURRENT_SOLD_SMOKE_001_PASS',
  admitted_count: 1,
  rejected_count: 0,
  event_id: event.event_id,
  collector_market_evidence_count: 0,
  track_b: 'NOT_STARTED',
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
