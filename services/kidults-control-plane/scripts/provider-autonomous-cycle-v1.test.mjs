import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('AWS object proof remains usable while USB Copy A stays fail closed', () => {
  const evidence = JSON.parse(fs.readFileSync(
    new URL('../../../coordination/kidults/evidence/aws-offline-durability-receipt-2026-09-21-v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(evidence.status, 'AWS_OBJECT_RESTORE_VERIFIED_OFFLINE_COPY_PENDING');
  assert.equal(evidence.restore_drill.status, 'COMPLETE_VERIFIED');
  assert.equal(evidence.restore_drill.source_sha256, evidence.restore_drill.restored_sha256);
  assert.equal(evidence.object_lock.mode, 'COMPLIANCE');
  assert.equal(evidence.object_lock.delete_attempt_return_code, 254);
  assert.equal(evidence.offline_copy.restore_verification, 'PENDING_PHYSICAL_MEDIA');
  assert.deepEqual(evidence.required_live_evidence, ['USB_COPY_A_RESTORE_SHA256_MATCH']);
});

test('provider-control AWS receipt binds isolation, reservation, and immutable read-back evidence', () => {
  const evidence = JSON.parse(fs.readFileSync(
    new URL('../../../coordination/kidults/evidence/provider-control-aws-staging-receipt-2026-09-21-v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(evidence.status, 'COMPLETE_VERIFIED');
  assert.equal(evidence.environment, 'STAGING');
  assert.equal(evidence.isolation.real_to_synthetic, 'DENIED');
  assert.equal(evidence.isolation.synthetic_to_real, 'DENIED');
  assert.equal(evidence.atomic_reservation.reserved, 120);
  assert.equal(evidence.atomic_reservation.limit, 120);
  assert.equal(evidence.atomic_reservation.overflow_return_code, 254);
  assert.equal(evidence.immutable_evidence.source_sha256, evidence.immutable_evidence.restored_sha256);
  assert.equal(evidence.immutable_evidence.object_lock_mode, 'COMPLIANCE');
  assert.equal(evidence.immutable_evidence.delete_attempt_return_code, 254);
  assert.equal(evidence.holds.production, 'HOLD');
  assert.equal(evidence.holds.public, 'HOLD');
  assert.equal(evidence.holds.g5, 'HOLD');
  assert.equal(evidence.holds.usb_copy_a, 'PENDING_PHYSICAL_MEDIA');
});
