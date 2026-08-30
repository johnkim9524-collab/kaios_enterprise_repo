#!/usr/bin/env node
import { fs, readJson, stableJson, hash, parsePsv, makeWriter } from './lib/asi-autonomous-resolution-common-v1.mjs';
import { resolveCurrent } from './lib/asi-autonomous-resolution-current-v1.mjs';
import { buildReplacement } from './lib/asi-autonomous-resolution-replacement-v1.mjs';
import { validateP1RuntimeLineageFromEnvironment } from './validate-asi-p1-runtime-lineage-v1.mjs';

const [candidateRegistryPath,bindingLedgerPath,gate1Path,admissionPath,actionQueuePath,frontierPath,crosswalkPath,adapterContractPath,contractPath,rightsPreflightPath,outputDir] = process.argv.slice(2);
if (![candidateRegistryPath,bindingLedgerPath,gate1Path,admissionPath,actionQueuePath,frontierPath,crosswalkPath,adapterContractPath,contractPath,rightsPreflightPath,outputDir].every(Boolean)) throw new Error('AUTONOMOUS_RESOLUTION_ARGUMENTS_REQUIRED');
if (process.env.GITHUB_ACTIONS === 'true') {
  await validateP1RuntimeLineageFromEnvironment({
    eventName: process.env.GITHUB_EVENT_NAME,
    eventPath: process.env.GITHUB_EVENT_PATH,
    expandedRoot: '/tmp/p1-expanded',
    expectedSourceSha: process.env.GITHUB_SHA
  });
}

const [candidates,bindings,gate1,admissions,actionQueue,crosswalk,adapterContract,contract,rightsPreflight,frontierText] = await Promise.all([
  readJson(candidateRegistryPath), readJson(bindingLedgerPath), readJson(gate1Path), readJson(admissionPath), readJson(actionQueuePath),
  readJson(crosswalkPath), readJson(adapterContractPath), readJson(contractPath), readJson(rightsPreflightPath), fs.readFile(frontierPath, 'utf8')
]);
const frontier = parsePsv(frontierText);
const principles = ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
if (candidates.id !== 'kidults-asi-p0b-source-candidate-registry-v1' || !Array.isArray(candidates.candidates)) throw new Error('P0B_CANDIDATE_REGISTRY_INVALID');
if (bindings.id !== 'kidults-asi-p0b-mission-candidate-binding-ledger-v1' || bindings.mission_count !== 192 || bindings.bindings?.length !== 192) throw new Error('P0B_BINDING_LEDGER_INVALID');
if (gate1.id !== 'kidults-asi-p1-gate1-source-safety-decisions-v1' || !gate1.decisions?.length) throw new Error('P1_GATE1_INVALID');
if (admissions.id !== 'kidults-asi-p1-evidence-admission-candidate-register-v1' || admissions.candidates?.length !== gate1.decisions.length) throw new Error('P1_ADMISSION_INVALID');
if (actionQueue.id !== 'kidults-asi-p1-preflight-action-queue-v1' || !actionQueue.actions?.length) throw new Error('P1_ACTION_QUEUE_INVALID');
if (crosswalk.id !== 'scope-registry-v1-to-v2-crosswalk-v1' || crosswalk.status !== 'ACTIVE_CANONICAL_MIGRATION_GATE') throw new Error('SCOPE_CROSSWALK_INVALID');
if (adapterContract.id !== 'kidults-asi-p1-market-event-adapter-runtime-contract-v1' || adapterContract.version !== '1.0.0') throw new Error('MARKET_ADAPTER_CONTRACT_INVALID');
if (contract.id !== 'kidults-asi-autonomous-resolution-layer-contract-v1' || contract.version !== '1.0.0') throw new Error('RESOLUTION_CONTRACT_INVALID');
if (JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) throw new Error('RESOLUTION_PRINCIPLE_ORDER_INVALID');
if (contract.truth_boundary?.executes_live_target_site_network_probe !== false || contract.truth_boundary?.admits_evidence !== false) throw new Error('RESOLUTION_TRUTH_BOUNDARY_INVALID');
if (rightsPreflight.id !== 'kidults-top16-empirical-activation-preflight-v1' || !Array.isArray(rightsPreflight.rows)) throw new Error('PURPOSE_RIGHTS_PREFLIGHT_INVALID');
await fs.mkdir(outputDir, { recursive: true });

const current = resolveCurrent({ candidates, bindings, gate1, admissions, actionQueue, contract });
const { adapterProfiles, replacementQueue } = buildReplacement({ bindings, gate1, frontier, crosswalk, adapterContract, rightsPreflight, contract });
const actionResolutionLedger = {
  id:'kidults-asi-action-resolution-ledger-v1',version:'1.0.0',state:'ALL_CURRENT_ACTIONS_TERMINAL',
  original_action_count:actionQueue.actions.length,terminal_action_count:current.actionRecords.length,
  resolved_rejected_count:current.actionRecords.filter((r)=>r.terminal_state==='RESOLVED_REJECTED').length,
  superseded_count:current.actionRecords.filter((r)=>r.terminal_state==='SUPERSEDED_BY_TERMINAL_SEMANTIC_REJECTION').length,
  unresolved_action_count:0,network_probe_executed_count:0,
  records:[...current.actionRecords].sort((a,b)=>a.action_id.localeCompare(b.action_id)),public_release:'HOLD',production:'HOLD'
};
const gate1ResolutionLedger = {
  id:'kidults-asi-gate1-resolution-ledger-v1',version:'1.0.0',state:'ALL_CURRENT_GRAINS_REEVALUATED',
  decision_count:current.gate1Records.length,pass_count:0,hold_count:0,reject_count:current.gate1Records.length,
  records:current.gate1Records,public_release:'HOLD',production:'HOLD'
};
const evidenceAdmissionLedger = {
  id:'kidults-asi-evidence-admission-resolution-ledger-v1',version:'1.0.0',state:'CURRENT_GRAINS_REJECTED_REPLACEMENT_REQUIRED',
  candidate_count:current.admissionRecords.length,admitted_count:0,ready_count:0,rejected_count:current.admissionRecords.length,
  market_events_created:0,records:current.admissionRecords,public_release:'HOLD',production:'HOLD'
};
const resolutionSchedule = {
  id:'kidults-asi-resolution-schedule-v1',version:'1.0.0',state:'DETERMINISTIC_RESOLUTION_SCHEDULE_EXECUTED',
  batches:[
    {sequence:1,batch_id:'SEMANTIC_TRIAGE',state:'COMPLETED',item_count:current.candidateIds.length,outcome:'TERMINAL_REJECT'},
    {sequence:2,batch_id:'CONDITIONAL_SOURCE_PREFLIGHT',state:'SUPERSEDED',item_count:actionQueue.actions.length-current.candidateIds.length,outcome:'NOT_EXECUTED_AFTER_SHORT_CIRCUIT'},
    {sequence:3,batch_id:'GATE1_REEVALUATION',state:'COMPLETED',item_count:gate1.decisions.length,outcome:'REJECT'},
    {sequence:4,batch_id:'REPLACEMENT_SOURCE_MISSION_GENERATION',state:'COMPLETED',item_count:replacementQueue.mission_count,outcome:replacementQueue.adapter_development_backlog.length > 0 ? 'RIGHTS_CLEAR_PROFILE_BACKLOG_CREATED' : 'RIGHTS_PREFLIGHT_QUEUE_ONLY'}
  ],
  total_original_actions:actionQueue.actions.length,terminal_actions:current.actionRecords.length,
  live_network_requests:0,manual_orchestration_required:false,public_release:'HOLD',production:'HOLD'
};
const rightsLedger = {
  id:'kidults-asi-rights-resolution-ledger-v1',version:'1.0.0',state:'TERMINALIZED_WITHOUT_RIGHTS_PROMOTION',
  candidate_count:current.rightsRecords.length,rights_pass_count:0,rights_unknown_count:current.rightsRecords.length,
  network_probes_executed:0,records:current.rightsRecords,public_release:'HOLD',production:'HOLD'
};
const semanticLedger = {
  id:'kidults-asi-semantic-resolution-ledger-v1',version:'1.0.0',state:'CURRENT_CANDIDATES_TERMINALLY_REJECTED_FOR_CURRENT_MARKET_EVIDENCE',
  candidate_count:current.semanticRecords.length,terminal_reject_count:current.semanticRecords.length,pass_count:0,
  records:current.semanticRecords,public_release:'HOLD',production:'HOLD'
};
const originLedger = {
  id:'kidults-asi-factual-origin-resolution-ledger-v1',version:'1.0.0',state:'NO_FALSE_INDEPENDENCE_PROMOTION',
  candidate_count:current.originRecords.length,verified_factual_origin_count:0,independence_pass_count:0,
  records:current.originRecords,public_release:'HOLD',production:'HOLD'
};
const learningLedger = {
  id:'kidults-asi-resolution-learning-ledger-v1',version:'1.0.0',state:'DETERMINISTIC_RULE_LEARNED_AND_VERSIONED',
  learned_rules:[{
    rule_id:'ARL-SEMANTIC-001',version:'1.0.0',
    antecedent:'DISCOVERY_METADATA_ONLY_AND_TARGET_CONTENT_NOT_ACQUIRED_AND_REQUIRED_CLASS_IN_CURRENT_SOLD_OR_LIQUIDITY',
    consequent:'TERMINAL_REJECT_GRAIN_AND_SUPERSEDE_EXPENSIVE_PREFLIGHT',
    observed_candidate_count:current.candidateIds.length,observed_grain_count:gate1.decisions.length,
    terminalized_action_count:actionQueue.actions.length,false_rights_pass_created:0,evidence_admitted:0,silent_rewrite_allowed:false,
    evidence_refs:[`candidate-registry:${hash(stableJson(candidates))}`,`action-queue:${hash(stableJson(actionQueue))}`,`gate1:${hash(stableJson(gate1))}`]
  }],rule_count:1,public_release:'HOLD',production:'HOLD'
};

const writeJson = makeWriter(outputDir), outputs=[];
for (const [name,value] of [
  ['action-dependency-graph-v1.json',current.actionDependencyGraph],['resolution-schedule-v1.json',resolutionSchedule],
  ['rights-resolution-ledger-v1.json',rightsLedger],['semantic-resolution-ledger-v1.json',semanticLedger],
  ['factual-origin-resolution-ledger-v1.json',originLedger],['action-resolution-ledger-v1.json',actionResolutionLedger],
  ['gate1-resolution-ledger-v1.json',gate1ResolutionLedger],['evidence-admission-resolution-ledger-v1.json',evidenceAdmissionLedger],
  ['replacement-source-mission-queue-v1.json',replacementQueue],['resolution-learning-ledger-v1.json',learningLedger]
]) outputs.push(await writeJson(name,value));

const candidateById=new Map(candidates.candidates.map((c)=>[c.candidate_id,c]));
const observedTimes=current.candidateIds.flatMap((id)=>candidateById.get(id).observed_at_values||[]).filter((v)=>Number.isFinite(Date.parse(v))).sort();
const manifest={
  id:'kidults-asi-autonomous-resolution-manifest-v1',version:'1.0.0',state:'P0_AUTONOMOUS_RESOLUTION_LAYER_EXECUTED',
  as_of:observedTimes.at(-1)||'1970-01-01T00:00:00.000Z',platform_principles:principles,engine_order:contract.engine_order,
  input_bindings:{
    candidate_registry:{id:candidates.id,count:candidates.canonical_candidate_count,digest:hash(stableJson(candidates))},
    binding_ledger:{id:bindings.id,count:bindings.mission_count,digest:hash(stableJson(bindings))},
    gate1:{id:gate1.id,count:gate1.decisions.length,digest:hash(stableJson(gate1))},
    admission_candidates:{id:admissions.id,count:admissions.candidates.length,digest:hash(stableJson(admissions))},
    action_queue:{id:actionQueue.id,count:actionQueue.actions.length,digest:hash(stableJson(actionQueue))},
    frontier:{path:contract.replacement_policy.frontier_path,records:frontier.length,digest:hash(frontierText)},
    crosswalk:{id:crosswalk.id,records:crosswalk.records.length,digest:hash(stableJson(crosswalk))},
    adapter_contract:{id:adapterContract.id,profiles:adapterProfiles.size,digest:hash(stableJson(adapterContract))},
    contract:{id:contract.id,version:contract.version,digest:hash(stableJson(contract))},
    rights_preflight:{id:rightsPreflight.id,rows:rightsPreflight.rows.length,digest:hash(stableJson(rightsPreflight))}
  },
  results:{
    current_candidate_count:current.candidateIds.length,original_actions:actionQueue.actions.length,terminal_actions:current.actionRecords.length,
    semantic_reject_actions:current.candidateIds.length,superseded_actions:actionQueue.actions.length-current.candidateIds.length,
    gate1_original_hold:gate1.decisions.filter((d)=>d.decision==='HOLD').length,gate1_resolved_reject:current.gate1Records.length,
    gate1_remaining_hold:0,gate1_pass:0,evidence_admission_candidates_rejected:current.admissionRecords.length,
    evidence_admitted:0,market_events_created:0,replacement_missions:replacementQueue.mission_count,
    replacement_missions_with_profiles:replacementQueue.missions_with_profile_candidates,
    replacement_missions_without_profiles:replacementQueue.missions_without_profile_candidates,
    replacement_source_slots_filled:replacementQueue.filled_source_slots,
    unique_registered_profiles_selected:replacementQueue.unique_registered_profiles_selected,
    adapter_backlog_items:replacementQueue.adapter_development_backlog.length,live_network_requests:0,
    rights_clear_registered_profiles:replacementQueue.rights_clear_registered_profile_count,
    rights_hold_registered_profiles:replacementQueue.rights_hold_registered_profile_count,
    rights_preflight_queue_items:replacementQueue.rights_preflight_queue_count,
    rights_clear_gate:'RIGHTS_CLEAR_FOR_PURPOSE_REQUIRED_BEFORE_ADAPTER_BACKLOG_OR_REPLACEMENT_PROFILE_SELECTION',
    collection_rights_created:0,snapshot_candidates_created:0,track_b_input_pairs_created:0
  },
  output_files:outputs,
  autonomous_effect:'POSITIVE_CURRENT_ACTION_QUEUE_TERMINALIZED_AND_RIGHTS_GATED_REPLACEMENT_OR_PREFLIGHT_QUEUE_GENERATED_WITHOUT_MANUAL_REVIEW',
  global_effect:'POSITIVE_ALL_192_CURRENT_SOLD_AND_LIQUIDITY_MISSIONS_REEVALUATED_WITH_SCOPE_CROSSWALKED_REPLACEMENT_SEARCH',
  irreplaceable_value_effect:'POSITIVE_KIDULTS_OWNED_DEPENDENCY_GRAPH_RESOLUTION_HISTORY_REJECTION_LINEAGE_AND_ADAPTER_BACKLOG',
  transparency_effect:'POSITIVE_EVERY_REJECT_SUPERSESSION_DEPENDENCY_AND_REPLACEMENT_GAP_IS_EXPLICIT_AND_DIGEST_BOUND',
  public_release:'HOLD',production:'HOLD'
};
outputs.push(await writeJson('autonomous-resolution-manifest-v1.json',manifest));
console.log(JSON.stringify({state:manifest.state,...manifest.results,public_release:'HOLD',production:'HOLD'},null,2));
