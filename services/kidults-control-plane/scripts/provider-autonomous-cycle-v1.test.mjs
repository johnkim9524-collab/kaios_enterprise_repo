import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProviderAutonomousCycle } from '../src/provider-autonomous-cycle.mjs';

const exactHeadSha = '6f38700fa439ea381777e4474e41c1478fda9b4a';
const evaluatedAt = '2026-09-21T03:30:00.000Z';
const durableEvidence = {
  verified: true,
  objectLockMode: 'COMPLIANCE',
  kmsSignatureValid: true,
  retentionUntil: '2036-09-20T12:05:04.000Z',
  manifestSha256: '0fe1ffa1434fc6ec81a788d2c01b872132e256b887560e4c675043e091dff695',
  receiptSha256: '08dbb2c437a9036f18d56b359e87a145481e60f3fe92adada2a4904286c6e0b8',
};

function provider(overrides = {}) {
  return {
    provider_id: 'PSA_PREMIUM',
    state: 'BOUNDED',
    acquisition_authorized: false,
    credential_authorized: false,
    new_spend_authorized: false,
    adapter_state: 'NOT_ACTIVE',
    production: 'HOLD',
    public_release: 'HOLD',
    ...overrides,
  };
}
function registry(item = provider()) {
  return { status: 'ACTIVE_FAIL_CLOSED', providers: [item] };
}

function evaluate(overrides = {}) {
  return evaluateProviderAutonomousCycle({
    registry: registry(),
    providerId: 'PSA_PREMIUM',
    exactHeadSha,
    evaluatedAt,
    durableEvidence,
    ...overrides,
  });
}

test('current bounded provider remains shadow-only with all protected holds', () => {
  const result = evaluate();
  assert.equal(result.action, 'SHADOW_NO_FETCH');
  assert.equal(result.brokerEgress, false);
  assert.deepEqual(result.holds, { production: 'HOLD', public: 'HOLD', g5: 'HOLD' });
  assert.match(result.decisionDigest, /^sha256:[0-9a-f]{64}$/);
});

test('decision digest is deterministic for the same exact inputs', () => {
  assert.equal(evaluate().decisionDigest, evaluate().decisionDigest);
});
test('bounded fetch requires every provider gate', () => {
  const ready = provider({
    acquisition_authorized: true,
    credential_authorized: true,
    adapter_state: 'ACTIVE',
  });
  const result = evaluate({ registry: registry(ready) });
  assert.equal(result.action, 'BOUNDED_FETCH');
  assert.equal(result.brokerEgress, true);
  assert.equal(result.reason, 'ALL_BOUNDED_PROVIDER_GATES_PASS');
});

test('new spend never enters the autonomous bounded path', () => {
  const spend = provider({
    acquisition_authorized: true,
    credential_authorized: true,
    new_spend_authorized: true,
    adapter_state: 'ACTIVE',
  });
  assert.equal(evaluate({ registry: registry(spend) }).action, 'SHADOW_NO_FETCH');
});

test('production and public holds are non-bypassable', () => {
  assert.throws(
    () => evaluate({ registry: registry(provider({ production: 'READY' })) }),
    /PROVIDER_PRODUCTION_HOLD_REQUIRED/
  );
  assert.throws(
    () => evaluate({ registry: registry(provider({ public_release: 'READY' })) }),
    /PROVIDER_PUBLIC_RELEASE_HOLD_REQUIRED/
  );
});
test('unverified or mutable AWS evidence fails closed', () => {
  assert.throws(
    () => evaluate({ durableEvidence: { ...durableEvidence, verified: false } }),
    /AWS_DURABLE_EVIDENCE_NOT_VERIFIED/
  );
  assert.throws(
    () => evaluate({ durableEvidence: { ...durableEvidence, objectLockMode: 'GOVERNANCE' } }),
    /AWS_OBJECT_LOCK_COMPLIANCE_REQUIRED/
  );
  assert.throws(
    () => evaluate({ durableEvidence: { ...durableEvidence, kmsSignatureValid: false } }),
    /AWS_KMS_SIGNATURE_REQUIRED/
  );
});

test('short retention and unregistered provider fail closed', () => {
  assert.throws(
    () => evaluate({ durableEvidence: { ...durableEvidence, retentionUntil: '2027-09-21T00:00:00Z' } }),
    /AWS_RETENTION_WINDOW_TOO_SHORT/
  );
  assert.throws(
    () => evaluate({ providerId: 'UNKNOWN' }),
    /PROVIDER_NOT_REGISTERED/
  );
});
