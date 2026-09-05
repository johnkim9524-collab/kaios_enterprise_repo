#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { validateKirReadinessStructure } from './validate-kir-readiness-structure-v1.mjs';

export const PATHS = {
  contract: 'coordination/kidults/runtime/kir-runtime-contract-v1.json',
  registry: 'coordination/kidults/runtime/kir-module-registry-v1.json',
  readiness: 'coordination/kidults/market/current-sold-value-chain-readiness-v1.json',
};

const REPO = 'johnkim9524-collab/kaios_enterprise_repo';
const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

const EXPECTED_DAG = Object.freeze({
  SOURCE_RIGHTS: [],
  RECEIPT_AUTHORITY: [],
  CURRENT_SOLD_ADMISSION: ['SOURCE_RIGHTS', 'RECEIPT_AUTHORITY'],
  CURRENT_SOLD_EVIDENCE: ['CURRENT_SOLD_ADMISSION'],
  APPEND_ONLY_LEDGER: ['CURRENT_SOLD_ADMISSION'],
  CANDIDATE_EVIDENCE_PAIR: ['CURRENT_SOLD_EVIDENCE', 'APPEND_ONLY_LEDGER'],
  TRACK_B_ASSESSMENT: ['CANDIDATE_EVIDENCE_PAIR'],
  PROJECTION_RELEASE: ['TRACK_B_ASSESSMENT'],
});

const FORWARD_STATE = Object.freeze({
  SOURCE_RIGHTS: 'READY',
  RECEIPT_AUTHORITY: 'READY',
  CURRENT_SOLD_ADMISSION: 'EMPIRICAL_VALIDATED',
  CURRENT_SOLD_EVIDENCE: 'EMPIRICAL_VALIDATED',
  APPEND_ONLY_LEDGER: 'EMPIRICAL_VALIDATED',
  CANDIDATE_EVIDENCE_PAIR: 'PAIR_READY',
  TRACK_B_ASSESSMENT: 'COMPLETE_INDEPENDENT_ASSESSMENT',
  PROJECTION_RELEASE: 'APPROVED_PROJECTION_READY',
});

const EVIDENCE_KEY = Object.freeze({
  SOURCE_RIGHTS: 'SOURCE_RIGHTS_READY',
  RECEIPT_AUTHORITY: 'RECEIPT_AUTHORITY_READY',
  CURRENT_SOLD_ADMISSION: 'CURRENT_SOLD_ADMISSION_EMPIRICAL_VALIDATED',
  CURRENT_SOLD_EVIDENCE: 'CURRENT_SOLD_EVIDENCE_EMPIRICAL_VALIDATED',
  APPEND_ONLY_LEDGER: 'APPEND_ONLY_LEDGER_EMPIRICAL_VALIDATED',
  CANDIDATE_EVIDENCE_PAIR: 'CANDIDATE_EVIDENCE_PAIR_READY',
  TRACK_B_ASSESSMENT: 'TRACK_B_ASSESSMENT_COMPLETE',
  PROJECTION_RELEASE: 'PROJECTION_RELEASE_READY',
});

const CURRENT_BLOCKED_STATE = Object.freeze({
  SOURCE_RIGHTS: 'BLOCKED_EXTERNAL_AUTHORITY',
  RECEIPT_AUTHORITY: 'CONTROL_IMPLEMENTATION_ADDED_PENDING_PROTECTED_MAIN_AND_EXTERNAL_TRUST_ROOT',
  CURRENT_SOLD_ADMISSION: 'CORE_COMPLETE_CONTROL_VALIDATED',
  CURRENT_SOLD_EVIDENCE: 'CORE_COMPLETE_CONTROL_VALIDATED',
  APPEND_ONLY_LEDGER: 'CODE_COMPLETE_NOT_ACTIVATED',
  CANDIDATE_EVIDENCE_PAIR: 'BLOCKED_NO_LAWFUL_LEDGER_ROWS',
  TRACK_B_ASSESSMENT: 'NOT_STARTED_EXACT_PAIR_ABSENT',
  PROJECTION_RELEASE: 'HOLD_NO_APPROVED_PROJECTION',
});

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
// Hash the same immutable byte snapshot whose parsed objects are evaluated.
// Never attach a disk-file digest to an unrelated caller-supplied payload.
function bindEvaluationSnapshot(provided) {
  const values = {};
  const digests = {};
  for (const [name, file] of Object.entries(PATHS)) {
    const bytes = fs.readFileSync(file);
    const parsed = JSON.parse(bytes.toString('utf8'));
    req(isDeepStrictEqual(provided[name], parsed), `KIR_EVALUATED_INPUT_FILE_MISMATCH:${name}`);
    values[name] = parsed;
    digests[`${name}_sha256`] = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }
  return {values, digests};
}
const req = (value, code) => { if (!value) throw new Error(code); };
const nonNegativeInt = value => Number.isInteger(value) && value >= 0;
const sameStringSet = (a, b) => Array.isArray(a) && a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

function requireTransitionEvidence(contract, module) {
  const expectedForwardState = FORWARD_STATE[module.id];
  if (module.state !== expectedForwardState) return;
  const key = EVIDENCE_KEY[module.id];
  const required = contract?.transition_evidence_requirements?.[key];
  req(Array.isArray(required) && required.length > 0, `KIR_TRANSITION_EVIDENCE_CONTRACT_MISSING:${module.id}`);
  req(module.transition_evidence && typeof module.transition_evidence === 'object' && !Array.isArray(module.transition_evidence), `KIR_TRANSITION_EVIDENCE_MISSING:${module.id}`);
  for (const field of required) {
    req(DIGEST.test(module.transition_evidence[field] || ''), `KIR_TRANSITION_EVIDENCE_INVALID:${module.id}:${field}`);
  }
  const extras = Object.keys(module.transition_evidence).filter(field => !required.includes(field));
  req(extras.length === 0, `KIR_TRANSITION_EVIDENCE_UNDECLARED:${module.id}:${extras.join(',')}`);
}

function moduleMap(registry) {
  req(Array.isArray(registry?.modules) && registry.modules.length === Object.keys(EXPECTED_DAG).length, 'KIR_MODULE_COUNT');
  const modules = new Map();
  for (const module of registry.modules) {
    req(typeof module?.id === 'string' && module.id.length > 0, 'KIR_MODULE_ID');
    req(Object.hasOwn(EXPECTED_DAG, module.id), `KIR_MODULE_UNKNOWN:${module.id}`);
    req(!modules.has(module.id), `KIR_MODULE_DUPLICATE:${module.id}`);
    modules.set(module.id, module);
  }
  for (const id of Object.keys(EXPECTED_DAG)) req(modules.has(id), `KIR_MODULE_MISSING:${id}`);
  return modules;
}

function validateExactDag(modules) {
  for (const [id, expected] of Object.entries(EXPECTED_DAG)) {
    const actual = modules.get(id).dependencies;
    req(sameStringSet(actual, expected), `KIR_MODULE_DEPENDENCY_DRIFT:${id}`);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visited.has(id)) return;
    req(!visiting.has(id), `KIR_MODULE_DEPENDENCY_CYCLE:${id}`);
    visiting.add(id);
    for (const dep of modules.get(id).dependencies) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of modules.keys()) visit(id);
}

function validateForwardDependencyClosure(modules) {
  for (const [id, module] of modules) {
    if (module.state !== FORWARD_STATE[id]) continue;
    for (const dependency of EXPECTED_DAG[id]) {
      req(modules.get(dependency).state === FORWARD_STATE[dependency], `KIR_FORWARD_DEPENDENCY_NOT_SATISFIED:${id}:${dependency}`);
    }
  }
}

function validateModuleReadinessBinding(modules, readiness) {
  const stages = new Map((readiness?.stages || []).map(stage => [stage.stage, stage]));
  req(stages.size >= Object.keys(EXPECTED_DAG).length, 'KIR_READINESS_STAGES');
  for (const [id, module] of modules) {
    const stage = stages.get(module.source_stage);
    req(stage, `KIR_SOURCE_STAGE_MISSING:${id}`);
    req(stage.state === module.state, `KIR_STAGE_STATE_DRIFT:${id}`);
    req(stage.owner === module.owner, `KIR_STAGE_OWNER_DRIFT:${id}`);
    if (module.runtime_owner && stage.runtime_owner) req(stage.runtime_owner === module.runtime_owner, `KIR_RUNTIME_OWNER_DRIFT:${id}`);
    if (Number.isInteger(module.empirical_count) && Number.isInteger(stage.empirical_increment)) {
      req(module.empirical_count === stage.empirical_increment, `KIR_STAGE_EMPIRICAL_COUNT_DRIFT:${id}`);
    }
    if (id === 'APPEND_ONLY_LEDGER') {
      req(stage.postgres_migration_applied === module.postgres_migration_applied, 'KIR_LEDGER_MIGRATION_DRIFT');
      req(stage.postgres_rows_written === module.postgres_rows_written, 'KIR_LEDGER_ROW_DRIFT');
    }
    if (id === 'CANDIDATE_EVIDENCE_PAIR') {
      req(stage.candidate === module.candidate, 'KIR_CANDIDATE_DRIFT');
      req(stage.evidence_package === module.evidence_package, 'KIR_EVIDENCE_PACKAGE_DRIFT');
    }
  }
  return stages;
}

function validateStateMachine(contract, registry, readiness, modules, stages) {
  const truth = readiness?.truth_boundary;
  const ceiling = registry?.truth_ceiling;
  req(truth && ceiling, 'KIR_TRUTH_BOUNDARY_MISSING');
  const empirical = truth.lawful_empirical_current_sold_admitted;
  req(nonNegativeInt(empirical), 'KIR_EMPIRICAL_TRUTH_INVALID');
  req(ceiling.lawful_empirical_current_sold_admitted === empirical, 'KIR_EMPIRICAL_CEILING_DRIFT');
  req(truth.public === 'HOLD' && truth.production === 'HOLD' && truth.g5 === 'HOLD', 'KIR_READINESS_RELEASE_HOLD');
  req(ceiling.public === 'HOLD' && ceiling.production === 'HOLD' && ceiling.g5 === 'HOLD', 'KIR_REGISTRY_RELEASE_HOLD');

  const source = modules.get('SOURCE_RIGHTS');
  const authority = modules.get('RECEIPT_AUTHORITY');
  const admission = modules.get('CURRENT_SOLD_ADMISSION');
  const evidence = modules.get('CURRENT_SOLD_EVIDENCE');
  const ledger = modules.get('APPEND_ONLY_LEDGER');
  const pair = modules.get('CANDIDATE_EVIDENCE_PAIR');
  const trackB = modules.get('TRACK_B_ASSESSMENT');
  const projection = modules.get('PROJECTION_RELEASE');

  req(nonNegativeInt(admission.empirical_count), 'KIR_ADMISSION_EMPIRICAL_INVALID');
  req(nonNegativeInt(evidence.empirical_count), 'KIR_EVIDENCE_EMPIRICAL_INVALID');
  req(admission.empirical_count === empirical, 'KIR_ADMISSION_EMPIRICAL_DRIFT');
  req(evidence.empirical_count === empirical, 'KIR_EVIDENCE_EMPIRICAL_DRIFT');

  if (empirical === 0) {
    req(source.state === CURRENT_BLOCKED_STATE.SOURCE_RIGHTS || source.state === 'READY', 'KIR_SOURCE_RIGHTS_ZERO_STATE');
    req(authority.state === CURRENT_BLOCKED_STATE.RECEIPT_AUTHORITY || authority.state === 'READY', 'KIR_RECEIPT_AUTHORITY_ZERO_STATE');
    req(admission.state === CURRENT_BLOCKED_STATE.CURRENT_SOLD_ADMISSION, 'KIR_ADMISSION_FALSE_GREEN');
    req(evidence.state === CURRENT_BLOCKED_STATE.CURRENT_SOLD_EVIDENCE, 'KIR_EVIDENCE_FALSE_GREEN');
  } else {
    req(source.state === 'READY', 'KIR_SOURCE_RIGHTS_NOT_READY_FOR_EMPIRICAL');
    req(authority.state === 'READY', 'KIR_RECEIPT_AUTHORITY_NOT_READY_FOR_EMPIRICAL');
    req(admission.state === 'EMPIRICAL_VALIDATED', 'KIR_ADMISSION_STATE_NOT_EMPIRICAL_VALIDATED');
    req(evidence.state === 'EMPIRICAL_VALIDATED', 'KIR_EVIDENCE_STATE_NOT_EMPIRICAL_VALIDATED');
  }

  req(typeof ledger.postgres_migration_applied === 'boolean', 'KIR_LEDGER_MIGRATION_TYPE');
  req(nonNegativeInt(ledger.postgres_rows_written), 'KIR_LEDGER_ROWS_INVALID');
  req(ceiling.postgres_rows_written === ledger.postgres_rows_written, 'KIR_LEDGER_CEILING_DRIFT');
  if (!ledger.postgres_migration_applied) {
    req(ledger.postgres_rows_written === 0, 'KIR_LEDGER_ROWS_WITHOUT_MIGRATION');
    req(ledger.state === CURRENT_BLOCKED_STATE.APPEND_ONLY_LEDGER, 'KIR_LEDGER_FALSE_GREEN');
  } else {
    req(ledger.postgres_rows_written > 0, 'KIR_LEDGER_MIGRATION_WITHOUT_FIRST_WRITE');
    req(ledger.state === 'EMPIRICAL_VALIDATED', 'KIR_LEDGER_STATE_NOT_EMPIRICAL_VALIDATED');
    req(empirical > 0, 'KIR_LEDGER_EMPIRICAL_WITHOUT_CURRENT_SOLD');
  }

  const pairAbsent = pair.candidate === 'NONE' && pair.evidence_package === 'NONE';
  const pairPresent = DIGEST.test(pair.candidate || '') && DIGEST.test(pair.evidence_package || '');
  req(pairAbsent || pairPresent, 'KIR_PAIR_PARTIAL_OR_MALFORMED');
  req(ceiling.candidate === pair.candidate && ceiling.evidence_package === pair.evidence_package, 'KIR_PAIR_CEILING_DRIFT');
  if (pairAbsent) {
    req(pair.state === CURRENT_BLOCKED_STATE.CANDIDATE_EVIDENCE_PAIR, 'KIR_PAIR_FALSE_GREEN');
  } else {
    req(pair.state === 'PAIR_READY', 'KIR_PAIR_STATE_NOT_READY');
    req(ledger.state === 'EMPIRICAL_VALIDATED' && ledger.postgres_rows_written > 0, 'KIR_PAIR_WITHOUT_LEDGER');
    req(evidence.state === 'EMPIRICAL_VALIDATED' && empirical > 0, 'KIR_PAIR_WITHOUT_EVIDENCE');
  }

  req(typeof trackB.assessment_started === 'boolean', 'KIR_TRACK_B_STARTED_TYPE');
  req(ceiling.track_b_started === trackB.assessment_started, 'KIR_TRACK_B_CEILING_DRIFT');
  if (!trackB.assessment_started) {
    req(trackB.state === CURRENT_BLOCKED_STATE.TRACK_B_ASSESSMENT, 'KIR_TRACK_B_FALSE_GREEN');
  } else {
    req(trackB.state === 'COMPLETE_INDEPENDENT_ASSESSMENT', 'KIR_TRACK_B_STATE_NOT_COMPLETE');
    req(pair.state === 'PAIR_READY', 'KIR_TRACK_B_WITHOUT_PAIR');
  }

  const projectionAbsent = projection.approved_projection === 'NONE';
  const projectionPresent = DIGEST.test(projection.approved_projection || '');
  req(projectionAbsent || projectionPresent, 'KIR_PROJECTION_MALFORMED');
  req(ceiling.approved_projection === projection.approved_projection, 'KIR_PROJECTION_CEILING_DRIFT');
  if (projectionAbsent) {
    req(projection.state === CURRENT_BLOCKED_STATE.PROJECTION_RELEASE, 'KIR_PROJECTION_FALSE_GREEN');
  } else {
    req(projection.state === 'APPROVED_PROJECTION_READY', 'KIR_PROJECTION_STATE_NOT_READY');
    req(trackB.state === 'COMPLETE_INDEPENDENT_ASSESSMENT', 'KIR_PROJECTION_WITHOUT_TRACK_B');
  }

  for (const module of modules.values()) requireTransitionEvidence(contract, module);
  validateForwardDependencyClosure(modules);

  return {
    empirical,
    postgresRows: ledger.postgres_rows_written,
    pairReady: pair.state === 'PAIR_READY',
    trackBComplete: trackB.state === 'COMPLETE_INDEPENDENT_ASSESSMENT',
    projectionReady: projection.state === 'APPROVED_PROJECTION_READY',
  };
}

export function validateKirRuntime({contract, registry, readiness}) {
  validateKirReadinessStructure(registry, readiness);
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
  req(contract?.authority_boundary?.public_release === 'HOLD' && contract?.authority_boundary?.production === 'HOLD' && contract?.authority_boundary?.g5 === 'HOLD', 'KIR_RELEASE_HOLD');

  req(registry?.id === 'kidults-intelligence-runtime-module-registry-v1', 'KIR_REGISTRY_ID');
  req(registry?.contract_id === contract.id, 'KIR_REGISTRY_CONTRACT_BINDING');
  req(registry?.mode === contract.mode, 'KIR_REGISTRY_MODE');
  req(registry?.reviewed_protected_main_sha === readiness?.reviewed_protected_main_sha, 'KIR_REGISTRY_READINESS_MAIN_BINDING');
  req(contract.protected_main_reference === readiness.reviewed_protected_main_sha, 'KIR_CONTRACT_READINESS_MAIN_BINDING');

  const modules = moduleMap(registry);
  for (const [id, module] of modules) {
    req(contract.module_state_classes.includes(module.state), `KIR_MODULE_STATE_UNKNOWN:${id}`);
    req(Array.isArray(module.dependencies), `KIR_MODULE_DEPENDENCIES:${id}`);
    req(module.forward_authority === false, `KIR_MODULE_FORWARD_AUTHORITY_FALSE:${id}`);
  }
  validateExactDag(modules);
  const stages = validateModuleReadinessBinding(modules, readiness);
  const state = validateStateMachine(contract, registry, readiness, modules, stages);

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

export function evaluateKirRuntime({contract, registry, readiness, identity}) {
  const fields = ['repository', 'source_sha', 'run_id', 'run_attempt', 'trigger_event'];
  req(identity && typeof identity === 'object' && !Array.isArray(identity), 'KIR_IDENTITY_OBJECT');
  const proto = Object.getPrototypeOf(identity);
  req(proto === Object.prototype || proto === null, 'KIR_IDENTITY_PLAIN_RECORD');
  const keys = Reflect.ownKeys(identity);
  req(keys.length === fields.length && keys.every(key => fields.includes(key)), 'KIR_IDENTITY_FIELDS');
  for (const field of fields) {
    req(Object.hasOwn(Object.getOwnPropertyDescriptor(identity, field) || {}, 'value'), 'KIR_IDENTITY_DATA_FIELDS');
  }
  const snapshot = bindEvaluationSnapshot({contract, registry, readiness});
  ({contract, registry, readiness} = snapshot.values);
  const validated = validateKirRuntime(snapshot.values);
  req(identity?.repository === REPO, 'KIR_IDENTITY_REPOSITORY');
  req(typeof identity.source_sha === 'string' && SHA40.test(identity.source_sha), 'KIR_IDENTITY_SOURCE_SHA');
  req(Number.isSafeInteger(identity?.run_id) && identity.run_id > 0, 'KIR_IDENTITY_RUN_ID');
  req(Number.isSafeInteger(identity?.run_attempt) && identity.run_attempt > 0, 'KIR_IDENTITY_RUN_ATTEMPT');
  req(typeof identity?.trigger_event === 'string' && identity.trigger_event.length > 0, 'KIR_IDENTITY_TRIGGER');

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

export function loadKirRuntime() {
  return {contract: readJson(PATHS.contract), registry: readJson(PATHS.registry), readiness: readJson(PATHS.readiness)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const loaded = loadKirRuntime();
  if (process.argv.includes('--validate')) {
    process.stdout.write(`${JSON.stringify(validateKirRuntime(loaded), null, 2)}\n`);
  } else if (process.argv.includes('--evaluate')) {
    const identity = {
      repository: process.env.GITHUB_REPOSITORY || REPO,
      source_sha: process.env.KIR_SOURCE_SHA || process.env.GITHUB_SHA || '',
      run_id: Number(process.env.GITHUB_RUN_ID || 0),
      run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0),
      trigger_event: process.env.GITHUB_EVENT_NAME || 'unknown',
    };
    const receipt = evaluateKirRuntime({...loaded, identity});
    const output = process.env.KIR_RECEIPT_PATH;
    if (output) fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    throw new Error('USAGE: --validate or --evaluate');
  }
}
