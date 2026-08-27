#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const closureDir=process.argv[2]||'closure';
const wave1Dir=process.argv[3]||'wave1';
const wave2Dir=process.argv[4]||'wave2';
const outDir=process.argv[5]||'coverage-v2-out';
fs.mkdirSync(outDir,{recursive:true});

const spec=JSON.parse(fs.readFileSync(path.join(closureDir,'provider-requirement-specification-v1.json'),'utf8'));
const w1=JSON.parse(fs.readFileSync(path.join(wave1Dir,'open-channel-expansion-wave1.json'),'utf8'));
const w2=JSON.parse(fs.readFileSync(path.join(wave2Dir,'open-channel-expansion-wave2.json'),'utf8'));
const clearStates=new Set(['CC0_COLLECTION_DATASET_METADATA','CORE_DATA_CC0_ONLY','ARTWORK_API_DATA_CC0_SUBJECT_TO_TERMS']);
const all=[...(w1.candidates||[]),...(w2.candidates||[])];
function clear(c){return clearStates.has(c.rights_state)}
function roleCoverage(scope,role){const rs=all.filter(c=>c.scope_id===scope&&clear(c)&&(c.roles||[]).includes(role));return {count:rs.length,families:[...new Set(rs.map(x=>x.source_family))],products:[...new Set(rs.map(x=>x.representative_product_id))]}}

const scopes=[];
for(const r of spec.requirements){
  const cat=roleCoverage(r.scope_id,'CATALOG_REFERENCE');
  const prov=roleCoverage(r.scope_id,'PROVENANCE_HISTORY');
  const auth=roleCoverage(r.scope_id,'AUTHENTICATION_CONDITION');
  const sold=roleCoverage(r.scope_id,'SOLD_TRANSACTION');
  const classes=[];
  for(const cap of r.required_capability_classes){
    let state='EXTERNAL_OR_SCOPE_SPECIFIC_CAPABILITY_REQUIRED',evidence={};
    if(cap==='CATALOG_REFERENCE'){evidence=cat;state=cat.count>0?'SELF_COLLECTABLE_PASS':'NO_RIGHTS_CLEAR_SOURCE_FOUND_IN_WAVES_0_2'}
    else if(cap==='PROVENANCE_HISTORY'){evidence=prov;state=prov.count>0?'SELF_COLLECTABLE_PASS':'NO_RIGHTS_CLEAR_SOURCE_FOUND_IN_WAVES_0_2'}
    else if(cap==='AUTHENTICATION_CONDITION'){evidence=auth;state=auth.count>0?'SELF_COLLECTABLE_PASS':'EXTERNAL_CAPABILITY_REQUIRED'}
    else if(cap==='SOLD_TRANSACTION_HISTORY'){evidence=sold;state=sold.count>0?'SELF_COLLECTABLE_PASS':'EXTERNAL_CAPABILITY_REQUIRED'}
    else if(cap==='PRIMARY_AUTHORITY_OR_RIGHTS'){state='SCOPE_SPECIFIC_AUTHORITY_RIGHTS_PREFLIGHT_REQUIRED'}
    classes.push({capability_class:cap,state,evidence});
  }
  scopes.push({
    scope_id:r.scope_id,
    scope_name:r.scope_name,
    capability_classes:classes,
    self_collectable_pass_classes:classes.filter(x=>x.state==='SELF_COLLECTABLE_PASS').map(x=>x.capability_class),
    external_capability_required_classes:classes.filter(x=>x.state==='EXTERNAL_CAPABILITY_REQUIRED').map(x=>x.capability_class),
    scope_specific_remaining_classes:classes.filter(x=>x.state.includes('SCOPE_SPECIFIC')||x.state.includes('NO_RIGHTS_CLEAR')).map(x=>x.capability_class)
  });
}

const summary={
  scope_count:scopes.length,
  total_candidates:all.length,
  rights_clear_candidates:all.filter(clear).length,
  scopes_with_any_rights_clear:new Set(all.filter(clear).map(x=>x.scope_id)).size,
  catalog_pass_scopes:scopes.filter(s=>s.self_collectable_pass_classes.includes('CATALOG_REFERENCE')).length,
  provenance_pass_scopes:scopes.filter(s=>s.self_collectable_pass_classes.includes('PROVENANCE_HISTORY')).length,
  authentication_external_scopes:scopes.filter(s=>s.external_capability_required_classes.includes('AUTHENTICATION_CONDITION')).length,
  sold_transaction_external_scopes:scopes.filter(s=>s.external_capability_required_classes.includes('SOLD_TRANSACTION_HISTORY')).length
};

const inputRefs={
  closure_artifact:9304814238,
  wave1_artifact:9304988483,
  wave2_artifact:9305092664,
  provenance_status:'UNVERIFIED_HARDCODED_ACTIONS_ARTIFACT_IDS'
};
const recommendation=(summary.authentication_external_scopes===32&&summary.sold_transaction_external_scopes===32)
  ? 'EXTERNAL_CAPABILITY_EVALUATION_RECOMMENDED_FOR_AUTHENTICATION_AND_SOLD_TRANSACTION_ONLY'
  : 'HOLD';

const output={
  id:'kidults-self-collectable-coverage-classification-v2',
  version:'2.1.0',
  status:'INTERNAL_SCOPE_CAPABILITY_CLASSIFICATION_READY',
  inputs:inputRefs,
  summary,
  scopes,
  provider_only_rule:'Only capability classes with repeated rights-clear self-collection exhaustion and no admitted self-collectable role may be recommended for separately governed external capability evaluation. Vendor selection and authorization are separate.',
  provider_contact_authorized:false,
  track_b_input_pair:'NONE',
  track_b_status:'NOT_STARTED',
  rankability_assessment_created:false,
  production:'HOLD'
};

const readiness={
  id:'scope-capability-evaluation-readiness-v2',
  version:'2.1.0',
  record_type:'INTERNAL_NON_TRACK_B_READINESS',
  input_provenance:'NOT_PROVEN',
  rights_classification:'LOCAL_RULE_EVALUATION_ONLY',
  source_role_integrity:'LOCAL_RULE_EVALUATION_ONLY',
  provider_independence:'NOT_ASSESSED_BY_TRACK_B',
  threshold_relaxation:false,
  recommendation,
  decision_authority:'PROGRAM_OWNER_OR_GOVERNED_PROVIDER_GATE',
  provider_contact_authorized:false,
  track_b_status:'NOT_STARTED',
  rankability_assessment_created:false,
  publication_eligibility:'BLOCKED',
  production:'HOLD'
};

const status={
  id:'kidults-self-collectable-coverage-status-v2',
  scope_count:32,
  state:'INTERNAL_SCOPE_CAPABILITY_CLASSIFICATION_ONLY',
  summary,
  recommendation,
  approved_projection:false,
  track_b_status:'NOT_STARTED',
  provider_contact:'HOLD_PROGRAM_OWNER_AUTHORIZATION',
  production:'HOLD'
};

fs.writeFileSync(path.join(outDir,'self-collectable-coverage-classification-v2.json'),JSON.stringify(output,null,2));
fs.writeFileSync(path.join(outDir,'scope-capability-evaluation-readiness-v2.json'),JSON.stringify(readiness,null,2));
fs.writeFileSync(path.join(outDir,'self-collectable-coverage-status-v2.json'),JSON.stringify(status,null,2));
console.log(JSON.stringify({status:output.status,...summary,recommendation,track_b:'NOT_STARTED',provider_contact:'HOLD',production:'HOLD'},null,2));
