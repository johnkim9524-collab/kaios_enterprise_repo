import fs from 'node:fs';
import {runtimeGithubRead} from './lib/runtime-github-read-v1.mjs';
import {consumeGithubReadResumeHandoff} from './lib/github-read-resume-handoff-v1.mjs';
import {readWithBoundedGithubDeferrals} from './lib/bounded-github-read-deferral-v1.mjs';

const env=process.env,dir='out/github-read-resume-handoff-v1';
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const api=route=>`https://api.github.com/repos/johnkim9524-collab/kaios_enterprise_repo/${route}`;
const runnerDeadline=Date.now()+18*60*1000;
const expectedBinding={run_id:env.GITHUB_RUN_ID,run_attempt:Number(env.GITHUB_RUN_ATTEMPT),source_sha:env.GITHUB_SHA};
const deferredReads=[];
try{
  const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  const producer=event.workflow_run;
  const operationDedupePrefix=`github-read-resume:${producer?.id}:${producer?.run_attempt}:${producer?.head_sha}`;
  let operationIndex=0;
  const boundedRead=(route,options={})=>readWithBoundedGithubDeferrals({route,expectedBinding,deadline:runnerDeadline,
    onDeferral:value=>deferredReads.push(value),read:()=>runtimeGithubRead(env.GITHUB_TOKEN,{deadlineMs:300000,
      maxRetries:0,operationDedupeKey:`${operationDedupePrefix}:read-${operationIndex++}`,...options})(api(route))});
  const readJson=async route=>(await boundedRead(route)).value;
  const readArchiveBytes=async route=>(await boundedRead(route,{responseMode:'bytes',maxBytes:8*1024*1024,
    allowArtifactRedirect:true})).value;
  const receipt=await consumeGithubReadResumeHandoff({event,
    readJson,readArchiveBytes,deadline:runnerDeadline});
  fs.writeFileSync(`${dir}/receipt.json`,JSON.stringify({...receipt,consumer_run_id:env.GITHUB_RUN_ID,
    consumer_run_attempt:Number(env.GITHUB_RUN_ATTEMPT),consumer_sha:env.GITHUB_SHA,
    bounded_read_deferrals:deferredReads})+'\n',{mode:0o600});
  console.log(JSON.stringify({state:receipt.state,run_id:receipt.run_id,artifact_id:receipt.artifact_id??null,
    actual_authority_granted:false,read_only:true}));
}catch(error){
  const checkpoint=error?.read_resume_checkpoint;
  const receipt={state:'HOLD',failure_code:error?.message||'UNKNOWN',consumer_run_id:env.GITHUB_RUN_ID,
    consumer_run_attempt:Number(env.GITHUB_RUN_ATTEMPT),consumer_sha:env.GITHUB_SHA,
    bounded_read_deferrals:deferredReads,
    ...(checkpoint?{read_resume_checkpoint:checkpoint}:{}),actual_authority_granted:false,read_only:true};
  fs.writeFileSync(`${dir}/receipt.json`,JSON.stringify(receipt)+'\n',{mode:0o600});
  throw error;
}
