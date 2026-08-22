#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-source-family-discovery-intent-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-source-family-discovery-intent-v1')fail('bad id');
if(x.status!=='SHADOW_SOURCE_FAMILY_DISCOVERY_INTENT_READY')fail('bad status');
if(x.universe_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||x.universe_restricted!==false)fail('universe narrowed');
if(x.baseline_discovery_required!==true||x.rules?.baseline_discovery_cannot_be_removed!==true||x.rules?.supplemental_queries_only!==true)fail('baseline boundary');
if(x.rules?.unclassified_is_not_a_target_family!==true||x.rules?.listing_is_not_sold!==true||x.rules?.sold_transaction_requires_terminal_event_assertion!==true)fail('market semantics');
if(x.rules?.rights_gate_can_never_be_weakened!==true||x.rules?.classification_or_intent_cannot_create_rights!==true)fail('rights boundary');
if(x.production!=='HOLD'||x.public_release!=='HOLD'||x.acquisition_authorized!==false||x.content_acquired!==false||x.target_site_body_crawled!==false)fail('release/acquisition boundary');
if(!Array.isArray(x.directives)||x.directives.length!==Number(x.supplemental_query_count)||x.directives.length>12)fail('directive budget');
const allowedFamilies=new Set(['PRIMARY_OR_OFFICIAL_AUTHORITY','OPEN_MARKETPLACE_OR_DEALER','GRADING_AUTHENTICATION_OR_CONDITION','MEDIA_COMMUNITY_OR_EVENT_CONTEXT','MUSEUM_OR_INSTITUTIONAL_CONTEXT']);
for(const d of x.directives){
  if(!allowedFamilies.has(d.source_family_id))fail(`invalid target family:${d.source_family_id}`);
  if(!d.scope_id||!d.scope_name||!d.query_term)fail('directive identity');
  if(d.query_mode!=='SUPPLEMENTAL_PUBLIC_METADATA_DISCOVERY_ONLY'||d.target_site_body_traversal_authorized!==false||d.rights_effect!=='NONE'||d.admission_effect!=='NONE')fail('directive boundary');
  if(!(Number(d.source_family_priority_weight)>=1&&Number(d.source_family_priority_weight)<=3))fail('family weight');
  if(!(Number(d.scope_priority_weight)>=1&&Number(d.scope_priority_weight)<=3))fail('scope weight');
}
if((x.target_family_ids||[]).includes('UNCLASSIFIED_ANY_SITE_CANDIDATE'))fail('unclassified targeted');
console.log(JSON.stringify({status:'PASS',supplemental_query_count:x.directives.length,target_family_ids:x.target_family_ids,production:'HOLD'}));
