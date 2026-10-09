import { CURRENT_BLOCKED_STATE, REPOSITORY, SHA40, req } from './constants-v1.mjs';
import {
  createModuleMap,
  validateExactDag,
  validateModuleReadinessBinding,
  validateReadinessStructure,
} from './graph-v1.mjs';
import { bindEvaluationSnapshot } from './snapshot-v1.mjs';
import { validateStateMachine } from './state-machine-v1.mjs';

function validateContract(contract, registry, readiness) {
  req(contract?.id === 'kidults-intelligence-runtime-contract-v1', 'KIR_CONTRACT_ID');
  req(contract?.version === '1.0.0', 'KIR_CONTRACT_VERSION');
  req(contract?.mode === 'CONTROL_ONLY_DRAFT_NOT_LANDED', 'KIR_MODE');
  req(contract?.runtime_activation_authorized === false, 'KIR_RUNTIME_AUTHORITY_FALSE');
  req(SHA40.test(contract?.protected_main_reference || ''), 'KIR_PROTECTED_MAIN_SHA');
  req(contract?.kernel?.fixture_or_replay_empirical_delta_allowed === false, 'KIR_FIXTURE_REPLAY_FALSE');
  req(contract?.kernel?.detached_receipt_authority_allowed === false, 'KIR_DETACHED_RECEIPT_FALSE');
  req(contract?.kernel?.self_issued_rights_authority_allowed === false, 'KIR_SELF_RIGHTS_FALSE');
  req(contract?.kernel?.self_approved_track_b_allowed === false, 'KIR_SELF_TRACK_B_FALSE');
  req(contract?.kernel?.implicit_database_write_authority_allowed === false, 'KIR_IMPLICIT_DB_FALSE');
  req(contract?.kernel?.implicit_publication_authority_allowed === false, 'KIR_IMPLICIT_RELEASE_FALSE');
  req(contract?.promotion_contract?.control_validation_is_empirical_proof === false, 'KIR_CONTROL_NOT_EMPIRICAL');
  req(contract?.promotion_contract?.branch_success_is_protected_main_natural_canary === false, 'KIR_BRANCH_NOT_MAIN_CANARY');
  req(contract?.promotion_contract?.fixture_state_machine_success_is_empirical_proof === false, 'KIR_FIXTURE_NOT_EMPIRICAL');
  req(contract?.promotion_contract?.lawful_empirical_current_sold_minimum_for_forward_chain === 1, 'KIR_MIN_EMPIRICAL_ONE');
  req(contract?.terminal_receipt?.promotion_eligible_under_this_control_contract === false, 'KIR_RECEIPT_NONPROMOTABLE');
  req(contract?.authority_boundary?.provider_call === false, 'KIR_PROVIDER_AUTHORITY_FALSE');
  req(contract?.authority_boundary?.postgresql_write === false, 'KIR_POSTGRES_AUTHORITY_FALSE');
  req(contract?.authority_boundary?.public_release === 'HOLD'
    && contract?.authority_boundary?.production === 'HOLD'
    && contract?.authority_boundary?.g5 === 'HOLD', 'KIR_RELEASE_HOLD');
  req(registry?.id === 'kidults-intelligence-runtime-module-registry-v1', 'KIR_REGISTRY_ID');
  req(registry?.contract_id === contract.id, 'KIR_REGISTRY_CONTRACT_BINDING');
  req(registry?.mode === contract.mode, 'KIR_REGISTRY_MODE');
  req(registry?.reviewed_protected_main_sha === readiness?.reviewed_protected_main_sha, 'KIR_REGISTRY_READINESS_MAIN_BINDING');
  req(contract.protected_main_reference === readiness.reviewed_protected_main_sha, 'KIR_CONTRACT_READINESS_MAIN_BINDING');
}

export function validateKirRuntime({ contract, registry, readiness }) {
  validateReadinessStructure(registry, readiness);
  validateContract(contract, registry, readiness);
  const modules = createModuleMap(registry);
  for (const [id, module] of modules) {
    req(contract.module_state_classes.includes(module.state), `KIR_MODULE_STATE_UNKNOWN:${id}`);
    req(Array.isArray(module.dependencies), `KIR_MODULE_DEPENDENCIES:${id}`);
    req(module.forward_authority === false, `KIR_MODULE_FORWARD_AUTHORITY_FALSE:${id}`);
  }
  validateExactDag(modules);
  validateModuleReadinessBinding(modules, registry, readiness);
  const state = validateStateMachine(contract, registry, readiness, modules);
  if (contract.mode === 'CONTROL_ONLY_DRAFT_NOT_LANDED') {
    for (const [id, module] of modules) {
      req(module.state === CURRENT_BLOCKED_STATE[id], `KIR_CONTROL_ONLY_FORWARD_STATE:${id}`);
    }
    req(state.empirical === 0, 'KIR_CONTROL_ONLY_EMPIRICAL_NONZERO');
    req(state.postgresRows === 0, 'KIR_CONTROL_ONLY_POSTGRES_ROWS_NONZERO');
    req(state.pairReady === false, 'KIR_CONTROL_ONLY_PAIR_READY');
    req(state.trackBComplete === false, 'KIR_CONTROL_ONLY_TRACK_B_COMPLETE');
    req(state.projectionReady === false, 'KIR_CONTROL_ONLY_PROJECTION_READY');
  }
  return {
    state: 'VERIFIED_PASS',
    module_count: modules.size,
    empirical_current_sold: state.empirical,
    postgres_rows: state.postgresRows,
    pair_ready: state.pairReady,
    track_b_complete: state.trackBComplete,
    projection_ready: state.projectionReady,
    production: 'HOLD',
  };
}

function validateIdentityShape(identity) {
  const fields = ['repository', 'source_sha', 'run_id', 'run_attempt', 'trigger_event'];
  req(identity && typeof identity === 'object' && !Array.isArray(identity), 'KIR_IDENTITY_OBJECT');
  const proto = Object.getPrototypeOf(identity);
  req(proto === Object.prototype || proto === null, 'KIR_IDENTITY_PLAIN_RECORD');
  const keys = Reflect.ownKeys(identity);
  req(keys.length === fields.length && keys.every(key => fields.includes(key)), 'KIR_IDENTITY_FIELDS');
  for (const field of fields) {
    req(Object.hasOwn(Object.getOwnPropertyDescriptor(identity, field) || {}, 'value'), 'KIR_IDENTITY_DATA_FIELDS');
  }
}

function validateIdentityValues(identity) {
  req(identity.repository === REPOSITORY, 'KIR_IDENTITY_REPOSITORY');
  req(typeof identity.source_sha === 'string' && SHA40.test(identity.source_sha), 'KIR_IDENTITY_SOURCE_SHA');
  req(Number.isSafeInteger(identity.run_id) && identity.run_id > 0, 'KIR_IDENTITY_RUN_ID');
  req(Number.isSafeInteger(identity.run_attempt) && identity.run_attempt > 0, 'KIR_IDENTITY_RUN_ATTEMPT');
  req(typeof identity.trigger_event === 'string' && identity.trigger_event.length > 0, 'KIR_IDENTITY_TRIGGER');
}

export function evaluateKirRuntime({ contract, registry, readiness, identity }) {
  validateIdentityShape(identity);
  const snapshot = bindEvaluationSnapshot({ contract, registry, readiness });
  ({ contract, registry, readiness } = snapshot.values);
  const validated = validateKirRuntime(snapshot.values);
  validateIdentityValues(identity);
  const modules = new Map(registry.modules.map(module => [module.id, module]));
  const blockers = [];
  if (modules.get('SOURCE_RIGHTS').state !== 'READY') blockers.push('LAWFUL_SOURCE_RIGHTS_NOT_READY');
  if (modules.get('RECEIPT_AUTHORITY').state !== 'READY') blockers.push('INDEPENDENT_TRUST_ROOT_NOT_READY');
  if (validated.empirical_current_sold < 1) blockers.push('LAWFUL_EMPIRICAL_CURRENT_SOLD_ZERO');
  if (modules.get('APPEND_ONLY_LEDGER').state !== 'EMPIRICAL_VALIDATED' || validated.postgres_rows < 1) blockers.push('POSTGRES_FIRST_WRITE_NOT_PROVEN');
  if (modules.get('CANDIDATE_EVIDENCE_PAIR').state !== 'PAIR_READY') blockers.push('CANDIDATE_EVIDENCE_PAIR_ABSENT');
  if (modules.get('TRACK_B_ASSESSMENT').state !== 'COMPLETE_INDEPENDENT_ASSESSMENT') blockers.push('TRACK_B_NOT_COMPLETE');
  if (modules.get('PROJECTION_RELEASE').state !== 'APPROVED_PROJECTION_READY') blockers.push('APPROVED_PROJECTION_ABSENT');
  return {
    id: 'kidults-intelligence-runtime-terminal-receipt-v1',
    version: '1.0.0',
    state: blockers.length ? 'CONTROL_VALIDATED_EMPIRICAL_BLOCKED' : 'READY_FOR_SEPARATELY_GATED_ACTIVATION_REVIEW',
    repository: identity.repository,
    source_sha: identity.source_sha,
    run_id: identity.run_id,
    run_attempt: identity.run_attempt,
    trigger_event: identity.trigger_event,
    ...snapshot.digests,
    receipt_scope: 'KIR_CONTROL_CONTRACT_ONLY_NOT_PLATFORM_HEALTH',
    readiness_reference_sha: readiness.reviewed_protected_main_sha,
    readiness_is_live_empirical_proof: false,
    module_states: Object.fromEntries(registry.modules.map(module => [module.id, module.state])),
    empirical_current_sold: validated.empirical_current_sold,
    postgres_rows: validated.postgres_rows,
    blockers,
    runtime_activation_authorized: false,
    empirical_authority: false,
    database_authority: false,
    provider_authority: false,
    promotion_eligible: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}
