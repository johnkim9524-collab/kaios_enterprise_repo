#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const scenarios = {
  'common-crawl-rights': {
    validator: 'scripts/kidults/source-intelligence/validate-asi-common-crawl-any-site-gate-binding-v1.mjs',
    reason: 'CANDIDATE_PROMOTION',
    baseline: () => ({
      id:'kidults-asi-global-low-risk-discovery-v1',primary_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
      common_crawl_host_expansion_applied:true,common_crawl_premerge_candidate_count:1,common_crawl_seed_host_count:1,
      common_crawl_observed_candidate_count:1,common_crawl_new_candidate_count:1,candidate_count:2,common_crawl_index_id:'CC-MAIN-fixture',
      common_crawl_rights_effect:'NONE',common_crawl_admission_effect:'NONE',common_crawl_acquisition_effect:'NONE',
      production:'HOLD',public_release:'HOLD',acquisition_authorized:false,content_acquired:false,target_site_body_crawled:false,
      listing_is_not_sold:true,terminal_transaction_assertion_required:true,
      lane_health:[{lane_id:'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION',status:'SUCCESS_WITH_RESULTS',observed_candidates:1,new_candidates:1}],
      candidates:[
        {candidate_id:'base',endpoint_url:'https://base.example/item',rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false,discovery_provider:'OTHER'},
        {candidate_id:'cc',endpoint_url:'https://cc.example/item',rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false,discovery_provider:'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION',discovery_channel:'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX',source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',content_acquired:false,live_external_observation:true,seed_host:'cc.example'}
      ]
    }),
    runtimeSubject: x => x.candidates?.find(y=>y.discovery_provider==='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION'||y.discovery_providers?.includes('COMMON_CRAWL_URL_INDEX_HOST_EXPANSION')) || null,
    mutate: x => {const c=x.candidates.find(y=>y.discovery_provider==='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION'||y.discovery_providers?.includes('COMMON_CRAWL_URL_INDEX_HOST_EXPANSION'));c.rights_state='ALLOW';}
  },
  'gate1-rights': {
    validator:'scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs',reason:'Gate1 created downstream right',
    baseline: () => gate1Baseline('HARD_BLOCK'),runtimeSubject:x=>x.receipts?.[0]||null,mutate:x=>{x.receipts[0].collection_right_created=true;}
  },
  'gate1-review': {
    validator:'scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs',reason:'safe pool without Gate1 PASS',
    baseline: () => gate1Baseline('REVIEW_REQUIRED'),runtimeSubject:x=>x.review_required_queue?.[0]||null,
    mutate:x=>{const c=x.review_required_queue[0];x.safe_candidate_pool.push(c);x.safe_candidate_count++;x.review_required_queue.shift();x.review_required_count--;}
  },
  'gate2-reuse': {
    validator:'scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs',reason:'Gate1 decision reused as evidence',
    baseline:gate2Baseline,runtimeSubject:x=>x.receipts?.[0]||null,mutate:x=>{x.receipts[0].gate1_decision_used_as_evidence=true;}
  },
  'gate2-collect': {
    validator:'scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs',reason:'unproven purpose promoted: collect',
    baseline:gate2Baseline,runtimeSubject:x=>x.receipts?.[0]||null,mutate:x=>{x.receipts[0].purpose_rights_matrix.collect='ALLOW';}
  },
  'gate3-content': {
    validator:'scripts/kidults/source-intelligence/validate-asi-gate3-admission-runtime-v1.mjs',reason:'content acquisition authorized',
    baseline:gate3ContentBaseline,runtimeSubject:x=>x.receipts?.[0]||null,mutate:x=>{x.receipts[0].content_acquisition_authorized=true;}
  },
  'gate3-scope': {
    validator:'scripts/kidults/source-intelligence/validate-asi-gate3-admission-runtime-v1.mjs',reason:'admission state too broad',
    baseline:gate3ScopeBaseline,runtimeSubject:x=>x.bounded_metadata_index_admission_pool?.[0]||null,mutate:x=>{x.bounded_metadata_index_admission_pool[0].admission_state='ADMITTED_FOR_ALL_PURPOSES';}
  },
  'revoked-alias': {
    validator:'scripts/kidults/source-intelligence/validate-asi-admitted-metadata-pool-v1.mjs',reason:'active candidate stale or revoked',
    baseline:admittedBaseline,runtimeSubject:x=>x.revoked_block_queue?.[0]||null,
    mutate:x=>{const c=x.revoked_block_queue[0];x.active_admitted_metadata_pool.push(c);x.active_count++;}
  }
};

function rightsUnknown(discover='UNKNOWN') {return {discover_metadata:discover,collect:'UNKNOWN',store:'UNKNOWN',derive:'UNKNOWN',internal_calibration:'UNKNOWN',retention:'UNKNOWN',redistribute:'UNKNOWN',public_project:'UNKNOWN',sold_event_fields:'UNKNOWN',listing_fields:'UNKNOWN',population_or_census_fields:'UNKNOWN'};}
function gate1Receipt(decision){return {receipt_type:'GATE_1_INGRESS_RECEIPT',gate:'GATE_1_ASI_INGRESS_VERIFICATION',source_candidate_id:'fixture-candidate',canonical_locator:'https://fixture.example/item',input_fingerprint:'sha256:'+'1'.repeat(64),source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',collection_right_created:false,store_right_created:false,derive_right_created:false,redistribution_right_created:false,acquisition_authorized:false,decision};}
function gate1Candidate(decision){return {candidate_id:'fixture-candidate',canonical_locator:'https://fixture.example/item',source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',source_family_classification:{rights_effect:'NONE',admission_effect:'NONE',market_claim_effect:'NONE'},candidate_source_roles:[],rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:decision==='REVIEW_REQUIRED'?'REVIEW_REQUIRED':'HARD_BLOCK',acquisition_authorized:false,gate_1_receipt:gate1Receipt(decision)};}
function gate1Baseline(decision){const review=decision==='REVIEW_REQUIRED';return {id:'kidults-asi-gate1-safe-candidate-pool-v1',status:'SHADOW_GATE1_INGRESS_CLASSIFICATION_COMPLETE',purpose:'DISCOVERY_METADATA_INDEX_ONLY',input_candidate_count:1,safe_candidate_count:0,review_required_count:review?1:0,hard_block_count:review?0:1,rights_promoted_automatically:false,admission_promoted_automatically:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD',gate2_required_before_any_collection_right:true,gate3_required_before_bounded_acquisition:true,source_family_classification_applied:true,source_family_counts:{UNCLASSIFIED_ANY_SITE_CANDIDATE:1},safe_candidate_pool:[],review_required_queue:review?[gate1Candidate(decision)]:[],hard_block_queue:review?[]:[gate1Candidate(decision)],receipts:[gate1Receipt(decision)]};}
function gate2Baseline(){return {id:'kidults-asi-gate2-independent-reverification-v1',status:'SHADOW_GATE2_INDEPENDENT_REVERIFICATION_COMPLETE',requested_purpose:'DISCOVERY_METADATA_INDEX_ONLY',gate1_decision_reuse_forbidden:true,collection_right_created:false,acquisition_authorized:false,production:'HOLD',public_release:'HOLD',input_safe_candidate_count:1,verified_eligible_pool:[],conditional_approval_queue:[],needs_clarification_queue:[{candidate_id:'fixture-candidate'}],blocked_queue:[],receipts:[{receipt_type:'GATE_2_INDEPENDENT_REVERIFICATION_RECEIPT',gate1_decision_used_as_evidence:false,collection_right_created:false,store_right_created:false,derive_right_created:false,redistribution_right_created:false,acquisition_authorized:false,decision:'NEEDS_CLARIFICATION',purpose_rights_matrix:rightsUnknown()}]};}
function gate3Receipt(decision='REJECTED'){return {gate:'GATE_3_ADMISSION_ACTIVATION_VERIFICATION',requested_purpose:'DISCOVERY_METADATA_INDEX_ONLY',collection_right_created:false,store_right_created:false,derive_right_created:false,redistribution_right_created:false,content_acquisition_authorized:false,public_projection:false,production:'HOLD',runtime_controls:{target_site_body_crawl:false,content_acquisition:false,credential_activation:false},decision,metadata_index_admission_authorized:decision==='ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION'};}
function gate3Base(){return {id:'kidults-asi-gate3-admission-runtime-v1',status:'SHADOW_GATE3_ADMISSION_CLASSIFICATION_COMPLETE',requested_purpose:'DISCOVERY_METADATA_INDEX_ONLY',content_acquisition_authorized:false,collection_right_created:false,admission_scope_limited_to_discovery_metadata_index_only:true,production:'HOLD',public_release:'HOLD',input_verified_for_gate3_count:1,external_approval_queue:[],conditional_hold_queue:[]};}
function gate3ContentBaseline(){return {...gate3Base(),bounded_metadata_index_admission_pool:[],rejected_queue:[{candidate_id:'fixture-candidate'}],receipts:[gate3Receipt()]};}
function gate3ScopeBaseline(){const matrix=rightsUnknown('ALLOW');const c={candidate_id:'fixture-candidate',gate_3_state:'ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION',admission_state:'ADMITTED_DISCOVERY_METADATA_INDEX_ONLY',acquisition_authorized:false,content_acquisition_authorized:false,gate_2_receipt:{decision:'VERIFIED_FOR_GATE_3',purpose_rights_matrix:matrix}};return {...gate3Base(),bounded_metadata_index_admission_pool:[c],rejected_queue:[],receipts:[gate3Receipt('ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION')]};}
function admittedBaseline(){const revoked={canonical_source_key:'fixture-key',admission_state:'ADMITTED_DISCOVERY_METADATA_INDEX_ONLY',acquisition_authorized:false,content_acquisition_authorized:false,admitted_pool_receipt:{fresh:false,is_revoked:true,alias_reentry_blocked:true}};return {id:'kidults-asi-admitted-metadata-pool-v1',status:'SHADOW_ADMITTED_METADATA_POOL_REVALIDATED',scope:'DISCOVERY_METADATA_INDEX_ONLY',freshness_ttl_hours:24,alias_reentry_block_required:true,content_acquisition_authorized:false,collection_right_created:false,public_release:'HOLD',production:'HOLD',active_count:0,stale_revalidation_count:0,revoked_block_count:1,active_admitted_metadata_pool:[],stale_revalidation_queue:[],revoked_block_queue:[revoked]};}

function runValidator(validator,file){return spawnSync(process.execPath,[validator,file],{encoding:'utf8'});}
function expectBaselinePass(spec,baseline,file){fs.writeFileSync(file,JSON.stringify(baseline));const result=runValidator(spec.validator,file);if(result.status!==0)throw new Error(`SYNTHETIC_BASELINE_INVALID:${spec.validator}:${result.stderr||result.stdout}`);}
function expectMutationRejected(spec,mutated,file){fs.writeFileSync(file,JSON.stringify(mutated));const result=runValidator(spec.validator,file);const output=`${result.stdout||''}${result.stderr||''}`;if(result.status===0)throw new Error(`SYNTHETIC_MUTATION_ACCEPTED:${spec.validator}`);if(!output.includes(spec.reason))throw new Error(`SYNTHETIC_WRONG_REJECTION:${spec.validator}:${spec.reason}:${output}`);}

function prepare(name,runtimePath,outputPath){const spec=scenarios[name];if(!spec)throw new Error(`UNKNOWN_SCENARIO:${name}`);let source='SYNTHETIC';let value=spec.baseline();if(runtimePath&&fs.existsSync(runtimePath)){const runtime=JSON.parse(fs.readFileSync(runtimePath,'utf8'));if(spec.runtimeSubject(runtime)){value=structuredClone(runtime);source='RUNTIME';}}
  if(source==='SYNTHETIC'){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kpmo-gate-baseline-'));expectBaselinePass(spec,value,path.join(dir,'baseline.json'));fs.rmSync(dir,{recursive:true,force:true});}
  spec.mutate(value);fs.writeFileSync(outputPath,JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify({state:'PREPARED_NEGATIVE_MUTATION',scenario:name,subject_origin:source,output:outputPath,expected_rejection:spec.reason}));}

function selfTest(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kpmo-gate-negative-'));let passed=0;try{for(const [name,spec] of Object.entries(scenarios)){const baseline=spec.baseline();const baselinePath=path.join(dir,`${name}-baseline.json`);const badPath=path.join(dir,`${name}-bad.json`);expectBaselinePass(spec,baseline,baselinePath);const mutated=structuredClone(baseline);spec.mutate(mutated);expectMutationRejected(spec,mutated,badPath);passed++;}}finally{fs.rmSync(dir,{recursive:true,force:true});}console.log(JSON.stringify({state:'VERIFIED_PASS',suite:'ASI_GATE_DETERMINISTIC_NEGATIVE_FIXTURES_V1',scenarios:passed,runtime_zero_cardinality_supported:true,synthetic_baseline_must_pass_before_mutation:true,exact_rejection_reason_required:true,production:'HOLD',public_release:'HOLD'}));}

const argv=process.argv.slice(2);
if(argv.includes('--self-test')) selfTest();
else {const at=n=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:null};prepare(at('--prepare'),at('--runtime'),at('--output'));}
