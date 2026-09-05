#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const discoveryPath=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const expansionPath=process.argv[3]||'/tmp/asi-common-crawl-host-expansion-v1.json';
const outPath=process.argv[4]||discoveryPath;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const norm=u=>{try{const x=new URL(String(u||''));if(!/^https?:$/.test(x.protocol))return null;x.hash='';return x.toString().replace(/\/$/,'')}catch{return null}};
const fail=m=>{throw new Error(m)};
const validIndexId=value=>/^CC-MAIN-\d{4}-\d{2,}$/.test(String(value||''));

const d=read(discoveryPath);
const e=read(expansionPath);
if(d.id!=='kidults-asi-global-low-risk-discovery-v1'||d.primary_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE')fail('DISCOVERY_IDENTITY');
if(d.production!=='HOLD'||d.public_release!=='HOLD'||d.acquisition_authorized!==false||d.content_acquired!==false||d.target_site_body_crawled!==false)fail('DISCOVERY_PERMISSION_BOUNDARY');
const materialStatus='SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE';
const zeroStatus='SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS';
if(e.id!=='kidults-asi-common-crawl-host-expansion-v1'||![materialStatus,zeroStatus].includes(e.status))fail('EXPANSION_IDENTITY');
if(e.universe_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||e.metadata_index_only!==true)fail('EXPANSION_UNIVERSE_BOUNDARY');
if(e.production!=='HOLD'||e.public_release!=='HOLD'||e.acquisition_authorized!==false||e.content_acquired!==false||e.target_site_body_crawled!==false||e.rights_promoted!==false||e.admission_promoted!==false)fail('EXPANSION_PERMISSION_BOUNDARY');
if(!Array.isArray(e.seed_hosts)||e.seed_hosts.length!==Number(e.seed_host_count)||e.seed_hosts.length<1||e.seed_hosts.length>8)fail('SEED_BUDGET');
if(!Array.isArray(e.candidates)||e.candidates.length!==Number(e.expanded_candidate_count))fail('EXPANSION_COUNT');
const zeroResults=e.status===zeroStatus;
const observedIndexId=e.common_crawl_index_id==null||e.common_crawl_index_id===''?null:e.common_crawl_index_id;
const indexApiPresent=typeof e.common_crawl_index_api==='string'&&e.common_crawl_index_api.length>0;
if(observedIndexId!==null&&!validIndexId(observedIndexId))fail('OBSERVED_INDEX_ID_FORMAT');
if(observedIndexId===null&&indexApiPresent)fail('COMMON_CRAWL_INDEX_API_WITHOUT_ID');
if(!Array.isArray(e.seed_host_results)||e.seed_host_results.length!==e.seed_hosts.length)fail('SEED_RESULTS_COUNT');
const skippedForIndexUnavailable=e.seed_host_results.filter(result=>result.status==='SKIPPED_INDEX_UNAVAILABLE_FAIL_SOFT');
if(indexApiPresent&&skippedForIndexUnavailable.length)fail('INDEX_AVAILABLE_WITH_SKIPPED_SEEDS');
if(!indexApiPresent&&skippedForIndexUnavailable.length!==e.seed_host_results.length)fail('INDEX_UNAVAILABLE_WITH_NON_SKIPPED_SEEDS');
const indexResolutionState=indexApiPresent?'INDEX_API_RESOLVED':observedIndexId?'INDEX_ID_RESOLVED_API_UNAVAILABLE':'INDEX_DISCOVERY_UNAVAILABLE';
if(zeroResults&&(e.candidates.length!==0||Number(e.expanded_candidate_count)!==0))fail('ZERO_RESULTS_COUNT');
if(!zeroResults&&(e.candidates.length<1||Number(e.expanded_candidate_count)<1||!observedIndexId))fail('MATERIAL_RESULTS_BINDING');

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
    prior.common_crawl_index_id=observedIndexId;
  }
}
const candidates=[...byUrl.values()].sort((a,b)=>a.endpoint_url.localeCompare(b.endpoint_url));
if(zeroResults&&(accepted!==0||candidates.length!==premergeCount))fail('ZERO_RESULTS_NOT_NOOP');
const live=candidates.filter(c=>c.live_external_observation===true);
const providerCounts={};
for(const c of candidates)for(const p of c.discovery_providers||[c.discovery_provider].filter(Boolean))providerCounts[p]=(providerCounts[p]||0)+1;
const laneId='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION';
const materialIndexId=zeroResults?null:observedIndexId;
const lane={lane_id:laneId,status:zeroResults?'SUCCESS_ZERO_RESULTS':'SUCCESS_WITH_RESULTS',observed_candidates:Number(e.expanded_candidate_count||0),new_candidates:accepted,error_count:Number(e.error_count??e.errors?.length??0),common_crawl_index_id:materialIndexId,common_crawl_observed_index_id:observedIndexId,common_crawl_index_resolution_state:indexResolutionState,index_api_available:indexApiPresent,expansion_status:e.status};
const laneHealth=[...(d.lane_health||[]).filter(x=>x.lane_id!==laneId),lane];
const healthyLiveLanes=laneHealth.filter(x=>x.status==='SUCCESS_WITH_RESULTS'&&!['CANONICAL_REGISTERED_FRONTIER_SEED'].includes(x.lane_id)).length;
const output={...d,version:'3.5.3',lane_health:laneHealth,healthy_live_lanes:healthyLiveLanes,candidate_count:candidates.length,live_external_candidate_count:live.length,provider_counts:providerCounts,candidates,common_crawl_host_expansion_applied:true,common_crawl_expansion_status:e.status,common_crawl_zero_result_noop:zeroResults,common_crawl_premerge_candidate_count:premergeCount,common_crawl_seed_host_count:Number(e.seed_host_count||0),common_crawl_index_id:materialIndexId,common_crawl_observed_index_id:observedIndexId,common_crawl_index_resolution_state:indexResolutionState,common_crawl_index_api_available:indexApiPresent,common_crawl_observed_candidate_count:Number(e.expanded_candidate_count||0),common_crawl_new_candidate_count:accepted,common_crawl_error_count:Number(e.error_count??e.errors?.length??0),common_crawl_rights_effect:'NONE',common_crawl_admission_effect:'NONE',common_crawl_acquisition_effect:'NONE',listing_is_not_sold:true,terminal_transaction_assertion_required:true,target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:zeroResults?'PASS_ZERO_RESULTS_NOOP':'PASS_WITH_RESULTS',expansion_status:output.common_crawl_expansion_status,zero_result_noop:output.common_crawl_zero_result_noop,premerge_candidates:premergeCount,observed_expansion_candidates:e.expanded_candidate_count,new_candidates:accepted,merged_candidates:output.candidate_count,live_external_candidates:output.live_external_candidate_count,index_id:output.common_crawl_index_id,observed_index_id:output.common_crawl_observed_index_id,index_resolution_state:output.common_crawl_index_resolution_state,index_api_available:output.common_crawl_index_api_available,production:'HOLD'},null,2));
