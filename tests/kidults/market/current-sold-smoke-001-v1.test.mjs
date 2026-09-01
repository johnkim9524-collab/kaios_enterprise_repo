import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admitCurrentSoldBatch } from '../../../scripts/kidults/market/current-sold-engine-v1.mjs';

const fixture = JSON.parse(fs.readFileSync('coordination/kidults/market/current-sold-smoke-001-v1.json', 'utf8'));

test('admits exactly one lawful factual SOLD event as smoke-only Current-SOLD', () => {
  const result = admitCurrentSoldBatch([fixture.observation], { now: new Date('2026-09-01T06:23:44.000Z') });
  assert.equal(result.status, 'PASS');
  assert.equal(result.admitted_count, 1);
  assert.equal(result.rejected_count, 0);
  assert.equal(result.admitted[0].transaction_status, 'SOLD');
  assert.equal(result.admitted[0].realized_consideration, 9);
  assert.equal(result.admitted[0].currency, 'EUR');
});

test('smoke evidence cannot widen collector-market or release claims', () => {
  assert.equal(fixture.rights_receipt.collector_market_representativeness, 'NOT_ESTABLISHED');
  assert.equal(fixture.claim_boundary.collector_current_sold_market_evidence_count, 0);
  assert.equal(fixture.claim_boundary.representative_price_claim, false);
  assert.equal(fixture.claim_boundary.liquidity_claim, false);
  assert.equal(fixture.claim_boundary.track_b_official_input, false);
  assert.equal(fixture.claim_boundary.public, 'HOLD');
  assert.equal(fixture.claim_boundary.production, 'HOLD');
  assert.equal(fixture.claim_boundary.g5, 'HOLD');
});
