import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function baseRecord(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    primitive: 'TRANSACTION_PRICE_COMPARABLE',
    source: 'TEST_MARKET_PROVIDER',
    sourceUrl: 'https://example.invalid/evidence/1',
    rightsClass: 'LICENSED_COMMERCIAL_DATA',
    observedAt: new Date().toISOString(),
    payloadHash: 'abc123',
    evidenceClass: 'TRANSACTION_MARKET_EVIDENCE',
    safety: { synthetic: false, estimated: false, listingOnly: false },
    value: {
      transactionId: 'tx-1',
      venue: 'TEST_VENUE',
      transactionAt: '2026-08-01T00:00:00Z',
      currency: 'USD',
      price: 1000,
      transactionType: 'MARKETPLACE_COMPLETED_SALE'
    },
    ...overrides,
  };
}

function runValidator(records) {
  return spawnSync(process.execPath, ['scripts/kidult100-provider-evidence-validate.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_RIGHT_DATA_EVIDENCE_JSON: JSON.stringify(records),
    },
  });
}

test('provider evidence contract rejects listing price as transaction evidence', () => {
  const record = baseRecord({
    safety: { synthetic: false, estimated: false, listingOnly: true },
    value: {
      transactionId: 'listing-1',
      venue: 'TEST_VENUE',
      transactionAt: '2026-08-01T00:00:00Z',
      currency: 'USD',
      price: 1000,
      transactionType: 'LISTING_PRICE'
    },
  });
  const result = runValidator([record]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fail closed/i);
});

test('provider evidence contract accepts executed sale and transaction-backed liquidity', () => {
  const transaction = baseRecord();
  const liquidity = baseRecord({
    primitive: 'LIQUIDITY',
    payloadHash: 'def456',
    value: {
      windowStart: '2026-07-01T00:00:00Z',
      windowEnd: '2026-08-01T00:00:00Z',
      completedTransactions: 2,
      venue: 'TEST_VENUE',
      derivationMethod: 'COUNT_COMPLETED_TRANSACTIONS',
      supportingTransactionIds: ['tx-1', 'tx-2']
    },
  });
  const result = runValidator([transaction, liquidity]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /market transaction=1 liquidity=1/);
});
