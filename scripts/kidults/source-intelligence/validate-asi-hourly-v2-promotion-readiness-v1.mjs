#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const inputPath=process.argv[2]||'/tmp/asi-hourly-v2-promotion-input-v1.json';
const outPath=process.argv[3]||'/tmp/asi-hourly-v2-promotion-readiness-v1.json';
const x=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const fail=m=>{throw new Error(m)};
const num=v=>Number(v||0);

if(x.id!=='kidults-asi-hourly-v2-promotion-input-v1')fail('INPUT_ID');
if(!Array.isArray(x.v2_cycles)||x.v2_cycles.length<2)fail('TWO_V2_CYCLES_REQUIRED');
const cycles=x.v2_cycles.slice(0,2);
const runIds=cycles.map(c=>String(c.workflow_run_id||''));
if(runIds.some(v=>!v)||new Set(runIds).size!==runIds.length)fail('DISTINCT_V2_RUNS_REQUIRED');
let totalObserved=0,totalNew=0;
for(const c of cycles){
  const r=c.receipt||{};
  if(r.id!=='kidults-asi-global-any-site-hourly-cycle-receipt-v2'||r.status!=='SHADOW_ANY_SITE_COMMON_CRAWL_FULL_GATE_CHAIN_COMPLETE')fail('V2_RECEIPT_IDENTITY');
  if(r.production!=='HOLD'||r.public_release!=='HOLD'||r.content_acquisition_authorized!==false||r.collection_right_created!==false)fail('V2_PERMISSION_BOUNDARY');
  if(r.common_crawl_applied!==true||!r.common_crawl_index_id)fail('COMMON_CRAWL_NOT_APPLIED');
  if(!Number.isInteger(num(r.common_crawl_seed_hosts))||num(r.common_crawl_seed_hosts)<1||num(r.common_crawl_seed_hosts)>8)fail('COMMON_CRAWL_SEED_BUDGET');
  if(num(r.common_crawl_observed_candidates)<0||num(r.common_crawl_new_candidates)<0||num(r.common_crawl_new_candidates)>num(r.common_crawl_observed_candidates))fail('COMMON_CRAWL_COUNTS');
  if(num(r.discovered_candidates)<1||num(r.live_external_candidates)<1||num(r.healthy_live_lanes)<1)fail('V2_DISCOVERY_EMPIRICAL');
  if(num(r.gate1_safe_candidates)+num(r.gate1_review_required)+num(r.gate1_hard_blocked)!==num(r.discovered_candidates))fail('GATE1_PARTITION');
  if(num(r.gate2_verified_for_gate3)>num(r.gate1_safe_candidates))fail('GATE2_BOUNDARY');
  if(num(r.gate3_bounded_metadata_admitted)>num(r.gate2_verified_for_gate3))fail('GATE3_BOUNDARY');
  if(num(r.rolling_discovery_pool_candidates)<num(r.discovered_candidates))fail('ROLLING_POOL_REGRESSION');
  totalObserved+=num(r.common_crawl_observed_candidates);totalNew+=num(r.common_crawl_new_candidates);
}
if(totalObserved<1)fail('NO_COMMON_CRAWL_EMPIRICAL_OBSERVATION_ACROSS_TWO_CYCLES');
if(totalNew<1)fail('NO_COMMON_CRAWL_INCREMENT_ACROSS_TWO_CYCLES');
const v1=x.v1_baseline?.receipt||null;
let baselineCheck='NOT_AVAILABLE';
if(v1){
  if(v1.id!=='kidults-asi-global-any-site-hourly-cycle-receipt-v1')fail('V1_RECEIPT_IDENTITY');
  if(v1.production!=='HOLD'||v1.public_release!=='HOLD'||v1.content_acquisition_authorized!==false||v1.collection_right_created!==false)fail('V1_PERMISSION_BOUNDARY');
  const floor=Math.max(1,Math.floor(num(v1.discovered_candidates)*0.5));
  const liveFloor=Math.max(1,Math.floor(num(v1.live_external_candidates)*0.5));
  for(const c of cycles){const r=c.receipt;if(num(r.discovered_candidates)<floor||num(r.live_external_candidates)<liveFloor)fail('V2_CATASTROPHIC_DISCOVERY_REGRESSION');}
  baselineCheck='PASS_NON_CATASTROPHIC_LIVE_VARIANCE';
}
const output={id:'kidults-asi-hourly-v2-promotion-readiness-v1',version:'1.0.0',status:'READY_TO_RETIRE_V1_AFTER_TWO_CONSECUTIVE_MAIN_CYCLES',evaluated_v2_workflow_run_ids:runIds,evaluated_v2_artifact_ids:cycles.map(c=>String(c.artifact_id||'')),v1_baseline_workflow_run_id:x.v1_baseline?.workflow_run_id||null,v1_baseline_check:baselineCheck,common_crawl_observed_candidates_across_cycles:totalObserved,common_crawl_new_candidates_across_cycles:totalNew,rules:{two_distinct_successful_v2_main_cycles_required:true,common_crawl_empirical_increment_required:true,v1_may_not_be_retired_on_single_cycle:true,rights_or_admission_scope_may_not_expand:true,production_or_public_scope_may_not_expand:true},retirement_scope:'SCHEDULED_V1_DEFAULT_PATH_ONLY',rollback_target:'KIDULTS ASI Global Any-Site Hourly Pooling v1',public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
