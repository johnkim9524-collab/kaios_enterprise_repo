#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const discoveryPath=process.argv[2]||'discovery-out/bounded-live-discovery.json';
const previousPath=process.argv[3]||'';
const outPath=process.argv[4]||'/tmp/asi-proactive-source-pool-v1.json';
const contract=JSON.parse(fs.readFileSync('coordination/kidults/source-intelligence/asi-proactive-source-pool-accumulator-v1.json','utf8'));
const discovery=JSON.parse(fs.readFileSync(discoveryPath,'utf8'));
let previous=null;
if(previousPath&&fs.existsSync(previousPath)) previous=JSON.parse(fs.readFileSync(previousPath,'utf8'));
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const norm=u=>{try{const x=new URL(u);x.hash='';x.searchParams.sort();return x.toString().replace(/\/$/,'')}catch{return String(u||'').trim()}};
const arr=v=>Array.isArray(v)?v:[];
const uniq=v=>[...new Set(v.filter(x=>x!==undefined&&x!==null&&x!==''))].sort();
const now=new Date().toISOString();
const map=new Map();
for(const c of arr(previous?.candidates)) map.set(c.source_candidate_key,{...c,discovery_providers:arr(c.discovery_providers),source_family_hints:arr(c.source_family_hints),candidate_source_roles:arr(c.candidate_source_roles),representative_product_ids:arr(c.representative_product_ids),demand_instance_ids:arr(c.demand_instance_ids),target_regions:arr(c.target_regions),target_languages:arr(c.target_languages),provider_record_ids:arr(c.provider_record_ids)});
let newCount=0,reobserved=0;
for(const c of arr(discovery.candidates)){
  const locator=norm(c.endpoint_url||c.source_locator||c.provider_record_id);
  const lineage=c.underlying_work_key||`${c.discovery_provider||'UNKNOWN'}|${locator}`;
  const key=`src-cand:${sha(lineage).slice(0,24)}`;
  const prev=map.get(key);
  const base={
    source_candidate_key:key,
    canonical_locator:locator,
    source_name:c.source_name||c.owner||locator,
    first_seen_at:prev?.first_seen_at||c.observed_at||now,
    last_seen_at:c.observed_at||now,
    observation_count:Number(prev?.observation_count||0)+1,
    discovery_providers:uniq([...(prev?.discovery_providers||[]),c.discovery_provider]),
    source_family_hints:uniq([...(prev?.source_family_hints||[]),c.source_family_hint]),
    candidate_source_roles:uniq([...(prev?.candidate_source_roles||[]),...arr(c.candidate_source_roles)]),
    representative_product_ids:uniq([...(prev?.representative_product_ids||[]),c.representative_product_id]),
    demand_instance_ids:uniq([...(prev?.demand_instance_ids||[]),...arr(c.demand_instance_ids)]),
    target_regions:uniq([...(prev?.target_regions||[]),...arr(c.target_regions)]),
    target_languages:uniq([...(prev?.target_languages||[]),...arr(c.target_languages)]),
    provider_record_ids:uniq([...(prev?.provider_record_ids||[]),...arr(c.provider_record_ids),c.provider_record_id]),
    rights_state:'UNASSESSED',
    admission_state:'NOT_ADMITTED',
    source_pool_state:'CANDIDATE_ONLY',
    evidence_state:'DISCOVERY_METADATA_ONLY',
    candidate_state:'RIGHTS_ROBOTS_ACCESS_PREFLIGHT_PENDING',
    acquisition_authorized:false,
    target_site_traversal_authorized:false,
    market_claim_authorized:false,
    public_projection:false,
    production:'HOLD',
    next_action:'PURPOSE_SPECIFIC_RIGHTS_ROBOTS_ACCESS_PREFLIGHT'
  };
  map.set(key,base);if(prev)reobserved++;else newCount++;
}
const candidates=[...map.values()].sort((a,b)=>b.demand_instance_ids.length-a.demand_instance_ids.length||b.candidate_source_roles.length-a.candidate_source_roles.length||a.source_candidate_key.localeCompare(b.source_candidate_key));
const newKeys=new Set(arr(discovery.candidates).map(c=>{const locator=norm(c.endpoint_url||c.source_locator||c.provider_record_id);const lineage=c.underlying_work_key||`${c.discovery_provider||'UNKNOWN'}|${locator}`;return `src-cand:${sha(lineage).slice(0,24)}`}));
const review=[...candidates].filter(c=>c.rights_state==='UNASSESSED').sort((a,b)=>Number(newKeys.has(b.source_candidate_key))-Number(newKeys.has(a.source_candidate_key))||b.demand_instance_ids.length-a.demand_instance_ids.length||b.candidate_source_roles.length-a.candidate_source_roles.length||b.target_regions.length-a.target_regions.length||b.observation_count-a.observation_count).slice(0,contract.rights_review_queue.max_packets_per_cycle).map((c,i)=>({packet_id:`rights-review:${c.source_candidate_key}:${i+1}`,source_candidate_key:c.source_candidate_key,canonical_locator:c.canonical_locator,source_name:c.source_name,candidate_source_roles:c.candidate_source_roles,target_regions:c.target_regions,target_languages:c.target_languages,demand_instance_ids:c.demand_instance_ids,purpose:'PURPOSE_SPECIFIC_RIGHTS_ROBOTS_ACCESS_PREFLIGHT_ONLY',rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',acquisition_authorized:false,next_action:'REVIEW_RIGHTS_TERMS_ROBOTS_AND_PURPOSE_BOUNDARY'}));
const cycleCount=Number(previous?.cycle_count||0)+1;
const artifact={
  id:'kidults-asi-proactive-source-pool-v1',version:'1.0.0',status:'ROLLING_DISCOVERY_CANDIDATE_POOL',cycle_count:cycleCount,rotation_cycle_index:(cycleCount-1)%contract.discovery.rotation_cycle_count,updated_at:now,previous_candidate_count:Number(previous?.candidate_count||0),discovery_batch_candidate_count:Number(discovery.candidate_count||0),new_candidate_count:newCount,reobserved_candidate_count:reobserved,candidate_count:candidates.length,covered_representative_products:uniq(candidates.flatMap(c=>c.representative_product_ids)).length,covered_regions:uniq(candidates.flatMap(c=>c.target_regions)),provider_counts:Object.fromEntries(uniq(candidates.flatMap(c=>c.discovery_providers)).map(p=>[p,candidates.filter(c=>c.discovery_providers.includes(p)).length])),rights_review_queue:review,candidates,content_acquired:false,rights_promoted_automatically:false,admission_promoted_automatically:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD',truth_boundary:contract.truth_boundary
};
fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:artifact.status,cycle_count:cycleCount,rotation_cycle_index:artifact.rotation_cycle_index,previous_candidate_count:artifact.previous_candidate_count,batch_candidates:artifact.discovery_batch_candidate_count,new_candidates:newCount,reobserved_candidates:reobserved,candidate_count:artifact.candidate_count,covered_products:artifact.covered_representative_products,rights_review_packets:review.length,production:'HOLD'}));
