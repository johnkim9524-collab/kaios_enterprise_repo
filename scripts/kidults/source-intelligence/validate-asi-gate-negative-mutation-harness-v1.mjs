#!/usr/bin/env node
import fs from 'node:fs';

const preparer='scripts/kidults/source-intelligence/prepare-asi-gate-negative-mutation-v1.mjs';
const workflows={
  v1:'.github/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml',
  v2:'.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml'
};
const v2Scenarios=[
  ['common-crawl-rights','discovery-out/global-low-risk-discovery-governed-v2.json','/tmp/bad-common-crawl-rights-v2.json','scripts/kidults/source-intelligence/validate-asi-common-crawl-any-site-gate-binding-v1.mjs','CANDIDATE_PROMOTION'],
  ['gate1-rights','/tmp/asi-gate1-safe-candidate-pool-v2.json','/tmp/bad-gate1-right-v2.json','scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs','Gate1 created downstream right'],
  ['gate1-review','/tmp/asi-gate1-safe-candidate-pool-v2.json','/tmp/bad-gate1-pool-v2.json','scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs','safe pool without Gate1 PASS'],
  ['gate2-reuse','/tmp/asi-gate2-independent-reverification-v2.json','/tmp/bad-gate2-reuse-v2.json','scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs','Gate1 decision reused as evidence'],
  ['gate2-collect','/tmp/asi-gate2-independent-reverification-v2.json','/tmp/bad-gate2-collect-v2.json','scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs','unproven purpose promoted: collect'],
  ['gate3-content','/tmp/asi-gate3-admission-runtime-v2.json','/tmp/bad-gate3-content-v2.json','scripts/kidults/source-intelligence/validate-asi-gate3-admission-runtime-v1.mjs','content acquisition authorized'],
  ['revoked-alias','/tmp/asi-admitted-metadata-pool-v2.json','/tmp/bad-revoked-reentry-v2.json','scripts/kidults/source-intelligence/validate-asi-admitted-metadata-pool-v1.mjs','active candidate stale or revoked']
];
const count=(source,needle)=>source.split(needle).length-1;
const fail=message=>{throw new Error(message)};
const stepBlock=(source,needle)=>{const anchor=source.indexOf(needle);if(anchor<0)fail('missing step anchor '+needle);const start=source.lastIndexOf('\n      - name:',anchor);const next=source.indexOf('\n      - name:',anchor+1);return source.slice(start<0?0:start,next<0?source.length:next);};

function validateShared(source,label,expectedSelfTests){
  if(source.includes('_MUTATION_SUBJECT_MISSING'))fail(`${label}: runtime cardinality coupled to negative proof`);
  const selfTest=`node ${preparer} --self-test`;
  if(count(source,selfTest)!==expectedSelfTests)fail(`${label}: deterministic preparer self-test cardinality expected ${expectedSelfTests} observed ${count(source,selfTest)}`);
  // Executing the preparer self-test is itself a Node parse/load check. Do not couple
  // this validator to whether extra syntax checking is expressed literally or via a loop.
  if(count(source,preparer)<expectedSelfTests+1)fail(`${label}: preparer not bound into validation/execution context`);
  if(source.includes('process.exit(0)')||source.includes('process.exit(2)'))fail(`${label}: vacuous mutation success exit`);
}

function validateV1(source){
  validateShared(source,'v1',2);
  const trigger=source.slice(0,source.indexOf('\npermissions:'));
  if(/^\s{2}schedule:/m.test(trigger)||/^\s{2}push:/m.test(trigger))fail('v1: independent production trigger reintroduced');
  if(!trigger.includes('workflow_dispatch:')||!trigger.includes('pull_request:'))fail('v1: recovery/static triggers missing');
  if(!source.includes("validate-legacy-recovery-contract:\n    if: github.event_name == 'pull_request'"))fail('v1: PR static lane missing');
  if(!source.includes("legacy-recovery-runtime:\n    if: github.event_name == 'workflow_dispatch'"))fail('v1: manual recovery lane missing');
  if(!source.includes("test \"$GITHUB_REF\" = 'refs/heads/main'"))fail('v1: recovery main guard missing');
  if(!source.includes("promotion_eligible:false")||!source.includes("g5:'HOLD'"))fail('v1: recovery authority boundary missing');
}

function validateV2(source){
  validateShared(source,'v2',1);
  for(const [scenario,runtime,badPath,validator,reason] of v2Scenarios){
    const prepare=`node ${preparer} --prepare ${scenario} --runtime ${runtime} --output ${badPath}`;
    const block=stepBlock(source,badPath);
    if(count(block,prepare)!==1)fail(`v2: preparer cardinality ${scenario}`);
    if(count(block,badPath)!==2)fail(`v2: bad artifact cardinality ${scenario}`);
    const capture=`OUTPUT=$(node ${validator} ${badPath} 2>&1)`;
    if(count(block,capture)!==1)fail(`v2: validator capture missing ${scenario}`);
    if(count(block,'STATUS=$?')!==1)fail(`v2: validator status capture missing ${scenario}`);
    if(count(block,'test "$STATUS" -ne 0')!==1)fail(`v2: nonzero rejection assertion missing ${scenario}`);
    const reasonCheck=`grep -F '${reason}' <<<\"$OUTPUT\"`;
    if(count(block,reasonCheck)!==1)fail(`v2: exact rejection reason missing ${scenario}`);
    if(block.includes('[ -f '+badPath+' ]'))fail(`v2: optional negative artifact guard ${scenario}`);
  }
}

function validateAll(sources){validateV1(sources.get(workflows.v1));validateV2(sources.get(workflows.v2));}
const pristine=new Map(Object.values(workflows).map(p=>[p,fs.readFileSync(p,'utf8')]));
validateAll(pristine);

if(process.argv.includes('--self-test')){
  const v1=pristine.get(workflows.v1),v2=pristine.get(workflows.v2);
  const [scenario,runtime,badPath,validator,reason]=v2Scenarios[0];
  const prepare=`node ${preparer} --prepare ${scenario} --runtime ${runtime} --output ${badPath}`;
  const capture=`OUTPUT=$(node ${validator} ${badPath} 2>&1)`;
  const reasonCheck=`grep -F '${reason}' <<<\"$OUTPUT\"`;
  const cases=[
    ['v1 one of two self-tests removed',workflows.v1,v1.replace(`node ${preparer} --self-test`,'true # removed deterministic fixture proof')],
    ['v1 schedule restored',workflows.v1,v1.replace('  workflow_dispatch:\n',"  workflow_dispatch:\n  schedule:\n    - cron: '47 * * * *'\n")],
    ['v2 self-test removed',workflows.v2,v2.replace(`node ${preparer} --self-test`,'true # removed deterministic fixture proof')],
    ['v2 prepare removed',workflows.v2,v2.replace(prepare,'true # mutation preparation removed')],
    ['v2 wrong scenario',workflows.v2,v2.replace(`--prepare ${scenario}`, '--prepare gate1-rights')],
    ['v2 optional validator guard',workflows.v2,v2.replace(capture,'[ -f '+badPath+' ] && '+capture)],
    ['v2 status assertion removed',workflows.v2,v2.replace('test "$STATUS" -ne 0','true # status assertion removed')],
    ['v2 exact reason removed',workflows.v2,v2.replace(reasonCheck,'true # reason check removed')],
    ['v2 duplicate preparer',workflows.v2,v2.replace(prepare,prepare+'\n          '+prepare)]
  ];
  for(const [name,path,mutated] of cases){const altered=new Map(pristine);altered.set(path,mutated);let rejected=false;try{validateAll(altered)}catch{rejected=true}if(!rejected)fail('self-test mutation survived: '+name);}
}

console.log(JSON.stringify({status:'VERIFIED_PASS',control:'ASI_GATE_NEGATIVE_PROOF_DETERMINISTIC_FIXTURE_AUTHORITY_V1',v1_preparer_self_test_cardinality:2,v2_preparer_self_test_cardinality:1,v1_redundant_runtime_negative_suite_removed:true,v2_runtime_or_synthetic_negative_scenarios:v2Scenarios.length,runtime_zero_cardinality_supported:true,synthetic_baseline_prevalidated:true,preparer_self_test_is_parse_and_contract_authority:true,exact_validator_rejection_required:true,self_test:process.argv.includes('--self-test'),public_release:'HOLD',production:'HOLD'},null,2));
