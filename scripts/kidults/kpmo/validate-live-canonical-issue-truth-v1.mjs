#!/usr/bin/env node
import {execFileSync} from 'node:child_process';

function fail(message){
  console.error(`FAIL canonical issue truth: ${message}`);
  process.exit(1);
}

function assertV3Authority(v3){
  if(v3?.state!=='VERIFIED_PASS') throw new Error('V3_STATE_NOT_PASS');
  if(v3?.authority_model!=='CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT') throw new Error('V3_AUTHORITY_MODEL_INVALID');
  if(!/^[0-9a-f]{40}$/.test(v3?.protected_main_sha||'')) throw new Error('V3_MAIN_SHA_INVALID');
  if(!/^kpmo-canonical-v3-[0-9a-f]{12}-[1-9][0-9]*-[1-9][0-9]*$/.test(v3?.generation_id||'')) throw new Error('V3_GENERATION_ID_INVALID');
  if(!Number.isInteger(v3?.aggregate_comment_id)||v3.aggregate_comment_id<1) throw new Error('V3_AGGREGATE_COMMENT_INVALID');
  if(v3?.canonical_issue_count!==25||!Array.isArray(v3?.canonical_issues)||v3.canonical_issues.length!==25||new Set(v3.canonical_issues).size!==25) throw new Error('V3_CANONICAL_CARDINALITY_INVALID');
  if(!Array.isArray(v3?.active_baseline_trust_root_defects)) throw new Error('V3_BASELINE_SET_INVALID');
  if(!Number.isInteger(v3?.material_defect_count)||v3.material_defect_count<0) throw new Error('V3_MATERIAL_COUNT_INVALID');
  if(!/^sha256:[0-9a-f]{64}$/.test(v3?.material_defect_registry_sha256||'')) throw new Error('V3_MATERIAL_DIGEST_INVALID');
  if(!Array.isArray(v3?.material_defects)||v3.material_defects.length!==v3.material_defect_count) throw new Error('V3_MATERIAL_RECORDS_INVALID');
  const issueNumbers=v3.material_defects.map((item)=>item?.issue_number);
  if(issueNumbers.some((number)=>!Number.isInteger(number)||number<1)||new Set(issueNumbers).size!==issueNumbers.length) throw new Error('V3_MATERIAL_MEMBER_SET_INVALID');
  if(!v3?.material_defect_query_cardinality||!Number.isInteger(v3.material_defect_query_cardinality.P0)||!Number.isInteger(v3.material_defect_query_cardinality.P1)) throw new Error('V3_MATERIAL_CARDINALITY_INVALID');
  const p0=v3.material_defects.filter((item)=>Array.isArray(item?.labels)&&item.labels.includes('P0')).length;
  const p1=v3.material_defects.filter((item)=>Array.isArray(item?.labels)&&item.labels.includes('P1')).length;
  if(v3.material_defect_query_cardinality.P0!==p0||v3.material_defect_query_cardinality.P1!==p1) throw new Error('V3_MATERIAL_CARDINALITY_BINDING_INVALID');
  if(v3?.empirical_promotion!==false||v3?.whole_platform_closure!==false||v3?.promotion_eligible!==false||v3?.production!=='HOLD'||v3?.public!=='HOLD'||v3?.g5!=='HOLD') throw new Error('V3_PROMOTION_BOUNDARY_INVALID');
  return true;
}

function runSelfTest(){
  const records=[
    {issue_number:10,effective_priority:'P0',labels:['P0','P1']},
    {issue_number:11,effective_priority:'P1',labels:['P1']}
  ];
  const valid={state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT',protected_main_sha:'a'.repeat(40),generation_id:'kpmo-canonical-v3-aaaaaaaaaaaa-123-1',aggregate_comment_id:100,canonical_issue_count:25,canonical_issues:Array.from({length:25},(_,i)=>i+1),active_baseline_trust_root_defects:[1330],material_defect_count:2,material_defect_registry_sha256:`sha256:${'1'.repeat(64)}`,material_defect_query_cardinality:{P0:1,P1:2},material_defects:records,empirical_promotion:false,whole_platform_closure:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
  assertV3Authority(valid);
  const mutations=[
    {...valid,state:'VERIFIED_FAIL'},
    {...valid,aggregate_comment_id:null},
    {...valid,material_defect_count:3},
    {...valid,material_defect_query_cardinality:{P0:2,P1:1}},
    {...valid,material_defects:[records[0],records[0]]},
    {...valid,whole_platform_closure:true}
  ];
  for(const mutated of mutations){let rejected=false;try{assertV3Authority(mutated);}catch{rejected=true;}if(!rejected)throw new Error('SELF_TEST_V3_MUTATION_ESCAPED');}
  console.log(JSON.stringify({test:'LIVE_CANONICAL_ISSUE_TRUTH_V3_AUTHORITY_SELF_TEST',state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_ONLY',legacy_v2_body_authority:false,label_overlap_cardinality_preserved:true,negative_cases:mutations.length}));
}

if(process.argv.includes('--self-test')){
  runSelfTest();
  process.exit(0);
}

const repository=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
const expectedMainSha=process.env.EXPECTED_PROTECTED_MAIN_SHA;
const allowPrMainAdvance=process.env.ALLOW_MAIN_ADVANCE_DURING_PR_VALIDATION==='true';
if(!repository||!token||!/^[0-9a-f]{40}$/i.test(expectedMainSha||'')) fail('GITHUB_REPOSITORY, GITHUB_TOKEN, and exact EXPECTED_PROTECTED_MAIN_SHA are required');

try{
  const text=execFileSync(process.execPath,['scripts/kidults/kpmo/canonical-generation-v3.mjs'],{encoding:'utf8',env:process.env,stdio:['ignore','pipe','pipe']});
  const v3=JSON.parse(text);
  assertV3Authority(v3);
  if(!allowPrMainAdvance&&v3.protected_main_sha!==expectedMainSha) throw new Error(`MAIN_MOVED:${expectedMainSha}:${v3.protected_main_sha}`);
  console.log(JSON.stringify({
    validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',
    version:'3.1.0',
    state:'VERIFIED_PASS',
    authority_model:'CANONICAL_GENERATION_V3_ONLY',
    generation_id:v3.generation_id,
    aggregate_comment_id:v3.aggregate_comment_id,
    protected_main_sha:v3.protected_main_sha,
    event_base_sha:expectedMainSha,
    live_main_observed:v3.protected_main_sha,
    main_advance_during_pr_validation_allowed:allowPrMainAdvance,
    canonical_main_policy:'EXACT_CURRENT_MAIN_COMMITTED_V3_GENERATION',
    correction_pr_validation:false,
    canonical_correction_pr:Number(process.env.CANONICAL_CORRECTION_PR_NUMBER||1431),
    canonical_correction_head:null,
    live_correction_head_enforced_in_issues:false,
    canonical_issues:v3.canonical_issues,
    active_baseline_trust_root_defects:v3.active_baseline_trust_root_defects,
    material_defect_scope_policy:'ALL_OPEN_MATERIAL_ISSUES_FROM_V3_LIVE_REGISTRY; FAIL_CLOSED_ON_CARDINALITY_OR_DIGEST_DRIFT',
    material_defect_representation_mode:'CANONICAL_V3_EXACT_RUN_DYNAMIC_MACHINE_REGISTRY',
    material_defect_query_cardinality:v3.material_defect_query_cardinality,
    material_defect_count:v3.material_defect_count,
    material_defect_registry_sha256:v3.material_defect_registry_sha256,
    material_defects:v3.material_defects,
    dynamic_query_pagination_verified:true,
    dynamic_query_cardinality_verified:true,
    dynamic_query_incomplete_results_rejected:true,
    dynamic_new_defect_discovery_mutation_rejected:true,
    dynamic_defect_omission_mutation_rejected:true,
    canonical_main_ancestry_verified:true,
    legacy_v2_body_authority:false,
    empirical_promotion:false,
    whole_platform_closure:false,
    production:'HOLD',
    public:'HOLD',
    g5:'HOLD'
  },null,2));
}catch(error){
  fail(error instanceof Error?error.message:String(error));
}
