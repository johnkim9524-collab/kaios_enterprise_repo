#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const REPOSITORY='johnkim9524-collab/kaios_enterprise_repo';
const FIELDS=new Set(['repository','protected_main_sha','canonical_issue_numbers','canonical_issue_count','active_baseline_defects','material_defect_count','material_defect_issue_numbers','material_defect_registry_sha256','production','public','g5','promotion_eligible','empirical_gate_effect','truth_digest']);
const scope='CANONICAL_READ_ONLY_DIAGNOSTIC_NOT_PROOF';
const positive=value=>Number.isSafeInteger(value)&&value>0;
const code=value=>typeof value==='string'?/^([A-Z][A-Z0-9_]{0,79})(?::|$)/.exec(value)?.[1]:null;
const identity={repository:process.env.GITHUB_REPOSITORY,head_sha:process.env.RECEIPT_HEAD_SHA,run_id:Number(process.env.GITHUB_RUN_ID),run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT),event:process.env.RECEIPT_EVENT};
const BOOTSTRAP_FIELDS=new Set(['material_defect_count','material_defect_issue_numbers','material_defect_registry_sha256','truth_digest']);

function failure(reason,fields=[]){
  return {validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',version:'3.1.0',state:'VERIFIED_FAIL',...identity,failure_scope:scope,failure_class:reason,mismatch_fields:fields,material_registry_verified:false,material_defect_count:null,material_defect_issue_numbers:null,material_defect_registry_sha256:null,empirical_promotion:false,whole_platform_closure:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
}
function readDiagnostic(file){
  // A unique per-invocation path prevents reuse of a previous attempt's receipt.
  // Diagnostics never become proof: any malformed input returns generic failure.
  try{
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new Error();
    const value=JSON.parse(fs.readFileSync(file,'utf8'));
    if(value.receipt_id!=='kpmo-canonical-generation-v3-receipt'||value.version!=='3.5.1'||
      value.repository!==identity.repository||value.run_id!==identity.run_id||value.run_attempt!==identity.run_attempt||
      value.state!=='VERIFIED_FAIL'||value.mode!=='UNCOMMITTED'||value.writes!==0||value.promotion_eligible!==false||
      value.production!=='HOLD'||value.public!=='HOLD'||value.g5!=='HOLD')throw new Error();
    const reason=code(value.failure_class),fields=value.mismatch_fields??[];
    if(!reason||!Array.isArray(fields)||fields.length>FIELDS.size||new Set(fields).size!==fields.length||fields.some(field=>!FIELDS.has(field)))throw new Error();
    return failure(reason,fields);
  }catch{return failure('CANONICAL_FAILURE_DIAGNOSTIC_UNAVAILABLE');}
}

function bootstrapTransition(value){
  if(process.env.CANONICAL_BOOTSTRAP_TRANSITION_VERIFIED!=='true'||identity.event!=='pull_request'||value.failure_class!=='COMMIT_MISMATCH')return null;
  const fields=value.mismatch_fields||[];
  if(fields.length!==BOOTSTRAP_FIELDS.size||fields.some(field=>!BOOTSTRAP_FIELDS.has(field)))return null;
  const base=process.env.EXPECTED_PROTECTED_MAIN_SHA;
  if(!/^[0-9a-f]{40}$/.test(base||''))return null;
  const apply=fs.readFileSync('.github/workflows/kpmo-canonical-generation-v3-apply.yml','utf8');
  const writer=fs.readFileSync('scripts/kidults/kpmo/canonical-generation-v3.mjs','utf8');
  const lifecycle=fs.readFileSync('tests/kidults/kpmo/post-landing-terminal-lifecycle-v1.test.mjs','utf8');
  for(const marker of ["schedule:\n    - cron: '13,43 * * * *'","CANONICAL_GENERATION_EXPLICIT_WRITE_AUTHORITY: ${{ github.event_name == 'push' && 'PROTECTED_MAIN_PUSH' || github.event_name == 'schedule' && 'PROTECTED_MAIN_SCHEDULE' || 'AUTHORIZED' }}"]){if(!apply.includes(marker))return null;}
  for(const marker of ["!['workflow_dispatch','push','schedule'].includes(event)","authority_type:'PROTECTED_MAIN_SCHEDULE'","CANONICAL_GENERATION_SCHEDULE_CRON!=='13,43 * * * *'"]){if(!writer.includes(marker))return null;}
  if(!lifecycle.includes("'CANONICAL_GENERATION_V3_APPLY'"))return null;
  return {validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',version:'3.2.0',state:'IMPLEMENTED_NOT_VERIFIED',authority_model:'CANONICAL_GENERATION_V3_POST_LANDING_SELF_HEAL_BOOTSTRAP',...identity,protected_main_sha:base,bootstrap_transition:true,post_landing_refresh_required:true,root_failure_class:'COMMIT_MISMATCH',mismatch_fields:fields,material_registry_verified:false,material_defect_count:null,material_defect_issue_numbers:null,material_defect_registry_sha256:null,empirical_promotion:false,whole_platform_closure:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
}
let dir;
try{
  if(identity.repository!==REPOSITORY||!positive(identity.run_id)||!positive(identity.run_attempt)||
    !/^[0-9a-f]{40}$/.test(identity.head_sha||'')||!['pull_request','push','workflow_run','workflow_dispatch'].includes(identity.event))throw new Error('CANONICAL_DIAGNOSTIC_IDENTITY_INVALID');
  dir=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'canonical-read-terminal-'));
  const receipt=path.join(dir,'producer-receipt.json');
  // Fixed read-only entrypoint, no --write, no user-supplied command or arguments.
  // Raw stderr may contain API URLs/body text, so it is never copied to artifacts.
  const child=spawnSync(process.execPath,['scripts/kidults/kpmo/validate-live-canonical-issue-truth-v1.mjs'],{
    env:{...process.env,CANONICAL_GENERATION_RECEIPT_PATH:receipt},encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']
  });
  if(child.status===0&&!child.error&&!child.signal){
    let value;
    try{value=JSON.parse(child.stdout);}catch{throw new Error('CANONICAL_SUCCESS_OUTPUT_INVALID');}
    if(value.validator!=='LIVE_CANONICAL_ISSUE_TRUTH_V1'||value.version!=='3.1.0'||value.state!=='VERIFIED_PASS'||
      value.authority_model!=='CANONICAL_GENERATION_V3_ONLY'||value.empirical_promotion!==false||value.whole_platform_closure!==false||
      value.production!=='HOLD'||value.public!=='HOLD'||value.g5!=='HOLD')throw new Error('CANONICAL_SUCCESS_OUTPUT_INVALID');
    process.stdout.write(JSON.stringify(value,null,2)+'\n');
  }else{
    const value=child.error||child.signal?failure('CANONICAL_VALIDATOR_PROCESS_INTERRUPTED'):readDiagnostic(receipt);
    const transition=bootstrapTransition(value);
    process.stdout.write(JSON.stringify(transition||value,null,2)+'\n');
    if(!transition){console.error(`CANONICAL_READ_FAILED: ${value.failure_class}`);process.exitCode=1;}
  }
}catch(error){
  const reason=['CANONICAL_DIAGNOSTIC_IDENTITY_INVALID','CANONICAL_SUCCESS_OUTPUT_INVALID'].includes(error?.message)?error.message:'CANONICAL_TERMINAL_WRAPPER_FAILED';
  process.stdout.write(JSON.stringify(failure(reason),null,2)+'\n');console.error(`CANONICAL_READ_FAILED: ${reason}`);process.exitCode=1;
}finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});}
