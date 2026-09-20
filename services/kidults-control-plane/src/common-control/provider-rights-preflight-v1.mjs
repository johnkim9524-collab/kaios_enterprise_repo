import {
  digestObject, requireDigest, requireExactRecord, requireInstant, requireValue,
  snapshotJson, verifySelfDigest,
} from './canonical-v1.mjs';

const GATE_ID = 'kidults-provider-rights-decision-gate-v1';
const GATE_VERSION = '1.3.0';
const CLAIM_CEILING = 'DATED_OBSERVED_SOLD_PRIVATE_EVALUATION_ONLY';
const PROVIDER_ID = /^[A-Z0-9][A-Z0-9./_-]{1,63}$/;
const PURPOSE = 'CURRENT_SOLD_PRIVATE_EVALUATION';
const DECISIONS = new Set(['PASS', 'NO_GO', 'NEEDS_CLARIFICATION']);
const RESULT_KEYS = Object.freeze([
  'contractId', 'version', 'providerId', 'purpose', 'rightsGateId',
  'rightsGateVersion', 'rightsGateDigest', 'sourceDecision', 'verdict',
  'reason', 'claimCeiling', 'activation', 'observedAt', 'providerContact',
  'externalEgress', 'credentialResolution', 'production', 'publicRelease', 'g5',
  'preflightId', 'preflightDigest',
]);

function providerState(gate, providerId) {
  requireValue(gate.id === GATE_ID && gate.version === GATE_VERSION,
    'PROVIDER_RIGHTS_GATE_CONTRACT_INVALID');
  requireValue(gate.claim_ceiling === CLAIM_CEILING,
    'PROVIDER_RIGHTS_GATE_CLAIM_CEILING_INVALID');
  requireValue(Array.isArray(gate.providers) && gate.providers.includes(providerId),
    'PROVIDER_RIGHTS_PROVIDER_NOT_REGISTERED');
  const state = gate.current_provider_state?.[providerId];
  requireValue(state && typeof state === 'object' && !Array.isArray(state),
    'PROVIDER_RIGHTS_STATE_MISSING');
  requireValue(DECISIONS.has(state.decision), 'PROVIDER_RIGHTS_DECISION_INVALID');
  requireValue(state.activation === 'DISABLED', 'PROVIDER_RIGHTS_ACTIVATION_NOT_DISABLED');
  return state;
}

function projection(decision) {
  if (decision === 'PASS') return ['PREFLIGHT_ELIGIBLE_NO_FETCH', 'RIGHTS_PASS_EXECUTION_NOT_AUTHORIZED'];
  if (decision === 'NO_GO') return ['DENY', 'RIGHTS_NO_GO'];
  return ['HOLD', 'RIGHTS_CLARIFICATION_REQUIRED'];
}

export function projectProviderRightsPreflight({
  rightsGate: input, providerId, purpose = PURPOSE, observedAt,
}) {
  const gate = snapshotJson(input);
  requireValue(typeof providerId === 'string' && PROVIDER_ID.test(providerId),
    'PROVIDER_RIGHTS_PROVIDER_ID_INVALID');
  requireValue(purpose === PURPOSE, 'PROVIDER_RIGHTS_PURPOSE_INVALID');
  const state = providerState(gate, providerId);
  requireInstant(observedAt, 'PROVIDER_RIGHTS_OBSERVED_AT_INVALID');
  const [verdict, reason] = projection(state.decision);
  const unsigned = {
    contractId: 'kidults-provider-rights-preflight-v1', version: '1.0.0',
    providerId, purpose, rightsGateId: gate.id, rightsGateVersion: gate.version,
    rightsGateDigest: digestObject(gate), sourceDecision: state.decision,
    verdict, reason, claimCeiling: CLAIM_CEILING, activation: 'DISABLED', observedAt,
    providerContact: false, externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const preflightId = `provider-rights-preflight:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, preflightId };
  return { ...identified, preflightDigest: digestObject(identified) };
}

export function verifyProviderRightsPreflight(input) {
  const result = snapshotJson(input);
  requireExactRecord(result, RESULT_KEYS, 'PROVIDER_RIGHTS_PREFLIGHT_SHAPE_INVALID');
  requireValue(result.contractId === 'kidults-provider-rights-preflight-v1'
    && result.version === '1.0.0', 'PROVIDER_RIGHTS_PREFLIGHT_CONTRACT_INVALID');
  requireValue(typeof result.providerId === 'string' && PROVIDER_ID.test(result.providerId),
    'PROVIDER_RIGHTS_PROVIDER_ID_INVALID');
  requireValue(result.purpose === PURPOSE && result.rightsGateId === GATE_ID
    && result.rightsGateVersion === GATE_VERSION,
    'PROVIDER_RIGHTS_PREFLIGHT_SCOPE_INVALID');
  requireDigest(result.rightsGateDigest, 'PROVIDER_RIGHTS_GATE_DIGEST_INVALID');
  requireValue(DECISIONS.has(result.sourceDecision), 'PROVIDER_RIGHTS_DECISION_INVALID');
  const [verdict, reason] = projection(result.sourceDecision);
  requireValue(result.verdict === verdict && result.reason === reason,
    'PROVIDER_RIGHTS_PREFLIGHT_PROJECTION_INVALID');
  requireValue(result.claimCeiling === CLAIM_CEILING && result.activation === 'DISABLED'
    && result.providerContact === false && result.externalEgress === false
    && result.credentialResolution === false && result.production === 'HOLD'
    && result.publicRelease === 'HOLD' && result.g5 === 'HOLD',
  'PROVIDER_RIGHTS_PREFLIGHT_BOUNDARY_INVALID');
  requireInstant(result.observedAt, 'PROVIDER_RIGHTS_OBSERVED_AT_INVALID');
  const unsigned = Object.fromEntries(Object.entries(result)
    .filter(([key]) => !['preflightId', 'preflightDigest'].includes(key)));
  requireValue(result.preflightId === `provider-rights-preflight:${digestObject(unsigned).slice(7)}`,
    'PROVIDER_RIGHTS_PREFLIGHT_ID_INVALID');
  verifySelfDigest(result, 'preflightDigest', 'PROVIDER_RIGHTS_PREFLIGHT_DIGEST_INVALID');
  return result;
}
