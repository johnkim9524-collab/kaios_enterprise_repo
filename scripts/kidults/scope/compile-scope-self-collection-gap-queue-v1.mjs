import fs from 'node:fs';
import path from 'node:path';
const dir=process.argv[2]||'scope-poc-live-out';
const matrixPath=process.argv[3]||'coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json';
const baseline=JSON.parse(fs.readFileSync(path.join(dir,'scope-self-collected-live-baseline-v1.json'),'utf8'));
const matrix=JSON.parse(fs.readFileSync(matrixPath,'utf8'));const scopeBy=new Map(matrix.scopes.map(s=>[s.scope_id,s]));
const tasks=[];
for(const p of baseline.product_results){
  const roles=new Set(p.observed_source_roles||[]);const common={representative_product_id:p.representative_product_id,display_name:p.display_name,scope_id:p.target_scope_id};
  if(!roles.has('PRIMARY_AUTHORITY'))tasks.push({...common,task_class:'DISCOVER_PRIMARY_AUTHORITY_REFERENCE',priority:'P0',provider_contact:false});
  else tasks.push({...common,task_class:'RIGHTS_PREFLIGHT_PRIMARY_AUTHORITY_POINTER',priority:'P0',provider_contact:false});
  if(!roles.has('CATALOG_REFERENCE'))tasks.push({...common,task_class:'DISCOVER_OPEN_CATALOG_REFERENCE',priority:'P0',provider_contact:false});
  tasks.push({...common,task_class:'DISCOVER_OPEN_PROVENANCE_HISTORY',priority:'P0',provider_contact:false});
  tasks.push({...common,task_class:'DISCOVER_OPEN_AUTHENTICATION_CONDITION',priority:'P0',provider_contact:false});
  tasks.push({...common,task_class:'DISCOVER_RIGHTS_CLEAR_PUBLIC_SOLD_EVENT_REFERENCE',priority:'P1',provider_contact:false});
}
const scopes=[];for(const s of baseline.scope_summaries){const req=scopeBy.get(s.scope_id);const st=tasks.filter(t=>t.scope_id===s.scope_id);scopes.push({scope_id:s.scope_id,name:s.name,semantic_review_required:s.semantic_review_required,task_count:st.length,p0_tasks:st.filter(t=>t.priority==='P0').length,p1_tasks:st.filter(t=>t.priority==='P1').length,provider_candidate_fields:req.provider_candidate_after_poc,provider_requirement_state:'PENDING_SELF_COLLECTION_EXHAUSTION',provider_contact_authorized:false,state:'SELF_COLLECTION_GAP_QUEUE_READY'})}
const out={id:'kidults-scope-self-collection-gap-queue-v1',version:'1.0.0',status:'READY',source_baseline_id:baseline.id,scope_count:32,product_count:64,task_count:tasks.length,scopes,tasks,freeze_rule:'Provider Requirement Specification may be frozen only after all P0 self-collection tasks have terminal PASS/GAP/RIGHTS_LIMITED states.',provider_contact_authorized:false,production:'HOLD'};
fs.writeFileSync(path.join(dir,'scope-self-collection-gap-queue-v1.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({status:'PASS',scopes:32,products:64,tasks:tasks.length,p0:tasks.filter(t=>t.priority==='P0').length,p1:tasks.filter(t=>t.priority==='P1').length,provider_contact:'HOLD'},null,2));