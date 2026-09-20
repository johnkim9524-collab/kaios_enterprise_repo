import {
  digestObject,
  requireDigest,
  requireExactRecord,
  requireIdentifier,
  requireInstant,
  requireValue,
  snapshotJson,
  verifySelfDigest,
} from './canonical-v1.mjs';

export const SOURCE_REQUEST_KEYS = Object.freeze([
  'requestId', 'taskId', 'sourceId', 'sourceFamilyId', 'providerId', 'purpose',
  'scope', 'dataClass', 'region', 'requestedMode', 'synthetic', 'endpointFingerprint',
]);
export const CONTROL_STATE_KEYS = Object.freeze([
  'policyRevision', 'policyDigest', 'registryRevision', 'registryDigest', 'killEpoch',
  'globalKill', 'killedSourceFamilies', 'killedSources', 'externalEgress',
  'production', 'publicRelease', 'g5',
]);
export const DECISION_KEYS = Object.freeze([
  'contractId', 'version', 'requestDigest', 'sourceId', 'sourceFamilyId', 'providerId',
  'taskId', 'purpose', 'scope', 'requestedMode', 'verdict', 'allowedMode',
  'primaryReason', 'secondaryReasons', 'policyRevision', 'policyDigest',
  'registryRevision', 'registryDigest', 'killEpoch', 'issuedAt', 'expiresAt',
  'externalEgress', 'production', 'publicRelease', 'g5', 'decisionId', 'decisionDigest',
]);
export const MANIFEST_KEYS = Object.freeze([
  'contractId', 'version', 'decisionId', 'decisionDigest', 'requestDigest', 'taskId',
  'requestId', 'sourceId', 'sourceFamilyId', 'providerId', 'purpose', 'scope',
  'dataClass', 'region', 'endpointFingerprint', 'allowedMode', 'maxAttempts',
  'policyRevision', 'policyDigest', 'registryRevision', 'registryDigest', 'killEpoch',
  'issuedAt', 'expiresAt', 'externalEgress', 'production', 'publicRelease', 'g5',
  'manifestId', 'manifestDigest',
]);
const REQUEST_MODES = new Set([
  'SYNTHETIC_SHADOW', 'EXTERNAL_FETCH', 'CREDENTIAL_ACCESS', 'PRODUCTION', 'PUBLIC', 'G5',
]);
const HOLD = 'HOLD';

function normalizeStringSet(values, code) {
  requireValue(Array.isArray(values), code);
  const normalized = values.map((value) => requireIdentifier(value, code)).sort();
  requireValue(new Set(normalized).size === normalized.length, code);
  return normalized;
}

export function normalizeSourceRequest(input) {
  const request = snapshotJson(input);
  requireExactRecord(request, SOURCE_REQUEST_KEYS, 'SOURCE_REQUEST_SHAPE_INVALID');
  for (const key of ['requestId', 'taskId', 'sourceId', 'sourceFamilyId', 'purpose', 'scope', 'dataClass', 'region']) {
    requireIdentifier(request[key], `SOURCE_REQUEST_${key.toUpperCase()}_INVALID`);
  }
  requireValue(request.providerId === null || typeof request.providerId === 'string', 'SOURCE_REQUEST_PROVIDER_ID_INVALID');
  if (request.providerId !== null) requireIdentifier(request.providerId, 'SOURCE_REQUEST_PROVIDER_ID_INVALID');
  requireValue(typeof request.requestedMode === 'string' && REQUEST_MODES.has(request.requestedMode), 'SOURCE_REQUEST_MODE_UNKNOWN');
  requireValue(typeof request.synthetic === 'boolean', 'SOURCE_REQUEST_SYNTHETIC_INVALID');
  requireDigest(request.endpointFingerprint, 'SOURCE_REQUEST_ENDPOINT_FINGERPRINT_INVALID');
  return request;
}

export function normalizeControlState(input) {
  const state = snapshotJson(input);
  requireExactRecord(state, CONTROL_STATE_KEYS, 'CONTROL_STATE_SHAPE_INVALID');
  for (const key of ['policyRevision', 'registryRevision', 'killEpoch']) {
    requireValue(Number.isSafeInteger(state[key]) && state[key] >= 0, `CONTROL_STATE_${key.toUpperCase()}_INVALID`);
  }
  requireDigest(state.policyDigest, 'CONTROL_STATE_POLICY_DIGEST_INVALID');
  requireDigest(state.registryDigest, 'CONTROL_STATE_REGISTRY_DIGEST_INVALID');
  requireValue(typeof state.globalKill === 'boolean' && state.externalEgress === false, 'CONTROL_STATE_SAFETY_INVALID');
  state.killedSourceFamilies = normalizeStringSet(state.killedSourceFamilies, 'CONTROL_STATE_KILLED_FAMILY_INVALID');
  state.killedSources = normalizeStringSet(state.killedSources, 'CONTROL_STATE_KILLED_SOURCE_INVALID');
  requireValue(state.production === HOLD && state.publicRelease === HOLD && state.g5 === HOLD, 'CONTROL_STATE_PROTECTED_GATE_INVALID');
  return state;
}

function decisionReason(request, state) {
  if (state.globalKill) return 'OPS_GLOBAL_KILL_ENGAGED';
  if (state.killedSourceFamilies.includes(request.sourceFamilyId)) return 'OPS_SOURCE_FAMILY_KILL_ENGAGED';
  if (state.killedSources.includes(request.sourceId)) return 'OPS_SOURCE_KILL_ENGAGED';
  if (request.requestedMode === 'PRODUCTION') return 'PRD_PRODUCTION_HOLD';
  if (request.requestedMode === 'PUBLIC') return 'PRD_PUBLIC_USE_HOLD';
  if (request.requestedMode === 'G5') return 'PRD_G5_HOLD';
  if (request.requestedMode === 'CREDENTIAL_ACCESS') return 'PRD_OWNER_APPROVAL_REQUIRED';
  if (request.requestedMode === 'EXTERNAL_FETCH' || !request.synthetic) return 'OPS_EXTERNAL_EGRESS_DISABLED';
  return 'ALLOW_SYNTHETIC_SHADOW_ONLY';
}

function addSelfIdentity(prefix, unsigned, idKey, digestKey) {
  const id = `${prefix}:${digestObject(unsigned).slice('sha256:'.length)}`;
  const identified = { ...unsigned, [idKey]: id };
  return { ...identified, [digestKey]: digestObject(identified) };
}

export function verifyDecision(decision) {
  requireExactRecord(decision, DECISION_KEYS, 'DECISION_SHAPE_INVALID');
  verifySelfDigest(decision, 'decisionDigest', 'DECISION_DIGEST_INVALID');
  requireIdentifier(decision.decisionId, 'DECISION_ID_INVALID');
  requireDigest(decision.requestDigest, 'DECISION_REQUEST_DIGEST_INVALID');
  requireDigest(decision.policyDigest, 'DECISION_POLICY_DIGEST_INVALID');
  requireDigest(decision.registryDigest, 'DECISION_REGISTRY_DIGEST_INVALID');
  requireValue(Number.isSafeInteger(decision.policyRevision) && decision.policyRevision >= 0, 'DECISION_POLICY_REVISION_INVALID');
  requireValue(Number.isSafeInteger(decision.registryRevision) && decision.registryRevision >= 0, 'DECISION_REGISTRY_REVISION_INVALID');
  requireValue(Number.isSafeInteger(decision.killEpoch) && decision.killEpoch >= 0, 'DECISION_KILL_EPOCH_INVALID');
  requireInstant(decision.issuedAt, 'DECISION_ISSUED_AT_INVALID');
  requireInstant(decision.expiresAt, 'DECISION_EXPIRY_INVALID');
  requireValue(decision.externalEgress === false && decision.production === HOLD
    && decision.publicRelease === HOLD && decision.g5 === HOLD, 'DECISION_PROTECTED_GATE_INVALID');
  requireValue((decision.verdict === 'SHADOW_ELIGIBLE' && decision.allowedMode === 'SHADOW_NO_FETCH')
    || (decision.verdict === 'DENY' && decision.allowedMode === 'NONE'), 'DECISION_VERDICT_MODE_INVALID');
  const unsignedId = Object.fromEntries(Object.entries(decision).filter(([key]) => key !== 'decisionId' && key !== 'decisionDigest'));
  requireValue(decision.decisionId === `decision:${digestObject(unsignedId).slice('sha256:'.length)}`, 'DECISION_ID_INVALID');
  return decision;
}

export function verifyManifest(manifest) {
  requireExactRecord(manifest, MANIFEST_KEYS, 'MANIFEST_SHAPE_INVALID');
  verifySelfDigest(manifest, 'manifestDigest', 'MANIFEST_DIGEST_INVALID');
  requireIdentifier(manifest.manifestId, 'MANIFEST_ID_INVALID');
  for (const [value, code] of [
    [manifest.decisionDigest, 'MANIFEST_DECISION_DIGEST_INVALID'],
    [manifest.requestDigest, 'MANIFEST_REQUEST_DIGEST_INVALID'],
    [manifest.endpointFingerprint, 'MANIFEST_ENDPOINT_FINGERPRINT_INVALID'],
    [manifest.policyDigest, 'MANIFEST_POLICY_DIGEST_INVALID'],
    [manifest.registryDigest, 'MANIFEST_REGISTRY_DIGEST_INVALID'],
  ]) requireDigest(value, code);
  requireValue(manifest.allowedMode === 'SHADOW_NO_FETCH' && manifest.maxAttempts === 1
    && manifest.externalEgress === false, 'MANIFEST_MODE_INVALID');
  requireValue(Number.isSafeInteger(manifest.policyRevision) && manifest.policyRevision >= 0, 'MANIFEST_POLICY_REVISION_INVALID');
  requireValue(Number.isSafeInteger(manifest.registryRevision) && manifest.registryRevision >= 0, 'MANIFEST_REGISTRY_REVISION_INVALID');
  requireValue(Number.isSafeInteger(manifest.killEpoch) && manifest.killEpoch >= 0, 'MANIFEST_KILL_EPOCH_INVALID');
  requireInstant(manifest.issuedAt, 'MANIFEST_ISSUED_AT_INVALID');
  requireInstant(manifest.expiresAt, 'MANIFEST_EXPIRY_INVALID');
  requireValue(manifest.production === HOLD && manifest.publicRelease === HOLD && manifest.g5 === HOLD,
    'MANIFEST_PROTECTED_GATE_INVALID');
  const unsignedId = Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== 'manifestId' && key !== 'manifestDigest'));
  requireValue(manifest.manifestId === `manifest:${digestObject(unsignedId).slice('sha256:'.length)}`, 'MANIFEST_ID_INVALID');
  return manifest;
}

export function evaluateAdmission({ sourceRequest, controlState, now, ttlSeconds = 300 }) {
  const request = normalizeSourceRequest(sourceRequest);
  const state = normalizeControlState(controlState);
  requireValue(now instanceof Date && Number.isFinite(now.getTime()), 'ADMISSION_CLOCK_INVALID');
  requireValue(Number.isSafeInteger(ttlSeconds) && ttlSeconds >= 1 && ttlSeconds <= 300, 'ADMISSION_TTL_INVALID');
  const reason = decisionReason(request, state);
  const allow = reason === 'ALLOW_SYNTHETIC_SHADOW_ONLY';
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const decisionUnsigned = {
    contractId: 'kidults-common-control-admission-v1', version: '1.0.0',
    requestDigest: digestObject(request), sourceId: request.sourceId,
    sourceFamilyId: request.sourceFamilyId, providerId: request.providerId,
    taskId: request.taskId, purpose: request.purpose, scope: request.scope,
    requestedMode: request.requestedMode,
    verdict: allow ? 'SHADOW_ELIGIBLE' : 'DENY',
    allowedMode: allow ? 'SHADOW_NO_FETCH' : 'NONE',
    primaryReason: reason, secondaryReasons: [],
    policyRevision: state.policyRevision, policyDigest: state.policyDigest,
    registryRevision: state.registryRevision, registryDigest: state.registryDigest,
    killEpoch: state.killEpoch, issuedAt, expiresAt,
    externalEgress: false, production: HOLD, publicRelease: HOLD, g5: HOLD,
  };
  const decision = addSelfIdentity('decision', decisionUnsigned, 'decisionId', 'decisionDigest');
  if (!allow) return { decision, manifest: null };
  const manifestUnsigned = {
    contractId: 'kidults-common-control-shadow-manifest-v1', version: '1.0.0',
    decisionId: decision.decisionId, decisionDigest: decision.decisionDigest,
    requestDigest: decision.requestDigest, taskId: request.taskId,
    requestId: request.requestId, sourceId: request.sourceId,
    sourceFamilyId: request.sourceFamilyId, providerId: request.providerId,
    purpose: request.purpose, scope: request.scope, dataClass: request.dataClass,
    region: request.region, endpointFingerprint: request.endpointFingerprint,
    allowedMode: 'SHADOW_NO_FETCH', maxAttempts: 1,
    policyRevision: state.policyRevision, policyDigest: state.policyDigest,
    registryRevision: state.registryRevision, registryDigest: state.registryDigest,
    killEpoch: state.killEpoch, issuedAt, expiresAt,
    externalEgress: false, production: HOLD, publicRelease: HOLD, g5: HOLD,
  };
  return { decision, manifest: addSelfIdentity('manifest', manifestUnsigned, 'manifestId', 'manifestDigest') };
}

export function validateAdmissionLifetime(decision, manifest, now) {
  verifyDecision(decision);
  verifyManifest(manifest);
  requireValue(now instanceof Date && Number.isFinite(now.getTime()), 'ADMISSION_CLOCK_INVALID');
  requireValue(requireInstant(decision.expiresAt, 'DECISION_EXPIRY_INVALID') > now, 'DECISION_EXPIRED');
  requireValue(requireInstant(manifest.expiresAt, 'MANIFEST_EXPIRY_INVALID') > now, 'MANIFEST_EXPIRED');
}
