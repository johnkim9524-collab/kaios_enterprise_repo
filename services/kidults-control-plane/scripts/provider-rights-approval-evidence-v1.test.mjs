import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalJson, digestObject } from '../src/common-control/canonical-v1.mjs';
import { verifyAndConsumeCryptographicApproval } from '../src/common-control/approval-consumption-v1.mjs';
import { createApprovalEnvelopeSigningStatement } from '../src/common-control/approval-envelope-v1.mjs';
import {
  bindProviderRightsApprovalEvidence, verifyProviderRightsApprovalEvidence,
} from '../src/common-control/provider-rights-approval-evidence-v1.mjs';
import { projectProviderRightsPreflight } from '../src/common-control/provider-rights-preflight-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sourceGate = JSON.parse(fs.readFileSync(path.join(root,
  'coordination/kidults/market/provider-rights-decision-gate-v1.json'), 'utf8'));

function trustFixture() {
  const roles = ['KPMO', 'TRACK_A', 'TRACK_Z'];
  const signers = roles.map((role) => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    return { privateKey, key: { keyId: `provider-preflight-${role.toLowerCase().replace('_', '-')}`,
      role, algorithm: 'Ed25519', publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
      keyFingerprint: digestObject({ spki: der }), state: 'ACTIVE' } };
  });
  const unsigned = { contractId: 'kidults-approval-trust-registry-v1', version: '1.0.0',
    state: 'CALLER_PINNED_PUBLIC_KEYS_ONLY_HOLD', registryId: 'provider-preflight-registry',
    keys: signers.map(({ key }) => key) };
  return { signers, registry: { ...unsigned, registryDigest: digestObject(unsigned) } };
}

async function approvedEvidence() {
  const gate = structuredClone(sourceGate);
  gate.current_provider_state['CLASSIC.COM'].decision = 'PASS';
  const preflight = projectProviderRightsPreflight({ rightsGate: gate,
    providerId: 'CLASSIC.COM', observedAt: '2026-09-19T10:00:00.000Z' });
  const { signers, registry } = trustFixture();
  const statement = createApprovalEnvelopeSigningStatement({
    authorityClass: 'PROVIDER_PREFLIGHT_NO_FETCH', subjectType: 'PROVIDER_ACTION',
    subjectId: preflight.preflightId, subjectDigest: preflight.preflightDigest,
    requestedCapabilities: { providerContact: false, spend: false, externalEgress: false,
      credentialAccess: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' },
    issuedAt: '2026-09-19T10:00:00.000Z', expiresAt: '2026-09-19T10:30:00.000Z',
    nonceDigest: digestObject({ nonce: 'provider-preflight-001' }),
    trustRegistryDigest: registry.registryDigest,
  });
  const envelope = { ...statement, signatures: signers.map(({ privateKey, key }) => ({
    role: key.role, keyId: key.keyId, algorithm: 'Ed25519',
    signatureBase64: sign(null, Buffer.from(canonicalJson(statement), 'utf8'), privateKey)
      .toString('base64'),
  })) };
  const consumed = await verifyAndConsumeCryptographicApproval(fakeAutonomousTaskClient(), {
    envelope, trustRegistry: registry, expectedTrustRegistryDigest: registry.registryDigest,
    expectedSubject: { authorityClass: 'PROVIDER_PREFLIGHT_NO_FETCH',
      subjectType: 'PROVIDER_ACTION', subjectId: preflight.preflightId,
      subjectDigest: preflight.preflightDigest },
    now: new Date('2026-09-19T10:01:00.000Z'),
  });
  return { preflight, ...consumed };
}

test('Track A/Z/KPMO consumed approval binds to exact rights preflight without activation', async () => {
  const value = await approvedEvidence();
  const evidence = bindProviderRightsApprovalEvidence({ preflight: value.preflight,
    verificationReceipt: value.verificationReceipt,
    consumptionReceipt: value.consumptionReceipt });
  assert.equal(evidence.state, 'VERIFIED_PROVIDER_PREFLIGHT_EVIDENCE_NO_ACTIVATION');
  assert.deepEqual(evidence.verifiedRoles, ['KPMO', 'TRACK_A', 'TRACK_Z']);
  assert.equal(evidence.activationAuthorized, false);
  assert.equal(evidence.providerContactExecuted, false);
  assert.equal(evidence.externalEgress, false);
  verifyProviderRightsApprovalEvidence(evidence);
});

test('different preflight, unconsumed evidence and authority escalation fail closed', async () => {
  const value = await approvedEvidence();
  const different = { ...value.preflight, preflightDigest: digestObject({ different: true }) };
  assert.throws(() => bindProviderRightsApprovalEvidence({ preflight: different,
    verificationReceipt: value.verificationReceipt,
    consumptionReceipt: value.consumptionReceipt }), /PROVIDER_RIGHTS_PREFLIGHT_DIGEST_INVALID/);
  assert.throws(() => bindProviderRightsApprovalEvidence({ preflight: value.preflight,
    verificationReceipt: value.verificationReceipt, consumptionReceipt: null }),
  /APPROVAL_CONSUMPTION_SHAPE_INVALID/);
  const evidence = bindProviderRightsApprovalEvidence({ preflight: value.preflight,
    verificationReceipt: value.verificationReceipt,
    consumptionReceipt: value.consumptionReceipt });
  assert.throws(() => verifyProviderRightsApprovalEvidence({ ...evidence,
    activationAuthorized: true }), /PROVIDER_RIGHTS_APPROVAL_EVIDENCE_BOUNDARY_INVALID/);
});

test('NO_GO and NEEDS_CLARIFICATION never accept approval evidence', async () => {
  const value = await approvedEvidence();
  for (const providerId of ['ALT/FNDATA', 'DISCOGS']) {
    const preflight = projectProviderRightsPreflight({ rightsGate: sourceGate, providerId,
      observedAt: '2026-09-19T10:00:00.000Z' });
    assert.throws(() => bindProviderRightsApprovalEvidence({ preflight,
      verificationReceipt: value.verificationReceipt,
      consumptionReceipt: value.consumptionReceipt }),
    /PROVIDER_RIGHTS_APPROVAL_PREFLIGHT_NOT_ELIGIBLE/);
  }
});
