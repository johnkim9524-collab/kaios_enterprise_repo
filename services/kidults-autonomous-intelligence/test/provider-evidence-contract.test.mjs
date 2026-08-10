import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function baseRecord(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    primitive: 'TRANSACTION_PRICE_COMPARABLE',
    source: 'TEST_MARKET_PROVIDER',
    sourceUrl: 'https://example.invalid/evidence/1',
    rightsClass: 'LICENSED_COMMERCIAL_DATA',
    observedAt: '2026-08-01T00:00:00Z',
    payloadHash: 'abc123',
    evidenceClass: 'TRANSACTION_MARKET_EVIDENCE',
    safety: { synthetic: false, estimated: false, listingOnly: false },
    value: {
      transactionId: 'tx-1',
      venue: 'TEST_VENUE',
      transactionAt: '2026-08-01T00:00:00Z',
      currency: 'USD',
      price: 1000,
      transactionType: 'MARKETPLACE_COMPLETED_SALE',
    },
    ...overrides,
  };
}

function liquidityRecord(overrides = {}) {
  return baseRecord({
    primitive: 'LIQUIDITY',
    payloadHash: 'def456',
    value: {
      windowStart: '2026-07-01T00:00:00Z',
      windowEnd: '2026-08-01T00:00:00Z',
      completedTransactions: 2,
      venue: 'TEST_VENUE',
      derivationMethod: 'COUNT_COMPLETED_TRANSACTIONS',
      supportingTransactionIds: ['tx-1', 'tx-2'],
    },
    ...overrides,
  });
}

function runValidatorPayload(payload, { asPath = false, absolute = false } = {}) {
  const env = { ...process.env };
  if (asPath) {
    const relativePath = path.join('test', '.provider-evidence-input.json');
    const absolutePath = path.join(process.cwd(), relativePath);
    fs.writeFileSync(absolutePath, JSON.stringify(payload));
    env.KIDULTS_RIGHT_DATA_EVIDENCE_JSON = absolute ? absolutePath : relativePath;
    const result = spawnSync(process.execPath, ['scripts/kidult100-provider-evidence-validate.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env,
    });
    fs.rmSync(absolutePath, { force: true });
    return result;
  }
  env.KIDULTS_RIGHT_DATA_EVIDENCE_JSON = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return spawnSync(process.execPath, ['scripts/kidult100-provider-evidence-validate.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
}

function runValidator(records) {
  return runValidatorPayload(records);
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
      transactionType: 'LISTING_PRICE',
    },
  });
  const result = runValidator([record]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fail closed/i);
});

test('provider evidence contract accepts executed sale and transaction-backed liquidity', () => {
  const result = runValidator([baseRecord(), liquidityRecord()]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /market transaction=1 liquidity=1/);
});

test('provider evidence contract exercises fail-closed validation branches', () => {
  const invalidRecords = [
    null,
    {
      candidateKey: 'bad:base',
      primitive: 'IDENTITY',
      source: 'TEST',
      sourceUrl: 'https://example.invalid/base',
      rightsClass: 'OPEN_COMMERCIAL_REUSE',
      observedAt: 'not-a-date',
      payloadHash: 'base-bad',
      evidenceClass: 'NOT_ALLOWED',
    },
    baseRecord({
      evidenceClass: 'AUTHORITATIVE_IDENTITY_PROVENANCE',
      rightsClass: 'UNKNOWN_RIGHTS',
      value: {},
      safety: { synthetic: true, estimated: true, listingOnly: true },
    }),
    baseRecord({
      value: {
        transactionId: 'tx-bad',
        venue: 'TEST_VENUE',
        transactionAt: 'not-a-date',
        currency: 'USD',
        price: 0,
        transactionType: 'UNKNOWN_TRANSACTION_TYPE',
      },
    }),
    liquidityRecord({
      evidenceClass: 'INDEPENDENT_VERIFICATION',
      rightsClass: 'UNKNOWN_RIGHTS',
      value: {
        windowStart: 'bad-start',
        windowEnd: 'bad-end',
        completedTransactions: 1,
        venue: 'TEST_VENUE',
        derivationMethod: 'ESTIMATED_LIQUIDITY',
        supportingTransactionIds: ['tx-1'],
      },
      safety: { synthetic: true, estimated: true, listingOnly: false },
    }),
    {
      candidateKey: 'wikidata:Q2',
      primitive: 'DEMAND_ATTENTION',
      source: 'TEST_REFERENCE',
      sourceUrl: 'https://example.invalid/reference/2',
      rightsClass: 'CC0_STRUCTURED_DATA',
      observedAt: '2026-08-01T00:00:00Z',
      payloadHash: 'reference-2',
      evidenceClass: 'DEMAND_CULTURAL_SIGNAL',
    },
  ];
  const result = runValidator(invalidRecords);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fail closed/i);
  assert.match(result.stdout, /accepted=1/);
});

test('provider evidence parser accepts evidence envelope and snapshot paths', () => {
  const envelope = { evidence: [baseRecord()] };
  const fromEnvelope = runValidatorPayload(envelope);
  assert.equal(fromEnvelope.status, 0, fromEnvelope.stderr || fromEnvelope.stdout);
  assert.match(fromEnvelope.stdout, /input=1 accepted=1 rejected=0/);

  const fromRelativePath = runValidatorPayload([baseRecord()], { asPath: true });
  assert.equal(fromRelativePath.status, 0, fromRelativePath.stderr || fromRelativePath.stdout);

  const fromAbsolutePath = runValidatorPayload([liquidityRecord()], { asPath: true, absolute: true });
  assert.equal(fromAbsolutePath.status, 0, fromAbsolutePath.stderr || fromAbsolutePath.stdout);
  assert.match(fromAbsolutePath.stdout, /liquidity=1/);

  const missingPath = runValidatorPayload('test/.missing-provider-evidence.json');
  assert.equal(missingPath.status, 0, missingPath.stderr || missingPath.stdout);
  assert.match(missingPath.stdout, /input=0 accepted=0 rejected=0/);
});
