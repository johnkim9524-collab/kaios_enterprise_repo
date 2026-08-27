#!/usr/bin/env node
import fs from 'node:fs';

const targets=[
  {
    compiler:'scripts/kidults/scope/compile-self-collectable-coverage-classification-v2.mjs',
    validator:'scripts/kidults/scope/validate-self-collectable-coverage-classification-v2.mjs',
    workflow:'.github/workflows/kidults-self-collectable-coverage-classification-v2.yml',
    forbidden:[
      'track-b-self-collectable-coverage-assessment-v2.json',
      "status:'TRACK_B_REVIEW_READY'",
      "artifact_traceability:'PASS'",
      "provider_independence:'PASS'",
      'classification_decision:'
    ],
    required:[
      "status:'INTERNAL_SCOPE_CAPABILITY_CLASSIFICATION_READY'",
      "provenance_status:'UNVERIFIED_HARDCODED_ACTIONS_ARTIFACT_IDS'",
      "track_b_input_pair:'NONE'",
      "track_b_status:'NOT_STARTED'",
      'rankability_assessment_created:false',
      "record_type:'INTERNAL_NON_TRACK_B_READINESS'",
      "provider_independence:'NOT_ASSESSED_BY_TRACK_B'",
      'approved_projection:false'
    ]
  },
  {
    compiler:'scripts/kidults/scope/close-scope-self-collection-gaps-v1.mjs',
    validator:'scripts/kidults/scope/validate-scope-self-collection-closure-v1.mjs',
    workflow:'.github/workflows/kidults-scope-poc-gap-closure-v1.yml',
    forbidden:[
      'track-b-scope-requirement-assessment-v1.json',
      'scope-poc-closure-projection-v1.json',
      "input_shape:'PASS'",
      "provider_independence:'PASS_NO_VENDOR_SELECTED'",
      "recommendation:'APPROVE_REQUIREMENT_SPEC_FOR_PROVIDER_SOURCE_EVALUATION_NOT_PUBLICATION'"
    ],
    required:[
      "status:'INTERNAL_32_SCOPE_POC_BOUNDARY_CLASSIFIED'",
      "status:'UNVERIFIED_HARDCODED_ACTIONS_ARTIFACT_ID'",
      "track_b_input_pair:'NONE'",
      "track_b_status:'NOT_STARTED'",
      'rankability_assessment_created:false',
      "record_type:'INTERNAL_NON_TRACK_B_READINESS'",
      "provider_independence:'NOT_ASSESSED_BY_TRACK_B'",
      'approved_projection:false'
    ]
  }
];

const fail=m=>{throw new Error(m)};
for(const target of targets){
  const compiler=fs.readFileSync(target.compiler,'utf8');
  const validator=fs.readFileSync(target.validator,'utf8');
  const workflow=fs.readFileSync(target.workflow,'utf8');
  for(const marker of target.forbidden) if(compiler.includes(marker)) fail(`${target.compiler}: shadow authority marker reintroduced: ${marker}`);
  for(const marker of target.required) if(!compiler.includes(marker)) fail(`${target.compiler}: missing internal-only boundary marker: ${marker}`);
  for(const marker of [
    'must not be emitted',
    'rankability-assessment is Track B-owned',
    'NOT_ASSESSED_BY_TRACK_B',
    "track_b_status==='NOT_STARTED'"
  ]) if(!validator.includes(marker)) fail(`${target.validator}: missing fail-closed assertion: ${marker}`);
  if(!workflow.includes('Verify Track B authority boundary')) fail(`${target.workflow}: boundary guard not executed`);
  if(!workflow.includes('validate-track-b-boundary-no-shadow-assessment-v1.mjs')) fail(`${target.workflow}: boundary validator not bound`);
}

console.log(JSON.stringify({status:'PASS',protected_scope_lanes:targets.length,track_b_owner:'Track B only',shadow_assessment_forbidden:true,approved_projection:false,production:'HOLD'},null,2));
