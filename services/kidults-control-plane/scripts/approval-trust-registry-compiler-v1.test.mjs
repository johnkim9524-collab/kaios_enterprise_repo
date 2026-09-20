import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  compileSyntheticApprovalTrustRegistry, verifyCompiledTrustRegistryHandoff,
  verifyTrustRegistryHandoffReceipt,
} from '../src/common-control/approval-trust-registry-compiler-v1.mjs';
import {
  createTrustRootCandidate, createTrustRootLifecycleEvent,
} from '../src/common-control/approval-trust-root-lifecycle-v1.mjs';
import {
  createApprovalEnvelopeSigningStatement, verifyCryptographicApprovalEnvelope,
} from '../src/common-control/approval-envelope-v1.mjs';
import { canonicalJson, digestObject } from '../src/common-control/canonical-v1.mjs';

const proposedAt = '2026-09-19T02:00:00.000Z';

function keyFixture(keyId, role, predecessorKeyId = null) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const candidate = createTrustRootCandidate({ keyId, role, predecessorKeyId, proposedAt,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) });
  return { candidate, privateKey };
}

function activate(candidate, candidates, events, time) {
  return createTrustRootLifecycleEvent({ candidate, candidates, events,
    operation: 'ACTIVATE_SYNTHETIC_ONLY', observedAt: time });
}

test('active synthetic lifecycle compiles deterministically into caller-pinned registry', () => {
  const kpmo = keyFixture('kpmo-local-001', 'KPMO');
  const trackA = keyFixture('track-a-local-001', 'TRACK_A');
  const candidates = [trackA.candidate, kpmo.candidate];
  const first = activate(kpmo.candidate, candidates, [], '2026-09-19T02:01:00.000Z');
  const second = activate(trackA.candidate, candidates, [first], '2026-09-19T02:02:00.000Z');
  const left = compileSyntheticApprovalTrustRegistry({ candidates, events: [second, first] });
  const right = compileSyntheticApprovalTrustRegistry({
    candidates: [...candidates].reverse(), events: [first, second],
  });
  assert.deepEqual(left, right);
  assert.deepEqual(left.registry.keys.map(key => key.role), ['KPMO', 'TRACK_A']);
  assert.equal(left.registry.state, 'CALLER_PINNED_PUBLIC_KEYS_ONLY_HOLD');
  assert.equal(left.handoffReceipt.verifierWired, false);
  assert.equal(left.handoffReceipt.activationAuthorized, false);
  assert.deepEqual(verifyCompiledTrustRegistryHandoff({ ...left, candidates, events: [first, second] }),
    { ...left, verifierWired: false, activationAuthorized: false });
});

test('compiled registry is compatible with exact digest-pinned verifier without automatic wiring', () => {
  const kpmo = keyFixture('kpmo-local-001', 'KPMO');
  const candidates = [kpmo.candidate];
  const events = [activate(kpmo.candidate, candidates, [], '2026-09-19T02:01:00.000Z')];
  const compiled = compileSyntheticApprovalTrustRegistry({ candidates, events });
  const statement = createApprovalEnvelopeSigningStatement({
    authorityClass: 'LOCAL_SYNTHETIC_SHADOW', subjectType: 'SUPERVISOR_INVOCATION',
    subjectId: 'synthetic-handoff-001', subjectDigest: digestObject({ subject: 'synthetic' }),
    requestedCapabilities: { providerContact: false, spend: false, externalEgress: false,
      credentialAccess: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' },
    issuedAt: '2026-09-19T02:02:00.000Z', expiresAt: '2026-09-19T02:07:00.000Z',
    nonceDigest: digestObject({ nonce: 'synthetic-handoff-001' }),
    trustRegistryDigest: compiled.registry.registryDigest,
  });
  const envelope = { ...statement, signatures: [{ role: 'KPMO', keyId: kpmo.candidate.keyId,
    algorithm: 'Ed25519', signatureBase64: sign(null,
      Buffer.from(canonicalJson(statement), 'utf8'), kpmo.privateKey).toString('base64') }] };
  const receipt = verifyCryptographicApprovalEnvelope({ envelope, trustRegistry: compiled.registry,
    expectedTrustRegistryDigest: compiled.registry.registryDigest,
    now: '2026-09-19T02:03:00.000Z' });
  assert.equal(receipt.state, 'SIGNATURES_VERIFIED_AUTHORITY_NOT_ACTIVATED');
  assert.equal(receipt.activationAuthorized, false);
});

test('revoked and superseded keys cannot enter a compiled registry', () => {
  const first = keyFixture('kpmo-local-001', 'KPMO');
  const second = keyFixture('kpmo-local-002', 'KPMO', first.candidate.keyId);
  const candidates = [first.candidate, second.candidate];
  const activation = activate(first.candidate, candidates, [], '2026-09-19T02:01:00.000Z');
  const rotation = activate(second.candidate, candidates, [activation], '2026-09-19T02:02:00.000Z');
  const compiled = compileSyntheticApprovalTrustRegistry({ candidates, events: [activation, rotation] });
  assert.deepEqual(compiled.registry.keys.map(key => key.keyId), [second.candidate.keyId]);
  const revoke = createTrustRootLifecycleEvent({ candidate: second.candidate, candidates,
    events: [activation, rotation], operation: 'REVOKE', observedAt: '2026-09-19T02:03:00.000Z' });
  assert.throws(() => compileSyntheticApprovalTrustRegistry({
    candidates, events: [activation, rotation, revoke],
  }), /TRUST_REGISTRY_NO_ACTIVE_SYNTHETIC_KEYS/);
});

test('candidate event or registry substitution breaks exact reproduction', () => {
  const kpmo = keyFixture('kpmo-local-001', 'KPMO');
  const candidates = [kpmo.candidate];
  const events = [activate(kpmo.candidate, candidates, [], '2026-09-19T02:01:00.000Z')];
  const compiled = compileSyntheticApprovalTrustRegistry({ candidates, events });
  const substituted = structuredClone(compiled.registry);
  substituted.registryId = 'synthetic-lifecycle:substituted';
  substituted.registryDigest = digestObject(Object.fromEntries(Object.entries(substituted)
    .filter(([key]) => key !== 'registryDigest')));
  assert.throws(() => verifyCompiledTrustRegistryHandoff({ registry: substituted,
    handoffReceipt: compiled.handoffReceipt, candidates, events }),
  /TRUST_REGISTRY_HANDOFF_REPRODUCTION_MISMATCH/);
});

test('handoff protected gates cannot be enabled even with a new self-digest', () => {
  const kpmo = keyFixture('kpmo-local-001', 'KPMO');
  const candidates = [kpmo.candidate];
  const events = [activate(kpmo.candidate, candidates, [], '2026-09-19T02:01:00.000Z')];
  const { handoffReceipt } = compileSyntheticApprovalTrustRegistry({ candidates, events });
  const unsafe = { ...handoffReceipt, verifierWired: true };
  unsafe.handoffDigest = digestObject(Object.fromEntries(Object.entries(unsafe)
    .filter(([key]) => key !== 'handoffDigest')));
  assert.throws(() => verifyTrustRegistryHandoffReceipt(unsafe),
    /TRUST_REGISTRY_HANDOFF_PROTECTED_GATE_INVALID/);
});
