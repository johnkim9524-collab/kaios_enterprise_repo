import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { canonicalJson, digestObject } from '../src/common-control/canonical-v1.mjs';
import { compileSyntheticApprovalTrustRegistry } from '../src/common-control/approval-trust-registry-compiler-v1.mjs';
import { fenceCurrentTrustRegistry } from '../src/common-control/approval-trust-registry-fence-v1.mjs';
import { resolveExactTrustRegistrySnapshot } from '../src/common-control/approval-trust-registry-resolver-v1.mjs';
import { recordCompiledTrustRegistrySnapshot } from '../src/common-control/approval-trust-registry-snapshot-v1.mjs';
import { verifyAndConsumeWithCurrentTrustRegistry } from '../src/common-control/approval-trust-verification-gateway-v1.mjs';
import { createTrustRootCandidate, createTrustRootLifecycleEvent } from '../src/common-control/approval-trust-root-lifecycle-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const candidate = createTrustRootCandidate({ keyId: 'kpmo-local-bundle-001', role: 'KPMO',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }), predecessorKeyId: null,
    proposedAt: '2026-09-19T03:00:00.000Z' });
  const candidates = [candidate];
  const activation = createTrustRootLifecycleEvent({ candidate, candidates, events: [],
    operation: 'ACTIVATE_SYNTHETIC_ONLY', observedAt: '2026-09-19T03:01:00.000Z' });
  const events = [activation];
  const compiled = compileSyntheticApprovalTrustRegistry({ candidates, events });
  return { privateKey, candidate, candidates, events, compiled };
}

async function storedFixture() {
  const value = fixture(); const client = fakeAutonomousTaskClient();
  const stored = await recordCompiledTrustRegistrySnapshot(client, { ...value.compiled,
    candidates: value.candidates, events: value.events,
    recordedAt: '2026-09-19T03:02:00.000Z' });
  return { ...value, client, stored };
}

test('compiled registry snapshot records once and exact replay is idempotent', async () => {
  const value = await storedFixture();
  assert.equal(value.stored.state, 'SNAPSHOT_RECORDED_AUTHORITY_NOT_ACTIVATED');
  const replay = await recordCompiledTrustRegistrySnapshot(value.client, { ...value.compiled,
    candidates: value.candidates, events: value.events,
    recordedAt: '2026-09-19T03:02:00.000Z' });
  assert.equal(replay.state, 'IDEMPOTENT_SNAPSHOT_REPLAY');
  assert.equal(value.client.state.trustRegistrySnapshots.length, 1);
});

test('resolver requires exact registry id and digest and verifies immutable row bindings', async () => {
  const value = await storedFixture();
  const resolved = await resolveExactTrustRegistrySnapshot(value.client, {
    registryId: value.compiled.registry.registryId,
    registryDigest: value.compiled.registry.registryDigest,
  });
  assert.equal(canonicalJson(resolved.registry), canonicalJson(value.compiled.registry));
  await assert.rejects(() => resolveExactTrustRegistrySnapshot(value.client, {
    registryId: value.compiled.registry.registryId,
    registryDigest: digestObject({ wrong: true }),
  }), /TRUST_REGISTRY_RESOLVER_NOT_FOUND/);
});

test('current-state fence accepts exact lifecycle pin and rejects revocation immediately', async () => {
  const value = await storedFixture();
  const resolvedSnapshot = await resolveExactTrustRegistrySnapshot(value.client, {
    registryId: value.compiled.registry.registryId,
    registryDigest: value.compiled.registry.registryDigest,
  });
  const fenced = fenceCurrentTrustRegistry({ resolvedSnapshot, candidates: value.candidates,
    events: value.events,
    expectedCurrentLifecycleStateDigest: value.compiled.handoffReceipt.lifecycleStateDigest });
  assert.equal(fenced.state, 'CURRENT_TRUST_REGISTRY_FENCED_AUTHORITY_NOT_ACTIVATED');
  const revoke = createTrustRootLifecycleEvent({ candidate: value.candidate,
    candidates: value.candidates, events: value.events, operation: 'REVOKE',
    observedAt: '2026-09-19T03:03:00.000Z' });
  assert.throws(() => fenceCurrentTrustRegistry({ resolvedSnapshot,
    candidates: value.candidates, events: [...value.events, revoke],
    expectedCurrentLifecycleStateDigest: value.compiled.handoffReceipt.lifecycleStateDigest }),
  /TRUST_REGISTRY_FENCE_STALE_OR_REVOKED/);
});

test('retired non-atomic gateway fails closed before database access', async () => {
  const value = await storedFixture();
  const callCount = value.client.state.calls.length;
  await assert.rejects(() => verifyAndConsumeWithCurrentTrustRegistry(value.client, {
  }), /TRUST_HANDOFF_GATEWAY_RETIRED_USE_ATOMIC_CURRENT_HEAD/);
  assert.equal(value.client.state.calls.length, callCount);
  assert.equal(value.client.state.approvalConsumptions.length, 0);
});
