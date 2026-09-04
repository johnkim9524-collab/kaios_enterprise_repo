#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const PATHS = {
  contract: 'coordination/kidults/runtime/kir-runtime-contract-v1.json',
  registry: 'coordination/kidults/runtime/kir-module-registry-v1.json',
  readiness: 'coordination/kidults/market/current-sold-value-chain-readiness-v1.json',
};

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const sha256File = path => `sha256:${createHash('sha256').update(fs.readFileSync(path)).digest('hex')}`;
const req = (value, code) => { if (!value) throw new Error(code); };

export function validateKirRuntime({contract, registry, readiness}) {
  req(contract?.id === 'kidults-intelligence-runtime-contract-v1', 'KIR_CONTRACT_ID');
  req(contract?.version === '1.0.0', 'KIR_CONTRACT_VERSION');
  req(contract?.mode === 'CONTROL_ONLY_DRAFT_NOT_LANDED', 'KIR_MODE');
  req(contract?.runtime_activation_authorized === false, 'KIR_RUNTIME_AUTHORITY_FALSE');
  req(/^[0-9a-f]{40}$/.test(contract?.protected_main_reference || ''), 'KIR_PROTECTED_MAIN_SHA');
  req(contract?.kernel?.fixture_or_replay_empirical_delta_allowed === false, 'KIR_FIXTURE_REPLAY_FALSE');
  req(contract?.kernel?.detached_receipt_authority_allowed === false, 'KIR_DETACHED_RECEIPT_FALSE');
  req(contract?.kernel?.self_issued_rights_authority_allowed === false, 'KIR_SELF_RIGHTS_FALSE');
  req(contract?.kernel?.self_approved_track_b_allowed === false, 'KIR_SELF_TRACK_B_FALSE');
  req(contract?.kernel?.implicit_database_write_authority_allowed === false, 'KIR_IMPLICIT_DB_FALSE');
  req(contract?.kernel?.implicit_publication_authority_allowed === false, 'KIR_IMPLICIT_RELEASE_FALSE');
  req(contract?.promotion_contract?.control_validation_is_empirical_proof === false, 'KIR_CONTROL_NOT_EMPIRICAL');
  req(contract?.promotion_contract?.branch_success_is_protected_main_natural_canary === false, 'KIR_BRANCH_NOT_MAIN_CANARY');
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
  req(Array.isArray(registry?.modules) && registry.modules.length === 8, 'KIR_MODULE_COUNT');

  const modules = new Map();
  for (const module of registry.modules) {
    req(typeof module?.id === 'string' && module.id.length > 0, 'KIR_MODULE_ID');
    req(!modules.has(module.id), `KIR_MODULE_DUPLICATE:${module.id}`);
    req(contract.module_state_classes.includes(module.state), `KIR_MODULE_STATE_UNKNOWN:${module.id}`);
    req(Array.isArray(module.dependencies), `KIR_MODULE_DEPENDENCIES:${module.id}`);
    req(module.forward_authority === false, `KIR_MODULE_FORWARD_AUTHORITY_FALSE:${module.id}`);
    modules.set(module.id, module);
  }
  for (const module of registry.modules) {
    for (const dependency of module.dependencies) req(modules.has(dependency), `KIR_MODULE_DEPENDENCY_UNKNOWN:${module.id}:${dependency}`);
  }

  const visiting = new Set(), visited = new Set();
  const visit = id => {
    if (visited.has(id)) return;
    req(!visiting.has(id), `KIR_MODULE_DEPENDENCY_CYCLE:${id}`);
    visiting.add(id);
    for (const dep of modules.get(id).dependencies) visit(dep);
    visiting.delete(id); visited.add(id);
  };
  for (const id of modules.keys()) visit(id);

  const stages = new Map((readiness?.stages || []).map(stage => [stage.stage, stage]));
  req(stages.size >= 8, 'KIR_READINESS_STAGES');
  for (const module of registry.modules) {
    const stage = stages.get(module.source_stage);
    req(stage, `KIR_SOURCE_STAGE_MISSING:${module.id}`);
    req(stage.state === module.state, `KIR_STAGE_STATE_DRIFT:${module.id}`);
    req(stage.owner === module.owner, `KIR_STAGE_OWNER_DRIFT:${module.id}`);
    if (module.runtime_owner && stage.runtime_owner) req(stage.runtime_owner === module.runtime_owner, `KIR_RUNTIME_OWNER_DRIFT:${module.id}`);
  }

  const truth = readiness?.truth_boundary;
  const ceiling = registry?.truth_ceiling;
  req(truth?.lawful_empirical_current_sold_admitted === 0, 'KIR_EMPIRICAL_TRUTH_NOT_ZERO');
  req(ceiling?.lawful_empirical_current_sold_admitted === truth.lawful_empirical_current_sold_admitted, 'KIR_EMPIRICAL_CEILING_DRIFT');
  req(truth?.postgres_rows_written_by_this_change === 0, 'KIR_READINESS_POSTGRES_DELTA_NOT_ZERO');
  req(ceiling?.postgres_rows_written === 0, 'KIR_REGISTRY_POSTGRES_NOT_ZERO');
  req(ceiling?.candidate === 'NONE' && ceiling?.evidence_package === 'NONE', 'KIR_PAIR_CEILING');
  req(ceiling?.track_b_started === false, 'KIR_TRACK_B_CEILING');
  req(ceiling?.approved_projection === 'NONE', 'KIR_PROJECTION_CEILING');
  req(ceiling?.public === 'HOLD' && ceiling?.production === 'HOLD' && ceiling?.g5 === 'HOLD', 'KIR_REGISTRY_RELEASE_HOLD');
  req(truth?.public === 'HOLD' && truth?.production === 'HOLD' && truth?.g5 === 'HOLD', 'KIR_READINESS_RELEASE_HOLD');

  const admission = modules.get('CURRENT_SOLD_ADMISSION');
  const ledger = modules.get('APPEND_ONLY_LEDGER');
  const pair = modules.get('CANDIDATE_EVIDENCE_PAIR');
  const trackB = modules.get('TRACK_B_ASSESSMENT');
  const projection = modules.get('PROJECTION_RELEASE');
  req(admission.empirical_count === 0, 'KIR_CURRENT_SOLD_EMPIRICAL_NOT_ZERO');
  req(ledger.postgres_migration_applied === false && ledger.postgres_rows_written === 0, 'KIR_LEDGER_FALSE_GREEN');
  req(pair.candidate === 'NONE' && pair.evidence_package === 'NONE', 'KIR_PAIR_FALSE_GREEN');
  req(trackB.assessment_started === false, 'KIR_TRACK_B_FALSE_GREEN');
  req(projection.approved_projection === 'NONE', 'KIR_PROJECTION_FALSE_GREEN');

  return {state:'VERIFIED_PASS', module_count:registry.modules.length, empirical_current_sold:0, postgres_rows:0, track_b_started:false, production:'HOLD'};
}

export function evaluateKirRuntime({contract, registry, readiness, identity}) {
  validateKirRuntime({contract, registry, readiness});
  req(identity?.repository === 'johnkim9524-collab/kaios_enterprise_repo', 'KIR_IDENTITY_REPOSITORY');
  req(/^[0-9a-f]{40}$/.test(identity?.source_sha || ''), 'KIR_IDENTITY_SOURCE_SHA');
  req(Number.isInteger(identity?.run_id) && identity.run_id > 0, 'KIR_IDENTITY_RUN_ID');
  req(Number.isInteger(identity?.run_attempt) && identity.run_attempt > 0, 'KIR_IDENTITY_RUN_ATTEMPT');
  req(typeof identity?.trigger_event === 'string' && identity.trigger_event.length > 0, 'KIR_IDENTITY_TRIGGER');

  const stages = new Map(readiness.stages.map(stage => [stage.stage, stage]));
  const blockers = [];
  if (stages.get('TRACK_Z_SOURCE_RIGHTS_AND_ACQUISITION')?.state !== 'READY') blockers.push('LAWFUL_SOURCE_RIGHTS_NOT_READY');
  if (stages.get('KPMO_GOVERNED_RECEIPT_REGISTRY_AUTHORITY')?.state !== 'READY') blockers.push('INDEPENDENT_TRUST_ROOT_NOT_READY');
  if (readiness.truth_boundary.lawful_empirical_current_sold_admitted < 1) blockers.push('LAWFUL_EMPIRICAL_CURRENT_SOLD_ZERO');
  if (stages.get('TRACK_D_APPEND_ONLY_LEDGER')?.postgres_migration_applied !== true || stages.get('TRACK_D_APPEND_ONLY_LEDGER')?.postgres_rows_written < 1) blockers.push('POSTGRES_FIRST_WRITE_NOT_PROVEN');
  if (stages.get('TRACK_A_CANDIDATE_EVIDENCE_PAIR')?.candidate === 'NONE' || stages.get('TRACK_A_CANDIDATE_EVIDENCE_PAIR')?.evidence_package === 'NONE') blockers.push('CANDIDATE_EVIDENCE_PAIR_ABSENT');
  if (!String(stages.get('TRACK_B_INDEPENDENT_ASSESSMENT')?.state || '').startsWith('COMPLETE')) blockers.push('TRACK_B_NOT_COMPLETE');
  if (stages.get('PROJECTION_AND_PORTAL')?.state !== 'APPROVED_PROJECTION_READY') blockers.push('APPROVED_PROJECTION_ABSENT');

  return {
    id:'kidults-intelligence-runtime-terminal-receipt-v1',
    version:'1.0.0',
    state:blockers.length ? 'CONTROL_VALIDATED_EMPIRICAL_BLOCKED' : 'READY_FOR_SEPARATELY_GATED_ACTIVATION_REVIEW',
    ...identity,
    contract_sha256:sha256File(PATHS.contract),
    registry_sha256:sha256File(PATHS.registry),
    readiness_sha256:sha256File(PATHS.readiness),
    module_states:Object.fromEntries(registry.modules.map(module => [module.id,module.state])),
    blockers,
    runtime_activation_authorized:false,
    empirical_authority:false,
    database_authority:false,
    provider_authority:false,
    promotion_eligible:false,
    public_release:'HOLD',
    production:'HOLD',
    g5:'HOLD'
  };
}

export function loadKirRuntime() {
  return {contract:readJson(PATHS.contract), registry:readJson(PATHS.registry), readiness:readJson(PATHS.readiness)};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loaded = loadKirRuntime();
  if (process.argv.includes('--validate')) {
    process.stdout.write(`${JSON.stringify(validateKirRuntime(loaded),null,2)}\n`);
  } else if (process.argv.includes('--evaluate')) {
    const identity={
      repository:process.env.GITHUB_REPOSITORY || 'johnkim9524-collab/kaios_enterprise_repo',
      source_sha:process.env.KIR_SOURCE_SHA || process.env.GITHUB_SHA || '',
      run_id:Number(process.env.GITHUB_RUN_ID || 0),
      run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT || 0),
      trigger_event:process.env.GITHUB_EVENT_NAME || 'unknown'
    };
    const receipt=evaluateKirRuntime({...loaded,identity});
    const output=process.env.KIR_RECEIPT_PATH;
    if(output) fs.writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`);
    process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
  } else {
    throw new Error('USAGE: --validate or --evaluate');
  }
}
