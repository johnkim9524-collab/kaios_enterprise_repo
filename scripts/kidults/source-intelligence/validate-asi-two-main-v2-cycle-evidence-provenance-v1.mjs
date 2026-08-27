#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath='.github/workflows/kidults-asi-two-main-v2-cycle-evidence-v1.yml';
const text=fs.readFileSync(workflowPath,'utf8');
const fail=m=>{throw new Error(m)};

function validate(source){
  const required=[
    'EXPECTED_SHA="$GITHUB_SHA"',
    '.head_sha==$sha',
    '.repository.full_name==$repo',
    '.path==$path',
    '.event=="workflow_dispatch"',
    'artifact_count=$(jq',
    'test "$artifact_count" -eq 1',
    'artifact_digest=$(jq',
    '[[ "$artifact_digest" =~ ^sha256:',
    'test "$SHA0" = "$GITHUB_SHA"',
    'test "$SHA1" = "$GITHUB_SHA"',
    "producer_workflow_path:'.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml'",
    'expected_source_sha:expected',
    'v1_baseline:null',
    "status:'TWO_DISTINCT_SUCCESSFUL_EXACT_GENERATION_MAIN_V2_CYCLES_PROVED'"
  ];
  for(const marker of required)if(!source.includes(marker))fail(`MISSING:${marker}`);
  if(source.includes('/actions/artifacts?per_page=100'))fail('REPOSITORY_GLOBAL_ARTIFACT_LOOKUP_FORBIDDEN');
  if(source.includes('Restore latest v1 baseline'))fail('UNBOUND_V1_BASELINE_FORBIDDEN');
  if(!source.includes('/actions/runs/${run_id}/artifacts?per_page=100'))fail('RUN_SCOPED_ARTIFACT_LOOKUP_REQUIRED');
  return true;
}

if(process.argv.includes('--self-test')){
  validate(text);
  const mutations=[
    ['EXPECTED_SHA="$GITHUB_SHA"','EXPECTED_SHA="main"'],
    ['.head_sha==$sha','.head_sha!=$sha'],
    ['.repository.full_name==$repo','.repository.full_name!=$repo'],
    ['test "$artifact_count" -eq 1','test "$artifact_count" -ge 1'],
    ['[[ "$artifact_digest" =~ ^sha256:','[[ "$artifact_digest" =~ ^md5:'],
    ['v1_baseline:null','v1_baseline:{receipt:{}}'],
    ["status:'TWO_DISTINCT_SUCCESSFUL_EXACT_GENERATION_MAIN_V2_CYCLES_PROVED'","status:'TWO_DISTINCT_SUCCESSFUL_MAIN_V2_CYCLES_EMPIRICALLY_PROVED'"]
  ];
  for(const [from,to] of mutations){
    const mutated=text.replace(from,to);
    let rejected=false;
    try{validate(mutated)}catch{rejected=true}
    if(!rejected)fail(`SELF_TEST_NOT_REJECTED:${from}`);
  }
  const globalLookup=text.replace('/actions/runs/${run_id}/artifacts?per_page=100','/actions/artifacts?per_page=100');
  let rejected=false;
  try{validate(globalLookup)}catch{rejected=true}
  if(!rejected)fail('SELF_TEST_GLOBAL_LOOKUP_NOT_REJECTED');
  console.log(JSON.stringify({status:'VERIFIED_PASS',mutations_rejected:mutations.length+1,production:'HOLD'}));
}else{
  validate(text);
  console.log(JSON.stringify({status:'PASS',workflow:workflowPath,exact_generation_required:true,production:'HOLD'}));
}
