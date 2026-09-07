#!/usr/bin/env node
import {execFileSync} from 'node:child_process';

function assertV3Authority(v3) {
  if(v3?.state!=='VERIFIED_PASS') throw new Error('V3_STATE_NOT_PASS');
  if(v3?.authority_model!=='CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT') throw new Error('V3_AUTHORITY_MODEL_INVALID');
  if(!/^[0-9a-f]{40}$/.test(v3?.protected_main_sha||'')) throw new Error('V3_MAIN_SHA_INVALID');
  if(!/^kpmo-canonical-v3-[0-9a-f]{12}-[1-9][0-9]*-[1-9][0-9]*$/.test(v3?.generation_id||'')) throw new Error('V3_GENERATION_ID_INVALID');
  if(!Number.isInteger(v3?.aggregate_comment_id)||v3.aggregate_comment_id<1) throw new Error('V3_AGGREGATE_COMMENT_INVALID');
  if(v3?.canonical_issue_count!==25||!Array.isArray(v3?.canonical_issues)||v3.canonical_issues.length!==25) throw new Error('V3_CANONICAL_CARDINALITY_INVALID');
  if(!Number.isInteger(v3?.material_defect_count)||v3.material_defect_count<0) throw new Error('V3_MATERIAL_COUNT_INVALID');
  if(!/^sha256:[0-9a-f]{64}$/.test(v3?.material_defect_registry_sha256||'')) throw new Error('V3_MATERIAL_DIGEST_INVALID');
  if(v3?.promotion_eligible!==false||v3?.production!=='HOLD'||v3?.public!=='HOLD'||v3?.g5!=='HOLD') throw new Error('V3_HOLD_BOUNDARY_INVALID');
  return true;
}

function selfTest(){
  const valid={state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT',protected_main_sha:'a'.repeat(40),generation_id:'kpmo-canonical-v3-aaaaaaaaaaaa-123-1',aggregate_comment_id:100,canonical_issue_count:25,canonical_issues:Array.from({length:25},(_,i)=>i+1),material_defect_count:2,material_defect_registry_sha256:`sha256:${'1'.repeat(64)}`,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
  assertV3Authority(valid);
  const mutations=[
    {...valid,state:'VERIFIED_FAIL'},
    {...valid,protected_main_sha:'b'.repeat(39)},
    {...valid,canonical_issue_count:24},
    {...valid,material_defect_registry_sha256:`sha256:${'0'.repeat(63)}`},
    {...valid,production:'PASS'}
  ];
  for(const mutated of mutations){let rejected=false;try{assertV3Authority(mutated);}catch{rejected=true;}if(!rejected)throw new Error('V3_AUTHORITY_MUTATION_ESCAPED');}
  console.log(JSON.stringify({state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_ONLY',legacy_v2_body_authority:false,negative_cases:mutations.length,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'}));
}

if(process.argv.includes('--self-test')){selfTest();process.exit(0);}
try{
  const text=execFileSync(process.execPath,['scripts/kidults/kpmo/canonical-generation-v3.mjs'],{encoding:'utf8',env:process.env,stdio:['ignore','pipe','pipe']});
  const v3=JSON.parse(text);
  assertV3Authority(v3);
  console.log(JSON.stringify({state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_ONLY',protected_main_sha:v3.protected_main_sha,generation_id:v3.generation_id,aggregate_comment_id:v3.aggregate_comment_id,canonical_issue_count:v3.canonical_issue_count,material_defect_count:v3.material_defect_count,material_defect_registry_sha256:v3.material_defect_registry_sha256,legacy_v2_body_authority:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
}catch(error){
  console.error(JSON.stringify({state:'VERIFIED_FAIL',authority_model:'CANONICAL_GENERATION_V3_ONLY',failure_class:error instanceof Error?error.message:String(error),legacy_v2_body_authority:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
  process.exit(1);
}
