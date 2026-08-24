#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildPurposeRightsIndex, RIGHTS_CLEAR } from './lib/source-purpose-rights-gate-v1.mjs';

const [outputDir,candidateRegistryPath,bindingLedgerPath,gate1Path,admissionPath,actionQueuePath,frontierPath,crosswalkPath,adapterContractPath,contractPath,rightsPreflightPath] = process.argv.slice(2);
if (![outputDir,candidateRegistryPath,bindingLedgerPath,gate1Path,admissionPath,actionQueuePath,frontierPath,crosswalkPath,adapterContractPath,contractPath,rightsPreflightPath].every(Boolean)) throw new Error('AUTONOMOUS_RESOLUTION_VALIDATION_ARGUMENTS_REQUIRED');
const fail=(m)=>{throw new Error(m)}; const assert=(c,m)=>{if(!c)fail(m)};
const text=(p)=>fs.readFileSync(p,'utf8'); const json=(p)=>JSON.parse(text(p)); const file=(n)=>path.join(outputDir,n);
const stable=(v)=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map((k)=>[k,stable(v[k])])):v;
const stableJson=(v)=>`${JSON.stringify(stable(v),null,2)}\n`; const hash=(v)=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const unique=(v)=>new Set(v).size===v.length;
const parsePsv=(raw)=>{const lines=raw.split(/\r?\n/).filter((x)=>x.trim());const header=lines.shift().split('|');return lines.map((line)=>{const f=line.split('|');return Object.fromEntries(header.map((k,i)=>[k,f[i]??'']));});};

const inputs={
  candidates:json(candidateRegistryPath),bindings:json(bindingLedgerPath),gate1:json(gate1Path),admissions:json(admissionPath),
  actions:json(actionQueuePath),frontier:parsePsv(text(frontierPath)),crosswalk:json(crosswalkPath),adapter:json(adapterContractPath),contract:json(contractPath),rightsPreflight:json(rightsPreflightPath)
};
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
assert(inputs.contract.id==='kidults-asi-autonomous-resolution-layer-contract-v1'&&inputs.contract.version==='1.0.0','CONTRACT_ID_VERSION');
assert(JSON.stringify(inputs.contract.platform_principles)===JSON.stringify(principles),'CONTRACT_PRINCIPLES');
assert(inputs.contract.engine_order?.length===7&&inputs.contract.action_types?.length===7&&inputs.contract.required_outputs?.length===11,'CONTRACT_COUNTS');
assert(inputs.contract.semantic_short_circuit?.candidate_global_retirement_allowed===false,'CONTRACT_GLOBAL_RETIREMENT_BOUNDARY');
assert(inputs.contract.truth_boundary?.executes_live_target_site_network_probe===false&&inputs.contract.truth_boundary?.creates_rights_pass===false&&inputs.contract.truth_boundary?.admits_evidence===false,'CONTRACT_PROMOTION_BOUNDARY');
for(const name of inputs.contract.required_outputs){assert(fs.existsSync(file(name)),`MISSING_OUTPUT:${name}`);JSON.parse(text(file(name)));}
assert(inputs.candidates.id==='kidults-asi-p0b-source-candidate-registry-v1','INPUT_CANDIDATES');
assert(inputs.bindings.id==='kidults-asi-p0b-mission-candidate-binding-ledger-v1'&&inputs.bindings.mission_count===192,'INPUT_BINDINGS');
assert(inputs.gate1.id==='kidults-asi-p1-gate1-source-safety-decisions-v1','INPUT_GATE1');
assert(inputs.admissions.id==='kidults-asi-p1-evidence-admission-candidate-register-v1','INPUT_ADMISSIONS');
assert(inputs.actions.id==='kidults-asi-p1-preflight-action-queue-v1','INPUT_ACTIONS');
assert(inputs.crosswalk.id==='scope-registry-v1-to-v2-crosswalk-v1','INPUT_CROSSWALK');
assert(inputs.adapter.id==='kidults-asi-p1-market-event-adapter-runtime-contract-v1','INPUT_ADAPTER');
assert(inputs.rightsPreflight.id==='kidults-top16-empirical-activation-preflight-v1'&&inputs.rightsPreflight.rows?.length===inputs.adapter.registered_source_profiles.length,'INPUT_RIGHTS_PREFLIGHT');

const candidateIds=[...new Set(inputs.actions.actions.map((a)=>a.candidate_id))].sort();
const missionIds=[...new Set(inputs.gate1.decisions.map((d)=>d.mission_id))].sort();
const rightsIndex=buildPurposeRightsIndex(inputs.rightsPreflight,inputs.adapter.registered_source_profiles.map((tuple)=>tuple[1]),'CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION');
const expectedRightsClear=[...rightsIndex.values()].filter((value)=>value.decision===RIGHTS_CLEAR).length;
assert(candidateIds.length>0&&missionIds.length===192,'INPUT_CARDINALITY');
assert(inputs.gate1.decisions.length===inputs.admissions.candidates.length,'GATE_ADMISSION_COUNT');
assert(inputs.actions.actions.length===candidateIds.length*7,'ACTION_CARDINALITY');
for(const id of candidateIds){const types=inputs.actions.actions.filter((a)=>a.candidate_id===id).map((a)=>a.action_type).sort();assert(JSON.stringify(types)===JSON.stringify([...inputs.contract.action_types].sort()),`ACTION_SET:${id}`);}

const dependency=json(file('action-dependency-graph-v1.json'));
const schedule=json(file('resolution-schedule-v1.json'));
const rights=json(file('rights-resolution-ledger-v1.json'));
const semantic=json(file('semantic-resolution-ledger-v1.json'));
const origin=json(file('factual-origin-resolution-ledger-v1.json'));
const actions=json(file('action-resolution-ledger-v1.json'));
const gate=json(file('gate1-resolution-ledger-v1.json'));
const admission=json(file('evidence-admission-resolution-ledger-v1.json'));
const replacement=json(file('replacement-source-mission-queue-v1.json'));
const learning=json(file('resolution-learning-ledger-v1.json'));
const manifest=json(file('autonomous-resolution-manifest-v1.json'));

assert(dependency.id==='kidults-asi-action-dependency-graph-v1'&&dependency.state==='TERMINAL_SHORT_CIRCUIT_GRAPH_BUILT','DEPENDENCY_ID_STATE');
assert(dependency.action_node_count===inputs.actions.actions.length&&dependency.gate1_reevaluation_node_count===inputs.gate1.decisions.length,'DEPENDENCY_NODE_CLASSES');
assert(dependency.node_count===inputs.actions.actions.length+inputs.gate1.decisions.length,'DEPENDENCY_NODE_COUNT');
assert(dependency.edge_count===candidateIds.length*6+inputs.gate1.decisions.length*7,'DEPENDENCY_EDGE_COUNT');
assert(dependency.nodes?.length===dependency.node_count&&dependency.edges?.length===dependency.edge_count,'DEPENDENCY_ARRAYS');
assert(unique(dependency.nodes.map((n)=>n.node_id))&&unique(dependency.edges.map((e)=>e.edge_id)),'DEPENDENCY_DUPLICATES');
const nodeIds=new Set(dependency.nodes.map((n)=>n.node_id));assert(dependency.edges.every((e)=>nodeIds.has(e.from_node_id)&&nodeIds.has(e.to_node_id))&&dependency.orphan_edge_count===0,'DEPENDENCY_ORPHANS');

assert(schedule.id==='kidults-asi-resolution-schedule-v1'&&schedule.batches?.length===4,'SCHEDULE_ID_BATCHES');
assert(schedule.batches[0].batch_id==='SEMANTIC_TRIAGE'&&schedule.batches[0].item_count===candidateIds.length,'SCHEDULE_SEMANTIC');
assert(schedule.batches[1].item_count===inputs.actions.actions.length-candidateIds.length&&schedule.batches[1].state==='SUPERSEDED','SCHEDULE_SUPERSEDED');
assert(schedule.batches[2].item_count===inputs.gate1.decisions.length&&schedule.batches[3].item_count===missionIds.length,'SCHEDULE_DOWNSTREAM');
assert(schedule.batches[3].outcome===(replacement.adapter_development_backlog.length>0?'RIGHTS_CLEAR_PROFILE_BACKLOG_CREATED':'RIGHTS_PREFLIGHT_QUEUE_ONLY'),'SCHEDULE_RIGHTS_OUTCOME');
assert(schedule.total_original_actions===inputs.actions.actions.length&&schedule.terminal_actions===inputs.actions.actions.length&&schedule.live_network_requests===0&&schedule.manual_orchestration_required===false,'SCHEDULE_BOUNDARY');

assert(rights.id==='kidults-asi-rights-resolution-ledger-v1'&&rights.candidate_count===candidateIds.length&&rights.records?.length===candidateIds.length,'RIGHTS_COUNT');
assert(rights.rights_pass_count===0&&rights.rights_unknown_count===candidateIds.length&&rights.network_probes_executed===0,'RIGHTS_PASS_BOUNDARY');
for(const r of rights.records){assert(r.state==='NOT_REQUIRED_AFTER_TERMINAL_SEMANTIC_REJECTION'&&r.rights_state==='UNKNOWN','RIGHTS_STATE');assert(r.rights_pass_created===false&&r.collection_authorized===false&&r.live_terms_or_robots_probe_executed===false,'RIGHTS_PROMOTION');}

assert(semantic.id==='kidults-asi-semantic-resolution-ledger-v1'&&semantic.candidate_count===candidateIds.length&&semantic.records?.length===candidateIds.length,'SEMANTIC_COUNT');
assert(semantic.terminal_reject_count===candidateIds.length&&semantic.pass_count===0,'SEMANTIC_DECISIONS');
for(const r of semantic.records){assert(r.state==='TERMINAL_REJECT_FOR_CURRENT_MARKET_EVIDENCE'&&r.decision==='REJECT','SEMANTIC_STATE');assert(r.rejection_scope==='MISSION_EVIDENCE_CLASS_ONLY'&&r.candidate_globally_retired===false,'SEMANTIC_SCOPE');assert(r.observed_candidate_state==='DISCOVERY_METADATA_ONLY'&&r.target_content_acquired===false&&r.terminal_market_state_observed===false&&r.exposure_denominator_observed===false,'SEMANTIC_FACTS');}

assert(origin.id==='kidults-asi-factual-origin-resolution-ledger-v1'&&origin.candidate_count===candidateIds.length&&origin.records?.length===candidateIds.length,'ORIGIN_COUNT');
assert(origin.verified_factual_origin_count===0&&origin.independence_pass_count===0,'ORIGIN_PASS_BOUNDARY');
for(const r of origin.records)assert(r.source_owner_id===null&&r.factual_origin_id===null&&r.distinct_host_is_distinct_factual_origin===false&&r.factual_origin_independence_proven===false,'ORIGIN_INDEPENDENCE');

assert(actions.id==='kidults-asi-action-resolution-ledger-v1','ACTION_RESOLUTION_ID');
assert(actions.original_action_count===inputs.actions.actions.length&&actions.terminal_action_count===inputs.actions.actions.length&&actions.records?.length===inputs.actions.actions.length,'ACTION_RESOLUTION_TERMINAL_COUNT');
assert(actions.resolved_rejected_count===candidateIds.length&&actions.superseded_count===inputs.actions.actions.length-candidateIds.length&&actions.unresolved_action_count===0,'ACTION_RESOLUTION_COUNTS');
assert(unique(actions.records.map((r)=>r.action_id)),'ACTION_RESOLUTION_DUPLICATE');
for(const r of actions.records){assert(inputs.contract.terminal_action_states.includes(r.terminal_state),'ACTION_RESOLUTION_STATE');assert(r.rights_pass_created===false&&r.evidence_admitted===false&&r.network_probe_executed===false,'ACTION_RESOLUTION_PROMOTION');}

assert(gate.id==='kidults-asi-gate1-resolution-ledger-v1'&&gate.decision_count===inputs.gate1.decisions.length&&gate.records?.length===inputs.gate1.decisions.length,'GATE1_RESOLUTION_COUNT');
assert(gate.pass_count===0&&gate.hold_count===0&&gate.reject_count===inputs.gate1.decisions.length,'GATE1_RESOLUTION_COUNTS');
for(const r of gate.records){assert(r.original_decision==='HOLD'&&r.resolved_decision==='REJECT'&&r.rights_state==='UNKNOWN','GATE1_DECISION');assert(r.rejection_scope==='MISSION_EVIDENCE_CLASS_ONLY'&&r.candidate_globally_retired===false,'GATE1_SCOPE');assert(r.collection_authorized===false&&r.evidence_admitted===false&&r.market_claim_authorized===false,'GATE1_PROMOTION');}

assert(admission.id==='kidults-asi-evidence-admission-resolution-ledger-v1'&&admission.candidate_count===inputs.admissions.candidates.length&&admission.records?.length===inputs.admissions.candidates.length,'ADMISSION_RESOLUTION_COUNT');
assert(admission.admitted_count===0&&admission.ready_count===0&&admission.rejected_count===inputs.admissions.candidates.length&&admission.market_events_created===0,'ADMISSION_RESOLUTION_COUNTS');
for(const r of admission.records)assert(r.resolved_state==='REJECTED_SOURCE_ROLE_INCOMPATIBLE'&&r.evidence_admitted===false&&r.admitted_evidence_id===null&&r.market_event_created===false&&r.collection_authorized===false,'ADMISSION_PROMOTION');

assert(replacement.id==='kidults-asi-replacement-source-mission-queue-v1'&&replacement.mission_count===missionIds.length&&replacement.missions?.length===missionIds.length,'REPLACEMENT_MISSION_COUNT');
assert(replacement.missions_with_profile_candidates+replacement.missions_without_profile_candidates===replacement.mission_count,'REPLACEMENT_PARTITION');
assert(replacement.filled_source_slots===replacement.missions.reduce((t,m)=>t+m.filled_slot_count,0),'REPLACEMENT_SLOT_COUNT');
assert(replacement.unique_registered_profiles_selected===replacement.adapter_development_backlog?.length,'REPLACEMENT_PROFILE_COUNT');
assert(replacement.rights_clear_registered_profile_count===expectedRightsClear&&replacement.rights_hold_registered_profile_count===inputs.adapter.registered_source_profiles.length-expectedRightsClear,'REPLACEMENT_RIGHTS_COUNTS');
assert(replacement.rights_preflight_queue_count===inputs.adapter.registered_source_profiles.length-expectedRightsClear&&replacement.rights_preflight_queue?.length===replacement.rights_preflight_queue_count,'REPLACEMENT_RIGHTS_QUEUE');
assert(replacement.implementation_priority_rule==='RIGHTS_CLEAR_FOR_PURPOSE_REQUIRED_BEFORE_ADAPTER_BACKLOG_OR_REPLACEMENT_PROFILE_SELECTION','REPLACEMENT_RIGHTS_RULE');
assert(replacement.registered_profile_is_rights_verified===false&&replacement.registered_profile_is_adapter_implemented===false&&replacement.evidence_admitted===0,'REPLACEMENT_PROMOTION_BOUNDARY');
const profileIds=new Set(inputs.adapter.registered_source_profiles.map((t)=>t[1])),frontierIds=new Set(inputs.frontier.map((r)=>r.source_id));
for(const m of replacement.missions){assert(m.slots?.length===3&&m.rights_or_admission_created===false,'REPLACEMENT_MISSION_BOUNDARY');assert(m.rights_clear_registered_profile_count===m.eligible_registered_profile_count,'MISSION_RIGHTS_COUNT');for(const s of m.slots.filter((x)=>x.source_id)){assert(profileIds.has(s.source_id)&&frontierIds.has(s.source_id),'REPLACEMENT_PROFILE_SOURCE');assert(s.rights_eligibility_state===RIGHTS_CLEAR&&s.adapter_state==='ADAPTER_NOT_IMPLEMENTED'&&s.sold_or_liquidity_semantics_state==='UNVERIFIED'&&s.factual_origin_independence_state==='UNVERIFIED'&&s.evidence_admitted===false,'REPLACEMENT_PROFILE_STATE');}}
for(const b of replacement.adapter_development_backlog){assert(profileIds.has(b.source_id)&&frontierIds.has(b.source_id)&&b.required_next_steps?.length===7,'BACKLOG_PROFILE');assert(b.adapter_state==='ADAPTER_NOT_IMPLEMENTED'&&b.rights_eligibility_state===RIGHTS_CLEAR&&b.semantic_state==='UNVERIFIED'&&b.factual_origin_state==='UNVERIFIED'&&b.evidence_admitted===false,'BACKLOG_STATE');}
for(const q of replacement.rights_preflight_queue){const expected=rightsIndex.get(q.source_id);assert(profileIds.has(q.source_id)&&expected&&q.adapter_backlog_eligible===false&&q.rights_eligibility_state===expected.decision&&JSON.stringify(q.rights_eligibility_reason_codes)===JSON.stringify(expected.reason_codes)&&JSON.stringify(q.rights_evidence_refs)===JSON.stringify(expected.evidence_refs)&&expected.decision!==RIGHTS_CLEAR,'RIGHTS_QUEUE_STATE');}

assert(learning.id==='kidults-asi-resolution-learning-ledger-v1'&&learning.rule_count===1&&learning.learned_rules?.length===1,'LEARNING_COUNT');
const learned=learning.learned_rules[0];assert(learned.rule_id==='ARL-SEMANTIC-001'&&learned.observed_candidate_count===candidateIds.length&&learned.observed_grain_count===inputs.gate1.decisions.length&&learned.terminalized_action_count===inputs.actions.actions.length,'LEARNING_COUNTS');
assert(learned.false_rights_pass_created===0&&learned.evidence_admitted===0&&learned.silent_rewrite_allowed===false,'LEARNING_BOUNDARY');

assert(manifest.id==='kidults-asi-autonomous-resolution-manifest-v1'&&manifest.state==='P0_AUTONOMOUS_RESOLUTION_LAYER_EXECUTED','MANIFEST_ID_STATE');
assert(JSON.stringify(manifest.platform_principles)===JSON.stringify(principles)&&JSON.stringify(manifest.engine_order)===JSON.stringify(inputs.contract.engine_order),'MANIFEST_GOVERNANCE');
assert(manifest.results.current_candidate_count===candidateIds.length&&manifest.results.original_actions===inputs.actions.actions.length&&manifest.results.terminal_actions===inputs.actions.actions.length,'MANIFEST_ACTIONS');
assert(manifest.results.semantic_reject_actions===candidateIds.length&&manifest.results.superseded_actions===inputs.actions.actions.length-candidateIds.length,'MANIFEST_OUTCOMES');
assert(manifest.results.gate1_original_hold===inputs.gate1.decisions.length&&manifest.results.gate1_resolved_reject===inputs.gate1.decisions.length&&manifest.results.gate1_remaining_hold===0&&manifest.results.gate1_pass===0,'MANIFEST_GATE1');
assert(manifest.results.evidence_admission_candidates_rejected===inputs.admissions.candidates.length&&manifest.results.evidence_admitted===0&&manifest.results.market_events_created===0,'MANIFEST_ADMISSION');
assert(manifest.results.replacement_missions===missionIds.length&&manifest.results.live_network_requests===0&&manifest.results.collection_rights_created===0&&manifest.results.snapshot_candidates_created===0&&manifest.results.track_b_input_pairs_created===0,'MANIFEST_BOUNDARY');
assert(manifest.results.rights_clear_registered_profiles===replacement.rights_clear_registered_profile_count&&manifest.results.rights_hold_registered_profiles===replacement.rights_hold_registered_profile_count&&manifest.results.rights_preflight_queue_items===replacement.rights_preflight_queue_count,'MANIFEST_RIGHTS_COUNTS');
assert(manifest.results.rights_clear_gate==='RIGHTS_CLEAR_FOR_PURPOSE_REQUIRED_BEFORE_ADAPTER_BACKLOG_OR_REPLACEMENT_PROFILE_SELECTION','MANIFEST_RIGHTS_GATE');
assert(manifest.output_files?.length===10,'MANIFEST_OUTPUT_FILE_COUNT');
for(const o of manifest.output_files){assert(fs.existsSync(file(o.name)),`MANIFEST_OUTPUT_MISSING:${o.name}`);const raw=text(file(o.name));assert(o.sha256===hash(raw),`MANIFEST_OUTPUT_DIGEST:${o.name}`);assert(o.bytes===Buffer.byteLength(raw),`MANIFEST_OUTPUT_BYTES:${o.name}`);}
assert(manifest.public_release==='HOLD'&&manifest.production==='HOLD','MANIFEST_RELEASE_BOUNDARY');

console.log(JSON.stringify({
  id:'kidults-asi-autonomous-resolution-layer-validation-v1',version:'1.0.0',state:'VERIFIED_PASS',engine_count:7,
  current_candidates:candidateIds.length,original_actions:inputs.actions.actions.length,terminal_actions:actions.terminal_action_count,
  semantic_reject_actions:actions.resolved_rejected_count,superseded_actions:actions.superseded_count,
  gate1_reject:gate.reject_count,gate1_hold:gate.hold_count,gate1_pass:gate.pass_count,evidence_admitted:admission.admitted_count,
  replacement_missions:replacement.mission_count,replacement_missions_with_profiles:replacement.missions_with_profile_candidates,
  unique_registered_profiles_selected:replacement.unique_registered_profiles_selected,live_network_requests:0,collection_rights_created:0,
  public_release:'HOLD',production:'HOLD'
},null,2));
