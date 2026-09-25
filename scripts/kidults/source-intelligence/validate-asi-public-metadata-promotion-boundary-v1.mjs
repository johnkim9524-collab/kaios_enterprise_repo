#!/usr/bin/env node
import fs from 'node:fs';

const target='scripts/kidults/source-intelligence/validate-asi-openalex-gdelt-public-metadata-discovery-v1.mjs';
const fail=message=>{throw new Error(message)};

function validate(source){
  if(!source.includes("control_observation_eligible:!diagnosticOnly"))fail('CONTROL_OBSERVATION_ELIGIBILITY_MISSING');
  if(!source.includes("promotion_eligible:false"))fail('GENERIC_PROMOTION_MUST_BE_FALSE');
  if(source.includes("promotion_eligible:!diagnosticOnly"))fail('GENERIC_PROMOTION_RECOUPLED_TO_PROVIDER_HEALTH');
  if(!source.includes("evidence_admission:'NONE'"))fail('EVIDENCE_ADMISSION_BOUNDARY_MISSING');
  if(!source.includes("public_release:'HOLD'"))fail('PUBLIC_RELEASE_BOUNDARY_MISSING');
  if(!source.includes("production:'HOLD'"))fail('PRODUCTION_BOUNDARY_MISSING');
}

const source=fs.readFileSync(target,'utf8');
validate(source);

if(process.argv.includes('--self-test')){
  const mutations=[
    ["promotion_eligible:false","promotion_eligible:true"],
    ["control_observation_eligible:!diagnosticOnly","observation_eligible:!diagnosticOnly"],
    ["evidence_admission:'NONE'","evidence_admission:'EMPIRICAL'"],
    ["public_release:'HOLD'","public_release:'PASS'"],
    ["production:'HOLD'","production:'PASS'"],
  ];
  let rejected=0;
  for(const [from,to] of mutations){
    if(!source.includes(from))fail(`SELF_TEST_MARKER_MISSING:${from}`);
    try{validate(source.replace(from,to));}
    catch{rejected++;}
  }
  if(rejected!==mutations.length)fail(`SELF_TEST_REJECTION_COUNT:${rejected}/${mutations.length}`);
  console.log(JSON.stringify({state:'VERIFIED_PASS',self_test:true,rejected,mutations:mutations.length}));
}else{
  console.log(JSON.stringify({state:'VERIFIED_PASS',self_test:false,control_observation_eligible:'PROVIDER_HEALTH_ONLY',promotion_eligible:false,evidence_admission:'NONE',public_release:'HOLD',production:'HOLD'}));
}
