#!/usr/bin/env node
import fs from 'node:fs';

const materialStatus='SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE';
const zeroStatus='SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS';
const fail=m=>{throw new Error(m)};
const validObservedIndex=value=>value===null||(typeof value==='string'&&value.trim().length>0);

function validate(x){
  if(x.id!=='kidults-asi-global-low-risk-discovery-v1'||x.primary_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE')fail('IDENTITY');
  if(x.common_crawl_host_expansion_applied!==true)fail('EXPANSION_NOT_APPLIED');
  if(![materialStatus,zeroStatus].includes(x.common_crawl_expansion_status))fail('EXPANSION_STATUS');
  if(typeof x.common_crawl_zero_result_noop!=='boolean')fail('ZERO_RESULT_NOOP_FLAG');
  if(!Number.isInteger(Number(x.common_crawl_premerge_candidate_count))||Number(x.common_crawl_premerge_candidate_count)<1)fail('PREMERGE_COUNT');
  if(!Number.isInteger(Number(x.common_crawl_seed_host_count))||Number(x.common_crawl_seed_host_count)<1||Number(x.common_crawl_seed_host_count)>8)fail('SEED_COUNT');
  if(!Number.isInteger(Number(x.common_crawl_observed_candidate_count))||Number(x.common_crawl_observed_candidate_count)<0)fail('OBSERVED_COUNT');
  if(!Number.isInteger(Number(x.common_crawl_new_candidate_count))||Number(x.common_crawl_new_candidate_count)<0||Number(x.common_crawl_new_candidate_count)>Number(x.common_crawl_observed_candidate_count))fail('NEW_COUNT');
  if(Number(x.candidate_count)!==Number(x.common_crawl_premerge_candidate_count)+Number(x.common_crawl_new_candidate_count))fail('MERGED_COUNT');
  if(x.common_crawl_rights_effect!=='NONE'||x.common_crawl_admission_effect!=='NONE'||x.common_crawl_acquisition_effect!=='NONE')fail('PERMISSION_EFFECT');
  if(x.production!=='HOLD'||x.public_release!=='HOLD'||x.acquisition_authorized!==false||x.content_acquired!==false||x.target_site_body_crawled!==false)fail('RELEASE_BOUNDARY');
  if(x.listing_is_not_sold!==true||x.terminal_transaction_assertion_required!==true)fail('MARKET_SEMANTICS');
  if(!validObservedIndex(x.common_crawl_observed_index_id))fail('OBSERVED_INDEX_ID');
  const lane=(x.lane_health||[]).find(l=>l.lane_id==='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION');
  if(!lane||!['SUCCESS_WITH_RESULTS','SUCCESS_ZERO_RESULTS'].includes(lane.status))fail('LANE');
  if(Number(lane.observed_candidates)!==Number(x.common_crawl_observed_candidate_count)||Number(lane.new_candidates)!==Number(x.common_crawl_new_candidate_count))fail('LANE_COUNTS');
  if(lane.expansion_status!==x.common_crawl_expansion_status)fail('LANE_STATUS_BINDING');
  if(!validObservedIndex(lane.common_crawl_observed_index_id)||lane.common_crawl_observed_index_id!==x.common_crawl_observed_index_id)fail('OBSERVED_INDEX_LANE_BINDING');

  const zeroResults=x.common_crawl_expansion_status===zeroStatus;
  if(x.common_crawl_zero_result_noop!==zeroResults)fail('ZERO_RESULT_FLAG_BINDING');
  if(zeroResults){
    if(x.common_crawl_index_id!==null)fail('ZERO_RESULTS_MATERIAL_INDEX_ID');
    if(Number(x.common_crawl_observed_candidate_count)!==0||Number(x.common_crawl_new_candidate_count)!==0)fail('ZERO_RESULTS_COUNTS');
    if(Number(x.candidate_count)!==Number(x.common_crawl_premerge_candidate_count))fail('ZERO_RESULTS_NOT_NOOP');
    if(lane.status!=='SUCCESS_ZERO_RESULTS'||lane.common_crawl_index_id!==null)fail('ZERO_RESULTS_LANE');
  }else{
    if(!x.common_crawl_index_id||x.common_crawl_index_id!==x.common_crawl_observed_index_id)fail('MATERIAL_INDEX_ID');
    if(Number(x.common_crawl_observed_candidate_count)<1)fail('MATERIAL_OBSERVED_COUNT');
    if(lane.status!=='SUCCESS_WITH_RESULTS'||lane.common_crawl_index_id!==x.common_crawl_index_id)fail('MATERIAL_LANE');
  }

  const seen=new Set();let ccPrimary=0;let ccAny=0;
  for(const c of x.candidates||[]){
    if(!c.endpoint_url||seen.has(c.endpoint_url))fail('DUPLICATE_OR_MISSING_URL');seen.add(c.endpoint_url);
    if(c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.gate_1_state!=='PENDING'||c.evidence_state!=='DISCOVERY_METADATA_ONLY'||c.acquisition_authorized!==false||c.target_site_body_crawled!==false)fail('CANDIDATE_PROMOTION');
    const ccObserved=c.discovery_provider==='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION'||c.discovery_providers?.includes('COMMON_CRAWL_URL_INDEX_HOST_EXPANSION');
    if(ccObserved)ccAny++;
    if(c.discovery_provider==='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION'){
      ccPrimary++;
      if(c.discovery_channel!=='COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX'||c.source_family_hint!=='UNCLASSIFIED_ANY_SITE_CANDIDATE'||c.content_acquired!==false||c.live_external_observation!==true)fail('COMMON_CRAWL_CANDIDATE');
      let h;try{h=new URL(c.endpoint_url).hostname.toLowerCase()}catch{fail('COMMON_CRAWL_URL')}
      const seed=String(c.seed_host||'').toLowerCase();if(!seed||!(h===seed||h.endsWith(`.${seed}`)))fail('HOST_ESCAPE');
    }
  }
  if(ccPrimary<Number(x.common_crawl_new_candidate_count))fail('COMMON_CRAWL_PARTITION');
  if(zeroResults&&ccAny!==0)fail('ZERO_RESULTS_COMMON_CRAWL_CONTAMINATION');
  if(!zeroResults&&ccAny<Number(x.common_crawl_new_candidate_count))fail('MATERIAL_COMMON_CRAWL_PARTITION');
  return {zeroResults,ccPrimary,ccAny};
}

function expectReject(name,fixture){
  try{validate(structuredClone(fixture));}catch{return;}
  throw new Error(`FALSE_GREEN:${name}`);
}

function selfTest(){
  const baseCandidates=[
    {candidate_id:'base-a',endpoint_url:'https://a.example',discovery_provider:'BASE',rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false},
    {candidate_id:'base-b',endpoint_url:'https://b.example',discovery_provider:'BASE',rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false}
  ];
  const zero={id:'kidults-asi-global-low-risk-discovery-v1',primary_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',common_crawl_host_expansion_applied:true,common_crawl_expansion_status:zeroStatus,common_crawl_zero_result_noop:true,common_crawl_premerge_candidate_count:2,common_crawl_seed_host_count:2,common_crawl_observed_candidate_count:0,common_crawl_new_candidate_count:0,candidate_count:2,common_crawl_index_id:null,common_crawl_observed_index_id:'CC-MAIN-TEST',common_crawl_rights_effect:'NONE',common_crawl_admission_effect:'NONE',common_crawl_acquisition_effect:'NONE',production:'HOLD',public_release:'HOLD',acquisition_authorized:false,content_acquired:false,target_site_body_crawled:false,listing_is_not_sold:true,terminal_transaction_assertion_required:true,lane_health:[{lane_id:'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION',status:'SUCCESS_ZERO_RESULTS',observed_candidates:0,new_candidates:0,common_crawl_index_id:null,common_crawl_observed_index_id:'CC-MAIN-TEST',expansion_status:zeroStatus}],candidates:baseCandidates};
  validate(structuredClone(zero));
  const zeroNoIndex=structuredClone(zero);zeroNoIndex.common_crawl_observed_index_id=null;zeroNoIndex.lane_health[0].common_crawl_observed_index_id=null;validate(zeroNoIndex);
  for(const [name,mutate] of [
    ['ZERO_WITH_MATERIAL_INDEX',x=>{x.common_crawl_index_id='CC-MAIN-FABRICATED';}],
    ['ZERO_OBSERVED_INDEX_LANE_MISMATCH',x=>{x.common_crawl_observed_index_id='CC-MAIN-OTHER';}],
    ['ZERO_OBSERVED_INDEX_INVALID_TYPE',x=>{x.common_crawl_observed_index_id=7;}],
    ['ZERO_WITH_OBSERVED_COUNT',x=>{x.common_crawl_observed_candidate_count=1;x.lane_health[0].observed_candidates=1;}],
    ['ZERO_WITH_NEW',x=>{x.common_crawl_observed_candidate_count=1;x.common_crawl_new_candidate_count=1;x.candidate_count=3;x.lane_health[0].observed_candidates=1;x.lane_health[0].new_candidates=1;}],
    ['ZERO_WITH_RIGHTS_EFFECT',x=>{x.common_crawl_rights_effect='ALLOW';}],
    ['ZERO_WITH_MATERIAL_LANE',x=>{x.lane_health[0].status='SUCCESS_WITH_RESULTS';}]
  ]){const x=structuredClone(zero);mutate(x);expectReject(name,x);}
  const material=structuredClone(zero);
  material.common_crawl_expansion_status=materialStatus;material.common_crawl_zero_result_noop=false;material.common_crawl_index_id='CC-MAIN-TEST';material.common_crawl_observed_index_id='CC-MAIN-TEST';material.common_crawl_observed_candidate_count=1;material.common_crawl_new_candidate_count=1;material.candidate_count=3;material.lane_health[0]={lane_id:'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION',status:'SUCCESS_WITH_RESULTS',observed_candidates:1,new_candidates:1,common_crawl_index_id:'CC-MAIN-TEST',common_crawl_observed_index_id:'CC-MAIN-TEST',expansion_status:materialStatus};
  material.candidates.push({candidate_id:'cc-a',endpoint_url:'https://shop.seed.example/item',discovery_provider:'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION',discovery_channel:'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX',source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',seed_host:'seed.example',rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false,content_acquired:false,live_external_observation:true});
  validate(structuredClone(material));
  const badMaterial=structuredClone(material);badMaterial.common_crawl_index_id=null;expectReject('MATERIAL_WITHOUT_INDEX',badMaterial);
  console.log(JSON.stringify({test:'COMMON_CRAWL_ANY_SITE_GATE_BINDING_SELF_TEST',state:'VERIFIED_PASS',zero_result_noop:true,zero_result_observed_index_provenance:true,material_result_binding:true,negative_cases_rejected:8,production:'HOLD'}));
}

if(process.argv.includes('--self-test'))selfTest();
else{
  const p=process.argv[2]||'discovery-out/global-low-risk-discovery-common-crawl-v1.json';
  const x=JSON.parse(fs.readFileSync(p,'utf8'));
  const result=validate(x);
  console.log(JSON.stringify({status:result.zeroResults?'PASS_ZERO_RESULTS_NOOP':'PASS_WITH_RESULTS',expansion_status:x.common_crawl_expansion_status,zero_result_noop:x.common_crawl_zero_result_noop,index_id:x.common_crawl_index_id,observed_index_id:x.common_crawl_observed_index_id,seed_hosts:x.common_crawl_seed_host_count,observed_candidates:x.common_crawl_observed_candidate_count,new_candidates:x.common_crawl_new_candidate_count,merged_candidates:x.candidate_count,common_crawl_bound_candidates:result.ccAny,production:'HOLD'},null,2));
}
