import {
  digestObject, requireDigest, requireExactRecord, requireInstant, requireValue,
  snapshotJson, verifySelfDigest,
} from './canonical-v1.mjs';
import { verifyCurrentApprovalEvidence } from './approval-trust-runtime-v1.mjs';
import { verifyProviderRightsPreflight } from './provider-rights-preflight-v1.mjs';

const EVIDENCE_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'providerId', 'purpose', 'preflightId',
  'preflightDigest', 'approvalEnvelopeId', 'approvalVerificationReceiptDigest',
  'approvalConsumptionId', 'approvalConsumptionReceiptDigest', 'trustRegistryDigest',
  'verifiedRoles', 'observedAt', 'activationAuthorized', 'providerContactExecuted',
  'externalEgress', 'credentialResolution', 'production', 'publicRelease', 'g5',
  'evidenceId', 'evidenceDigest',
]);

export function bindProviderRightsApprovalEvidence({
  preflight: preflightInput, verificationReceipt: verificationInput,
  consumptionReceipt: consumptionInput,
}) {
  const preflight = verifyProviderRightsPreflight(preflightInput);
  requireValue(preflight.verdict === 'PREFLIGHT_ELIGIBLE_NO_FETCH',
    'PROVIDER_RIGHTS_APPROVAL_PREFLIGHT_NOT_ELIGIBLE');
  const { verificationReceipt, consumptionReceipt } = verifyCurrentApprovalEvidence({
    verificationReceipt: verificationInput, consumptionReceipt: consumptionInput,
  });
  requireValue(verificationReceipt.authorityClass === 'PROVIDER_PREFLIGHT_NO_FETCH'
    && verificationReceipt.subjectType === 'PROVIDER_ACTION'
    && verificationReceipt.subjectId === preflight.preflightId
    && verificationReceipt.subjectDigest === preflight.preflightDigest,
  'PROVIDER_RIGHTS_APPROVAL_SUBJECT_BINDING_INVALID');
  requireValue(consumptionReceipt.approvalVerificationReceiptDigest
    === verificationReceipt.receiptDigest
    && consumptionReceipt.envelopeId === verificationReceipt.envelopeId
    && consumptionReceipt.envelopeDigest === verificationReceipt.envelopeDigest
    && consumptionReceipt.subjectId === preflight.preflightId
    && consumptionReceipt.subjectDigest === preflight.preflightDigest,
  'PROVIDER_RIGHTS_APPROVAL_CONSUMPTION_BINDING_INVALID');
  requireValue(consumptionReceipt.trustRegistryDigest === verificationReceipt.trustRegistryDigest,
    'PROVIDER_RIGHTS_APPROVAL_TRUST_BINDING_INVALID');
  const unsigned = {
    contractId: 'kidults-provider-rights-approval-evidence-v1', version: '1.0.0',
    state: 'VERIFIED_PROVIDER_PREFLIGHT_EVIDENCE_NO_ACTIVATION',
    providerId: preflight.providerId, purpose: preflight.purpose,
    preflightId: preflight.preflightId, preflightDigest: preflight.preflightDigest,
    approvalEnvelopeId: verificationReceipt.envelopeId,
    approvalVerificationReceiptDigest: verificationReceipt.receiptDigest,
    approvalConsumptionId: consumptionReceipt.consumptionId,
    approvalConsumptionReceiptDigest: consumptionReceipt.receiptDigest,
    trustRegistryDigest: verificationReceipt.trustRegistryDigest,
    verifiedRoles: verificationReceipt.verifiedRoles,
    observedAt: consumptionReceipt.consumedAt,
    activationAuthorized: false, providerContactExecuted: false,
    externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const evidenceId = `provider-rights-approval:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, evidenceId };
  return { ...identified, evidenceDigest: digestObject(identified) };
}

export function verifyProviderRightsApprovalEvidence(input) {
  const evidence = snapshotJson(input);
  requireExactRecord(evidence, EVIDENCE_KEYS, 'PROVIDER_RIGHTS_APPROVAL_EVIDENCE_SHAPE_INVALID');
  requireValue(evidence.contractId === 'kidults-provider-rights-approval-evidence-v1'
    && evidence.version === '1.0.0'
    && evidence.state === 'VERIFIED_PROVIDER_PREFLIGHT_EVIDENCE_NO_ACTIVATION',
  'PROVIDER_RIGHTS_APPROVAL_EVIDENCE_CONTRACT_INVALID');
  for (const digest of [evidence.preflightDigest, evidence.approvalVerificationReceiptDigest,
    evidence.approvalConsumptionReceiptDigest, evidence.trustRegistryDigest]) {
    requireDigest(digest, 'PROVIDER_RIGHTS_APPROVAL_EVIDENCE_DIGEST_INVALID');
  }
  requireValue(JSON.stringify(evidence.verifiedRoles) === JSON.stringify(['KPMO', 'TRACK_A', 'TRACK_Z']),
    'PROVIDER_RIGHTS_APPROVAL_ROLE_QUORUM_INVALID');
  requireInstant(evidence.observedAt, 'PROVIDER_RIGHTS_APPROVAL_EVIDENCE_TIME_INVALID');
  requireValue(evidence.activationAuthorized === false
    && evidence.providerContactExecuted === false && evidence.externalEgress === false
    && evidence.credentialResolution === false && evidence.production === 'HOLD'
    && evidence.publicRelease === 'HOLD' && evidence.g5 === 'HOLD',
  'PROVIDER_RIGHTS_APPROVAL_EVIDENCE_BOUNDARY_INVALID');
  const unsigned = Object.fromEntries(Object.entries(evidence)
    .filter(([key]) => !['evidenceId', 'evidenceDigest'].includes(key)));
  requireValue(evidence.evidenceId === `provider-rights-approval:${digestObject(unsigned).slice(7)}`,
    'PROVIDER_RIGHTS_APPROVAL_EVIDENCE_ID_INVALID');
  verifySelfDigest(evidence, 'evidenceDigest', 'PROVIDER_RIGHTS_APPROVAL_EVIDENCE_INTEGRITY_INVALID');
  return evidence;
}
