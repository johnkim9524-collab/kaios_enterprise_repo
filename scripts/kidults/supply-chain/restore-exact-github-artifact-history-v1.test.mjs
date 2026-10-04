import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {restoreExactArtifact} from './restore-exact-github-artifact-v1.mjs';
const repository='fixture/estate';
const workflowPath='.github/workflows/autobalance.yml';
const workflowName='Autobalance';
const makeRun=(event,ageDays=40)=>({id:17,run_attempt:1,repository:{full_name:repository},name:workflowName,path:workflowPath,head_branch:'main',head_sha:'a'.repeat(40),status:'completed',conclusion:'success',event,created_at:new Date(Date.now()-ageDays*86400000).toISOString()});
async function scenario({oldLive=false,allowOld=true,allowEmpty=true,badEvent=false,recentInProbe=false,pageMismatch=false,freshLive=false}={}){
 const saved=Object.fromEntries(['GITHUB_REPOSITORY','GH_TOKEN','RUNNER_TEMP'].map(key=>[key,process.env[key]]));
 process.env.GITHUB_REPOSITORY=repository;process.env.GH_TOKEN='fixture-only-not-a-credential';process.env.RUNNER_TEMP=os.tmpdir();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kpmo-live-history-test-'));
 const spec={workflowPath,workflowName,artifactName:'balance',branch:'main',archivePath:path.join(dir,'archive.zip'),extractDir:path.join(dir,'extract'),receiptPath:path.join(dir,'receipt.json'),requiredBasenames:['balance.json'],allowedEvents:['schedule','workflow_dispatch','push'],maxPages:40,lookbackDays:35,maxCompressedBytes:4194304,allowNoProducerHistory:allowEmpty,allowProducerHistoryOutsideLookbackBaseline:allowOld,allowProducerHistoryWithoutArtifactBaseline:true};
 const calls=[];
 const fetchImpl=async raw=>{
  const u=new URL(raw);calls.push(u);let body;
  if(u.pathname.endsWith('/autobalance.yml'))body={path:workflowPath,name:workflowName,state:'active'};
  else if(u.pathname.endsWith('/artifacts'))body={total_count:0,artifacts:[]};
  else {
   const event=u.searchParams.get('event');assert.ok(spec.allowedEvents.includes(event),'Every history request must filter a permitted live event');
   const inWindow=u.searchParams.has('created');let rows=[];
   if(event==='schedule'&&((inWindow&&freshLive)||(!inWindow&&(oldLive||recentInProbe))))rows=[makeRun(event,(freshLive||recentInProbe)?1:40)];
   if(badEvent&&inWindow&&event==='schedule')rows=[makeRun('pull_request',1)];
   body={total_count:pageMismatch?1:rows.length,workflow_runs:rows};
  }
  return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{return {receipt:await restoreExactArtifact(spec,{fetchImpl}),calls};}
 finally{fs.rmSync(dir,{recursive:true,force:true});for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}
test('PR-only recent successes cannot poison absence of permitted live producer history',async()=>{
 const {receipt,calls}=await scenario();assert.equal(receipt.state,'NO_PRODUCER_HISTORY_BASELINE_ONLY');assert.equal(receipt.historical_producer_artifact_consumed,false);assert.equal(calls.filter(u=>u.pathname.endsWith('/runs')).length,6);
});
test('expired live history plus recent PR history gives only explicit optional baseline',async()=>{
 const {receipt}=await scenario({oldLive:true});assert.equal(receipt.state,'PRODUCER_HISTORY_OUTSIDE_LOOKBACK_BASELINE_ONLY');assert.equal(receipt.optional_feedback_baseline_only,true);assert.equal(receipt.all_history_total_count,1);
});
test('outside-lookback baseline still requires explicit opt-in',async()=>{await assert.rejects(scenario({oldLive:true,allowOld:false}),/PRODUCER_HISTORY_OUTSIDE_LOOKBACK/);});
test('no-history baseline still requires explicit opt-in',async()=>{await assert.rejects(scenario({allowEmpty:false}),/NO_PRODUCER_HISTORY/);});
test('API returning a forbidden event remains fail closed',async()=>{await assert.rejects(scenario({badEvent:true}),/RUN_EVENT_FILTER_MISMATCH/);});
test('history that appears between live queries and all-history probes remains fail closed',async()=>{await assert.rejects(scenario({recentInProbe:true}),/ALLOWED_HISTORY_LOOKBACK_INCONSISTENT/);});
test('incomplete pagination remains fail closed',async()=>{await assert.rejects(scenario({pageMismatch:true}),/PAGINATION_INCOMPLETE/);});
test('fresh permitted producer stays selected and never falls through to absent-history baseline',async()=>{const {receipt}=await scenario({freshLive:true});assert.equal(receipt.state,'PRODUCER_HISTORY_WITHOUT_ARTIFACT_BASELINE_ONLY');assert.equal(receipt.successful_producer_run_count,1);});
