import {
  canonicalJson, digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireValue, snapshotJson, verifySelfDigest,
} from './canonical-v1.mjs';
import {
  deriveTrustRootLifecycle, verifyTrustRootCandidate, verifyTrustRootLifecycleEvent,
} from './approval-trust-root-lifecycle-v1.mjs';

const REGISTRY_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'registryId', 'keys', 'registryDigest',
]);
const REGISTRY_KEY_KEYS = Object.freeze([
  'keyId', 'role', 'algorithm', 'publicKeyPem', 'keyFingerprint', 'state',
]);
const HANDOFF_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'scope', 'registryId', 'registryDigest',
  'candidateSetDigest', 'eventSetDigest', 'lifecycleStateDigest', 'activeKeyBindings',
  'verifierWired', 'activationAuthorized', 'providerContactExecuted', 'spendAuthorized',
  'externalEgress', 'credentialResolution', 'production', 'publicRelease', 'g5',
  'handoffId', 'handoffDigest',
]);
const ROLES = Object.freeze(['KPMO', 'PROGRAM_OWNER', 'TRACK_A', 'TRACK_Z']);

function sortedCandidates(inputs) {
  requireValue(Array.isArray(inputs) && inputs.length <= 64,
    'TRUST_REGISTRY_CANDIDATE_COUNT_INVALID');
  return inputs.map(verifyTrustRootCandidate).sort((left, right) =>
    left.role.localeCompare(right.role) || left.keyId.localeCompare(right.keyId));
}

function sortedEvents(inputs) {
  requireValue(Array.isArray(inputs) && inputs.length <= 512,
    'TRUST_REGISTRY_EVENT_COUNT_INVALID');
  return inputs.map(verifyTrustRootLifecycleEvent).sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt) || left.eventId.localeCompare(right.eventId));
}

function verifyRegistry(input) {
  const registry = snapshotJson(input, { maxBytes: 262144 });
  requireExactRecord(registry, REGISTRY_KEYS, 'TRUST_REGISTRY_SHAPE_INVALID');
  requireValue(registry.contractId === 'kidults-approval-trust-registry-v1'
    && registry.version === '1.0.0'
    && registry.state === 'CALLER_PINNED_PUBLIC_KEYS_ONLY_HOLD',
  'TRUST_REGISTRY_CONTRACT_INVALID');
  requireIdentifier(registry.registryId, 'TRUST_REGISTRY_ID_INVALID');
  requireValue(Array.isArray(registry.keys) && registry.keys.length >= 1
    && registry.keys.length <= 4, 'TRUST_REGISTRY_KEY_COUNT_INVALID');
  const keyIds = new Set(); const fingerprints = new Set(); const roles = new Set();
  for (const key of registry.keys) {
    requireExactRecord(key, REGISTRY_KEY_KEYS, 'TRUST_REGISTRY_KEY_SHAPE_INVALID');
    requireIdentifier(key.keyId, 'TRUST_REGISTRY_KEY_ID_INVALID');
    requireValue(ROLES.includes(key.role) && !roles.has(key.role),
      'TRUST_REGISTRY_KEY_ROLE_INVALID');
    requireValue(key.algorithm === 'Ed25519' && key.state === 'ACTIVE',
      'TRUST_REGISTRY_KEY_STATE_INVALID');
    requireValue(typeof key.publicKeyPem === 'string' && key.publicKeyPem.includes('PUBLIC KEY')
      && !key.publicKeyPem.includes('PRIVATE KEY'), 'TRUST_REGISTRY_PUBLIC_KEY_INVALID');
    requireDigest(key.keyFingerprint, 'TRUST_REGISTRY_FINGERPRINT_INVALID');
    requireValue(!keyIds.has(key.keyId) && !fingerprints.has(key.keyFingerprint),
      'TRUST_REGISTRY_KEY_DUPLICATE');
    keyIds.add(key.keyId); fingerprints.add(key.keyFingerprint); roles.add(key.role);
  }
  const ordered = [...registry.keys].sort((left, right) => left.role.localeCompare(right.role)
    || left.keyId.localeCompare(right.keyId));
  requireValue(canonicalJson(ordered) === canonicalJson(registry.keys),
    'TRUST_REGISTRY_KEY_ORDER_INVALID');
  verifySelfDigest(registry, 'registryDigest', 'TRUST_REGISTRY_INTEGRITY_INVALID');
  return registry;
}

export function verifyTrustRegistryHandoffReceipt(input) {
  const receipt = snapshotJson(input, { maxBytes: 65536 });
  requireExactRecord(receipt, HANDOFF_KEYS, 'TRUST_REGISTRY_HANDOFF_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-approval-trust-registry-handoff-v1'
    && receipt.version === '1.0.0'
    && receipt.state === 'SYNTHETIC_REGISTRY_COMPILED_CALLER_PIN_REQUIRED'
    && receipt.scope === 'LOCAL_SYNTHETIC_TEST_ONLY',
  'TRUST_REGISTRY_HANDOFF_CONTRACT_INVALID');
  requireIdentifier(receipt.registryId, 'TRUST_REGISTRY_ID_INVALID');
  for (const digest of [receipt.registryDigest, receipt.candidateSetDigest,
    receipt.eventSetDigest, receipt.lifecycleStateDigest]) {
    requireDigest(digest, 'TRUST_REGISTRY_HANDOFF_DIGEST_INVALID');
  }
  requireValue(Array.isArray(receipt.activeKeyBindings)
    && receipt.activeKeyBindings.length >= 1 && receipt.activeKeyBindings.length <= 4,
  'TRUST_REGISTRY_HANDOFF_BINDINGS_INVALID');
  const roles = new Set(); const ids = new Set();
  for (const binding of receipt.activeKeyBindings) {
    requireExactRecord(binding, ['role', 'keyId', 'keyFingerprint'],
      'TRUST_REGISTRY_HANDOFF_BINDING_SHAPE_INVALID');
    requireValue(ROLES.includes(binding.role) && !roles.has(binding.role),
      'TRUST_REGISTRY_HANDOFF_BINDING_ROLE_INVALID');
    requireIdentifier(binding.keyId, 'TRUST_REGISTRY_HANDOFF_BINDING_KEY_INVALID');
    requireDigest(binding.keyFingerprint, 'TRUST_REGISTRY_HANDOFF_BINDING_DIGEST_INVALID');
    requireValue(!ids.has(binding.keyId), 'TRUST_REGISTRY_HANDOFF_BINDING_KEY_INVALID');
    roles.add(binding.role); ids.add(binding.keyId);
  }
  const ordered = [...receipt.activeKeyBindings].sort((left, right) =>
    left.role.localeCompare(right.role) || left.keyId.localeCompare(right.keyId));
  requireValue(canonicalJson(ordered) === canonicalJson(receipt.activeKeyBindings),
    'TRUST_REGISTRY_HANDOFF_BINDING_ORDER_INVALID');
  requireValue(receipt.verifierWired === false && receipt.activationAuthorized === false
    && receipt.providerContactExecuted === false && receipt.spendAuthorized === false
    && receipt.externalEgress === false && receipt.credentialResolution === false
    && receipt.production === 'HOLD' && receipt.publicRelease === 'HOLD'
    && receipt.g5 === 'HOLD', 'TRUST_REGISTRY_HANDOFF_PROTECTED_GATE_INVALID');
  requireIdentifier(receipt.handoffId, 'TRUST_REGISTRY_HANDOFF_ID_INVALID');
  requireDigest(receipt.handoffDigest, 'TRUST_REGISTRY_HANDOFF_DIGEST_INVALID');
  verifySelfDigest(receipt, 'handoffDigest', 'TRUST_REGISTRY_HANDOFF_INTEGRITY_INVALID');
  const unsigned = Object.fromEntries(Object.entries(receipt)
    .filter(([key]) => key !== 'handoffId' && key !== 'handoffDigest'));
  requireValue(receipt.handoffId === `trust-registry-handoff:${digestObject(unsigned).slice(7)}`,
    'TRUST_REGISTRY_HANDOFF_ID_INVALID');
  return receipt;
}

export function compileSyntheticApprovalTrustRegistry({ candidates, events }) {
  const orderedCandidates = sortedCandidates(candidates);
  const orderedEvents = sortedEvents(events);
  const lifecycle = deriveTrustRootLifecycle({
    candidates: orderedCandidates, events: orderedEvents,
  });
  const candidateById = new Map(orderedCandidates.map(candidate => [candidate.keyId, candidate]));
  const active = lifecycle.activeSyntheticKeys.map(({ role, keyId }) => {
    const candidate = candidateById.get(keyId);
    requireValue(candidate && candidate.role === role, 'TRUST_REGISTRY_ACTIVE_KEY_BINDING_INVALID');
    return candidate;
  }).sort((left, right) => left.role.localeCompare(right.role)
    || left.keyId.localeCompare(right.keyId));
  requireValue(active.length >= 1 && active.length <= 4,
    'TRUST_REGISTRY_NO_ACTIVE_SYNTHETIC_KEYS');
  const candidateSetDigest = digestObject(orderedCandidates);
  const eventSetDigest = digestObject(orderedEvents);
  const lifecycleStateDigest = digestObject(lifecycle);
  const lineageDigest = digestObject({ candidateSetDigest, eventSetDigest, lifecycleStateDigest });
  const registryUnsigned = {
    contractId: 'kidults-approval-trust-registry-v1', version: '1.0.0',
    state: 'CALLER_PINNED_PUBLIC_KEYS_ONLY_HOLD',
    registryId: `synthetic-lifecycle:${lineageDigest.slice(7)}`,
    keys: active.map(candidate => ({
      keyId: candidate.keyId, role: candidate.role, algorithm: 'Ed25519',
      publicKeyPem: candidate.publicKeyPem, keyFingerprint: candidate.keyFingerprint,
      state: 'ACTIVE',
    })),
  };
  const registry = verifyRegistry({ ...registryUnsigned,
    registryDigest: digestObject(registryUnsigned) });
  const handoffUnsigned = {
    contractId: 'kidults-approval-trust-registry-handoff-v1', version: '1.0.0',
    state: 'SYNTHETIC_REGISTRY_COMPILED_CALLER_PIN_REQUIRED',
    scope: 'LOCAL_SYNTHETIC_TEST_ONLY', registryId: registry.registryId,
    registryDigest: registry.registryDigest, candidateSetDigest, eventSetDigest,
    lifecycleStateDigest,
    activeKeyBindings: active.map(candidate => ({ role: candidate.role,
      keyId: candidate.keyId, keyFingerprint: candidate.keyFingerprint })),
    verifierWired: false, activationAuthorized: false, providerContactExecuted: false,
    spendAuthorized: false, externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const handoffId = `trust-registry-handoff:${digestObject(handoffUnsigned).slice(7)}`;
  const identified = { ...handoffUnsigned, handoffId };
  const handoffReceipt = verifyTrustRegistryHandoffReceipt({ ...identified,
    handoffDigest: digestObject(identified) });
  return { registry, handoffReceipt };
}

export function verifyCompiledTrustRegistryHandoff({ registry: registryInput,
  handoffReceipt: receiptInput, candidates, events }) {
  const registry = verifyRegistry(registryInput);
  const receipt = verifyTrustRegistryHandoffReceipt(receiptInput);
  const expected = compileSyntheticApprovalTrustRegistry({ candidates, events });
  requireValue(canonicalJson(registry) === canonicalJson(expected.registry)
    && canonicalJson(receipt) === canonicalJson(expected.handoffReceipt)
    && receipt.registryId === registry.registryId
    && receipt.registryDigest === registry.registryDigest,
  'TRUST_REGISTRY_HANDOFF_REPRODUCTION_MISMATCH');
  return { registry, handoffReceipt: receipt, verifierWired: false,
    activationAuthorized: false };
}
