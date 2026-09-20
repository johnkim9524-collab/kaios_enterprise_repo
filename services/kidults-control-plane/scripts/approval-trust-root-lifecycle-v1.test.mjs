import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  createTrustRootCandidate, createTrustRootLifecycleEvent, deriveTrustRootLifecycle,
  verifyTrustRootCandidate, verifyTrustRootLifecycleEvent,
} from '../src/common-control/approval-trust-root-lifecycle-v1.mjs';
import { digestObject } from '../src/common-control/canonical-v1.mjs';

function candidate(keyId, role, predecessorKeyId = null, proposedAt = '2026-09-19T01:00:00.000Z') {
  const { publicKey } = generateKeyPairSync('ed25519');
  return createTrustRootCandidate({ keyId, role, predecessorKeyId, proposedAt,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) });
}

test('public-key-only candidate is exact, self-digested and held', () => {
  const value = candidate('kpmo-local-001', 'KPMO');
  assert.equal(value.state, 'CANDIDATE_HOLD');
  assert.equal(value.scope, 'LOCAL_SYNTHETIC_TEST_ONLY');
  assert.equal(value.activationAuthorized, false);
  assert.equal(value.production, 'HOLD');
  assert.deepEqual(verifyTrustRootCandidate(value), value);
});

test('first activation and exact predecessor rotation produce one synthetic active key', () => {
  const first = candidate('kpmo-local-001', 'KPMO');
  const second = candidate('kpmo-local-002', 'KPMO', first.keyId, '2026-09-19T01:01:00.000Z');
  const candidates = [first, second];
  const activation = createTrustRootLifecycleEvent({ candidate: first, candidates, events: [],
    operation: 'ACTIVATE_SYNTHETIC_ONLY', observedAt: '2026-09-19T01:02:00.000Z' });
  const rotation = createTrustRootLifecycleEvent({ candidate: second, candidates,
    events: [activation], operation: 'ACTIVATE_SYNTHETIC_ONLY',
    observedAt: '2026-09-19T01:03:00.000Z' });
  const state = deriveTrustRootLifecycle({ candidates, events: [activation, rotation] });
  assert.equal(state.keys.find(key => key.keyId === first.keyId).state, 'SUPERSEDED');
  assert.equal(state.keys.find(key => key.keyId === second.keyId).state, 'ACTIVE_SYNTHETIC_ONLY');
  assert.deepEqual(state.activeSyntheticKeys, [{ role: 'KPMO', keyId: second.keyId }]);
  assert.equal(state.verifierWired, false);
  assert.deepEqual(verifyTrustRootLifecycleEvent(rotation), rotation);
});

test('duplicate fingerprint and key identity fail closed', () => {
  const first = candidate('kpmo-local-001', 'KPMO');
  assert.throws(() => deriveTrustRootLifecycle({ candidates: [first, { ...first }], events: [] }),
    /TRUST_ROOT_CANDIDATE_DUPLICATE/);
  const unsigned = Object.fromEntries(Object.entries({ ...first, keyId: 'kpmo-local-002' })
    .filter(([key]) => key !== 'candidateDigest'));
  const sameFingerprint = { ...unsigned, candidateDigest: digestObject(unsigned) };
  assert.throws(() => deriveTrustRootLifecycle({ candidates: [first, sameFingerprint], events: [] }),
    /TRUST_ROOT_CANDIDATE_DUPLICATE/);
});

test('wrong predecessor cannot rotate an active role', () => {
  const first = candidate('kpmo-local-001', 'KPMO');
  const wrong = candidate('kpmo-local-002', 'KPMO', 'kpmo-local-other');
  const candidates = [first, wrong];
  const activation = createTrustRootLifecycleEvent({ candidate: first, candidates, events: [],
    operation: 'ACTIVATE_SYNTHETIC_ONLY', observedAt: '2026-09-19T01:02:00.000Z' });
  assert.throws(() => createTrustRootLifecycleEvent({ candidate: wrong, candidates,
    events: [activation], operation: 'ACTIVATE_SYNTHETIC_ONLY',
    observedAt: '2026-09-19T01:03:00.000Z' }), /TRUST_ROOT_ROTATION_PREDECESSOR_MISMATCH/);
});

test('revocation is terminal and dominates later activation', () => {
  const key = candidate('track-a-local-001', 'TRACK_A');
  const candidates = [key];
  const activation = createTrustRootLifecycleEvent({ candidate: key, candidates, events: [],
    operation: 'ACTIVATE_SYNTHETIC_ONLY', observedAt: '2026-09-19T01:01:00.000Z' });
  const revoke = createTrustRootLifecycleEvent({ candidate: key, candidates,
    events: [activation], operation: 'REVOKE', observedAt: '2026-09-19T01:02:00.000Z' });
  const state = deriveTrustRootLifecycle({ candidates, events: [activation, revoke] });
  assert.equal(state.keys[0].state, 'REVOKED');
  assert.deepEqual(state.activeSyntheticKeys, []);
  assert.throws(() => createTrustRootLifecycleEvent({ candidate: key, candidates,
    events: [activation, revoke],
    operation: 'ACTIVATE_SYNTHETIC_ONLY', observedAt: '2026-09-19T01:03:00.000Z' }),
  /TRUST_ROOT_TERMINAL_STATE/);
});

test('private material, non-Ed25519 keys and protected gate tampering are rejected', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  assert.throws(() => createTrustRootCandidate({ keyId: 'bad-private-001', role: 'KPMO',
    publicKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    proposedAt: '2026-09-19T01:00:00.000Z' }), /TRUST_ROOT_PUBLIC_KEY_PEM_INVALID/);
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => createTrustRootCandidate({ keyId: 'bad-rsa-001', role: 'KPMO',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    proposedAt: '2026-09-19T01:00:00.000Z' }), /TRUST_ROOT_PUBLIC_KEY_TYPE_INVALID/);
  const safe = candidate('track-z-local-001', 'TRACK_Z');
  const unsafe = { ...safe, activationAuthorized: true };
  unsafe.candidateDigest = digestObject(Object.fromEntries(Object.entries(unsafe)
    .filter(([key]) => key !== 'candidateDigest')));
  assert.throws(() => verifyTrustRootCandidate(unsafe), /TRUST_ROOT_PROTECTED_GATE_INVALID/);
});
