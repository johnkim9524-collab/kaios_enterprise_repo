#!/usr/bin/env node
import fs from 'node:fs';
const x=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/asi-region-family-discovery-budget-v1.json','utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-region-family-discovery-budget-v1'||x.status!=='SHADOW_DISCOVERY_DEMAND_BUDGET_READY')fail('IDENTITY');
if(x.production!=='HOLD'||x.public_release!=='HOLD')fail('RELEASE_BOUNDARY');
if(x.region_semantics!=='DISCOVERY_TARGET_DEMAND_NOT_SOURCE_GEOLOCATION'||x.source_geography_inference_forbidden!==true)fail('REGION_SEMANTICS');
if(x.rules?.discovery_only!==true||x.rules?.target_site_body_crawl!==false||x.rules?.rights_gate_unchanged!==true||x.rules?.admission_unchanged!==true||x.rules?.listing_is_not_sold!==true||x.rules?.source_geography_not_inferred!==true||x.rules?.unknown_remains_unknown!==true)fail('RULES');
if(!Array.isArray(x.top_source_family_demands)||x.top_source_family_demands.length!==3)fail('FAMILY_DEMAND');
if(!Array.isArray(x.top_region_demands)||x.top_region_demands.length!==4)fail('REGION_DEMAND');
if(!Array.isArray(x.query_plan)||x.query_plan.length!==12)fail('QUERY_PLAN');
for(const q of x.query_plan){if(!q.source_family||!q.region_id||!Array.isArray(q.intent_hints)||!q.intent_hints.length)fail('QUERY_ROW');if(q.region_effect!=='QUERY_RECALL_HINT_ONLY'||q.family_effect!=='QUERY_RECALL_HINT_ONLY')fail('QUERY_EFFECT');}
console.log(JSON.stringify({status:'PASS',families:x.top_source_family_demands.map(v=>v.source_family),regions:x.top_region_demands.map(v=>v.region_id),query_plan_rows:x.query_plan.length,production:'HOLD'}));
