import { createPublicKey } from 'node:crypto';
import {
  canonicalJson, digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson, verifySelfDigest,
} from './canonical-v1.mjs';

const ROLES = Object.freeze(['KPMO', 'PROGRAM_OWNER', 'TRACK_A', 'TRACK_Z']);
const OPERATIONS = Object.freeze(['ACTIVATE_SYNTHETIC_ONLY', 'REVOKE']);
const CANDIDATE_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'scope', 'keyId', 'role', 'algorithm',
  'publicKeyPem', 'keyFingerprint', 'predecessorKeyId', 'proposedAt',
  'activationAuthorized', 'production', 'publicRelease', 'g5', 'candidateDigest',
]);
const EVENT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'scope', 'eventId', 'keyId', 'candidateDigest',
  'role', 'operation', 'revision', 'predecessorKeyId', 'beforeState', 'afterState',
  'observedAt', 'activationAuthorized', 'providerContactExecuted', 'spendAuthorized',
  'externalEgress', 'credentialResolution', 'production', 'publicRelease', 'g5',
  'eventDigest',
]);

function parsePublicKey(publicKeyPem) {
  requireValue(typeof publicKeyPem === 'string' && Buffer.byteLength(publicKeyPem) <= 4096,
    'TRUST_ROOT_PUBLIC_KEY_PEM_INVALID');
  requireValue(publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----\n')
    && publicKeyPem.endsWith('-----END PUBLIC KEY-----\n')
    && !publicKeyPem.includes('PRIVATE KEY'), 'TRUST_ROOT_PUBLIC_KEY_PEM_INVALID');
  try {
    const key = createPublicKey(publicKeyPem);
    requireValue(key.asymmetricKeyType === 'ed25519', 'TRUST_ROOT_PUBLIC_KEY_TYPE_INVALID');
    return key;
  } catch (error) {
    if (error?.message === 'TRUST_ROOT_PUBLIC_KEY_TYPE_INVALID') throw error;
    requireValue(false, 'TRUST_ROOT_PUBLIC_KEY_PEM_INVALID');
  }
}

function protectedBoundary(record) {
  requireValue(record.activationAuthorized === false && record.production === 'HOLD'
    && record.publicRelease === 'HOLD' && record.g5 === 'HOLD',
  'TRUST_ROOT_PROTECTED_GATE_INVALID');
}

export function verifyTrustRootCandidate(input) {
  const candidate = snapshotJson(input, { maxBytes: 16384 });
  requireExactRecord(candidate, CANDIDATE_KEYS, 'TRUST_ROOT_CANDIDATE_SHAPE_INVALID');
  requireValue(candidate.contractId === 'kidults-approval-trust-root-candidate-v1'
    && candidate.version === '1.0.0' && candidate.state === 'CANDIDATE_HOLD'
    && candidate.scope === 'LOCAL_SYNTHETIC_TEST_ONLY',
  'TRUST_ROOT_CANDIDATE_CONTRACT_INVALID');
  requireIdentifier(candidate.keyId, 'TRUST_ROOT_KEY_ID_INVALID');
  requireValue(ROLES.includes(candidate.role), 'TRUST_ROOT_ROLE_INVALID');
  requireValue(candidate.algorithm === 'Ed25519', 'TRUST_ROOT_ALGORITHM_INVALID');
  requireDigest(candidate.keyFingerprint, 'TRUST_ROOT_FINGERPRINT_INVALID');
  requireValue(candidate.predecessorKeyId === null
    || (requireIdentifier(candidate.predecessorKeyId, 'TRUST_ROOT_PREDECESSOR_INVALID')
      && candidate.predecessorKeyId !== candidate.keyId), 'TRUST_ROOT_PREDECESSOR_INVALID');
  requireInstant(candidate.proposedAt, 'TRUST_ROOT_TIME_INVALID');
  protectedBoundary(candidate);
  const key = parsePublicKey(candidate.publicKeyPem);
  requireValue(candidate.keyFingerprint === digestObject({
    spki: key.export({ type: 'spki', format: 'der' }).toString('base64'),
  }), 'TRUST_ROOT_FINGERPRINT_MISMATCH');
  verifySelfDigest(candidate, 'candidateDigest', 'TRUST_ROOT_CANDIDATE_INTEGRITY_INVALID');
  return candidate;
}

export function createTrustRootCandidate({
  keyId, role, publicKeyPem, predecessorKeyId = null, proposedAt,
}) {
  requireIdentifier(keyId, 'TRUST_ROOT_KEY_ID_INVALID');
  requireValue(ROLES.includes(role), 'TRUST_ROOT_ROLE_INVALID');
  requireValue(predecessorKeyId === null
    || (requireIdentifier(predecessorKeyId, 'TRUST_ROOT_PREDECESSOR_INVALID')
      && predecessorKeyId !== keyId), 'TRUST_ROOT_PREDECESSOR_INVALID');
  requireInstant(proposedAt, 'TRUST_ROOT_TIME_INVALID');
  const key = parsePublicKey(publicKeyPem);
  const unsigned = {
    contractId: 'kidults-approval-trust-root-candidate-v1', version: '1.0.0',
    state: 'CANDIDATE_HOLD', scope: 'LOCAL_SYNTHETIC_TEST_ONLY', keyId, role,
    algorithm: 'Ed25519', publicKeyPem,
    keyFingerprint: digestObject({
      spki: key.export({ type: 'spki', format: 'der' }).toString('base64'),
    }),
    predecessorKeyId, proposedAt, activationAuthorized: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyTrustRootCandidate({ ...unsigned, candidateDigest: digestObject(unsigned) });
}

export function verifyTrustRootLifecycleEvent(input) {
  const event = snapshotJson(input, { maxBytes: 16384 });
  requireExactRecord(event, EVENT_KEYS, 'TRUST_ROOT_EVENT_SHAPE_INVALID');
  requireValue(event.contractId === 'kidults-approval-trust-root-lifecycle-event-v1'
    && event.version === '1.0.0'
    && event.state === 'LIFECYCLE_RECORDED_AUTHORITY_NOT_ACTIVATED'
    && event.scope === 'LOCAL_SYNTHETIC_TEST_ONLY', 'TRUST_ROOT_EVENT_CONTRACT_INVALID');
  requireIdentifier(event.eventId, 'TRUST_ROOT_EVENT_ID_INVALID');
  requireIdentifier(event.keyId, 'TRUST_ROOT_KEY_ID_INVALID');
  requireDigest(event.candidateDigest, 'TRUST_ROOT_CANDIDATE_DIGEST_INVALID');
  requireValue(ROLES.includes(event.role), 'TRUST_ROOT_ROLE_INVALID');
  requireValue(OPERATIONS.includes(event.operation), 'TRUST_ROOT_OPERATION_INVALID');
  requireValue(Number.isSafeInteger(event.revision) && event.revision >= 1,
    'TRUST_ROOT_REVISION_INVALID');
  requireValue(event.predecessorKeyId === null
    || Boolean(requireIdentifier(event.predecessorKeyId, 'TRUST_ROOT_PREDECESSOR_INVALID')),
  'TRUST_ROOT_PREDECESSOR_INVALID');
  requireValue(['CANDIDATE_HOLD', 'ACTIVE_SYNTHETIC_ONLY'].includes(event.beforeState),
    'TRUST_ROOT_BEFORE_STATE_INVALID');
  requireValue(event.afterState === (event.operation === 'REVOKE'
    ? 'REVOKED' : 'ACTIVE_SYNTHETIC_ONLY'), 'TRUST_ROOT_AFTER_STATE_INVALID');
  requireInstant(event.observedAt, 'TRUST_ROOT_TIME_INVALID');
  protectedBoundary(event);
  requireValue(event.providerContactExecuted === false && event.spendAuthorized === false
    && event.externalEgress === false && event.credentialResolution === false,
  'TRUST_ROOT_PROTECTED_GATE_INVALID');
  requireDigest(event.eventDigest, 'TRUST_ROOT_EVENT_DIGEST_INVALID');
  verifySelfDigest(event, 'eventDigest', 'TRUST_ROOT_EVENT_INTEGRITY_INVALID');
  const unsigned = Object.fromEntries(Object.entries(event)
    .filter(([key]) => key !== 'eventId' && key !== 'eventDigest'));
  requireValue(event.eventId === `trust-root-event:${digestObject(unsigned).slice(7)}`,
    'TRUST_ROOT_EVENT_ID_INVALID');
  return event;
}

function normalizedInputs(candidateInputs, eventInputs) {
  requireValue(Array.isArray(candidateInputs) && candidateInputs.length <= 64,
    'TRUST_ROOT_CANDIDATE_COUNT_INVALID');
  requireValue(Array.isArray(eventInputs) && eventInputs.length <= 512,
    'TRUST_ROOT_EVENT_COUNT_INVALID');
  const candidates = candidateInputs.map(verifyTrustRootCandidate);
  const events = eventInputs.map(verifyTrustRootLifecycleEvent);
  const ids = new Set(); const fingerprints = new Set(); const digests = new Set();
  for (const candidate of candidates) {
    requireValue(!ids.has(candidate.keyId) && !fingerprints.has(candidate.keyFingerprint)
      && !digests.has(candidate.candidateDigest), 'TRUST_ROOT_CANDIDATE_DUPLICATE');
    ids.add(candidate.keyId); fingerprints.add(candidate.keyFingerprint);
    digests.add(candidate.candidateDigest);
  }
  requireValue(events.length === new Set(events.map(event => event.eventId)).size,
    'TRUST_ROOT_EVENT_DUPLICATE');
  return { candidates, events };
}

export function deriveTrustRootLifecycle({ candidates: candidateInputs, events: eventInputs }) {
  const { candidates, events } = normalizedInputs(candidateInputs, eventInputs);
  const candidateById = new Map(candidates.map(candidate => [candidate.keyId, candidate]));
  const states = new Map(candidates.map(candidate => [candidate.keyId, 'CANDIDATE_HOLD']));
  const revisions = new Map(candidates.map(candidate => [candidate.keyId, 0]));
  const activeByRole = new Map();
  const ordered = [...events].sort((left, right) => left.observedAt.localeCompare(right.observedAt)
    || left.eventId.localeCompare(right.eventId));
  for (const event of ordered) {
    const candidate = candidateById.get(event.keyId);
    requireValue(candidate && candidate.candidateDigest === event.candidateDigest
      && candidate.role === event.role && candidate.predecessorKeyId === event.predecessorKeyId,
    'TRUST_ROOT_EVENT_CANDIDATE_BINDING_INVALID');
    requireValue(event.revision === revisions.get(event.keyId) + 1,
      'TRUST_ROOT_EVENT_REVISION_INVALID');
    const beforeState = states.get(event.keyId);
    requireValue(beforeState === event.beforeState, 'TRUST_ROOT_EVENT_BEFORE_STATE_MISMATCH');
    requireValue(beforeState !== 'REVOKED' && beforeState !== 'SUPERSEDED',
      'TRUST_ROOT_TERMINAL_STATE');
    if (event.operation === 'ACTIVATE_SYNTHETIC_ONLY') {
      requireValue(beforeState === 'CANDIDATE_HOLD', 'TRUST_ROOT_ACTIVATION_STATE_INVALID');
      const current = activeByRole.get(candidate.role) ?? null;
      requireValue(candidate.predecessorKeyId === current,
        'TRUST_ROOT_ROTATION_PREDECESSOR_MISMATCH');
      if (current !== null) states.set(current, 'SUPERSEDED');
      states.set(candidate.keyId, 'ACTIVE_SYNTHETIC_ONLY');
      activeByRole.set(candidate.role, candidate.keyId);
    } else {
      states.set(candidate.keyId, 'REVOKED');
      if (activeByRole.get(candidate.role) === candidate.keyId) activeByRole.delete(candidate.role);
    }
    revisions.set(event.keyId, event.revision);
  }
  return {
    state: 'DERIVED_LOCAL_SYNTHETIC_TRUST_ROOTS_NOT_VERIFIER_WIRED_HOLD',
    keys: candidates.map(candidate => ({
      keyId: candidate.keyId, role: candidate.role, keyFingerprint: candidate.keyFingerprint,
      predecessorKeyId: candidate.predecessorKeyId, state: states.get(candidate.keyId),
      revision: revisions.get(candidate.keyId),
    })).sort((left, right) => left.role.localeCompare(right.role)
      || left.keyId.localeCompare(right.keyId)),
    activeSyntheticKeys: [...activeByRole].map(([role, keyId]) => ({ role, keyId }))
      .sort((left, right) => left.role.localeCompare(right.role)),
    verifierWired: false, activationAuthorized: false, production: 'HOLD',
    publicRelease: 'HOLD', g5: 'HOLD',
  };
}

export function createTrustRootLifecycleEvent({
  candidate: candidateInput, candidates, events, operation, observedAt,
}) {
  const candidate = verifyTrustRootCandidate(candidateInput);
  requireValue(OPERATIONS.includes(operation), 'TRUST_ROOT_OPERATION_INVALID');
  requireInstant(observedAt, 'TRUST_ROOT_TIME_INVALID');
  requireValue(new Date(observedAt) >= new Date(candidate.proposedAt), 'TRUST_ROOT_TIME_ORDER_INVALID');
  const allCandidates = [...candidates];
  const matching = allCandidates.find(item => item.keyId === candidate.keyId);
  requireValue(matching && canonicalJson(matching) === canonicalJson(candidate),
    'TRUST_ROOT_CANDIDATE_NOT_REGISTERED');
  const snapshot = deriveTrustRootLifecycle({ candidates: allCandidates, events });
  const current = snapshot.keys.find(key => key.keyId === candidate.keyId);
  requireValue(current && !['REVOKED', 'SUPERSEDED'].includes(current.state),
    'TRUST_ROOT_TERMINAL_STATE');
  if (operation === 'ACTIVATE_SYNTHETIC_ONLY') {
    requireValue(current.state === 'CANDIDATE_HOLD', 'TRUST_ROOT_ACTIVATION_STATE_INVALID');
    const active = snapshot.activeSyntheticKeys.find(key => key.role === candidate.role)?.keyId ?? null;
    requireValue(candidate.predecessorKeyId === active, 'TRUST_ROOT_ROTATION_PREDECESSOR_MISMATCH');
  }
  const unsigned = {
    contractId: 'kidults-approval-trust-root-lifecycle-event-v1', version: '1.0.0',
    state: 'LIFECYCLE_RECORDED_AUTHORITY_NOT_ACTIVATED', scope: 'LOCAL_SYNTHETIC_TEST_ONLY',
    keyId: candidate.keyId, candidateDigest: candidate.candidateDigest, role: candidate.role,
    operation, revision: current.revision + 1, predecessorKeyId: candidate.predecessorKeyId,
    beforeState: current.state,
    afterState: operation === 'REVOKE' ? 'REVOKED' : 'ACTIVE_SYNTHETIC_ONLY', observedAt,
    activationAuthorized: false, providerContactExecuted: false, spendAuthorized: false,
    externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const eventId = `trust-root-event:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, eventId };
  return verifyTrustRootLifecycleEvent({ ...identified, eventDigest: digestObject(identified) });
}
