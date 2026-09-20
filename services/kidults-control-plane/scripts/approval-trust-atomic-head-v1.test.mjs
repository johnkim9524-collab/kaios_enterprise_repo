import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { canonicalJson, digestObject } from '../src/common-control/canonical-v1.mjs';
import { createApprovalEnvelopeSigningStatement } from '../src/common-control/approval-envelope-v1.mjs';
import {
  publishCurrentApprovalTrust, verifyAndConsumeCurrentApprovalTrust,
} from '../src/common-control/approval-trust-runtime-v1.mjs';
import { compileSyntheticApprovalTrustRegistry } from '../src/common-control/approval-trust-registry-compiler-v1.mjs';
import { recordCompiledTrustRegistrySnapshot } from '../src/common-control/approval-trust-registry-snapshot-v1.mjs';
import { createTrustRootCandidate, createTrustRootLifecycleEvent } from '../src/common-control/approval-trust-root-lifecycle-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const candidate = createTrustRootCandidate({ keyId: 'kpmo-atomic-001', role: 'KPMO',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    proposedAt: '2026-09-19T04:00:00.000Z' });
  const candidates = [candidate];
  const activation = createTrustRootLifecycleEvent({ candidate, candidates, events: [],
    operation: 'ACTIVATE_SYNTHETIC_ONLY', observedAt: '2026-09-19T04:01:00.000Z' });
  const events = [activation];
  return { privateKey, candidate, candidates, events,
    compiled: compileSyntheticApprovalTrustRegistry({ candidates, events }) };
}

async function ready() {
  const value = fixture(); const client = fakeAutonomousTaskClient();
  await recordCompiledTrustRegistrySnapshot(client, { ...value.compiled,
    candidates: value.candidates, events: value.events,
    recordedAt: '2026-09-19T04:02:00.000Z' });
  const publication = await publishCurrentApprovalTrust(client, { candidates: value.candidates,
    events: value.events, observedAt: '2026-09-19T04:02:00.000Z' });
  return { ...value, client, publication };
}

function approval(value, nonce = 'atomic-001') {
  const subjectDigest = digestObject({ subject: nonce });
  const statement = createApprovalEnvelopeSigningStatement({
    authorityClass: 'LOCAL_SYNTHETIC_SHADOW', subjectType: 'SUPERVISOR_INVOCATION',
    subjectId: `subject-${nonce}`, subjectDigest,
    requestedCapabilities: { providerContact: false, spend: false, externalEgress: false,
      credentialAccess: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' },
    issuedAt: '2026-09-19T04:02:00.000Z', expiresAt: '2026-09-19T04:07:00.000Z',
    nonceDigest: digestObject({ nonce }),
    trustRegistryDigest: value.compiled.registry.registryDigest,
  });
  return { envelope: { ...statement, signatures: [{ role: 'KPMO',
    keyId: value.candidate.keyId, algorithm: 'Ed25519',
    signatureBase64: sign(null, Buffer.from(canonicalJson(statement), 'utf8'),
      value.privateKey).toString('base64') }] }, expectedSubject: {
    authorityClass: 'LOCAL_SYNTHETIC_SHADOW', subjectType: 'SUPERVISOR_INVOCATION',
    subjectId: `subject-${nonce}`, subjectDigest } };
}

test('current lifecycle head publishes an immutable active head and exact replay', async () => {
  const value = await ready();
  assert.equal(value.publication.head.revision, 1);
  assert.equal(value.publication.head.activeRegistryDigest, value.compiled.registry.registryDigest);
  const replay = await publishCurrentApprovalTrust(value.client, { candidates: value.candidates,
    events: value.events, observedAt: '2026-09-19T04:03:00.000Z' });
  assert.equal(replay.state, 'IDEMPOTENT_CURRENT_HEAD_REPLAY');
  assert.equal(value.client.state.trustCurrentHeads.length, 1);
});

test('revocation publishes a tombstone head chained to the active predecessor', async () => {
  const value = await ready();
  const revoke = createTrustRootLifecycleEvent({ candidate: value.candidate,
    candidates: value.candidates, events: value.events, operation: 'REVOKE',
    observedAt: '2026-09-19T04:03:00.000Z' });
  const result = await publishCurrentApprovalTrust(value.client, { candidates: value.candidates,
    events: [...value.events, revoke], observedAt: '2026-09-19T04:03:00.000Z' });
  assert.equal(result.head.revision, 2);
  assert.equal(result.head.previousHeadDigest, value.publication.head.headDigest);
  assert.equal(result.head.activeRegistryId, null);
  assert.equal(result.head.activeRegistryDigest, null);
});

test('atomic gateway holds shared head lock through current-head read and nonce insert', async () => {
  const value = await ready(); const request = approval(value);
  const callStart = value.client.state.calls.length;
  const result = await verifyAndConsumeCurrentApprovalTrust(value.client, {
    registryId: value.compiled.registry.registryId,
    registryDigest: value.compiled.registry.registryDigest,
    expectedCurrentLifecycleStateDigest: value.publication.head.lifecycleStateDigest,
    ...request, now: new Date('2026-09-19T04:03:00.000Z'),
  });
  assert.equal(result.state, 'CONSUMED_AUTHORITY_NOT_ACTIVATED');
  const calls = value.client.state.calls.slice(callStart);
  const lock = calls.findIndex(call => call.includes('pg_advisory_xact_lock'));
  const head = calls.findIndex(call => call.includes('approval_trust_current_heads'));
  const consume = calls.findIndex(call => call.includes('cryptographic_approval_consumptions'));
  assert(lock >= 0 && head > lock && consume > head);
});

test('revocation tombstone wins before a previously valid approval can consume', async () => {
  const value = await ready(); const request = approval(value, 'atomic-revoked');
  const revoke = createTrustRootLifecycleEvent({ candidate: value.candidate,
    candidates: value.candidates, events: value.events, operation: 'REVOKE',
    observedAt: '2026-09-19T04:03:00.000Z' });
  await publishCurrentApprovalTrust(value.client, { candidates: value.candidates,
    events: [...value.events, revoke], observedAt: '2026-09-19T04:03:00.000Z' });
  await assert.rejects(() => verifyAndConsumeCurrentApprovalTrust(value.client, {
    registryId: value.compiled.registry.registryId,
    registryDigest: value.compiled.registry.registryDigest,
    expectedCurrentLifecycleStateDigest: value.publication.head.lifecycleStateDigest,
    ...request, now: new Date('2026-09-19T04:04:00.000Z'),
  }), /ATOMIC_TRUST_GATEWAY_CURRENT_HEAD_PIN_MISMATCH/);
  assert.equal(value.client.state.approvalConsumptions.length, 0);
});

test('atomic runtime facade replays one consumed envelope without a second receipt', async () => {
  const value = await ready(); const request = approval(value, 'atomic-replay');
  const input = { registryId: value.compiled.registry.registryId,
    registryDigest: value.compiled.registry.registryDigest,
    expectedCurrentLifecycleStateDigest: value.publication.head.lifecycleStateDigest,
    ...request, now: new Date('2026-09-19T04:03:00.000Z') };
  await verifyAndConsumeCurrentApprovalTrust(value.client, input);
  const replay = await verifyAndConsumeCurrentApprovalTrust(value.client, input);
  assert.equal(replay.state, 'ALREADY_CONSUMED_HOLD');
  assert.equal(replay.consumptionReceipt, null);
  assert.equal(value.client.state.approvalConsumptions.length, 1);
});

test('atomic runtime facade rolls back a corrupt consumption readback', async () => {
  const value = await ready(); const request = approval(value, 'atomic-rollback');
  const query = value.client.query.bind(value.client);
  value.client.query = async (sql, params) => {
    const result = await query(sql, params);
    if (sql.startsWith('INSERT INTO kidults_control.cryptographic_approval_consumptions')
      && result.rows[0]) result.rows[0].subject_digest = digestObject({ corrupt: true });
    return result;
  };
  await assert.rejects(() => verifyAndConsumeCurrentApprovalTrust(value.client, {
    registryId: value.compiled.registry.registryId,
    registryDigest: value.compiled.registry.registryDigest,
    expectedCurrentLifecycleStateDigest: value.publication.head.lifecycleStateDigest,
    ...request, now: new Date('2026-09-19T04:03:00.000Z'),
  }), /APPROVAL_CONSUMPTION_READBACK_MISMATCH/);
  assert.equal(value.client.state.approvalConsumptions.length, 0);
});
