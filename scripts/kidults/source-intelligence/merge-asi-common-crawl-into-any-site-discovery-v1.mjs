#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const discoveryPath=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const expansionPath=process.argv[3]||'/tmp/asi-common-crawl-host-expansion-v1.json';
const outPath=process.argv[4]||discoveryPath;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const norm=u=>{try{const x=new URL(String(u||''));if(!/^https?:$/.test(x.protocol))return null;x.hash='';return x.toString().replace(/\/$/,'')}catch{return null}};
const fail=m=>{throw new Error(m)};

const d=read(discoveryPath);
const e=read(expansionPath);
if(d.id!=='kidults-asi-global-low-risk-discovery-v1'||d.primary_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE')fail('DISCOVERY_IDENTITY');
if(d.production!=='HOLD'||d.public_release!=='HOLD'||d.acquisition_authorized!==false||d.content_acquired!==false||d.target_site_body_crawled!==false)fail('DISCOVERY_PERMISSION_BOUNDARY');
if(e.id!=='kidults-asi-common-crawl-host-expansion-v1'||e.version!=='1.3.0'||!['SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE','SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS'].includes(e.status))fail('EXPANSION_IDENTITY');
if(e.universe_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||e.metadata_index_only!==true)fail('EXPANSION_UNIVERSE_BOUNDARY');
if(e.production!=='HOLD'||e.public_release!=='HOLD'||e.acquisition_authorized!==false||e.content_acquired!==false||e.target_site_body_crawled!==false||e.rights_promoted!==false||e.admission_promoted!==false)fail('EXPANSION_PERMISSION_BOUNDARY');
if(!Array.isArray(e.seed_hosts)||e.seed_hosts.length!==Number(e.seed_host_count)||e.seed_hosts.length>8)fail('SEED_BUDGET');
if(!Array.isArray(e.candidates)||e.candidates.length!==Number(e.expanded_candidate_count))fail('EXPANSION_COUNT');
if(!['DISCOVERED','UNAVAILABLE_FAIL_SOFT'].includes(e.common_crawl_index_state))fail('INDEX_STATE');
const indexUnavailable=e.common_crawl_index_state==='UNAVAILABLE_FAIL_SOFT';
if(indexUnavailable&&(e.common_crawl_index_id!==null||e.common_crawl_index_api!==null||Number(e.expanded_candidate_count)!==0))fail('UNAVAILABLE_INDEX_CONTRACT');
if(!indexUnavailable&&(!e.common_crawl_index_id||!e.common_crawl_index_api))fail('DISCOVERED_INDEX_CONTRACT');

const byUrl=new Map();
for(const c of d.candidates||[]){const u=norm(c.endpoint_url);if(!u)continue;byUrl.set(u,{...c,endpoint_url:u});}
const premergeCount=byUrl.size;
let accepted=0;
for(const raw of e.candidates){
  const u=norm(raw.endpoint_url);if(!u)fail('EXPANSION_URL');
  let h;try{h=new URL(u).hostname.toLowerCase()}catch{fail('EXPANSION_HOST')}
  const seed=String(raw.seed_host||'').toLowerCase();
  if(!seed||!(h===seed||h.endsWith(`.${seed}`)))fail('HOST_ESCAPE');
  if(raw.discovery_provider!=='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION'||raw.discovery_channel!=='COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX')fail('EXPANSION_PROVIDER');
  if(raw.source_family_hint!=='UNCLASSIFIED_ANY_SITE_CANDIDATE'||raw.rights_state!=='UNASSESSED'||raw.admission_state!=='NOT_ADMITTED'||raw.gate_1_state!=='PENDING'||raw.evidence_state!=='DISCOVERY_METADATA_ONLY'||raw.acquisition_authorized!==false||raw.target_site_body_crawled!==false||raw.content_acquired!==false)fail('EXPANSION_CANDIDATE_BOUNDARY');
  if(!byUrl.has(u)){
    byUrl.set(u,{...raw,endpoint_url:u,live_external_observation:true,provider_contacted:false,account_created:false,eula_accepted:false,spend_authorized:false,public_projection:false,production:'HOLD'});
    accepted++;
  } else {
    const prior=byUrl.get(u);
    prior.discovery_providers=[...new Set([...(prior.discovery_providers||[prior.discovery_provider]).filter(Boolean),raw.discovery_provider])];
    prior.common_crawl_index_observed=true;
    prior.common_crawl_index_id=e.common_crawl_index_id||null;
  }
}
const candidates=[...byUrl.values()].sort((a,b)=>a.endpoint_url.localeCompare(b.endpoint_url));
const live=candidates.filter(c=>c.live_external_observation===true);
const providerCounts={};
for(const c of candidates)for(const p of c.discovery_providers||[c.discovery_provider].filter(Boolean))providerCounts[p]=(providerCounts[p]||0)+1;
const laneId='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION';
const lane={lane_id:laneId,status:indexUnavailable?'CONTROL_EMPTY_INDEX_UNAVAILABLE':e.expanded_candidate_count>0?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS',observed_candidates:Number(e.expanded_candidate_count||0),new_candidates:accepted,error_count:Number(e.error_count??e.errors?.length??0),common_crawl_index_id:e.common_crawl_index_id||null};
const laneHealth=[...(d.lane_health||[]).filter(x=>x.lane_id!==laneId),lane];
const healthyLiveLanes=laneHealth.filter(x=>x.status==='SUCCESS_WITH_RESULTS'&&!['CANONICAL_REGISTERED_FRONTIER_SEED'].includes(x.lane_id)).length;
const output={...d,version:'3.5.0',lane_health:laneHealth,healthy_live_lanes:healthyLiveLanes,candidate_count:candidates.length,live_external_candidate_count:live.length,provider_counts:providerCounts,candidates,common_crawl_host_expansion_applied:true,common_crawl_premerge_candidate_count:premergeCount,common_crawl_seed_host_count:Number(e.seed_host_count||0),common_crawl_index_state:e.common_crawl_index_state,common_crawl_index_id:e.common_crawl_index_id||null,common_crawl_observed_candidate_count:Number(e.expanded_candidate_count||0),common_crawl_new_candidate_count:accepted,common_crawl_error_count:Number(e.error_count??e.errors?.length??0),common_crawl_rights_effect:'NONE',common_crawl_admission_effect:'NONE',common_crawl_acquisition_effect:'NONE',listing_is_not_sold:true,terminal_transaction_assertion_required:true,target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',premerge_candidates:premergeCount,observed_expansion_candidates:e.expanded_candidate_count,new_candidates:accepted,merged_candidates:output.candidate_count,live_external_candidates:output.live_external_candidate_count,index_state:output.common_crawl_index_state,index_id:output.common_crawl_index_id,production:'HOLD'},null,2));
