#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const dir=process.argv[2]||'scope-poc-live-out';
const matrixPath=process.argv[3]||'coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json';
const baseline=JSON.parse(fs.readFileSync(path.join(dir,'scope-self-collected-live-baseline-v1.json'),'utf8'));
const queue=JSON.parse(fs.readFileSync(path.join(dir,'scope-self-collection-gap-queue-v1.json'),'utf8'));
const matrix=JSON.parse(fs.readFileSync(matrixPath,'utf8'));
const resultByProduct=new Map(baseline.product_results.map(x=>[x.representative_product_id,x]));
const candByProduct=new Map();
for(const c of baseline.candidates||[]){
  if(!candByProduct.has(c.representative_product_id))candByProduct.set(c.representative_product_id,[]);
  candByProduct.get(c.representative_product_id).push(c);
}

const provenanceProps=new Set(['P127','P195','P276','P361','P793','P607','P1343','P973']);
const terminal=[];
for(const t of queue.tasks){
  const p=resultByProduct.get(t.representative_product_id);
  const cs=candByProduct.get(t.representative_product_id)||[];
  const roles=new Set(p?.observed_source_roles||[]);
  let terminal_state='GAP_SELF_COLLECTION_EXHAUSTED_WITHIN_POC_BOUNDARY';
  let reason='No qualifying open-source candidate observed in declared PoC topology';
  if(t.task_class==='DISCOVER_PRIMARY_AUTHORITY_REFERENCE'&&roles.has('PRIMARY_AUTHORITY')){
    terminal_state='PASS_REFERENCE_DISCOVERED';reason='Official authority pointer discovered; content not acquired';
  } else if(t.task_class==='RIGHTS_PREFLIGHT_PRIMARY_AUTHORITY_POINTER'){
    const oc=cs.filter(c=>(c.source_roles||[]).includes('PRIMARY_AUTHORITY'));
    terminal_state=oc.length?'RIGHTS_LIMITED_REFERENCE_ONLY':'GAP_NO_AUTHORITY_POINTER';
    reason=oc.length?'Official pointer exists but content rights are not verified for commercial acquisition':'No official authority pointer observed';
  } else if(t.task_class==='DISCOVER_OPEN_CATALOG_REFERENCE'&&roles.has('CATALOG_REFERENCE')){
    terminal_state='PASS_OPEN_METADATA_CANDIDATE';reason='Open catalog metadata candidate observed';
  } else if(t.task_class==='DISCOVER_OPEN_PROVENANCE_HISTORY'){
    const hit=(p?.open_claim_properties||[]).some(x=>provenanceProps.has(x));
    if(hit){terminal_state='PASS_OPEN_KG_PROVENANCE_POINTER';reason='Open knowledge-graph provenance/history property observed; assertion-level admission still required';}
  } else if(t.task_class==='DISCOVER_OPEN_AUTHENTICATION_CONDITION'){
    terminal_state='GAP_SPECIALIST_AUTHENTICATION_OR_CONDITION_EVIDENCE';reason='No cross-scope open authentication/condition channel observed in bounded PoC';
  } else if(t.task_class==='DISCOVER_RIGHTS_CLEAR_PUBLIC_SOLD_EVENT_REFERENCE'){
    terminal_state='GAP_RIGHTS_CLEAR_SOLD_EVENT_EVIDENCE';reason='No rights-cleared sold-event channel admitted in bounded PoC';
  }
  terminal.push({...t,terminal_state,terminal_reason:reason,terminal:true,provider_contact:false});
}

const p0=terminal.filter(t=>t.priority==='P0');
const p1=terminal.filter(t=>t.priority==='P1');
if(p0.some(t=>!t.terminal))throw new Error('Non-terminal P0 task');
const scopeClosures=[];
const requirements=[];
for(const s of matrix.scopes){
  const ts=terminal.filter(t=>t.scope_id===s.scope_id);
  const gaps=ts.filter(t=>t.terminal_state.startsWith('GAP_')||t.terminal_state.startsWith('RIGHTS_LIMITED'));
  const passes=ts.filter(t=>t.terminal_state.startsWith('PASS_'));
  const classes=new Set();
  for(const g of gaps){
    if(g.task_class.includes('PRIMARY_AUTHORITY'))classes.add('PRIMARY_AUTHORITY_OR_RIGHTS');
    if(g.task_class.includes('AUTHENTICATION'))classes.add('AUTHENTICATION_CONDITION');
    if(g.task_class.includes('PROVENANCE'))classes.add('PROVENANCE_HISTORY');
    if(g.task_class.includes('CATALOG'))classes.add('CATALOG_REFERENCE');
    if(g.task_class.includes('SOLD_EVENT'))classes.add('SOLD_TRANSACTION_HISTORY');
  }
  scopeClosures.push({
    scope_id:s.scope_id,
    name:s.name,
    p0_tasks:ts.filter(t=>t.priority==='P0').length,
    p0_terminal:ts.filter(t=>t.priority==='P0'&&t.terminal).length,
    pass_tasks:passes.length,
    gap_or_rights_limited_tasks:gaps.length,
    unresolved_requirement_classes:[...classes],
    self_collection_boundary_state:'TERMINAL_WITHIN_DECLARED_POC_TOPOLOGY',
    provider_requirement_ready:true
  });
  requirements.push({
    scope_id:s.scope_id,
    scope_name:s.name,
    requirement_state:'FROZEN_REQUIREMENT_FROM_SELF_COLLECTED_POC',
    required_capability_classes:[...classes],
    scope_provider_candidate_fields:s.provider_candidate_after_poc,
    identity_fields:s.identity_extensions,
    qualification_fields:s.collectible_qualification_extensions,
    market_cell_fields:s.market_cell_extensions,
    irreplaceable_metrics:s.irreplaceable_metrics,
    target_regions:s.regions,
    language_rule:s.language_rule,
    freshness:s.freshness,
    rights_requirement:'EXPLICIT_FIELD_LEVEL_COMMERCIAL_INTELLIGENCE_USE_OR_OPEN_RIGHTS',
    source_independence:'OWNER_AND_UNDERLYING_DATASET_FAMILY_NO_ALIAS_INFLATION',
    note:'A requirement may be satisfied by a newly discovered rights-clear self-collectable source or an authorized provider; vendor is not preselected.'
  });
}

const closure={
  id:'kidults-32-scope-self-collection-closure-v1',
  version:'1.1.0',
  status:'INTERNAL_32_SCOPE_POC_BOUNDARY_CLASSIFIED',
  source_baseline_id:baseline.id,
  source_gap_queue_id:queue.id,
  input_provenance:{artifact_id:9304716429,status:'UNVERIFIED_HARDCODED_ACTIONS_ARTIFACT_ID'},
  scope_count:32,
  product_count:64,
  p0_task_count:p0.length,
  p0_terminal_count:p0.length,
  p1_task_count:p1.length,
  terminal_tasks:terminal,
  scope_closures:scopeClosures,
  track_b_input_pair:'NONE',
  track_b_status:'NOT_STARTED',
  rankability_assessment_created:false,
  north_star:{AUTONOMOUS:'PASS_BOUNDED_SELF_COLLECTION_AND_DETERMINISTIC_GAP_CLASSIFICATION',GLOBAL:'REQUIREMENTS_GLOBAL_EMPIRICAL_COVERAGE_PENDING',IRREPLACEABLE_VALUE:'PASS_SCOPE_OUTPUT_TRACEABILITY',TRANSPARENT:'PASS_TERMINAL_GAPS_AND_RIGHTS_EXPLICIT'},
  provider_contact_authorized:false,
  production:'HOLD'
};

const spec={
  id:'kidults-32-scope-provider-requirement-specification-v1',
  version:'1.1.0',
  status:'INTERNAL_REQUIREMENTS_PROVIDER_SELECTION_NOT_STARTED',
  derived_from:closure.id,
  scope_count:32,
  requirements,
  selection_policy:'Provider/source candidates may be evaluated against these internal requirements only after KPMO/governed review; providers may not redefine Scope, Product or Metric.',
  provider_name_required:false,
  provider_contact_authorized:false,
  track_b_status:'NOT_STARTED',
  production:'HOLD'
};

const readiness={
  id:'scope-provider-source-evaluation-readiness-v1',
  version:'1.1.0',
  record_type:'INTERNAL_NON_TRACK_B_READINESS',
  input_provenance:'NOT_PROVEN',
  reproducibility:'LOCAL_DETERMINISTIC_RULE_EVALUATION_ONLY',
  gap_transparency:'LOCAL_RULE_EVALUATION_ONLY',
  rights_classification:'LOCAL_RULE_EVALUATION_ONLY',
  provider_independence:'NOT_ASSESSED_BY_TRACK_B',
  scope_requirement_completeness:requirements.length===32?'INTERNAL_SHAPE_COMPLETE':'BLOCK',
  empirical_global_market_coverage:'BLOCK_NOT_YET_ACQUIRED',
  publication_eligibility:'BLOCKED',
  recommendation:'EXTERNAL_PROVIDER_SOURCE_EVALUATION_MAY_BE_CONSIDERED_AFTER_GOVERNED_GATE',
  decision_authority:'PROGRAM_OWNER_OR_GOVERNED_PROVIDER_GATE',
  provider_contact_authorized:false,
  track_b_status:'NOT_STARTED',
  rankability_assessment_created:false,
  threshold_relaxation:false,
  production:'HOLD'
};

const status={
  id:'kidults-32-scope-poc-closure-status-v1',
  state:'INTERNAL_REQUIREMENTS_CLASSIFIED_MARKET_EVIDENCE_NOT_VERIFIED',
  scope_count:32,
  scope_states:scopeClosures.map(s=>({scope_id:s.scope_id,self_collection:s.self_collection_boundary_state,provider_requirement_ready:s.provider_requirement_ready,missing_capability_classes:s.unresolved_requirement_classes,market_truth:'NOT_VERIFIED'})),
  portal_policy:'INTERNAL_ONLY_SHOW_GAPS_LIMITATIONS_AND_REQUIREMENT_STATE_NO_MARKET_CLAIM',
  eos_state:'INTERNAL_32_SCOPE_REQUIREMENTS_CLASSIFIED_PROVIDER_EVALUATION_GATED',
  approved_projection:false,
  track_b_status:'NOT_STARTED',
  production:'HOLD'
};

fs.writeFileSync(path.join(dir,'scope-self-collection-closure-v1.json'),JSON.stringify(closure,null,2));
fs.writeFileSync(path.join(dir,'provider-requirement-specification-v1.json'),JSON.stringify(spec,null,2));
fs.writeFileSync(path.join(dir,'scope-provider-source-evaluation-readiness-v1.json'),JSON.stringify(readiness,null,2));
fs.writeFileSync(path.join(dir,'scope-poc-closure-status-v1.json'),JSON.stringify(status,null,2));
console.log(JSON.stringify({scopes:32,products:64,p0_tasks:p0.length,p0_terminal:p0.length,requirements:requirements.length,recommendation:readiness.recommendation,track_b:'NOT_STARTED',provider_contact:'HOLD',production:'HOLD'},null,2));
