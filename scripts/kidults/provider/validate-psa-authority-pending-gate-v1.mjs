#!/usr/bin/env node
import fs from 'node:fs';

export const CONTRACT_PATH = 'coordination/kidults/provider/psa-authority-pending-gate-v1.json';

export function evaluatePsaAuthorityGate(contract) {
  const required = contract?.execution_gate?.required_states ?? {};
  const current = contract?.execution_gate?.current_states ?? {};
  const requiredKeys = [
    'authorized_fixture_state',
    'runtime_token_binding_state',
    'retention_policy_state',
    'rate_budget_state',
    'owner_scope_state'
  ];
  const missing = requiredKeys.filter(key => required[key] !== 'PASS' || typeof current[key] !== 'string');
  const unsatisfied = requiredKeys.filter(key => current[key] !== required[key]);
  return {
    decision: missing.length === 0 && unsatisfied.length === 0 ? 'ALLOW' : 'DENY',
    missing,
    unsatisfied
  };
}

export function validatePsaAuthorityPendingGate(contract) {
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  const serialized = JSON.stringify(contract);
  const gate = evaluatePsaAuthorityGate(contract);

  check(contract?.id === 'KIDULTS_PSA_AUTHORITY_PENDING_GATE_V1', 'CONTRACT_ID');
  check(contract?.version === '1.0.0', 'CONTRACT_VERSION');
  check(contract?.state === 'AUTHORITY_PENDING_NO_EXECUTION', 'PENDING_STATE');
  check(contract?.historical_truth?.schema_connection_evidence_exists === true, 'HISTORICAL_CONNECTION_PRESERVED');
  check(contract?.historical_truth?.historical_provider_calls === 1, 'HISTORICAL_PROVIDER_CALL_COUNT');
  check(contract?.historical_truth?.current_runtime_path === 'REMOVED', 'CURRENT_RUNTIME_MUST_REMAIN_REMOVED');
  check(contract?.historical_truth?.historical_evidence_does_not_authorize_new_execution === true,
    'HISTORICAL_EVIDENCE_AUTHORITY_CEILING');

  check(contract?.current_decision?.provider_reply_state === 'AWAITING_SUBSTANTIVE_WRITTEN_RESPONSE',
    'PROVIDER_REPLY_STATE');
  check(contract?.current_decision?.positive_canary === 'HOLD', 'POSITIVE_CANARY_HOLD');
  check(contract?.current_decision?.negative_canary === 'HOLD', 'NEGATIVE_CANARY_HOLD');
  check(contract?.current_decision?.terminal_receipt === 'NOT_ELIGIBLE', 'TERMINAL_RECEIPT_INELIGIBLE');
  check(contract?.current_decision?.provider_network_calls_authorized === false, 'PROVIDER_NETWORK_CALL_DENY');

  const candidate = contract?.reserved_candidate ?? {};
  check(/^sha256:[0-9a-f]{64}$/.test(candidate.cert_reference_digest ?? ''), 'CANDIDATE_DIGEST');
  check(candidate.raw_cert_value_in_repository === false, 'RAW_CERT_REPOSITORY_BOUNDARY');
  check(candidate.api_execution_authority === 'PENDING_PROVIDER_RESPONSE', 'CANDIDATE_AUTHORITY_PENDING');
  check(candidate.api_executed_under_this_decision === false, 'CANDIDATE_EXECUTION_FALSE');
  check(candidate.empirical_admissible === false && candidate.promotion_eligible === false,
    'CANDIDATE_NON_EMPIRICAL_NON_PROMOTABLE');
  check(!/\b[0-9]{8}\b/.test(serialized), 'RAW_RESERVED_CERT_VALUE_LEAK');

  check(gate.decision === 'DENY', 'CURRENT_GATE_MUST_DENY');
  check(contract?.execution_gate?.decision === 'DENY' && contract?.execution_gate?.default === 'DENY',
    'DECLARED_GATE_DENY');
  check(contract?.execution_gate?.unknown_or_missing === 'DENY', 'UNKNOWN_MUST_DENY');
  check(contract?.execution_gate?.self_asserted_or_chat_only_authority === 'DENY', 'CHAT_AUTHORITY_MUST_DENY');
  check(contract?.execution_gate?.outbound_request_alone_grants_execution_authority === false,
    'OUTBOUND_REQUEST_NOT_AUTHORITY');

  const routes = new Map((contract?.provider_response_routes ?? []).map(route => [route.response_class, route.action]));
  for (const responseClass of [
    'OFFICIAL_TEST_CERT_NUMBER',
    'SANDBOX_OR_FIXTURE',
    'PUBLIC_CERT_USE_EXPLICITLY_ALLOWED',
    'OWNER_HELD_CERT_ONLY',
    'AMBIGUOUS_OR_PARTIAL',
    'NO_RESPONSE'
  ]) check(routes.has(responseClass), `RESPONSE_ROUTE_MISSING:${responseClass}`);
  check(routes.get('NO_RESPONSE') === 'KEEP_EXECUTION_HOLD_NO_UNAUTHORIZED_BYPASS', 'NO_RESPONSE_BYPASS_FORBIDDEN');

  const dormant = contract?.dormant_canary_contract ?? {};
  check(dormant.implementation_state === 'STATIC_CONTRACT_ONLY', 'DORMANT_STATIC_ONLY');
  check(dormant.network_capable_runtime_present === false, 'NETWORK_RUNTIME_MUST_BE_ABSENT');
  check(dormant.activation_requires_separate_exact_authority === true, 'SEPARATE_AUTHORITY_REQUIRED');
  check(dormant.secret_value_may_be_logged === false, 'SECRET_LOGGING_FORBIDDEN');
  check(dormant.raw_response_retention_days_max === 30, 'RETENTION_LIMIT');
  check(dormant.daily_provider_limit === 100 && dormant.internal_daily_ceiling === 90, 'RATE_BUDGET');
  for (const requiredSemantic of ['HTTP_200', 'IS_VALID_REQUEST_TRUE', 'SERVER_MESSAGE_REQUEST_SUCCESSFUL', 'EXPECTED_CORE_FIELDS_MATCH']) {
    check(dormant.positive_semantics?.includes(requiredSemantic), `POSITIVE_SEMANTIC_MISSING:${requiredSemantic}`);
  }
  for (const negativeSemantic of ['VALID_FORMAT_NO_DATA_FOUND', 'INVALID_FORMAT_REJECTED', 'RATE_LIMIT_429_FAILS_CLOSED', 'TIMEOUT_FAILS_CLOSED', 'PROVIDER_5XX_FAILS_CLOSED']) {
    check(dormant.negative_semantics?.includes(negativeSemantic), `NEGATIVE_SEMANTIC_MISSING:${negativeSemantic}`);
  }

  const boundary = contract?.authority_boundary ?? {};
  check(boundary.provider_call_this_change === 0, 'PROVIDER_CALL_BOUNDARY');
  check(boundary.external_message_this_change === 0, 'EXTERNAL_MESSAGE_BOUNDARY');
  check(boundary.credential_read_this_change === false, 'CREDENTIAL_READ_BOUNDARY');
  check(boundary.new_spend === 'NONE', 'SPEND_BOUNDARY');
  check(boundary.production === 'HOLD' && boundary.public === 'HOLD' && boundary.g5 === 'HOLD', 'HOLD_BOUNDARY');

  return errors;
}

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const errors = validatePsaAuthorityPendingGate(contract);
if (errors.length) throw new Error(errors.join(';'));

const negativeMutations = [
  value => { value.current_decision.provider_network_calls_authorized = true; },
  value => { value.current_decision.positive_canary = 'PASS'; },
  value => { value.reserved_candidate.raw_cert_value_in_repository = true; },
  value => { value.reserved_candidate.api_executed_under_this_decision = true; },
  value => { value.execution_gate.current_states.authorized_fixture_state = 'PASS'; value.execution_gate.decision = 'ALLOW'; },
  value => { value.dormant_canary_contract.network_capable_runtime_present = true; },
  value => { value.authority_boundary.production = 'RELEASED'; }
];
for (const mutate of negativeMutations) {
  const changed = structuredClone(contract);
  mutate(changed);
  if (validatePsaAuthorityPendingGate(changed).length === 0) {
    throw new Error('PSA_AUTHORITY_GATE_NEGATIVE_MUTATION_FALSE_GREEN');
  }
}

const authorizedControl = structuredClone(contract);
for (const key of Object.keys(authorizedControl.execution_gate.required_states)) {
  authorizedControl.execution_gate.current_states[key] = 'PASS';
}
if (evaluatePsaAuthorityGate(authorizedControl).decision !== 'ALLOW') {
  throw new Error('PSA_AUTHORITY_GATE_POSITIVE_CONTROL_FAILED');
}

console.log(JSON.stringify({
  validator: 'KIDULTS_PSA_AUTHORITY_PENDING_GATE_V1',
  state: 'VERIFIED_PASS',
  current_decision: 'DENY',
  reserved_candidate: 'DIGEST_ONLY_NO_EXECUTION',
  provider_response: 'PENDING',
  dormant_canary: 'STATIC_CONTRACT_ONLY',
  provider_network_calls: 0,
  negative_mutations_rejected: negativeMutations.length,
  positive_control: 'ALLOW_ONLY_WHEN_ALL_REQUIRED_STATES_PASS',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
