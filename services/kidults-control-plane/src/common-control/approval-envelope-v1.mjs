import { createPublicKey, verify as verifySignature } from 'node:crypto';
import {
  canonicalJson, digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson, verifySelfDigest,
} from './canonical-v1.mjs';

const CAPABILITY_KEYS = Object.freeze([
  'providerContact', 'spend', 'externalEgress', 'credentialAccess',
  'production', 'publicRelease', 'g5',
]);
const ENVELOPE_KEYS = Object.freeze([
  'contractId', 'version', 'authorityClass', 'subjectType', 'subjectId',
  'subjectDigest', 'requestedCapabilities', 'issuedAt', 'expiresAt', 'nonceDigest',
  'matrixContractDigest', 'trustRegistryDigest', 'signingPayloadDigest',
  'envelopeId', 'signatures',
]);
const SIGNATURE_KEYS = Object.freeze(['role', 'keyId', 'algorithm', 'signatureBase64']);
const REGISTRY_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'registryId', 'keys', 'registryDigest',
]);
const TRUST_KEY_KEYS = Object.freeze([
  'keyId', 'role', 'algorithm', 'publicKeyPem', 'keyFingerprint', 'state',
]);
const RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'envelopeId', 'envelopeDigest',
  'authorityClass', 'subjectType', 'subjectId', 'subjectDigest', 'verifiedRoles',
  'nonceDigest', 'requestedCapabilitiesDigest', 'matrixContractDigest',
  'trustRegistryDigest', 'observedAt',
  'activationAuthorized', 'providerContactExecuted', 'spendAuthorized',
  'externalEgress', 'credentialResolution', 'production', 'publicRelease', 'g5',
  'receiptId', 'receiptDigest',
]);

export const APPROVAL_AUTHORITY_CLASSES_V1 = Object.freeze({
  LOCAL_SYNTHETIC_SHADOW: Object.freeze({
    subjectType: 'SUPERVISOR_INVOCATION', requiredRoles: Object.freeze(['KPMO']),
    maximumLifetimeSeconds: 300, protectedCapabilityRequestsAllowed: false,
  }),
  PROVIDER_PREFLIGHT_NO_FETCH: Object.freeze({
    subjectType: 'PROVIDER_ACTION',
    requiredRoles: Object.freeze(['KPMO', 'TRACK_A', 'TRACK_Z']),
    maximumLifetimeSeconds: 3600, protectedCapabilityRequestsAllowed: false,
  }),
  PROTECTED_ACTION_PACKAGE: Object.freeze({
    subjectType: 'PROTECTED_ACTION_PACKAGE',
    requiredRoles: Object.freeze(['KPMO', 'PROGRAM_OWNER']),
    maximumLifetimeSeconds: 900, protectedCapabilityRequestsAllowed: true,
  }),
});

export const APPROVAL_AUTHORITY_MATRIX_DIGEST_V1 = digestObject(APPROVAL_AUTHORITY_CLASSES_V1);

function parseEd25519PublicKey(publicKeyPem) {
  try {
    const key = createPublicKey(publicKeyPem);
    requireValue(key.asymmetricKeyType === 'ed25519', 'APPROVAL_TRUST_KEY_TYPE_INVALID');
    return key;
  } catch (error) {
    if (error?.message === 'APPROVAL_TRUST_KEY_TYPE_INVALID') throw error;
    requireValue(false, 'APPROVAL_TRUST_KEY_PEM_INVALID');
    return null;
  }
}

function capabilities(input, protectedAllowed) {
  const value = snapshotJson(input);
  requireExactRecord(value, CAPABILITY_KEYS, 'APPROVAL_CAPABILITY_SHAPE_INVALID');
  for (const key of ['providerContact', 'spend', 'externalEgress', 'credentialAccess']) {
    requireValue(typeof value[key] === 'boolean', 'APPROVAL_CAPABILITY_VALUE_INVALID');
  }
  for (const key of ['production', 'publicRelease', 'g5']) {
    requireValue(value[key] === 'HOLD' || value[key] === 'REQUESTED',
      'APPROVAL_CAPABILITY_VALUE_INVALID');
  }
  if (!protectedAllowed) {
    requireValue(value.providerContact === false && value.spend === false
      && value.externalEgress === false && value.credentialAccess === false
      && value.production === 'HOLD' && value.publicRelease === 'HOLD' && value.g5 === 'HOLD',
    'APPROVAL_PROTECTED_CAPABILITY_REQUEST_DENIED');
  }
  return value;
}

function signingStatementFromEnvelope(envelope) {
  return Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== 'signatures'));
}

export function createApprovalEnvelopeSigningStatement({
  authorityClass, subjectType, subjectId, subjectDigest, requestedCapabilities,
  issuedAt, expiresAt, nonceDigest, trustRegistryDigest,
}) {
  const rule = APPROVAL_AUTHORITY_CLASSES_V1[authorityClass];
  requireValue(rule, 'APPROVAL_AUTHORITY_CLASS_INVALID');
  requireValue(subjectType === rule.subjectType, 'APPROVAL_SUBJECT_TYPE_INVALID');
  requireIdentifier(subjectId, 'APPROVAL_SUBJECT_ID_INVALID');
  requireDigest(subjectDigest, 'APPROVAL_SUBJECT_DIGEST_INVALID');
  requireDigest(nonceDigest, 'APPROVAL_NONCE_DIGEST_INVALID');
  requireDigest(trustRegistryDigest, 'APPROVAL_TRUST_REGISTRY_DIGEST_INVALID');
  const issued = requireInstant(issuedAt, 'APPROVAL_TIME_INVALID');
  const expires = requireInstant(expiresAt, 'APPROVAL_TIME_INVALID');
  requireValue(expires > issued
    && expires.getTime() - issued.getTime() <= rule.maximumLifetimeSeconds * 1000,
  'APPROVAL_LIFETIME_INVALID');
  const unsigned = {
    contractId: 'kidults-cryptographic-approval-envelope-v1', version: '1.0.0',
    authorityClass, subjectType, subjectId, subjectDigest,
    requestedCapabilities: capabilities(requestedCapabilities,
      rule.protectedCapabilityRequestsAllowed),
    issuedAt, expiresAt, nonceDigest,
    matrixContractDigest: APPROVAL_AUTHORITY_MATRIX_DIGEST_V1, trustRegistryDigest,
  };
  const signingPayloadDigest = digestObject(unsigned);
  const identified = { ...unsigned, signingPayloadDigest };
  return { ...identified, envelopeId: `approval-envelope:${digestObject(identified).slice(7)}` };
}

function validateTrustRegistry(input, expectedDigest) {
  const registry = snapshotJson(input, { maxBytes: 262144 });
  requireExactRecord(registry, REGISTRY_KEYS, 'APPROVAL_TRUST_REGISTRY_SHAPE_INVALID');
  requireValue(registry.contractId === 'kidults-approval-trust-registry-v1'
    && registry.version === '1.0.0'
    && registry.state === 'CALLER_PINNED_PUBLIC_KEYS_ONLY_HOLD',
  'APPROVAL_TRUST_REGISTRY_CONTRACT_INVALID');
  requireIdentifier(registry.registryId, 'APPROVAL_TRUST_REGISTRY_ID_INVALID');
  requireDigest(registry.registryDigest, 'APPROVAL_TRUST_REGISTRY_DIGEST_INVALID');
  requireDigest(expectedDigest, 'APPROVAL_EXPECTED_TRUST_DIGEST_INVALID');
  requireValue(registry.registryDigest === expectedDigest, 'APPROVAL_TRUST_REGISTRY_PIN_MISMATCH');
  verifySelfDigest(registry, 'registryDigest', 'APPROVAL_TRUST_REGISTRY_INTEGRITY_INVALID');
  requireValue(Array.isArray(registry.keys) && registry.keys.length >= 1 && registry.keys.length <= 16,
    'APPROVAL_TRUST_KEY_COUNT_INVALID');
  const keyIds = new Set();
  const fingerprints = new Set();
  for (const entry of registry.keys) {
    requireExactRecord(entry, TRUST_KEY_KEYS, 'APPROVAL_TRUST_KEY_SHAPE_INVALID');
    requireIdentifier(entry.keyId, 'APPROVAL_TRUST_KEY_ID_INVALID');
    requireValue(['KPMO', 'TRACK_A', 'TRACK_Z', 'PROGRAM_OWNER'].includes(entry.role),
      'APPROVAL_TRUST_KEY_ROLE_INVALID');
    requireValue(entry.algorithm === 'Ed25519' && entry.state === 'ACTIVE',
      'APPROVAL_TRUST_KEY_STATE_INVALID');
    requireDigest(entry.keyFingerprint, 'APPROVAL_TRUST_KEY_FINGERPRINT_INVALID');
    requireValue(!keyIds.has(entry.keyId) && !fingerprints.has(entry.keyFingerprint),
      'APPROVAL_TRUST_KEY_DUPLICATE');
    const key = parseEd25519PublicKey(entry.publicKeyPem);
    requireValue(digestObject({ spki: key.export({ type: 'spki', format: 'der' }).toString('base64') })
      === entry.keyFingerprint, 'APPROVAL_TRUST_KEY_FINGERPRINT_MISMATCH');
    keyIds.add(entry.keyId); fingerprints.add(entry.keyFingerprint);
  }
  return registry;
}

function validateEnvelope(input) {
  const envelope = snapshotJson(input, { maxBytes: 262144 });
  requireExactRecord(envelope, ENVELOPE_KEYS, 'APPROVAL_ENVELOPE_SHAPE_INVALID');
  requireValue(envelope.contractId === 'kidults-cryptographic-approval-envelope-v1'
    && envelope.version === '1.0.0', 'APPROVAL_ENVELOPE_CONTRACT_INVALID');
  const rule = APPROVAL_AUTHORITY_CLASSES_V1[envelope.authorityClass];
  requireValue(rule, 'APPROVAL_AUTHORITY_CLASS_INVALID');
  requireValue(envelope.subjectType === rule.subjectType, 'APPROVAL_SUBJECT_TYPE_INVALID');
  requireIdentifier(envelope.subjectId, 'APPROVAL_SUBJECT_ID_INVALID');
  requireDigest(envelope.subjectDigest, 'APPROVAL_SUBJECT_DIGEST_INVALID');
  requireDigest(envelope.nonceDigest, 'APPROVAL_NONCE_DIGEST_INVALID');
  requireDigest(envelope.matrixContractDigest, 'APPROVAL_MATRIX_DIGEST_INVALID');
  requireValue(envelope.matrixContractDigest === APPROVAL_AUTHORITY_MATRIX_DIGEST_V1,
    'APPROVAL_MATRIX_DIGEST_MISMATCH');
  requireDigest(envelope.trustRegistryDigest, 'APPROVAL_TRUST_REGISTRY_DIGEST_INVALID');
  const issued = requireInstant(envelope.issuedAt, 'APPROVAL_TIME_INVALID');
  const expires = requireInstant(envelope.expiresAt, 'APPROVAL_TIME_INVALID');
  requireValue(expires > issued
    && expires.getTime() - issued.getTime() <= rule.maximumLifetimeSeconds * 1000,
  'APPROVAL_LIFETIME_INVALID');
  capabilities(envelope.requestedCapabilities, rule.protectedCapabilityRequestsAllowed);
  requireDigest(envelope.signingPayloadDigest, 'APPROVAL_SIGNING_DIGEST_INVALID');
  requireIdentifier(envelope.envelopeId, 'APPROVAL_ENVELOPE_ID_INVALID');
  const expected = createApprovalEnvelopeSigningStatement(envelope);
  requireValue(canonicalJson(signingStatementFromEnvelope(envelope)) === canonicalJson(expected),
    'APPROVAL_ENVELOPE_INTEGRITY_INVALID');
  requireValue(Array.isArray(envelope.signatures), 'APPROVAL_SIGNATURES_INVALID');
  return { envelope, rule };
}

export function verifyCryptographicApprovalEnvelope({
  envelope: input, trustRegistry: registryInput, expectedTrustRegistryDigest, now,
}) {
  const { envelope, rule } = validateEnvelope(input);
  const observed = requireInstant(now, 'APPROVAL_OBSERVED_TIME_INVALID');
  requireValue(observed >= new Date(envelope.issuedAt) && observed < new Date(envelope.expiresAt),
    'APPROVAL_ENVELOPE_EXPIRED_OR_NOT_YET_VALID');
  const registry = validateTrustRegistry(registryInput, expectedTrustRegistryDigest);
  requireValue(envelope.trustRegistryDigest === registry.registryDigest,
    'APPROVAL_ENVELOPE_TRUST_BINDING_INVALID');
  requireValue(envelope.signatures.length === rule.requiredRoles.length,
    'APPROVAL_SIGNATURE_QUORUM_INVALID');
  const sorted = [...envelope.signatures].sort((left, right) => left.role.localeCompare(right.role)
    || left.keyId.localeCompare(right.keyId));
  requireValue(canonicalJson(sorted) === canonicalJson(envelope.signatures),
    'APPROVAL_SIGNATURE_ORDER_INVALID');
  const verifiedRoles = [];
  const usedKeys = new Set();
  const signingBytes = Buffer.from(canonicalJson(signingStatementFromEnvelope(envelope)), 'utf8');
  for (const [index, signature] of envelope.signatures.entries()) {
    requireExactRecord(signature, SIGNATURE_KEYS, 'APPROVAL_SIGNATURE_SHAPE_INVALID');
    requireValue(signature.role === rule.requiredRoles[index], 'APPROVAL_SIGNATURE_ROLE_QUORUM_INVALID');
    requireIdentifier(signature.keyId, 'APPROVAL_SIGNATURE_KEY_ID_INVALID');
    requireValue(signature.algorithm === 'Ed25519' && !usedKeys.has(signature.keyId),
      'APPROVAL_SIGNATURE_KEY_INVALID');
    requireValue(/^[A-Za-z0-9+/]{86}==$/.test(signature.signatureBase64),
      'APPROVAL_SIGNATURE_ENCODING_INVALID');
    const signatureBytes = Buffer.from(signature.signatureBase64, 'base64');
    requireValue(signatureBytes.length === 64
      && signatureBytes.toString('base64') === signature.signatureBase64,
    'APPROVAL_SIGNATURE_ENCODING_INVALID');
    const trusted = registry.keys.find((key) => key.keyId === signature.keyId);
    requireValue(trusted && trusted.role === signature.role && trusted.algorithm === 'Ed25519'
      && trusted.state === 'ACTIVE', 'APPROVAL_SIGNATURE_TRUST_BINDING_INVALID');
    requireValue(verifySignature(null, signingBytes,
      parseEd25519PublicKey(trusted.publicKeyPem), signatureBytes),
      'APPROVAL_SIGNATURE_INVALID');
    usedKeys.add(signature.keyId); verifiedRoles.push(signature.role);
  }
  const unsigned = {
    contractId: 'kidults-cryptographic-approval-verification-receipt-v1', version: '1.0.0',
    state: 'SIGNATURES_VERIFIED_AUTHORITY_NOT_ACTIVATED', envelopeId: envelope.envelopeId,
    envelopeDigest: digestObject(envelope), authorityClass: envelope.authorityClass,
    subjectType: envelope.subjectType, subjectId: envelope.subjectId,
    subjectDigest: envelope.subjectDigest, verifiedRoles,
    nonceDigest: envelope.nonceDigest,
    requestedCapabilitiesDigest: digestObject(envelope.requestedCapabilities),
    matrixContractDigest: envelope.matrixContractDigest,
    trustRegistryDigest: registry.registryDigest, observedAt: now,
    activationAuthorized: false, providerContactExecuted: false, spendAuthorized: false,
    externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const receiptId = `approval-verification:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, receiptId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function verifyCryptographicApprovalReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, RECEIPT_KEYS, 'APPROVAL_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-cryptographic-approval-verification-receipt-v1'
    && receipt.version === '1.0.0'
    && receipt.state === 'SIGNATURES_VERIFIED_AUTHORITY_NOT_ACTIVATED',
  'APPROVAL_RECEIPT_CONTRACT_INVALID');
  requireIdentifier(receipt.envelopeId, 'APPROVAL_RECEIPT_ENVELOPE_INVALID');
  for (const digest of [receipt.envelopeDigest, receipt.subjectDigest, receipt.nonceDigest,
    receipt.requestedCapabilitiesDigest,
    receipt.matrixContractDigest, receipt.trustRegistryDigest]) {
    requireDigest(digest, 'APPROVAL_RECEIPT_DIGEST_INVALID');
  }
  requireValue(APPROVAL_AUTHORITY_CLASSES_V1[receipt.authorityClass]?.subjectType
    === receipt.subjectType, 'APPROVAL_RECEIPT_AUTHORITY_INVALID');
  requireValue(receipt.matrixContractDigest === APPROVAL_AUTHORITY_MATRIX_DIGEST_V1,
    'APPROVAL_RECEIPT_MATRIX_DIGEST_MISMATCH');
  requireIdentifier(receipt.subjectId, 'APPROVAL_RECEIPT_SUBJECT_INVALID');
  requireValue(Array.isArray(receipt.verifiedRoles)
    && canonicalJson(receipt.verifiedRoles)
      === canonicalJson(APPROVAL_AUTHORITY_CLASSES_V1[receipt.authorityClass].requiredRoles),
  'APPROVAL_RECEIPT_ROLE_QUORUM_INVALID');
  requireInstant(receipt.observedAt, 'APPROVAL_RECEIPT_TIME_INVALID');
  requireValue(receipt.activationAuthorized === false && receipt.providerContactExecuted === false
    && receipt.spendAuthorized === false && receipt.externalEgress === false
    && receipt.credentialResolution === false && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'APPROVAL_RECEIPT_PROTECTED_GATE_INVALID');
  requireIdentifier(receipt.receiptId, 'APPROVAL_RECEIPT_ID_INVALID');
  requireDigest(receipt.receiptDigest, 'APPROVAL_RECEIPT_DIGEST_INVALID');
  verifySelfDigest(receipt, 'receiptDigest', 'APPROVAL_RECEIPT_INTEGRITY_INVALID');
  const unsigned = Object.fromEntries(Object.entries(receipt)
    .filter(([key]) => key !== 'receiptId' && key !== 'receiptDigest'));
  requireValue(receipt.receiptId === `approval-verification:${digestObject(unsigned).slice(7)}`,
    'APPROVAL_RECEIPT_ID_INVALID');
  return receipt;
}
