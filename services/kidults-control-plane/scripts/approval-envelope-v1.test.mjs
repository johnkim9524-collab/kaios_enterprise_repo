import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  APPROVAL_AUTHORITY_MATRIX_DIGEST_V1,
  createApprovalEnvelopeSigningStatement,
  verifyCryptographicApprovalEnvelope,
  verifyCryptographicApprovalReceipt,
} from '../src/common-control/approval-envelope-v1.mjs';
import { canonicalJson, digestObject } from '../src/common-control/canonical-v1.mjs';

const issuedAt = '2026-09-19T00:00:00.000Z';
const digest = value => digestObject({ value });

function createTrustKey(role) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const keyFingerprint = digestObject({
    spki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  });
  return {
    privateKey,
    registryEntry: {
      keyId: `${role.toLowerCase().replace('_', '-')}-key-001`, role,
      algorithm: 'Ed25519', publicKeyPem, keyFingerprint, state: 'ACTIVE',
    },
  };
}

function createTrustRegistry(keys) {
  const unsigned = {
    contractId: 'kidults-approval-trust-registry-v1', version: '1.0.0',
    state: 'CALLER_PINNED_PUBLIC_KEYS_ONLY_HOLD', registryId: 'local-test-registry-001',
    keys: keys.map(key => key.registryEntry),
  };
  return { ...unsigned, registryDigest: digestObject(unsigned) };
}

const noProtectedCapabilities = Object.freeze({
  providerContact: false, spend: false, externalEgress: false, credentialAccess: false,
  production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
});

function createFixture(authorityClass, roles, options = {}) {
  const keys = roles.map(createTrustKey);
  const trustRegistry = createTrustRegistry(keys);
  const subjectType = {
    LOCAL_SYNTHETIC_SHADOW: 'SUPERVISOR_INVOCATION',
    PROVIDER_PREFLIGHT_NO_FETCH: 'PROVIDER_ACTION',
    PROTECTED_ACTION_PACKAGE: 'PROTECTED_ACTION_PACKAGE',
  }[authorityClass];
  const statement = createApprovalEnvelopeSigningStatement({
    authorityClass, subjectType, subjectId: options.subjectId ?? 'subject-001',
    subjectDigest: options.subjectDigest ?? digest('subject'),
    requestedCapabilities: options.requestedCapabilities ?? noProtectedCapabilities,
    issuedAt, expiresAt: options.expiresAt ?? '2026-09-19T00:05:00.000Z',
    nonceDigest: digest('nonce'), trustRegistryDigest: trustRegistry.registryDigest,
  });
  const signingBytes = Buffer.from(canonicalJson(statement), 'utf8');
  const signatures = keys.map(key => ({
    role: key.registryEntry.role, keyId: key.registryEntry.keyId, algorithm: 'Ed25519',
    signatureBase64: sign(null, signingBytes, key.privateKey).toString('base64'),
  })).sort((left, right) => left.role.localeCompare(right.role)
    || left.keyId.localeCompare(right.keyId));
  return {
    keys, trustRegistry, envelope: { ...statement, signatures },
    expectedTrustRegistryDigest: trustRegistry.registryDigest,
    now: options.now ?? '2026-09-19T00:01:00.000Z',
  };
}

function verify(fixture) {
  return verifyCryptographicApprovalEnvelope(fixture);
}

test('local synthetic shadow requires one KPMO signature and never activates authority', () => {
  const receipt = verify(createFixture('LOCAL_SYNTHETIC_SHADOW', ['KPMO']));
  assert.deepEqual(receipt.verifiedRoles, ['KPMO']);
  assert.equal(receipt.matrixContractDigest, APPROVAL_AUTHORITY_MATRIX_DIGEST_V1);
  assert.equal(receipt.state, 'SIGNATURES_VERIFIED_AUTHORITY_NOT_ACTIVATED');
  assert.equal(receipt.activationAuthorized, false);
  assert.equal(receipt.externalEgress, false);
  assert.equal(receipt.production, 'HOLD');
  assert.equal(canonicalJson(verifyCryptographicApprovalReceipt(receipt)), canonicalJson(receipt));
});

test('provider preflight requires exact KPMO, Track A and Track Z quorum', () => {
  const receipt = verify(createFixture('PROVIDER_PREFLIGHT_NO_FETCH',
    ['KPMO', 'TRACK_A', 'TRACK_Z'], { expiresAt: '2026-09-19T01:00:00.000Z' }));
  assert.deepEqual(receipt.verifiedRoles, ['KPMO', 'TRACK_A', 'TRACK_Z']);
  assert.equal(receipt.providerContactExecuted, false);
  assert.equal(receipt.credentialResolution, false);
});

test('a missing Track Z signature fails the provider quorum', () => {
  const fixture = createFixture('PROVIDER_PREFLIGHT_NO_FETCH',
    ['KPMO', 'TRACK_A', 'TRACK_Z'], { expiresAt: '2026-09-19T01:00:00.000Z' });
  fixture.envelope.signatures.pop();
  assert.throws(() => verify(fixture), /APPROVAL_SIGNATURE_QUORUM_INVALID/);
});

test('an extra signer fails instead of broadening the quorum', () => {
  const fixture = createFixture('LOCAL_SYNTHETIC_SHADOW', ['KPMO']);
  fixture.envelope.signatures.push({ ...fixture.envelope.signatures[0], keyId: 'other-key-001' });
  assert.throws(() => verify(fixture), /APPROVAL_SIGNATURE_QUORUM_INVALID/);
});

test('a trusted key cannot substitute for a different authority role', () => {
  const fixture = createFixture('PROVIDER_PREFLIGHT_NO_FETCH',
    ['KPMO', 'TRACK_A', 'TRACK_Z'], { expiresAt: '2026-09-19T01:00:00.000Z' });
  const trackA = fixture.envelope.signatures.find(entry => entry.role === 'TRACK_A');
  const trackZ = fixture.envelope.signatures.find(entry => entry.role === 'TRACK_Z');
  trackZ.keyId = trackA.keyId;
  trackZ.signatureBase64 = trackA.signatureBase64;
  assert.throws(() => verify(fixture), /APPROVAL_SIGNATURE_KEY_INVALID|APPROVAL_SIGNATURE_TRUST_BINDING_INVALID/);
});

test('subject tampering invalidates the signed envelope identity', () => {
  const fixture = createFixture('LOCAL_SYNTHETIC_SHADOW', ['KPMO']);
  fixture.envelope.subjectDigest = digest('tampered-subject');
  assert.throws(() => verify(fixture), /APPROVAL_ENVELOPE_INTEGRITY_INVALID/);
});

test('expired and not-yet-valid envelopes fail closed', () => {
  const expired = createFixture('LOCAL_SYNTHETIC_SHADOW', ['KPMO'], {
    expiresAt: '2026-09-19T00:04:00.000Z', now: '2026-09-19T00:04:00.000Z',
  });
  assert.throws(() => verify(expired), /APPROVAL_ENVELOPE_EXPIRED_OR_NOT_YET_VALID/);
  const future = createFixture('LOCAL_SYNTHETIC_SHADOW', ['KPMO'], {
    now: '2026-09-18T23:59:59.999Z',
  });
  assert.throws(() => verify(future), /APPROVAL_ENVELOPE_EXPIRED_OR_NOT_YET_VALID/);
});

test('the caller must pin the exact self-digest trust registry', () => {
  const fixture = createFixture('LOCAL_SYNTHETIC_SHADOW', ['KPMO']);
  fixture.expectedTrustRegistryDigest = digest('different-registry');
  assert.throws(() => verify(fixture), /APPROVAL_TRUST_REGISTRY_PIN_MISMATCH/);
});

test('protected action signatures remain verification evidence, not activation authority', () => {
  const requestedCapabilities = {
    providerContact: true, spend: true, externalEgress: true, credentialAccess: true,
    production: 'REQUESTED', publicRelease: 'REQUESTED', g5: 'REQUESTED',
  };
  const receipt = verify(createFixture('PROTECTED_ACTION_PACKAGE',
    ['KPMO', 'PROGRAM_OWNER'], { requestedCapabilities }));
  assert.deepEqual(receipt.verifiedRoles, ['KPMO', 'PROGRAM_OWNER']);
  assert.equal(receipt.activationAuthorized, false);
  assert.equal(receipt.providerContactExecuted, false);
  assert.equal(receipt.spendAuthorized, false);
  assert.equal(receipt.externalEgress, false);
  assert.equal(receipt.credentialResolution, false);
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.publicRelease, 'HOLD');
  assert.equal(receipt.g5, 'HOLD');
});

test('unprotected classes cannot request protected capabilities', () => {
  assert.throws(() => createFixture('LOCAL_SYNTHETIC_SHADOW', ['KPMO'], {
    requestedCapabilities: { ...noProtectedCapabilities, externalEgress: true },
  }), /APPROVAL_PROTECTED_CAPABILITY_REQUEST_DENIED/);
});

test('unregistered envelope fields and receipt matrix substitution fail closed', () => {
  const fixture = createFixture('LOCAL_SYNTHETIC_SHADOW', ['KPMO']);
  assert.throws(() => verify({ ...fixture, envelope: { ...fixture.envelope, unexpected: true } }),
    /APPROVAL_ENVELOPE_SHAPE_INVALID/);
  const receipt = verify(fixture);
  const substituted = { ...receipt, matrixContractDigest: digest('other-matrix') };
  substituted.receiptDigest = digestObject(Object.fromEntries(Object.entries(substituted)
    .filter(([key]) => key !== 'receiptDigest')));
  assert.throws(() => verifyCryptographicApprovalReceipt(substituted),
    /APPROVAL_RECEIPT_MATRIX_DIGEST_MISMATCH/);
});
