import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  verifyAndConsumeCryptographicApproval, verifyApprovalConsumptionReceipt,
} from '../src/common-control/approval-consumption-v1.mjs';
import { createApprovalEnvelopeSigningStatement } from '../src/common-control/approval-envelope-v1.mjs';
import { canonicalJson, digestObject } from '../src/common-control/canonical-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const digest = value => digestObject({ value });

function fixture({ subjectId = 'supervisor-request-001', subject = 'request-001', nonce = 'nonce-001' } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const key = {
    keyId: 'kpmo-key-001', role: 'KPMO', algorithm: 'Ed25519', publicKeyPem,
    keyFingerprint: digestObject({
      spki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    }),
    state: 'ACTIVE',
  };
  const unsignedRegistry = {
    contractId: 'kidults-approval-trust-registry-v1', version: '1.0.0',
    state: 'CALLER_PINNED_PUBLIC_KEYS_ONLY_HOLD', registryId: 'test-registry-001', keys: [key],
  };
  const trustRegistry = { ...unsignedRegistry, registryDigest: digestObject(unsignedRegistry) };
  const subjectDigest = digest(subject);
  const statement = createApprovalEnvelopeSigningStatement({
    authorityClass: 'LOCAL_SYNTHETIC_SHADOW', subjectType: 'SUPERVISOR_INVOCATION',
    subjectId, subjectDigest,
    requestedCapabilities: {
      providerContact: false, spend: false, externalEgress: false, credentialAccess: false,
      production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
    },
    issuedAt: '2026-09-19T00:00:00.000Z', expiresAt: '2026-09-19T00:05:00.000Z',
    nonceDigest: digest(nonce), trustRegistryDigest: trustRegistry.registryDigest,
  });
  const envelope = { ...statement, signatures: [{
    role: 'KPMO', keyId: key.keyId, algorithm: 'Ed25519',
    signatureBase64: sign(null, Buffer.from(canonicalJson(statement), 'utf8'), privateKey)
      .toString('base64'),
  }] };
  return {
    envelope, trustRegistry, expectedTrustRegistryDigest: trustRegistry.registryDigest,
    expectedSubject: {
      authorityClass: 'LOCAL_SYNTHETIC_SHADOW', subjectType: 'SUPERVISOR_INVOCATION',
      subjectId, subjectDigest,
    },
  };
}

test('valid signature verification is atomically consumed without activating authority', async () => {
  const client = fakeAutonomousTaskClient();
  const result = await verifyAndConsumeCryptographicApproval(client, {
    ...fixture(), now: new Date('2026-09-19T00:01:00.000Z'),
  });
  assert.equal(result.state, 'CONSUMED_AUTHORITY_NOT_ACTIVATED');
  assert.equal(result.activationAuthorized, false);
  assert.equal(result.verificationReceipt.nonceDigest, digest('nonce-001'));
  assert.equal(result.consumptionReceipt.activationAuthorized, false);
  assert.equal(result.consumptionReceipt.providerContactExecuted, false);
  assert.equal(result.consumptionReceipt.externalEgress, false);
  assert.equal(result.consumptionReceipt.production, 'HOLD');
  assert.equal(client.state.approvalConsumptions.length, 1);
  assert.equal(canonicalJson(verifyApprovalConsumptionReceipt(result.consumptionReceipt)),
    canonicalJson(result.consumptionReceipt));
});

test('exact envelope replay is held and cannot emit a second consumption receipt', async () => {
  const client = fakeAutonomousTaskClient();
  const approval = fixture();
  await verifyAndConsumeCryptographicApproval(client, {
    ...approval, now: new Date('2026-09-19T00:01:00.000Z'),
  });
  const replay = await verifyAndConsumeCryptographicApproval(client, {
    ...approval, now: new Date('2026-09-19T00:02:00.000Z'),
  });
  assert.equal(replay.state, 'ALREADY_CONSUMED_HOLD');
  assert.equal(replay.consumptionReceipt, null);
  assert.equal(replay.activationAuthorized, false);
  assert.equal(client.state.approvalConsumptions.length, 1);
});

test('same nonce on a different signed envelope is a replay conflict', async () => {
  const client = fakeAutonomousTaskClient();
  await verifyAndConsumeCryptographicApproval(client, {
    ...fixture(), now: new Date('2026-09-19T00:01:00.000Z'),
  });
  await assert.rejects(() => verifyAndConsumeCryptographicApproval(client, {
    ...fixture({ subjectId: 'supervisor-request-002', subject: 'request-002' }),
    now: new Date('2026-09-19T00:02:00.000Z'),
  }), /APPROVAL_CONSUMPTION_REPLAY_CONFLICT/);
  assert.equal(client.state.approvalConsumptions.length, 1);
});

test('expected subject substitution fails before opening a transaction', async () => {
  const client = fakeAutonomousTaskClient();
  const approval = fixture();
  approval.expectedSubject.subjectDigest = digest('different-request');
  await assert.rejects(() => verifyAndConsumeCryptographicApproval(client, {
    ...approval, now: new Date('2026-09-19T00:01:00.000Z'),
  }), /APPROVAL_CONSUMPTION_SUBJECT_BINDING_INVALID/);
  assert.equal(client.state.calls.length, 0);
});

test('bad signature fails before persistence', async () => {
  const client = fakeAutonomousTaskClient();
  const approval = fixture();
  const signature = approval.envelope.signatures[0].signatureBase64;
  approval.envelope.signatures[0].signatureBase64 = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  await assert.rejects(() => verifyAndConsumeCryptographicApproval(client, {
    ...approval, now: new Date('2026-09-19T00:01:00.000Z'),
  }), /APPROVAL_SIGNATURE_INVALID/);
  assert.equal(client.state.calls.length, 0);
});

test('corrupt inserted readback rolls back the consumption', async () => {
  const client = fakeAutonomousTaskClient();
  const query = client.query.bind(client);
  client.query = async (sql, params) => {
    const result = await query(sql, params);
    if (sql.startsWith('INSERT INTO kidults_control.cryptographic_approval_consumptions')
      && result.rows[0]) result.rows[0].subject_digest = digest('corrupt');
    return result;
  };
  await assert.rejects(() => verifyAndConsumeCryptographicApproval(client, {
    ...fixture(), now: new Date('2026-09-19T00:01:00.000Z'),
  }), /APPROVAL_CONSUMPTION_READBACK_MISMATCH/);
  assert.equal(client.state.approvalConsumptions.length, 0);
});

test('consumption receipt cannot be rehashed with activation enabled', async () => {
  const result = await verifyAndConsumeCryptographicApproval(fakeAutonomousTaskClient(), {
    ...fixture(), now: new Date('2026-09-19T00:01:00.000Z'),
  });
  const unsafe = { ...result.consumptionReceipt, activationAuthorized: true };
  const identified = Object.fromEntries(Object.entries(unsafe)
    .filter(([key]) => key !== 'receiptDigest'));
  unsafe.receiptDigest = digestObject(identified);
  assert.throws(() => verifyApprovalConsumptionReceipt(unsafe),
    /APPROVAL_CONSUMPTION_PROTECTED_GATE_INVALID/);
});
