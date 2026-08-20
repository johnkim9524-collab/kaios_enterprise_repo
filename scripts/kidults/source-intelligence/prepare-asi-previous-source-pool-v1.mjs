#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const p=process.argv[2]||'/tmp/previous-source-pool/asi-proactive-source-pool-v1.json';
if(!fs.existsSync(p)){
  console.log(JSON.stringify({status:'NO_PREVIOUS_POOL',cycle_index:0,previous_pool_valid:false}));
  process.exit(0);
}
const v=spawnSync(process.execPath,['scripts/kidults/source-intelligence/validate-asi-proactive-source-pool-v1.mjs',p],{encoding:'utf8'});
if(v.status!==0){
  fs.rmSync(p,{force:true});
  console.log(JSON.stringify({status:'PREVIOUS_POOL_REJECTED_FRESH_RESTART',cycle_index:0,previous_pool_valid:false,validator_exit:v.status,validator_error:(v.stderr||'').slice(0,500)}));
  process.exit(0);
}
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const cycle=Number(x.cycle_count||0)%10;
if(!Number.isInteger(cycle)||cycle<0||cycle>9){fs.rmSync(p,{force:true});console.log(JSON.stringify({status:'PREVIOUS_POOL_CYCLE_INVALID_FRESH_RESTART',cycle_index:0,previous_pool_valid:false}));process.exit(0)}
console.log(JSON.stringify({status:'PREVIOUS_POOL_VALID',cycle_index:cycle,previous_pool_valid:true,previous_candidate_count:Number(x.candidate_count||0),previous_cycle_count:Number(x.cycle_count||0)}));
