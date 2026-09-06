import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const ROOT=process.cwd();
const SCRIPT='scripts/kidults/kpmo/consume-direct-owner-postmerge-push-suite-v1.mjs';
const POLICY=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json','utf8'));
const REPOSITORY='johnkim9524-collab/kaios_enterprise_repo';
const SHA='a'.repeat(40);
const steps=[
 'Validate exact ASI SHADOW upstream evidence binding',
 'Validate exact Requirement Coverage upstream evidence binding',
 'Validate exact Sharded Reserve upstream terminal binding',
 'Validate exact Canonical Truth upstream terminal binding',
];
function execute({stepOutcome='success', moveMain=false, changeAttempt=false, failRequired=false}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'postmerge-boundary-'));
 const file=path.join(dir,'receipt.json');
 const runs=POLICY.required_workflows.map((x,i)=>({id:1000+i,run_attempt:1,path:x.path,name:x.name,head_sha:SHA,head_branch:'main',event:'push',status:'completed',conclusion:failRequired&&i===1?'failure':'success',created_at:'2026-09-05T00:00:01Z',updated_at:'2026-09-05T00:00:02Z'}));
 const assurance=runs.find(x=>x.path.includes('continuous-assurance'));
 const jobs=[{id:5000,run_id:assurance.id,run_attempt:1,head_sha:SHA,name:'audit',status:'completed',conclusion:'success',steps:steps.map((name,i)=>({name,number:i+1,status:'completed',conclusion:stepOutcome}))}];
 fs.writeFileSync(file,JSON.stringify({id:'kidults-direct-owner-landing-handoff-receipt-v1',state:'CONSUMED_BY_DIRECT_OWNER_MERGE',merge_commit_sha:SHA,merged_at:'2026-09-05T00:00:00Z',merged_by:'owner',direct_owner:'owner',production:'HOLD',public:'HOLD',g5:'HOLD'}));
 const harness=`
  const runs=${JSON.stringify(runs)}, jobs=${JSON.stringify(jobs)};let mains=0,indices=0;
  globalThis.fetch=async(url,options)=>{
   if(options?.method && options.method!=='GET')throw new Error('MOCK_MUTATION_FORBIDDEN');
   if(!url.startsWith('https://api.github.com/repos/${REPOSITORY}/'))throw new Error('MOCK_ORIGIN_FORBIDDEN');
   let body;
   if(url.endsWith('/branches/main')){mains++;body={commit:{sha:${moveMain?'mains>1?"'+ 'b'.repeat(40)+'":':''}${JSON.stringify(SHA)}}};}
   else if(url.includes('/actions/runs?')){indices++;body={total_count:runs.length,workflow_runs:structuredClone(runs)};if(${changeAttempt}&&indices>1)body.workflow_runs[0].run_attempt=2;}
   else if(url.includes('/jobs?'))body={total_count:jobs.length,jobs};
   else throw new Error('MOCK_UNEXPECTED_API');
   return {ok:true,status:200,json:async()=>body};
  };
  await import(${JSON.stringify(pathToFileURL(path.resolve(SCRIPT)).href)});
 `;
 try {
  const r=spawnSync(process.execPath,['--input-type=module','-e',harness],{cwd:ROOT,encoding:'utf8',timeout:10000,env:{PATH:path.dirname(process.execPath)+':/usr/bin:/bin',GH_REPOSITORY:REPOSITORY,GH_TOKEN:'SYNTHETIC_NOT_A_CREDENTIAL',HANDOFF_RECEIPT_PATH:file,POSTMERGE_PUSH_SUITE_WAIT_SECONDS:'0'}});
  assert.ifError(r.error);
  return {status:r.status,stderr:r.stderr,receipt:JSON.parse(fs.readFileSync(file,'utf8'))};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const stepOutcome of ['success','skipped'])test(`${stepOutcome} binding-step metadata never grants producer-health authority`,()=>{
 const {status,stderr,receipt}=execute({stepOutcome});assert.equal(status,0,stderr);
 const p=receipt.post_merge_push_suite;
 assert.equal(p.state,'CONSUMED_EXACT_MERGE_SHA_PUSH_SUITE');
 assert.equal(p.producer_health_authority,false);
 assert.equal(p.producer_health_gate_state,'HOLD_SEPARATE_EXACT_SHA_GATE_REQUIRED');
 assert.equal(p.assurance_semantic_classification.producer_health_authority,false);
 assert.equal(p.promotion_eligible,false);
});
test('main movement during evidence read rejects terminal success',()=>{
 const r=execute({moveMain:true});assert.equal(r.status,1);assert.equal(r.receipt.state,'VERIFIED_FAIL');
 assert.equal(r.receipt.post_merge_push_suite_consumed,false);
 assert.equal(r.receipt.failure_code,'DIRECT_OWNER_POSTMERGE_MAIN_ADVANCED_DURING_CONSUMPTION');
});
test('a new run attempt during evidence read rejects old-generation receipt',()=>{
 const r=execute({changeAttempt:true});assert.equal(r.status,1);assert.equal(r.receipt.state,'VERIFIED_FAIL');
 assert.equal(r.receipt.failure_code,'DIRECT_OWNER_POSTMERGE_RUN_GENERATION_CHANGED');
});
test('required workflow failure remains evidence, never health or release permission',()=>{
 const r=execute({stepOutcome:'skipped',failRequired:true});assert.equal(r.status,0,r.stderr);
 const p=r.receipt.post_merge_push_suite;assert.equal(p.required_failure_count,1);
 assert.equal(p.terminal_failure_preserved_as_fail_closed_evidence,true);assert.equal(p.all_required_success,false);
 assert.equal(p.producer_health_authority,false);assert.equal(p.promotion_eligible,false);
});
