#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const balancePath=process.argv[2]||'/tmp/asi-throughput-coverage-autobalance-live-v1.json';
const out=process.argv[3]||'/tmp/asi-source-family-discovery-intent-v1.json';
const maxDirectives=12;
const scopeRegistry=JSON.parse(fs.readFileSync('coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json','utf8'));
const scopeName=new Map((scopeRegistry.scopes||[]).map(s=>[s.scope_id,s.name||s.scope_id]));
const familyTerms={
  PRIMARY_OR_OFFICIAL_AUTHORITY:['official','manufacturer','foundation','registry'],
  OPEN_MARKETPLACE_OR_DEALER:['auction','dealer','marketplace','consignment'],
  GRADING_AUTHENTICATION_OR_CONDITION:['grading','authentication','certification','appraisal'],
  MEDIA_COMMUNITY_OR_EVENT_CONTEXT:['community','news','event','forum'],
  MUSEUM_OR_INSTITUTIONAL_CONTEXT:['museum','archive','institution','collection']
};

let balance=null;
if(fs.existsSync(balancePath)){
  try{balance=JSON.parse(fs.readFileSync(balancePath,'utf8'));}catch{}
}
const validBalance=Boolean(balance&&balance.status==='SHADOW_AUTOBALANCE_PLAN_READY'&&balance.production==='HOLD'&&balance.public_release==='HOLD'&&balance.rules?.rights_gate_can_never_be_weakened===true);
const familyPriorities=(validBalance?balance.next_cycle_budget?.source_family_priorities:[])||[];
const scopePriorities=(validBalance?balance.next_cycle_budget?.scope_priorities:[])||[];
const regionPriorities=(validBalance?balance.next_cycle_budget?.region_priorities:[])||[];

const targetFamilies=familyPriorities
  .filter(x=>familyTerms[x.id]&&Number(x.priority_weight)>1.05)
  .sort((a,b)=>Number(b.priority_weight)-Number(a.priority_weight)||String(a.id).localeCompare(String(b.id)))
  .slice(0,3);
const targetScopes=scopePriorities
  .filter(x=>scopeName.has(x.id))
  .sort((a,b)=>Number(b.priority_weight)-Number(a.priority_weight)||String(a.id).localeCompare(String(b.id)))
  .slice(0,8);
const targetRegions=regionPriorities
  .sort((a,b)=>Number(b.priority_weight)-Number(a.priority_weight)||String(a.id).localeCompare(String(b.id)))
  .slice(0,4)
  .map(x=>({region_id:x.id,priority_weight:Number(x.priority_weight)}));

const directives=[];
for(const f of targetFamilies){
  for(const s of targetScopes){
    if(directives.length>=maxDirectives)break;
    const terms=familyTerms[f.id];
    directives.push({
      directive_id:`${f.id}::${s.id}`,
      source_family_id:f.id,
      source_family_priority_weight:Number(f.priority_weight),
      scope_id:s.id,
      scope_name:scopeName.get(s.id),
      scope_priority_weight:Number(s.priority_weight),
      query_term:terms[directives.length%terms.length],
      query_mode:'SUPPLEMENTAL_PUBLIC_METADATA_DISCOVERY_ONLY',
      target_site_body_traversal_authorized:false,
      rights_effect:'NONE',
      admission_effect:'NONE'
    });
  }
}
const unclassified=(familyPriorities.find(x=>x.id==='UNCLASSIFIED_ANY_SITE_CANDIDATE')||{});
const output={
  id:'kidults-asi-source-family-discovery-intent-v1',version:'1.0.0',status:'SHADOW_SOURCE_FAMILY_DISCOVERY_INTENT_READY',
  universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',universe_restricted:false,baseline_discovery_required:true,
  autobalance_input_present:validBalance,autobalance_input_id:validBalance?balance.id:null,
  supplemental_query_budget_max:maxDirectives,supplemental_query_count:directives.length,directives,
  target_family_ids:targetFamilies.map(x=>x.id),target_region_hints:targetRegions,
  unclassified_observed_count:Number(unclassified.count||0),
  rules:{baseline_discovery_cannot_be_removed:true,supplemental_queries_only:true,unclassified_is_not_a_target_family:true,listing_is_not_sold:true,sold_transaction_requires_terminal_event_assertion:true,rights_gate_can_never_be_weakened:true,classification_or_intent_cannot_create_rights:true},
  target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'
};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,autobalance_input_present:validBalance,supplemental_query_count:directives.length,target_family_ids:output.target_family_ids,production:'HOLD'},null,2));
