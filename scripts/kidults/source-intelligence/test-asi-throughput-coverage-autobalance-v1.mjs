import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autobalance-partition-'));
const build='scripts/kidults/source-intelligence/build-asi-throughput-coverage-autobalance-v1.mjs';
const validate='scripts/kidults/source-intelligence/validate-asi-throughput-coverage-autobalance-v1.mjs';
const candidates=Array.from({length:164},(_,i)=>({candidate_id:`c${i}`,source_name:i%2?'Example Museum':'Unknown',source_family_hint:'NON_CANONICAL_HINT'}));
const discovery={candidate_count:164,candidates};
const gate={input_candidate_count:0,safe_candidate_count:0,safe_candidate_pool:[],review_required_queue:[],hard_block_queue:[]};
function run(d,g){
  const values=[d,g,{}, {},{}];const files=values.map((v,i)=>{const p=path.join(dir,`${i}.json`);fs.writeFileSync(p,JSON.stringify(v));return p;});
  const out=path.join(dir,'out.json');const result=spawnSync(process.execPath,[build,...files,out],{encoding:'utf8'});
  return {result,out,value:result.status===0?JSON.parse(fs.readFileSync(out)):null};
}
try {
  const x=run(discovery,gate);assert.equal(x.result.status,0,x.result.stderr);
  assert.equal(spawnSync(process.execPath,[validate,x.out]).status,0);
  assert.equal(x.value.coverage.source_family_counts.MUSEUM_OR_INSTITUTIONAL_CONTEXT,82);
  assert.equal(x.value.coverage.source_family_counts.UNCLASSIFIED_ANY_SITE_CANDIDATE,82);
  assert.equal(x.value.throughput.gate1_safe,0);assert.equal(x.value.production,'HOLD');
  const subset={...gate,input_candidate_count:1,review_required_queue:[candidates[0]]};
  assert.equal(run(discovery,subset).result.status,0);
  for(const [d,g,code] of [
    [{...discovery,candidate_count:163},gate,'DISCOVERY_IDENTITY_PARTITION'],
    [{...discovery,candidates:[...candidates.slice(0,163),candidates[0]]},gate,'DISCOVERY_IDENTITY_PARTITION'],
    [discovery,{...subset,review_required_queue:[{candidate_id:'foreign'}]},'GATE1_DISCOVERY_SUBSET_BINDING'],
    [discovery,{...subset,input_candidate_count:2,review_required_queue:[candidates[0],candidates[0]]},'GATE1_DISCOVERY_SUBSET_BINDING'],
    [discovery,{...subset,input_candidate_count:0},'GATE1_INPUT_PARTITION'],
    [discovery,{...gate,safe_candidate_count:1},'GATE1_SAFE_PARTITION'],
  ]){const x=run(d,g);assert.notEqual(x.result.status,0);assert.ok(x.result.stderr.includes(code),x.result.stderr);}
  console.log('PASS: discovery coverage, zero/subset Gate1 and six malformed partition regressions');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
