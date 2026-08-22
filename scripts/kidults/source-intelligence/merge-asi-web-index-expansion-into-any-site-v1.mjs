#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const anySitePath=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const expansionPath=process.argv[3]||'/tmp/asi-common-crawl-host-expansion-v1.json';
const outPath=process.argv[4]||'/tmp/asi-global-any-site-web-index-expanded-v1.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const any=read(anySitePath),exp=read(expansionPath);
const fail=m=>{throw new Error(m)};
const norm=u=>{const x=new URL(String(u));x.hash='';return x.toString().replace(/\/$/,'')};

if(any.id!=='kidults-asi-global-low-risk-discovery-v1')fail('ANY_SITE_ID');
if(any.primary_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||any.source_family_restriction!==null)fail('UNIVERSE_BOUNDARY');
if(any.production!=='HOLD'||any.public_release!=='HOLD'||any.acquisition_authorized!==false)fail('ANY_SITE_PERMISSION_BOUNDARY');
if(exp.id!=='kidults-asi-common-crawl-host-expansion-v1')fail('EXPANSION_ID');
if(!['SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE','SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS'].includes(exp.status))fail('EXPANSION_STATUS');
if(exp.production!=='HOLD'||exp.public_release!=='HOLD'||exp.acquisition_authorized!==false||exp.content_acquired!==false||exp.target_site_body_crawled!==false)fail('EXPANSION_PERMISSION_BOUNDARY');

const merged=new Map();
for(const raw of any.candidates||[]){
  const key=norm(raw.endpoint_url);
  merged.set(key,{...raw,endpoint_url:key});
}
let inserted=0,deduplicated=0;
for(const raw of exp.candidates||[]){
  if(raw.discovery_provider!=='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION')fail('EXPANSION_PROVIDER');
  if(raw.source_family_hint!=='UNCLASSIFIED_ANY_SITE_CANDIDATE'||raw.rights_state!=='UNASSESSED'||raw.admission_state!=='NOT_ADMITTED'||raw.gate_1_state!=='PENDING')fail('EXPANSION_SELF_PROMOTION');
  if(raw.acquisition_authorized!==false||raw.content_acquired!==false||raw.target_site_body_crawled!==false)fail('EXPANSION_ACQUISITION_BOUNDARY');
  const endpoint=norm(raw.endpoint_url);const host=new URL(endpoint).hostname.toLowerCase();const seed=String(raw.seed_host||'').toLowerCase();
  if(!seed||!(host===seed||host.endsWith(`.${seed}`)))fail('EXPANSION_HOST_ESCAPE');
  const lineage={kind:'PUBLIC_WEB_INDEX_HOST_EXPANSION',provider:'COMMON_CRAWL_URL_INDEX',seed_host:seed,index_id:exp.common_crawl_index_id||null,observed_at:raw.observed_at||exp.observed_at||null,ownership_effect:'NONE',officiality_effect:'NONE',rights_effect:'NONE'};
  const prior=merged.get(endpoint);
  if(prior){
    deduplicated++;
    merged.set(endpoint,{...prior,discovery_providers:[...new Set([...(prior.discovery_providers||[prior.discovery_provider]).filter(Boolean),raw.discovery_provider])],web_index_expansion_lineage:[...(prior.web_index_expansion_lineage||[]),lineage],web_index_expansion_observed:true,rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',acquisition_authorized:false,target_site_body_crawled:false,content_acquired:false,production:'HOLD'});
  }else{
    inserted++;
    merged.set(endpoint,{...raw,endpoint_url:endpoint,live_external_observation:true,web_index_expansion_observed:true,web_index_expansion_lineage:[lineage],source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',candidate_source_roles:['UNCLASSIFIED_PENDING_RELEVANCE'],rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false,content_acquired:false,provider_contacted:false,account_created:false,eula_accepted:false,spend_authorized:false,production:'HOLD'});
  }
}
const candidates=[...merged.values()].sort((a,b)=>String(a.endpoint_url).localeCompare(String(b.endpoint_url)));
const providerCounts={};
for(const c of candidates)for(const p of c.discovery_providers||[c.discovery_provider].filter(Boolean))providerCounts[p]=(providerCounts[p]||0)+1;
const lane={lane_id:'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION',status:exp.expanded_candidate_count>0?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS',observed_candidates:Number(exp.expanded_candidate_count||0),error:Array.isArray(exp.errors)&&exp.errors.length?`FAIL_SOFT_ERRORS:${exp.errors.length}`:null};
const laneHealth=[...(any.lane_health||[]).filter(x=>x.lane_id!==lane.lane_id),lane];
const healthyLiveLanes=laneHealth.filter(x=>x.status==='SUCCESS_WITH_RESULTS'&&x.lane_id!=='CANONICAL_REGISTERED_FRONTIER_SEED').length;
const output={...any,version:'3.4.0',expanded_view_id:'kidults-asi-global-any-site-web-index-expanded-v1',expanded_at:new Date().toISOString(),lane_health:laneHealth,healthy_live_lanes:healthyLiveLanes,candidate_count:candidates.length,live_external_candidate_count:candidates.filter(c=>c.live_external_observation===true).length,provider_counts:providerCounts,candidates,web_index_expansion:{provider:'COMMON_CRAWL_URL_INDEX',index_id:exp.common_crawl_index_id||null,seed_host_count:Number(exp.seed_host_count||0),input_candidate_count:Number(exp.expanded_candidate_count||0),inserted_candidate_count:inserted,deduplicated_candidate_count:deduplicated,metadata_index_only:true,same_host_or_subdomain_only:true,gate1_required:true,ownership_asserted:false,officiality_asserted:false,rights_promoted:false,admission_promoted:false},target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',base_candidates:any.candidate_count,expansion_input:exp.expanded_candidate_count,inserted,deduplicated,total:output.candidate_count,healthy_live_lanes:output.healthy_live_lanes,production:'HOLD'}));
