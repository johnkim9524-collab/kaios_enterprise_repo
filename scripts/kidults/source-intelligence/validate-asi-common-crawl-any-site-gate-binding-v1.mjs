#!/usr/bin/env node
import fs from 'node:fs';

const p=process.argv[2]||'discovery-out/global-low-risk-discovery-common-crawl-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-global-low-risk-discovery-v1'||x.primary_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE')fail('IDENTITY');
if(x.common_crawl_host_expansion_applied!==true)fail('EXPANSION_NOT_APPLIED');
if(!Number.isInteger(Number(x.common_crawl_premerge_candidate_count))||Number(x.common_crawl_premerge_candidate_count)<1)fail('PREMERGE_COUNT');
if(!Number.isInteger(Number(x.common_crawl_seed_host_count))||Number(x.common_crawl_seed_host_count)<1||Number(x.common_crawl_seed_host_count)>8)fail('SEED_COUNT');
if(!Number.isInteger(Number(x.common_crawl_observed_candidate_count))||Number(x.common_crawl_observed_candidate_count)<0)fail('OBSERVED_COUNT');
if(!Number.isInteger(Number(x.common_crawl_new_candidate_count))||Number(x.common_crawl_new_candidate_count)<0||Number(x.common_crawl_new_candidate_count)>Number(x.common_crawl_observed_candidate_count))fail('NEW_COUNT');
if(Number(x.candidate_count)!==Number(x.common_crawl_premerge_candidate_count)+Number(x.common_crawl_new_candidate_count))fail('MERGED_COUNT');
if(!['DISCOVERED','UNAVAILABLE_FAIL_SOFT'].includes(x.common_crawl_index_state))fail('INDEX_STATE');
const indexUnavailable=x.common_crawl_index_state==='UNAVAILABLE_FAIL_SOFT';
if(indexUnavailable&&(x.common_crawl_index_id!==null||Number(x.common_crawl_observed_candidate_count)!==0||Number(x.common_crawl_new_candidate_count)!==0))fail('UNAVAILABLE_INDEX_CONTRACT');
if(!indexUnavailable&&!x.common_crawl_index_id)fail('DISCOVERED_INDEX_ID');
if(x.common_crawl_rights_effect!=='NONE'||x.common_crawl_admission_effect!=='NONE'||x.common_crawl_acquisition_effect!=='NONE')fail('PERMISSION_EFFECT');
if(x.production!=='HOLD'||x.public_release!=='HOLD'||x.acquisition_authorized!==false||x.content_acquired!==false||x.target_site_body_crawled!==false)fail('RELEASE_BOUNDARY');
if(x.listing_is_not_sold!==true||x.terminal_transaction_assertion_required!==true)fail('MARKET_SEMANTICS');
const lane=(x.lane_health||[]).find(l=>l.lane_id==='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION');
if(!lane||!['SUCCESS_WITH_RESULTS','SUCCESS_ZERO_RESULTS','CONTROL_EMPTY_INDEX_UNAVAILABLE'].includes(lane.status))fail('LANE');
if(indexUnavailable&&lane.status!=='CONTROL_EMPTY_INDEX_UNAVAILABLE')fail('UNAVAILABLE_INDEX_LANE');
if(!indexUnavailable&&lane.status==='CONTROL_EMPTY_INDEX_UNAVAILABLE')fail('DISCOVERED_INDEX_LANE');
if(Number(lane.observed_candidates)!==Number(x.common_crawl_observed_candidate_count)||Number(lane.new_candidates)!==Number(x.common_crawl_new_candidate_count))fail('LANE_COUNTS');
const seen=new Set();let cc=0;
for(const c of x.candidates||[]){
  if(!c.endpoint_url||seen.has(c.endpoint_url))fail('DUPLICATE_OR_MISSING_URL');seen.add(c.endpoint_url);
  if(c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.gate_1_state!=='PENDING'||c.evidence_state!=='DISCOVERY_METADATA_ONLY'||c.acquisition_authorized!==false||c.target_site_body_crawled!==false)fail('CANDIDATE_PROMOTION');
  if(c.discovery_provider==='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION'){
    cc++;
    if(c.discovery_channel!=='COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX'||c.source_family_hint!=='UNCLASSIFIED_ANY_SITE_CANDIDATE'||c.content_acquired!==false||c.live_external_observation!==true)fail('COMMON_CRAWL_CANDIDATE');
    let h;try{h=new URL(c.endpoint_url).hostname.toLowerCase()}catch{fail('COMMON_CRAWL_URL')}
    const seed=String(c.seed_host||'').toLowerCase();if(!seed||!(h===seed||h.endsWith(`.${seed}`)))fail('HOST_ESCAPE');
  }
}
if(cc<Number(x.common_crawl_new_candidate_count))fail('COMMON_CRAWL_PARTITION');
console.log(JSON.stringify({status:'PASS',index_state:x.common_crawl_index_state,index_id:x.common_crawl_index_id,seed_hosts:x.common_crawl_seed_host_count,observed_candidates:x.common_crawl_observed_candidate_count,new_candidates:x.common_crawl_new_candidate_count,merged_candidates:x.candidate_count,production:'HOLD'},null,2));
