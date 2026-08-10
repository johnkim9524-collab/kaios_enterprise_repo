import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const OUT = path.join(process.cwd(), 'reports', 'kidult100-right-data', 'normalized-market-provider-evidence-latest.json');

function provider(overrides = {}) {
  return {
    providerId: 'TEST_PROVIDER',
    displayName: 'Test Provider',
    enabled: true,
    authorizationStatus: 'APPROVED',
    authorizationId: 'test-authorization-only',
    rightsClass: 'LICENSED_COMMERCIAL_DATA',
    allowedHosts: ['market.example.invalid'],
    adapterVersion: 'test-only-v1',
    ...overrides,
  };
}

function transactionEvent(overrides = {}) {
  return {
    providerId: 'TEST_PROVIDER',
    candidateKey: 'wikidata:Q1',
    sourceUrl: 'https://market.example.invalid/transactions/tx-1',
    rightsClass: 'LICENSED_COMMERCIAL_DATA',
    observedAt: '2026-08-01T00:00:00Z',
    payloadHash: 'test-payload-hash-1',
    eventType: 'EXECUTED_TRANSACTION',
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

function liquidityEvent(overrides = {}) {
  return {
    providerId: 'TEST_PROVIDER',
    candidateKey: 'wikidata:Q1',
    sourceUrl: 'https://market.example.invalid/liquidity/q1',
    rightsClass: 'LICENSED_COMMERCIAL_DATA',
    observedAt: '2026-08-01T00:00:00Z',
    payloadHash: 'test-payload-hash-2',
    eventType: 'LIQUIDITY_OBSERVATION',
    safety: { synthetic: false, estimated: false, listingOnly: false },
    value: {
      windowStart: '2026-07-01T00:00:00Z',
      windowEnd: '2026-08-01T00:00:00Z',
      completedTransactions: 2,
      venue: 'TEST_VENUE',
      derivationMethod: 'COUNT_COMPLETED_TRANSACTIONS',
      supportingTransactionIds: ['tx-1', 'tx-2'],
    },
    ...overrides,
  };
}

function runNormalizer(events, providers = [provider()], { envelope = false, asPath = false, registryEnvelope = false } = {}) {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    KIDULTS_TEST_MARKET_ADAPTER_REGISTRY_JSON: JSON.stringify(registryEnvelope ? { providers } : providers),
  };
  const payload = envelope ? { events } : events;
  let inputPath;
  if (asPath) {
    inputPath = path.join('test', '.market-adapter-input.json');
    fs.writeFileSync(path.join(process.cwd(), inputPath), JSON.stringify(payload));
    env.KIDULTS_MARKET_PROVIDER_EVENTS_JSON = inputPath;
  } else {
    env.KIDULTS_MARKET_PROVIDER_EVENTS_JSON = JSON.stringify(payload);
  }
  const result = spawnSync(process.execPath, ['scripts/kidult100-market-adapter-normalize.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  if (inputPath) fs.rmSync(path.join(process.cwd(), inputPath), { force: true });
  return result;
}

test('market adapter baseline stays empty and does not certify live evidence', () => {
  const result = runNormalizer([], [], { registryEnvelope: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /providers=0 approved=0 input=0 normalized=0 rejected=0/);
  const output = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.equal(output.claims.liveEvidenceCertified, false);
  assert.equal(output.claims.marketEvidenceCertified, false);
  assert.deepEqual(output.evidence, []);
});

test('approved provider normalizes executed transaction and transaction-backed liquidity', () => {
  const result = runNormalizer([transactionEvent(), liquidityEvent()], [provider()], { envelope: true, registryEnvelope: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /normalized=2 rejected=0/);
  const output = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.deepEqual(output.evidence.map((row) => row.primitive), ['TRANSACTION_PRICE_COMPARABLE', 'LIQUIDITY']);
  assert.equal(output.evidence[0].providerAuthorization.verified, true);
  assert.equal(output.evidence[0].sourceClass, 'MARKET_PROVIDER');

  const env = { ...process.env, KIDULTS_RIGHT_DATA_EVIDENCE_JSON: OUT };
  const validation = spawnSync(process.execPath, ['scripts/kidult100-provider-evidence-validate.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  assert.match(validation.stdout, /market transaction=1 liquidity=1/);
});

test('unregistered or unauthorized providers fail closed', () => {
  const badProviders = [
    null,
    provider({ providerId: 'DISABLED', enabled: false }),
    provider({ providerId: 'PENDING', authorizationStatus: 'PENDING' }),
    provider({ providerId: 'BAD_RIGHTS', rightsClass: 'UNKNOWN_RIGHTS' }),
    provider({ providerId: 'NO_HOSTS', allowedHosts: [] }),
    { providerId: 'INCOMPLETE' },
  ];
  const result = runNormalizer([transactionEvent({ providerId: 'UNKNOWN' })], badProviders);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fail closed/i);
});

test('market adapter rejects rights mismatch, unauthorized hosts and unsafe market claims', () => {
  const invalid = [
    null,
    transactionEvent({ rightsClass: 'OPEN_COMMERCIAL_REUSE' }),
    transactionEvent({ sourceUrl: 'http://market.example.invalid/insecure' }),
    transactionEvent({ sourceUrl: 'not-a-url' }),
    transactionEvent({ sourceUrl: 'https://other.example.invalid/tx' }),
    transactionEvent({ observedAt: 'not-a-date' }),
    transactionEvent({ eventType: 'LISTING' }),
    transactionEvent({ safety: { synthetic: true, estimated: true, listingOnly: true } }),
    transactionEvent({
      value: {
        transactionId: '',
        venue: '',
        transactionAt: 'bad-time',
        currency: '',
        price: 0,
        transactionType: 'LISTING_PRICE',
      },
    }),
  ];
  const result = runNormalizer(invalid);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fail closed/i);
});

test('market adapter rejects unsupported liquidity derivation and insufficient transaction support', () => {
  const invalid = [
    liquidityEvent({
      value: {
        windowStart: '',
        windowEnd: '',
        completedTransactions: 1,
        venue: '',
        derivationMethod: 'ESTIMATED_LIQUIDITY',
        supportingTransactionIds: ['tx-1'],
      },
    }),
    liquidityEvent({ value: null }),
  ];
  const result = runNormalizer(invalid);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fail closed/i);
});

test('market adapter parser accepts snapshot paths and ignores missing paths without inventing evidence', () => {
  const fromPath = runNormalizer([transactionEvent()], [provider()], { asPath: true });
  assert.equal(fromPath.status, 0, fromPath.stderr || fromPath.stdout);
  assert.match(fromPath.stdout, /normalized=1/);

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    KIDULTS_TEST_MARKET_ADAPTER_REGISTRY_JSON: JSON.stringify([provider()]),
    KIDULTS_MARKET_PROVIDER_EVENTS_JSON: 'test/.missing-market-adapter-input.json',
  };
  const missing = spawnSync(process.execPath, ['scripts/kidult100-market-adapter-normalize.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  assert.equal(missing.status, 0, missing.stderr || missing.stdout);
  assert.match(missing.stdout, /input=0 normalized=0 rejected=0/);
});
