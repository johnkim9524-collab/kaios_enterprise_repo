#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [candidatePath,bindingPath,gate1Path,admissionPath,actionPath,p2GraphPath,p2LineagePath,contractPath,outputDir] = process.argv.slice(2);
if (![candidatePath,bindingPath,gate1Path,admissionPath,actionPath,p2GraphPath,p2LineagePath,contractPath,outputDir].every(Boolean)) throw new Error('P1R2_ARGUMENTS_REQUIRED');
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const stableJson=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const hash=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const id=(prefix,v)=>`${prefix}::${crypto.createHash('sha256').update(stableJson(v)).digest('hex').slice(0,32)}`;
const uniq=v=>[...new Set((v||[]).filter(Boolean))].sort();
const countBy=(values,fn)=>{const m=new Map();for(const value of values){const key=fn(value);m.set(key,(m.get(key)||0)+1);}return Object.fromEntries([...m.entries()].sort(([a],[b])=>String(a).localeCompare(String(b))));};
const writeJson=async(name,value)=>{const text=stableJson(value);await fs.writeFile(path.join(outputDir,name),text);return{name,sha256:hash(text),bytes:Buffer.byteLength(text)};};

const candidates=await readJson(candidatePath);
const bindings=await readJson(bindingPath);
const gate1=await readJson(gate1Path);
const admissions=await readJson(admissionPath);
const actions=await readJson(actionPath);
const p2Graph=await readJson(p2GraphPath);
const p2Lineage=await readJson(p2LineagePath);
const contract=await readJson(contractPath);
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
if(candidates.id!==contract.input_contracts.candidate_registry_id||!Array.isArray(candidates.candidates)||candidates.candidates.length===0)throw new Error('P1R2_CANDIDATES_INVALID');
if(bindings.id!==contract.input_contracts.binding_ledger_id||bindings.mission_count!==192||bindings.bindings?.length!==192)throw new Error('P1R2_BINDINGS_INVALID');
if(gate1.id!==contract.input_contracts.gate1_id||gate1.decision_count!==gate1.decisions?.length)throw new Error('P1R2_GATE1_INVALID');
if(admissions.id!==contract.input_contracts.admission_candidate_id||admissions.candidate_count!==admissions.candidates?.length||admissions.admitted_count!==0)throw new Error('P1R2_ADMISSIONS_INVALID');
if(actions.id!==contract.input_contracts.action_queue_id||actions.action_count!==actions.actions?.length)throw new Error('P1R2_ACTIONS_INVALID');
if(p2Graph.id!==contract.input_contracts.p2_graph_id||p2Graph.evidence_admitted!==0||p2Graph.market_events_created!==0)throw new Error('P1R2_P2_GRAPH_INVALID');
if(p2Lineage.id!==contract.input_contracts.p2_lineage_id||p2Lineage.graph?.digest!==hash(stableJson(p2Graph)))throw new Error('P1R2_P2_LINEAGE_INVALID');
if(contract.id!=='kidults-asi-claim-suitability-replacement-contract-v2'||contract.version!=='2.0.0')throw new Error('P1R2_CONTRACT_INVALID');
if(JSON.stringify(contract.platform_principles)!==JSON.stringify(principles))throw new Error('P1R2_PRINCIPLES_INVALID');
if(contract.required_outputs?.length!==6||contract.engines?.length!==5)throw new Error('P1R2_ENGINE_OUTPUT_COUNT');
await fs.mkdir(outputDir,{recursive:true});

const candidateMap=new Map(candidates.candidates.map(c=>[c.candidate_id,c]));
const bindingMap=new Map(bindings.bindings.map(b=>[b.mission_id,b]));
const admissionMap=new Map(admissions.candidates.map(a=>[a.grain_id,a]));
const actionsByGrain=new Map();
for(const action of actions.actions){for(const grainId of action.impacted_grain_ids||[]){if(!actionsByGrain.has(grainId))actionsByGrain.set(grainId,[]);actionsByGrain.get(grainId).push(action);}}

const claimResolutions=gate1.decisions.map(decision=>{
  const candidate=candidateMap.get(decision.candidate_id);
  const binding=bindingMap.get(decision.mission_id);
  const admission=admissionMap.get(decision.grain_id);
  if(!candidate||!binding||!admission)throw new Error(`P1R2_LINK_MISSING:${decision.grain_id}`);
  if(!contract.supported_evidence_classes.includes(binding.evidence_class))throw new Error(`P1R2_EVIDENCE_CLASS:${binding.evidence_class}`);
  const linkedActions=actionsByGrain.get(decision.grain_id)||[];
  return{
    resolution_id:id('claim-suitability',{grain_id:decision.grain_id,candidate_id:decision.candidate_id,mission_id:decision.mission_id}),
    grain_id:decision.grain_id,
    candidate_id:decision.candidate_id,
    mission_id:decision.mission_id,
    scope_id:binding.scope_id,
    scope_name:binding.scope_name,
    domain:binding.domain,
    archetype:binding.archetype,
    region:binding.region,
    evidence_class:binding.evidence_class,
    canonical_endpoint:candidate.canonical_endpoint,
    canonical_host:candidate.canonical_host,
    observed_evidence_state:candidate.evidence_state,
    target_content_acquired:Boolean(candidate.target_content_acquired),
    original_gate1_decision:decision.decision,
    terminal_claim_suitability_decision:contract.terminal_decision.metadata_only_current_observation,
    terminal_state:'CURRENT_OBSERVATION_TERMINAL_NOT_CLAIM_SUITABLE',
    reason_codes:['DISCOVERY_METADATA_ONLY','NO_TERMINAL_SOLD_OR_EXPOSURE_OUTCOME_SEMANTICS','NO_PURPOSE_SPECIFIC_RIGHTS_EVIDENCE','NO_FACTUAL_ORIGIN_INDEPENDENCE_PROOF'],
    linked_action_count:linkedActions.length,
    linked_action_ids:linkedActions.map(a=>a.action_id).sort(),
    source_global_retired:false,
    source_role_retired:contract.terminal_decision.candidate_role_retirement,
    rejection_is_negative_market_fact:false,
    rejection_is_source_rights_deny:false,
    evidence_admitted:false,
    market_event_created:false,
    public_release:'HOLD',
    production:'HOLD'
  };
});

const claimLedger={
  id:'kidults-asi-claim-suitability-resolution-ledger-v2',version:'2.0.0',state:'CURRENT_OBSERVATIONS_TERMINALLY_RESOLVED_NOT_CLAIM_SUITABLE',
  platform_principles:principles,source_graph_digest:p2Lineage.graph.digest,resolution_count:claimResolutions.length,
  evidence_class_counts:countBy(claimResolutions,r=>r.evidence_class),decision_counts:countBy(claimResolutions,r=>r.terminal_claim_suitability_decision),
  resolutions:claimResolutions,evidence_admitted:0,market_events_created:0,public_release:'HOLD',production:'HOLD'
};

const gateDecisions=claimResolutions.map(r=>({
  terminal_decision_id:id('gate1-terminal',r.resolution_id),gate1_decision_id:gate1.decisions.find(d=>d.grain_id===r.grain_id).gate1_decision_id,
  grain_id:r.grain_id,candidate_id:r.candidate_id,mission_id:r.mission_id,original_decision:r.original_gate1_decision,
  terminal_decision:'REJECT',terminal_reason:'CURRENT_OBSERVATION_NOT_CLAIM_SUITABLE',candidate_may_reenter_with_new_evidence:true,
  collection_right_created:false,evidence_admitted:false,public_release:'HOLD',production:'HOLD'
}));
const gateTerminal={
  id:'kidults-asi-gate1-terminal-resolution-ledger-v2',version:'2.0.0',state:'ALL_CURRENT_METADATA_ONLY_GRAINS_TERMINALLY_RESOLVED',
  decision_count:gateDecisions.length,pass_count:0,hold_count:0,reject_count:gateDecisions.length,decisions:gateDecisions,
  gate1_pass_created:false,evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};

const resolutionsByCandidate=new Map();
for(const r of claimResolutions){if(!resolutionsByCandidate.has(r.candidate_id))resolutionsByCandidate.set(r.candidate_id,[]);resolutionsByCandidate.get(r.candidate_id).push(r);}
const retirements=[...resolutionsByCandidate.entries()].map(([candidateId,records])=>{
  const c=candidateMap.get(candidateId);
  return{
    retirement_id:id('candidate-role-retirement',candidateId),candidate_id:candidateId,canonical_endpoint:c.canonical_endpoint,canonical_host:c.canonical_host,
    state:'RETIRED_FROM_CURRENT_SOLD_AND_LIQUIDITY_EVIDENCE_ROLE',global_source_state:'RETAINED_AS_DISCOVERY_CONTEXT_CANDIDATE',
    impacted_grain_count:records.length,impacted_mission_ids:uniq(records.map(r=>r.mission_id)),evidence_classes:uniq(records.map(r=>r.evidence_class)),
    source_global_retired:false,rights_deny_inferred:false,negative_market_fact_created:false,replacement_required:true,
    public_release:'HOLD',production:'HOLD'
  };
}).sort((a,b)=>a.candidate_id.localeCompare(b.candidate_id));
const retirementLedger={
  id:'kidults-asi-candidate-role-retirement-ledger-v2',version:'2.0.0',state:'CLAIM_ROLE_RETIREMENT_COMPLETE',candidate_count:retirements.length,
  impacted_grain_count:claimResolutions.length,global_source_retirement_count:0,role_retirement_count:retirements.length,records:retirements,
  evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};

const missionRecords=bindings.bindings.map(binding=>{
  const requirement=contract.replacement_lane_requirements[binding.evidence_class];
  if(!requirement)throw new Error(`P1R2_REPLACEMENT_REQUIREMENT:${binding.evidence_class}`);
  const current=claimResolutions.filter(r=>r.mission_id===binding.mission_id);
  const slots=contract.required_slots.map((slot,index)=>({
    replacement_task_id:id('replacement-task',{mission_id:binding.mission_id,slot}),mission_id:binding.mission_id,slot,sequence:index+1,
    state:'QUEUED_CLAIM_SUITABLE_SOURCE_DISCOVERY_REQUIRED',scope_id:binding.scope_id,region:binding.region,evidence_class:binding.evidence_class,
    source_role:requirement.source_role,source_lane_class:requirement.source_lane_class,required_semantics:requirement.required_semantics,
    required_rights:requirement.required_rights,named_provider:null,source_candidate_id:null,source_admitted:false,target_host_egress_authorized:false,
    public_release:'HOLD',production:'HOLD'
  }));
  return{
    replacement_mission_id:id('replacement-mission',binding.mission_id),mission_id:binding.mission_id,market_cell_id:binding.market_cell_id,
    scope_id:binding.scope_id,scope_name:binding.scope_name,domain:binding.domain,archetype:binding.archetype,region:binding.region,evidence_class:binding.evidence_class,
    state:'READY_FOR_CLAIM_SUITABLE_REPLACEMENT_DISCOVERY',retired_current_grain_count:current.length,required_slot_count:slots.length,slots,
    public_release:'HOLD',production:'HOLD'
  };
}).sort((a,b)=>a.mission_id.localeCompare(b.mission_id));
const replacementTasks=missionRecords.flatMap(m=>m.slots);
const replacementQueue={
  id:'kidults-asi-replacement-mission-queue-v2',version:'2.0.0',state:'CLAIM_SUITABLE_REPLACEMENT_DISCOVERY_QUEUED',mission_count:missionRecords.length,
  replacement_task_count:replacementTasks.length,required_slots_per_mission:contract.required_slots.length,evidence_class_counts:countBy(missionRecords,m=>m.evidence_class),
  missions:missionRecords,named_provider_selected_count:0,source_admitted_count:0,target_host_egress_authorized:false,public_release:'HOLD',production:'HOLD'
};

const adapterRequirements=missionRecords.map(m=>{
  const requirement=contract.replacement_lane_requirements[m.evidence_class];
  return{
    adapter_requirement_id:id('adapter-requirement',{scope_id:m.scope_id,region:m.region,evidence_class:m.evidence_class}),
    state:'SOURCE_SPECIFIC_ADAPTER_REQUIRED_NOT_IMPLEMENTED',scope_id:m.scope_id,scope_name:m.scope_name,domain:m.domain,archetype:m.archetype,region:m.region,
    evidence_class:m.evidence_class,source_role:requirement.source_role,source_lane_class:requirement.source_lane_class,
    required_semantics:requirement.required_semantics,required_rights:requirement.required_rights,
    schema_version_required:true,field_purpose_rights_required:true,listing_as_sold_forbidden:true,temporal_coherence_required:true,
    source_owner_and_factual_origin_required:true,deterministic_duplicate_grain_required:true,fixture_pass_is_empirical_admission:false,
    named_provider:null,adapter_id:null,adapter_implemented:false,adapter_activated:false,empirical_evidence_admitted:false,
    public_release:'HOLD',production:'HOLD'
  };
});
const adapterQueue={
  id:'kidults-asi-adapter-requirement-queue-v2',version:'2.0.0',state:'SOURCE_SPECIFIC_ADAPTER_BACKLOG_COMPILED',requirement_count:adapterRequirements.length,
  evidence_class_counts:countBy(adapterRequirements,r=>r.evidence_class),domain_counts:countBy(adapterRequirements,r=>r.domain),requirements:adapterRequirements,
  adapters_implemented:0,adapters_activated:0,empirical_evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};

const outputs=[];
outputs.push(await writeJson('claim-suitability-resolution-ledger-v2.json',claimLedger));
outputs.push(await writeJson('gate1-terminal-resolution-ledger-v2.json',gateTerminal));
outputs.push(await writeJson('candidate-role-retirement-ledger-v2.json',retirementLedger));
outputs.push(await writeJson('replacement-mission-queue-v2.json',replacementQueue));
outputs.push(await writeJson('adapter-requirement-queue-v2.json',adapterQueue));
const manifest={
  id:'kidults-asi-claim-suitability-replacement-manifest-v2',version:'2.0.0',state:'CURRENT_METADATA_ONLY_GRAINS_RESOLVED_AND_REPLACEMENT_QUEUED',
  platform_principles:principles,input_bindings:{candidate_registry:{id:candidates.id,digest:hash(stableJson(candidates)),candidate_count:candidates.candidates.length},
  binding_ledger:{id:bindings.id,digest:hash(stableJson(bindings)),mission_count:bindings.mission_count},gate1:{id:gate1.id,digest:hash(stableJson(gate1)),decision_count:gate1.decision_count},
  admissions:{id:admissions.id,digest:hash(stableJson(admissions)),candidate_count:admissions.candidate_count},actions:{id:actions.id,digest:hash(stableJson(actions)),action_count:actions.action_count},
  p2_graph:{id:p2Graph.id,digest:p2Lineage.graph.digest,node_count:p2Graph.node_count,edge_count:p2Graph.edge_count},contract:{id:contract.id,version:contract.version,digest:hash(stableJson(contract))}},
  results:{current_grains_resolved:claimResolutions.length,terminal_reject_decisions:gateDecisions.length,terminal_hold_decisions:0,terminal_pass_decisions:0,
  candidates_role_retired:retirements.length,candidates_globally_retired:0,replacement_missions:missionRecords.length,replacement_tasks:replacementTasks.length,
  adapter_requirements:adapterRequirements.length,adapters_implemented:0,adapters_activated:0,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,target_host_egress_executed:false},
  output_files:outputs,autonomous_effect:'POSITIVE_ALL_CURRENT_METADATA_ONLY_GRAINS_TERMINALLY_RESOLVED_AND_REPLACEMENT_WORK_AUTOMATICALLY_COMPILED',
  global_effect:'POSITIVE_ALL_32_SCOPES_AND_3_REGIONS_RETAIN_REPLACEMENT_REQUIREMENTS',irreplaceable_value_effect:'POSITIVE_KIDULTS_OWNED_CLAIM_SUITABILITY_RETIREMENT_REPLACEMENT_AND_ADAPTER_REQUIREMENT_ASSETS',
  transparency_effect:'POSITIVE_REJECTION_SCOPE_AND_NON_CLAIM_BOUNDARIES_EXPLICIT',public_release:'HOLD',production:'HOLD'
};
outputs.push(await writeJson('claim-suitability-replacement-manifest-v2.json',manifest));
console.log(JSON.stringify({state:manifest.state,current_grains_resolved:manifest.results.current_grains_resolved,terminal_reject_decisions:manifest.results.terminal_reject_decisions,
replacement_missions:manifest.results.replacement_missions,replacement_tasks:manifest.results.replacement_tasks,adapter_requirements:manifest.results.adapter_requirements,
evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,public_release:'HOLD',production:'HOLD'},null,2));
