import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

const fixture=()=>({id:'kidults-asi-hourly-v2-promotion-input-v1',v2_cycles:[1,2].map(run=>({artifact_id:`artifact-${run}`,workflow_run_id:String(run),receipt:{id:'kidults-asi-global-any-site-hourly-cycle-receipt-v2',status:'SHADOW_ANY_SITE_COMMON_CRAWL_FULL_GATE_CHAIN_COMPLETE',discovered_candidates:166,live_external_candidates:102,healthy_live_lanes:3,common_crawl_applied:true,common_crawl_index_id:'CC-MAIN-2026-39',common_crawl_seed_hosts:8,common_crawl_observed_candidates:4,common_crawl_new_candidates:4,gate1_safe_candidates:0,gate1_review_required:166,gate1_hard_blocked:0,gate2_verified_for_gate3:0,gate3_bounded_metadata_admitted:0,rolling_discovery_pool_candidates:618,content_acquisition_authorized:false,collection_right_created:false,public_release:'HOLD',production:'HOLD'}}))});
const filtered=(value,input=0)=>{for(const c of value.v2_cycles)Object.assign(c.receipt,{gate1_partition_contract:'PRODUCT_VALUE_GATED_DISCOVERY_V1',gate1_input_candidate_count:input,product_value_enrichment_queue_count:166-input,gate1_review_required:input});return value;};
function run(value){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kpmo-promotion-partition-'));
  try{
    const input=path.join(dir,'input.json'),output=path.join(dir,'output.json');
    fs.writeFileSync(input,JSON.stringify(value));
    const result=spawnSync(process.execPath,['scripts/kidults/source-intelligence/validate-asi-hourly-v2-promotion-readiness-v1.mjs',input,output],{encoding:'utf8'});
    return {...result,receipt:fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):null};
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('legacy discovery partition remains valid',()=>assert.equal(run(fixture()).status,0));
test('actual filtered-empty input accounts for all 166 enrichment candidates',()=>{
  const result=run(filtered(fixture()));assert.equal(result.status,0,result.stderr);assert.equal(result.receipt.production,'HOLD');assert.equal(result.receipt.public_release,'HOLD');assert.equal(result.receipt.retirement_scope,'SCHEDULED_V1_DEFAULT_PATH_ONLY');
});
test('nonempty filtered input uses its own partition',()=>assert.equal(run(filtered(fixture(),90)).status,0));
test('legacy zero partition does not silently acquire new meaning',()=>{const x=fixture();x.v2_cycles[0].receipt.gate1_review_required=0;assert.match(run(x).stderr,/GATE1_PARTITION/);});
for(const [name,mutate,code] of [
  ['partial contract',r=>delete r.product_value_enrichment_queue_count,'GATE1_PARTITION_CONTRACT'],
  ['unknown contract',r=>r.gate1_partition_contract='UNREGISTERED','GATE1_PARTITION_CONTRACT'],
  ['unaccounted discovery',r=>r.product_value_enrichment_queue_count=165,'PRODUCT_VALUE_PARTITION'],
  ['fractional count',r=>r.gate1_input_candidate_count=0.5,'GATE1_PARTITION_COUNT'],
  ['negative count',r=>r.gate1_safe_candidates=-1,'GATE1_PARTITION_COUNT'],
  ['missing partition member',r=>delete r.gate1_hard_blocked,'GATE1_PARTITION_COUNT'],
  ['Gate1 mismatch',r=>r.gate1_review_required=1,'GATE1_PARTITION'],
  ['Gate2 authority beyond Safe pool',r=>r.gate2_verified_for_gate3=1,'GATE2_BOUNDARY'],
  ['rights promotion',r=>r.content_acquisition_authorized=true,'V2_PERMISSION_BOUNDARY'],
  ['production release',r=>r.production='APPROVED','V2_PERMISSION_BOUNDARY']
])test(`reject ${name}`,()=>{const x=filtered(fixture());mutate(x.v2_cycles[0].receipt);const result=run(x);assert.notEqual(result.status,0);assert.match(result.stderr,new RegExp(code));assert.equal(result.receipt,null);});

function cycleReceipt(input=90,enrichment=76){
  const workflow=fs.readFileSync('.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml','utf8');
  const code=workflow.match(/node - <<'NODE' >\/tmp\/asi-global-any-site-hourly-cycle-receipt-v2\.json\n([\s\S]*?)\n\s+NODE/)[1].replace(/^          /gm,'');
  let output='';
  const objects={
    'discovery-out/global-low-risk-discovery-governed-v2.json':{candidate_count:166},
    '/tmp/asi-gate1-safe-candidate-pool-v2.json':{input_candidate_count:input},
    '/tmp/asi-product-value-gated-discovery-v1.json':{candidate_count:90,pre_value_gate_candidate_count:166,product_value_enrichment_queue_count:enrichment},
    '/tmp/asi-source-eligibility-receipts-v1.json':{summary:{product_content_admitted:0}}
  };
  vm.runInNewContext(code,{require:name=>{assert.equal(name,'fs');return {readFileSync:file=>JSON.stringify(objects[file]||{})};},process:{stdout:{write:text=>output+=text}}});
  return JSON.parse(output);
}
test('workflow emits the actual filtered-input and enrichment counts',()=>{
  const r=cycleReceipt();assert.equal(r.discovered_candidates,166);assert.equal(r.gate1_input_candidate_count,90);assert.equal(r.product_value_enrichment_queue_count,76);assert.equal(r.content_acquisition_authorized,false);assert.equal(r.production,'HOLD');
});
test('workflow refuses a Gate1 input drift before receipt emission',()=>assert.throws(()=>cycleReceipt(89),/PRODUCT_VALUE_GATE1_INPUT_PARTITION_BINDING/));
test('workflow refuses an enrichment queue cardinality drift',()=>assert.throws(()=>cycleReceipt(90,75),/PRODUCT_VALUE_GATE1_INPUT_PARTITION_BINDING/));
