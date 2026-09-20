import {
  digestObject,
  requireExactRecord,
  requireIdentifier,
  requireValue,
  snapshotJson,
} from './canonical-v1.mjs';
import {
  normalizeControlState,
  normalizeSourceRequest,
  validateAdmissionLifetime,
} from './admission-v1.mjs';

const BROKER_REQUEST_KEYS = Object.freeze([
  'requestId', 'taskId', 'manifestId', 'endpointFingerprint', 'attempt',
]);

function normalizeBrokerRequest(input) {
  const request = snapshotJson(input);
  requireExactRecord(request, BROKER_REQUEST_KEYS, 'BROKER_REQUEST_SHAPE_INVALID');
  for (const key of ['requestId', 'taskId', 'manifestId']) requireIdentifier(request[key], `BROKER_${key.toUpperCase()}_INVALID`);
  requireValue(typeof request.endpointFingerprint === 'string', 'BROKER_ENDPOINT_FINGERPRINT_INVALID');
  requireValue(Number.isSafeInteger(request.attempt) && request.attempt >= 1, 'BROKER_ATTEMPT_INVALID');
  return request;
}

function receipt(unsigned) {
  const receiptId = `execution:${digestObject(unsigned).slice('sha256:'.length)}`;
  const identified = { ...unsigned, receiptId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

function semanticReason(source, decision, manifest, broker, state) {
  if (state.globalKill) return 'OPS_GLOBAL_KILL_ENGAGED';
  if (state.killedSourceFamilies.includes(source.sourceFamilyId)) return 'OPS_SOURCE_FAMILY_KILL_ENGAGED';
  if (state.killedSources.includes(source.sourceId)) return 'OPS_SOURCE_KILL_ENGAGED';
  if (decision.verdict !== 'SHADOW_ELIGIBLE' || decision.allowedMode !== 'SHADOW_NO_FETCH') return 'OPS_ADMISSION_NOT_ELIGIBLE';
  if (manifest.allowedMode !== 'SHADOW_NO_FETCH' || manifest.externalEgress !== false) return 'OPS_MANIFEST_MODE_INVALID';
  if (broker.requestId !== source.requestId || broker.taskId !== source.taskId) return 'OPS_BROKER_REQUEST_BINDING_MISMATCH';
  if (broker.manifestId !== manifest.manifestId) return 'OPS_MANIFEST_ID_MISMATCH';
  if (broker.endpointFingerprint !== source.endpointFingerprint || manifest.endpointFingerprint !== source.endpointFingerprint) return 'OPS_ENDPOINT_FINGERPRINT_MISMATCH';
  if (broker.attempt > manifest.maxAttempts) return 'OPS_ATTEMPT_LIMIT_EXCEEDED';
  if (manifest.requestDigest !== digestObject(source) || decision.requestDigest !== manifest.requestDigest) return 'OPS_REQUEST_DIGEST_MISMATCH';
  if (manifest.decisionId !== decision.decisionId || manifest.decisionDigest !== decision.decisionDigest) return 'OPS_DECISION_BINDING_MISMATCH';
  if (manifest.policyRevision !== state.policyRevision || manifest.policyDigest !== state.policyDigest) return 'OPS_POLICY_REVISION_CHANGED';
  if (manifest.registryRevision !== state.registryRevision || manifest.registryDigest !== state.registryDigest) return 'OPS_REGISTRY_REVISION_CHANGED';
  if (manifest.killEpoch !== state.killEpoch) return 'OPS_KILL_EPOCH_CHANGED';
  return 'SHADOW_NO_FETCH_RECORDED';
}

export function executeShadowBroker({ sourceRequest, decision, manifest, brokerRequest, controlState, now }) {
  const source = normalizeSourceRequest(sourceRequest);
  const state = normalizeControlState(controlState);
  const broker = normalizeBrokerRequest(brokerRequest);
  requireValue(manifest !== null, 'BROKER_MANIFEST_REQUIRED');
  let reason;
  try {
    validateAdmissionLifetime(decision, manifest, now);
    reason = semanticReason(source, decision, manifest, broker, state);
  } catch (error) {
    if (!['DECISION_EXPIRED', 'MANIFEST_EXPIRED'].includes(error.message)) throw error;
    reason = error.message;
  }
  const accepted = reason === 'SHADOW_NO_FETCH_RECORDED';
  return receipt({
    contractId: 'kidults-common-control-shadow-execution-receipt-v1', version: '1.0.0',
    state: accepted ? 'SHADOW_NO_FETCH_RECORDED' : 'DENIED', primaryReason: reason,
    requestId: source.requestId, taskId: source.taskId,
    sourceId: source.sourceId, sourceFamilyId: source.sourceFamilyId,
    decisionId: decision.decisionId, manifestId: manifest.manifestId,
    attempt: broker.attempt, observedAt: now.toISOString(),
    observedPolicyRevision: state.policyRevision, observedRegistryRevision: state.registryRevision,
    observedKillEpoch: state.killEpoch, egressAttempted: false, bytesReceived: 0,
    externalMutation: false, credentialResolved: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
}
