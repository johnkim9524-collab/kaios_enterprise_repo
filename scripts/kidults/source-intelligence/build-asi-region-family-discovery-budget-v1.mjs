#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const input=process.argv[2]||'/tmp/asi-throughput-coverage-autobalance-live-v1.json';
const out=process.argv[3]||'/tmp/asi-region-family-discovery-budget-v1.json';
const x=JSON.parse(fs.readFileSync(input,'utf8'));
if(x.status!=='SHADOW_AUTOBALANCE_PLAN_READY'||x.production!=='HOLD'||x.public_release!=='HOLD')throw new Error('AUTOBALANCE_BOUNDARY');
if(x.rules?.rights_gate_can_never_be_weakened!==true)throw new Error('RIGHTS_BOUNDARY');
const familyIntent={
  PRIMARY_OR_OFFICIAL_AUTHORITY:['official brand manufacturer','official registry foundation'],
  OPEN_MARKETPLACE_OR_DEALER:['auction dealer marketplace','collector dealer auction'],
  GRADING_AUTHENTICATION_OR_CONDITION:['grading authentication','certification condition'],
  MEDIA_COMMUNITY_OR_EVENT_CONTEXT:['forum community','news event'],
  MUSEUM_OR_INSTITUTIONAL_CONTEXT:['museum archive catalog','institution collection archive'],
  UNCLASSIFIED_ANY_SITE_CANDIDATE:['collectibles collector','collector reference']
};
const family=(x.next_cycle_budget?.source_family_priorities||[]).slice().sort((a,b)=>b.priority_weight-a.priority_weight||a.id.localeCompare(b.id));
const region=(x.next_cycle_budget?.region_priorities||[]).slice().sort((a,b)=>b.priority_weight-a.priority_weight||a.id.localeCompare(b.id));
const topFamilies=family.slice(0,3).map(v=>({source_family:v.id,priority_weight:v.priority_weight,coverage_count:v.count,intents:familyIntent[v.id]||['collectibles collector']}));
const topRegions=region.slice(0,4).map(v=>({region_id:v.id,priority_weight:v.priority_weight,coverage_count:v.count}));
const output={id:'kidults-asi-region-family-discovery-budget-v1',version:'1.0.0',status:'SHADOW_DISCOVERY_DEMAND_BUDGET_READY',input_autobalance_id:x.id,region_semantics:'DISCOVERY_TARGET_DEMAND_NOT_SOURCE_GEOLOCATION',source_geography_inference_forbidden:true,top_source_family_demands:topFamilies,top_region_demands:topRegions,query_plan:topFamilies.flatMap(f=>topRegions.map(r=>({source_family:f.source_family,region_id:r.region_id,priority_score:Number((f.priority_weight*r.priority_weight).toFixed(4)),intent_hints:f.intents,region_effect:'QUERY_RECALL_HINT_ONLY',family_effect:'QUERY_RECALL_HINT_ONLY'}))).sort((a,b)=>b.priority_score-a.priority_score),rules:{discovery_only:true,target_site_body_crawl:false,rights_gate_unchanged:true,admission_unchanged:true,listing_is_not_sold:true,source_geography_not_inferred:true,unknown_remains_unknown:true},public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,top_families:topFamilies.map(x=>x.source_family),top_regions:topRegions.map(x=>x.region_id),query_plan_rows:output.query_plan.length,production:'HOLD'},null,2));
