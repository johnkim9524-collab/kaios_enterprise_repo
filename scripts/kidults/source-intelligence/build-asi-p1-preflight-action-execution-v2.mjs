#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [candidatePath,bindingPath,gate1Path,admissionPath,actionPath,adapterContractPath,contractPath,outputDir] = process.argv.slice(2);
if (![candidatePath,bindingPath,gate1Path,admissionPath,actionPath,adapterContractPath,contractPath,outputDir].every(Boolean)) throw new Error('P1_ACTION_EXECUTION_ARGUMENTS_REQUIRED');

const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const stableJson=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const hash=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const short=(prefix,v)=>`${prefix}_${crypto.createHash('sha256').update(String(v)).digest('hex').slice(0,32)}`;
const uniq=v=>[...new Set((v||[]).filter(Boolean))].sort();
const countBy=(xs,fn)=>Object.fromEntries([...xs.reduce((m,x)=>m.set(fn(x),(m.get(fn(x))||0)+1),new Map()).entries()].sort(([a],[b])=>String(a).localeCompare(String(b))));

const candidates=await readJson(candidatePath);
const bindings=await readJson(bindingPath);
const gate1=await readJson(gate1Path);
const admissions=await readJson(admissionPath);
const actions=await readJson(actionPath);
const adapter=await readJson(adapterContractPath);
const contract=await readJson(contractPath);
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];

if(candidates.id!==contract.input_ids.candidate_registry||!Array.isArray(candidates.candidates)||candidates.candidates.length<1) throw new Error('P0B_CANDIDATES_INVALID');
if(bindings.id!==contract.input_ids.binding_ledger||bindings.mission_count!==192||bindings.bindings?.length!==192) throw new Error('P0B_BINDINGS_INVALID');
if(gate1.id!==contract.input_ids.gate1||!Array.isArray(gate1.decisions)) throw new Error('P1_GATE1_INVALID');
if(admissions.id!==contract.input_ids.admission||!Array.isArray(admissions.candidates)) throw new Error('P1_ADMISSION_INVALID');
if(actions.id!==contract.input_ids.action_queue||!Array.isArray(actions.actions)) throw new Error('P1_ACTION_QUEUE_INVALID');
if(adapter.id!=='kidults-asi-p1-market-event-adapter-runtime-contract-v1'||adapter.registered_source_profiles?.length!==16) throw new Error('ADAPTER_CONTRACT_INVALID');
if(contract.id!=='kidults-asi-p1-preflight-action-execution-contract-v2'||contract.version!=='2.0.0') throw new Error('P1_ACTION_CONTRACT_INVALID');
if(JSON.stringify(contract.platform_principles)!==JSON.stringify(principles)) throw new Error('P1_ACTION_PRINCIPLE_ORDER_INVALID');
if(contract.truth_boundary?.admits_evidence!==false||contract.truth_boundary?.creates_market_event!==false||contract.truth_boundary?.creates_snapshot_candidate!==false) throw new Error('P1_ACTION_BOUNDARY_INVALID');

await fs.mkdir(outputDir,{recursive:true});
const candidateById=new Map(candidates.candidates.map(c=>[c.candidate_id,c]));
const actionCandidateIds=uniq(actions.actions.map(a=>a.candidate_id));
if(actions.action_count!==actions.actions.length) throw new Error('P1_ACTION_COUNT_INVALID');
if(actions.actions.length!==actionCandidateIds.length*contract.required_action_types.length) throw new Error('P1_ACTION_CARDINALITY_INVALID');
for(const id of actionCandidateIds) if(!candidateById.has(id)) throw new Error(`ACTION_CANDIDATE_MISSING:${id}`);
const actionTypes=uniq(actions.actions.map(a=>a.action_type));
if(JSON.stringify(actionTypes)!==JSON.stringify([...contract.required_action_types].sort())) throw new Error('P1_ACTION_TYPE_SET_INVALID');

function classifyCandidate(c){
  const providers=new Set(c.discovery_providers||[]);
  const channels=new Set(c.discovery_channels||[]);
  if(providers.has('OPENALEX_PUBLIC_WORK_AND_SOURCE_METADATA')||channels.has('OPEN_RESEARCH_AND_REPOSITORY_METADATA')) return {
    source_class:'RESEARCH_OR_PUBLICATION_METADATA',
    terminal:true,
    reason_code:'RESEARCH_OR_PUBLICATION_METADATA_NOT_MARKET_EVENT_SOURCE',
    factual_origin_state:'PUBLICATION_OR_REPOSITORY_RECORD_NOT_TRANSACTION_OR_EXPOSURE_ORIGIN',
    semantic_state:'REJECTED_NO_TERMINAL_SOLD_OR_EXPOSURE_SURFACE'
  };
  if(providers.has('GDELT_PUBLIC_DOMAIN_MENTION_METADATA')||channels.has('GLOBAL_EVENT_AND_DOMAIN_MENTION_INDEX')) return {
    source_class:'NEWS_OR_PRESS_MENTION_METADATA',
    terminal:true,
    reason_code:'NEWS_OR_PRESS_MENTION_NOT_TERMINAL_MARKET_RESULT',
    factual_origin_state:'MENTION_INDEX_NOT_TRANSACTION_OR_EXPOSURE_ORIGIN',
    semantic_state:'REJECTED_NO_TERMINAL_SOLD_OR_EXPOSURE_SURFACE'
  };
  return {
    source_class:'UNRESOLVED_SOURCE_CLASS',
    terminal:false,
    reason_code:'SOURCE_CLASS_REQUIRES_ADDITIONAL_PREFLIGHT',
    factual_origin_state:'UNKNOWN',
    semantic_state:'HOLD_UNVERIFIED'
  };
}

const dispositions=[];
for(const candidateId of actionCandidateIds){
  const c=candidateById.get(candidateId);
  const classification=classifyCandidate(c);
  dispositions.push({
    disposition_id:short('source_disposition',candidateId),
    candidate_id:candidateId,
    canonical_endpoint:c.canonical_endpoint,
    canonical_host:c.canonical_host,
    source_class:classification.source_class,
    state:classification.terminal?'TERMINAL_REJECTED_SOURCE_ROLE_MISMATCH':'HOLD_REQUIRES_ADDITIONAL_PREFLIGHT',
    terminal:classification.terminal,
    reason_codes:[classification.reason_code],
    semantic_state:classification.semantic_state,
    owner_state:'SOURCE_OWNER_NOT_REQUIRED_FOR_ADMISSION_AFTER_TERMINAL_SEMANTIC_REJECT',
    factual_origin_state:classification.factual_origin_state,
    rights_state:'NOT_ADJUDICATED_NO_COLLECTION_REQUEST_AFTER_TERMINAL_SEMANTIC_REJECT',
    technical_access_state:'NOT_PROBED_NO_TARGET_REQUEST_REQUIRED_AFTER_TERMINAL_SEMANTIC_REJECT',
    regional_relevance_state:'NOT_PROVEN_AND_NOT_USED_AFTER_TERMINAL_SEMANTIC_REJECT',
    schema_state:'NO_MARKET_EVENT_OR_EXPOSURE_SCHEMA_SURFACE',
    independence_state:'NOT_PROVEN_AND_NOT_REQUIRED_FOR_REJECTED_CANDIDATE',
    discovery_providers:c.discovery_providers,
    discovery_channels:c.discovery_channels,
    evidence_refs:[`candidate:${candidateId}`,`candidate_registry:${candidates.id}`,`candidate_registry_digest:${hash(stableJson(candidates))}`],
    collection_authorized:false,
    evidence_admitted:false,
    market_claim_authorized:false,
    public_release:'HOLD',
    production:'HOLD'
  });
}
const dispositionByCandidate=new Map(dispositions.map(d=>[d.candidate_id,d]));
const unresolvedDispositions=dispositions.filter(d=>!d.terminal);
if(unresolvedDispositions.length>0) throw new Error(`CURRENT_ACTION_CANDIDATES_NOT_TERMINALLY_CLASSIFIABLE:${unresolvedDispositions.length}`);

const executedActions=actions.actions.map(a=>{
  const d=dispositionByCandidate.get(a.candidate_id);
  const isSemantic=a.action_type==='MARKET_SEMANTIC_AND_SOURCE_ROLE_VERIFICATION';
  const decision=isSemantic?'REJECT':'NOT_APPLICABLE_AFTER_TERMINAL_SEMANTIC_REJECT';
  return {
    execution_id:short('action_execution',a.action_id),
    action_id:a.action_id,
    action_type:a.action_type,
    sequence:a.sequence,
    candidate_id:a.candidate_id,
    canonical_endpoint:a.canonical_endpoint,
    canonical_host:a.canonical_host,
    impacted_grain_ids:a.impacted_grain_ids,
    impacted_mission_ids:a.impacted_mission_ids,
    state:'EXECUTED_TERMINAL',
    decision,
    terminal:true,
    source_class:d.source_class,
    reason_codes:isSemantic?d.reason_codes:['TERMINAL_SEMANTIC_REJECTION_MAKES_ACTION_NON_APPLICABLE',...d.reason_codes],
    output:{
      expected_output:a.expected_output,
      observed_state:isSemantic?d.semantic_state:'NOT_APPLICABLE_AFTER_TERMINAL_SEMANTIC_REJECT',
      rights_state:d.rights_state,
      factual_origin_state:d.factual_origin_state,
      network_probe_executed:false
    },
    evidence_refs:d.evidence_refs,
    network_probe_authorized:false,
    network_probe_executed:false,
    collection_authorized:false,
    evidence_admitted:false,
    public_release:'HOLD',
    production:'HOLD'
  };
});

const actionLedger={
  id:'kidults-asi-p1-preflight-action-execution-ledger-v2',version:'2.0.0',state:'ALL_CURRENT_ACTIONS_TERMINALLY_RESOLVED',
  platform_principles:principles,input_action_queue_digest:hash(stableJson(actions)),action_count:executedActions.length,
  terminal_action_count:executedActions.filter(a=>a.terminal).length,executed_reject_count:executedActions.filter(a=>a.decision==='REJECT').length,
  executed_not_applicable_count:executedActions.filter(a=>a.decision==='NOT_APPLICABLE_AFTER_TERMINAL_SEMANTIC_REJECT').length,
  queued_action_count:0,network_probe_count:0,action_type_counts:countBy(executedActions,a=>a.action_type),actions:executedActions,
  evidence_admitted:0,market_events_created:0,public_release:'HOLD',production:'HOLD'
};

const dispositionLedger={
  id:'kidults-asi-p1-source-disposition-ledger-v2',version:'2.0.0',state:'CURRENT_BOUND_CANDIDATES_TERMINALLY_DISPOSITIONED',
  candidate_count:dispositions.length,rejected_candidate_count:dispositions.filter(d=>d.terminal).length,hold_candidate_count:0,
  source_class_counts:countBy(dispositions,d=>d.source_class),dispositions,evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};

const gate1v2Decisions=gate1.decisions.map(d=>{
  const disposition=dispositionByCandidate.get(d.candidate_id);
  if(!disposition) throw new Error(`GATE1_DISPOSITION_MISSING:${d.candidate_id}`);
  return {
    ...d,
    decision:'REJECT',
    classification_state:'REJECTED_NON_MARKET_SOURCE_ROLE',
    qualification_state:'TERMINAL_NOT_APPLICABLE',
    rights_state:'NOT_ADJUDICATED_TERMINAL_SEMANTIC_REJECT',
    target_site_probe_executed:false,
    passed_requirements:['CANONICAL_SOURCE_IDENTITY_PASS','NO_PROVIDER_DIRECT_PATH'],
    unresolved_requirements:[],
    reason_codes:[],
    rejection_reasons:[...disposition.reason_codes,'REQUIRED_EVIDENCE_CLASS_NOT_OBSERVABLE_FROM_CANDIDATE_SOURCE_CLASS'],
    collection_authorized:false,
    evidence_admitted:false,
    market_claim_authorized:false
  };
});
const gate1v2={
  id:'kidults-asi-p1-gate1-source-safety-decisions-v2',version:'2.0.0',state:'CURRENT_GRAINS_TERMINALLY_REJECTED_SOURCE_ROLE_MISMATCH',
  input_gate1_digest:hash(stableJson(gate1)),decision_count:gate1v2Decisions.length,pass_count:0,hold_count:0,reject_count:gate1v2Decisions.length,
  decisions:gate1v2Decisions,metadata_hint_pass_count:0,evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};

const admissionV2Candidates=admissions.candidates.map(a=>{
  const disposition=dispositionByCandidate.get(a.candidate_id);
  if(!disposition) throw new Error(`ADMISSION_DISPOSITION_MISSING:${a.candidate_id}`);
  return {
    ...a,
    state:'REJECTED_GATE1_SOURCE_ROLE_MISMATCH',
    gate1_decision:'REJECT',
    rights_state:'NOT_ADJUDICATED_TERMINAL_SEMANTIC_REJECT',
    required_next_actions:[],
    rejection_reasons:[...disposition.reason_codes,'REPLACEMENT_SOURCE_REQUIRED'],
    collection_authorized:false,
    evidence_admitted:false,
    admitted_evidence_id:null,
    market_claim_authorized:false
  };
});
const admissionV2={
  id:'kidults-asi-p1-evidence-admission-candidate-register-v2',version:'2.0.0',state:'CURRENT_ADMISSION_CANDIDATES_REJECTED_REPLACEMENT_REQUIRED',
  input_admission_digest:hash(stableJson(admissions)),candidate_count:admissionV2Candidates.length,ready_count:0,rejected_count:admissionV2Candidates.length,admitted_count:0,
  candidates:admissionV2Candidates,public_release:'HOLD',production:'HOLD'
};

const profiles=adapter.registered_source_profiles.map(([rank,sourceId,verifiedAssignmentCount,targetClaims])=>({
  rank,source_id:sourceId,verified_assignment_count:verifiedAssignmentCount,target_claims:targetClaims,
  state:'ADAPTER_NOT_IMPLEMENTED',rights_state:'UNVERIFIED',semantics_state:'UNVERIFIED',schema_state:'UNVERIFIED',activation_state:'NOT_ACTIVATED',
  registered_profile_is_rights_verification:false,registered_profile_is_implemented_adapter:false,evidence_admitted:false,
  public_release:'HOLD',production:'HOLD'
}));
const claimForEvidenceClass=evidenceClass=>evidenceClass==='CURRENT_SOLD_TRANSACTION'?'DATED_OBSERVED_SOLD_TRANSACTION':'LIQUIDITY_OR_TIME_TO_SALE';
const replacementDemands=bindings.bindings.map(b=>{
  const rejected=uniq((b.slot_bindings||[]).map(s=>s.candidate_id).filter(id=>dispositionByCandidate.get(id)?.terminal));
  if(rejected.length!==b.slot_bindings.length) throw new Error(`MISSION_NOT_FULLY_TERMINAL:${b.mission_id}`);
  const targetClaim=claimForEvidenceClass(b.evidence_class);
  const compatible=profiles.filter(p=>p.target_claims.includes(targetClaim));
  return {
    demand_id:short('replacement_demand',b.mission_id),mission_id:b.mission_id,market_cell_id:b.market_cell_id,scope_id:b.scope_id,scope_name:b.scope_name,
    domain:b.domain,region:b.region,evidence_class:b.evidence_class,target_claim:targetClaim,state:'REPLACEMENT_SOURCE_PROFILE_REQUIRED',
    rejected_candidate_ids:rejected,rejected_candidate_count:rejected.length,current_candidate_slots_valid:0,
    compatible_registered_profile_ids:compatible.map(p=>p.source_id),profile_scope_compatibility_state:'REQUIRES_REGISTERED_FRONTIER_CROSSWALK_AND_SOURCE_SPECIFIC_PREFLIGHT',
    required_next_actions:['SELECT_SCOPE_COMPATIBLE_REGISTERED_PROFILE','IMPLEMENT_SOURCE_SPECIFIC_ADAPTER','VERIFY_FIELD_PURPOSE_RIGHTS','VERIFY_SOLD_OR_EXPOSURE_SEMANTICS','VERIFY_SCHEMA_AND_DRIFT_CONTROL','RUN_GATE1_GATE2_GATE3','EMIT_MARKET_EVENT_ADMISSION_RECEIPT'],
    evidence_admitted:false,public_release:'HOLD',production:'HOLD'
  };
});
const replacementPackage={
  id:'kidults-asi-p1-replacement-source-demand-v2',version:'2.0.0',state:'ALL_CURRENT_MISSIONS_REQUIRE_REPLACEMENT_SOURCE_PROFILES',
  mission_count:replacementDemands.length,replacement_required_mission_count:replacementDemands.length,rejected_candidate_slot_count:replacementDemands.reduce((n,d)=>n+d.rejected_candidate_count,0),
  registered_profile_count:profiles.length,demands:replacementDemands,evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};

const profileActions=[];
let seq=1;
for(const p of profiles){
  for(const actionType of contract.required_action_types){
    profileActions.push({
      profile_action_id:short('profile_action',`${p.source_id}::${actionType}`),sequence:seq++,source_id:p.source_id,priority_rank:p.rank,
      verified_assignment_count:p.verified_assignment_count,target_claims:p.target_claims,action_type:actionType,state:'QUEUED_SOURCE_SPECIFIC_PREFLIGHT',
      required_evidence_class:actionType==='PURPOSE_SPECIFIC_RIGHTS_AND_TERMS_PREFLIGHT'?'FIELD_PURPOSE_RIGHTS_EVIDENCE':'SOURCE_SPECIFIC_PREFLIGHT_EVIDENCE',
      network_probe_authorized:false,adapter_implemented:false,adapter_activated:false,evidence_admitted:false,public_release:'HOLD',production:'HOLD'
    });
  }
}
const profileQueue={
  id:'kidults-asi-p1-source-profile-adapter-queue-v2',version:'2.0.0',state:'REAL_MARKET_SOURCE_PROFILE_WORK_QUEUED',
  profile_count:profiles.length,action_count:profileActions.length,profiles,actions:profileActions,
  source_specific_adapters_implemented:0,source_specific_adapters_activated:0,evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};

const outputs=[];
async function write(name,value){const content=stableJson(value);await fs.writeFile(path.join(outputDir,name),content);outputs.push({name,sha256:hash(content),bytes:Buffer.byteLength(content)});}
await write('p1-preflight-action-execution-ledger-v2.json',actionLedger);
await write('p1-source-disposition-ledger-v2.json',dispositionLedger);
await write('p1-gate1-source-safety-decisions-v2.json',gate1v2);
await write('p1-evidence-admission-candidate-register-v2.json',admissionV2);
await write('p1-replacement-source-demand-v2.json',replacementPackage);
await write('p1-source-profile-adapter-queue-v2.json',profileQueue);
const manifest={
  id:'kidults-asi-p1-preflight-action-execution-manifest-v2',version:'2.0.0',state:'P1_CURRENT_ACTION_BACKLOG_TERMINALLY_RESOLVED_REPLACEMENT_QUEUED',
  platform_principles:principles,input_bindings:{
    candidate_registry:{id:candidates.id,digest:hash(stableJson(candidates)),candidate_count:candidates.canonical_candidate_count},
    binding_ledger:{id:bindings.id,digest:hash(stableJson(bindings)),mission_count:bindings.mission_count},
    gate1:{id:gate1.id,digest:hash(stableJson(gate1)),decision_count:gate1.decision_count},
    admission:{id:admissions.id,digest:hash(stableJson(admissions)),candidate_count:admissions.candidate_count},
    action_queue:{id:actions.id,digest:hash(stableJson(actions)),action_count:actions.action_count},
    adapter_contract:{id:adapter.id,digest:hash(stableJson(adapter)),registered_source_profiles:profiles.length}
  },
  results:{
    actions_received:actions.actions.length,actions_terminally_resolved:executedActions.length,actions_remaining_queued:0,
    current_action_candidates:dispositions.length,current_candidates_rejected:dispositions.length,
    gate1_reject:gate1v2.reject_count,gate1_hold:0,gate1_pass:0,
    admission_candidates_rejected:admissionV2.rejected_count,evidence_admitted:0,
    missions_requiring_replacement:replacementPackage.replacement_required_mission_count,
    rejected_candidate_slots:replacementPackage.rejected_candidate_slot_count,
    registered_market_source_profiles:profiles.length,source_profile_actions_queued:profileActions.length,
    source_specific_adapters_implemented:0,source_specific_adapters_activated:0,market_events_created:0,snapshot_candidates_created:0
  },
  output_files:outputs,
  autonomous_effect:'POSITIVE_TERMINAL_ACTION_EXECUTION_AND_AUTOMATIC_REPLACEMENT_ROUTING',
  global_effect:'POSITIVE_ALL_192_CURRENT_SOLD_AND_LIQUIDITY_MISSIONS_RETAINED_WITHOUT_FALSE_COVERAGE',
  irreplaceable_value_effect:'POSITIVE_KIDULTS_OWNED_DISPOSITION_REPLACEMENT_AND_ADAPTER_WORK_GRAPH',
  transparency_effect:'POSITIVE_672_ACTIONS_AND_576_GRAINS_RESOLVED_WITH_EXACT_REJECTION_REASONS',
  evidence_admitted:0,market_events_created:0,public_release:'HOLD',production:'HOLD'
};
await fs.writeFile(path.join(outputDir,'p1-preflight-action-execution-manifest-v2.json'),stableJson(manifest));
console.log(JSON.stringify({state:manifest.state,...manifest.results,output_dir:outputDir,public_release:'HOLD',production:'HOLD'},null,2));
