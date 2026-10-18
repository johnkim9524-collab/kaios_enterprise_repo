// Read-resume execution is bounded to exact one-time Scheduler entries and immutable readback.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {runtimeGithubRead} from './lib/runtime-github-read-v1.mjs';
import {consumeGithubReadResumeHandoff} from './lib/github-read-resume-handoff-v1.mjs';
import {readWithBoundedGithubDeferrals} from './lib/bounded-github-read-deferral-v1.mjs';
import {createGithubReadResumeScheduleRequest,verifyGithubReadResumeScheduleReadback} from './lib/github-read-resume-schedule-v1.mjs';
import {buildGithubReadResumeTerminalReceipt,sealGithubReadResumeReceipt} from './lib/github-read-resume-immutable-receipt-v1.mjs';

const env=process.env,dir='out/github-read-resume-handoff-v1';
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const api=route=>`https://api.github.com/repos/johnkim9524-collab/kaios_enterprise_repo/${route}`;
const runnerDeadline=Date.now()+18*60*1000;
let consumerSha=env.GITHUB_SHA;
const expectedMainSha=env.KIDULTS_EXPECTED_MAIN_SHA;
const expectedBinding={run_id:env.GITHUB_RUN_ID,run_attempt:Number(env.GITHUB_RUN_ATTEMPT),source_sha:env.GITHUB_SHA};
const deferredReads=[];
let normalizedEvent=null;
try{
  consumerSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  if(!/^[a-f0-9]{40}$/.test(expectedMainSha||'')||consumerSha!==expectedMainSha)throw Error('GITHUB_READ_RESUME_EXACT_MAIN_CHECKOUT');
  const rawEvent=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  const isResumeDispatch=env.GITHUB_EVENT_NAME==='repository_dispatch'&&rawEvent.action==='kidults.github.read.resume.v1';
  if(isResumeDispatch&&(rawEvent.repository?.full_name!==env.GITHUB_REPOSITORY
    ||Number(rawEvent.repository?.id)!==Number(env.GITHUB_REPOSITORY_ID)
    ||rawEvent.sender?.login!=='kidults-autonomous-landing-staging[bot]'
    ||rawEvent.client_payload?.source!=='AWS_EVENTBRIDGE_SCHEDULER'
    ||rawEvent.client_payload?.exact_main_sha!==expectedMainSha))throw Error('GITHUB_RESUME_DISPATCH_SENDER');
  const isOwnerManualRecovery=env.GITHUB_EVENT_NAME==='workflow_dispatch';
  let manualRecoveryEvent=null;
  if(isOwnerManualRecovery){
    const input=rawEvent.inputs||{};
    if(env.GITHUB_ACTOR!=='johnkim9524-collab'||rawEvent.sender?.login!=='johnkim9524-collab'
      ||env.GITHUB_REPOSITORY!=='johnkim9524-collab/kaios_enterprise_repo'
      ||Number(env.GITHUB_REPOSITORY_ID)!==1281328888||env.GITHUB_REF!=='refs/heads/main'
      ||rawEvent.ref!=='refs/heads/main'||rawEvent.repository?.full_name!==env.GITHUB_REPOSITORY
      ||Number(rawEvent.repository?.id)!==Number(env.GITHUB_REPOSITORY_ID)||input.expected_main_sha!==expectedMainSha
      ||!/^[1-9][0-9]{0,15}$/.test(input.source_run_id||'')
      ||!/^(?:[1-9]|[1-9][0-9]|100)$/.test(input.source_run_attempt||'')
      ||!/^[a-f0-9]{40}$/.test(input.source_sha||''))throw Error('GITHUB_RESUME_OWNER_DISPATCH_BINDING');
    const runId=Number(input.source_run_id),runAttempt=Number(input.source_run_attempt);
    if(!Number.isSafeInteger(runId)||runId<=0)throw Error('GITHUB_RESUME_OWNER_DISPATCH_RUN_ID');
    manualRecoveryEvent={action:'completed',workflow_run:{id:runId,run_attempt:runAttempt,head_sha:input.source_sha,
      head_branch:'main',event:'workflow_run',conclusion:'failure',
      repository:{full_name:env.GITHUB_REPOSITORY,id:Number(env.GITHUB_REPOSITORY_ID)}}};
  }
  const event=isResumeDispatch
    ?{action:'completed',resume_schedule:rawEvent.client_payload,workflow_run:{id:Number(rawEvent.client_payload?.resume_binding?.run_id),
      run_attempt:rawEvent.client_payload?.resume_binding?.run_attempt,head_sha:rawEvent.client_payload?.resume_binding?.source_sha,
      head_branch:'main',event:rawEvent.client_payload?.resume_binding?.producer_event,
      conclusion:rawEvent.client_payload?.resume_binding?.producer_conclusion,
      repository:{full_name:env.GITHUB_REPOSITORY,id:Number(env.GITHUB_REPOSITORY_ID)}}}
    :isOwnerManualRecovery?manualRecoveryEvent:rawEvent;
  normalizedEvent=event;
  const producer=event.workflow_run;
  expectedBinding.run_id=String(producer?.id);
  expectedBinding.run_attempt=producer?.run_attempt;
  expectedBinding.source_sha=producer?.head_sha;
  const operationDedupePrefix=event.resume_schedule?.schedule_id
    ?`github-read-resume:v2:${event.resume_schedule.schedule_id}`
    :`github-read-resume:v2:${producer?.id}:${producer?.run_attempt}:${producer?.head_sha}`;
  let operationIndex=0;
  const boundedRead=(route,options={})=>readWithBoundedGithubDeferrals({route,expectedBinding,deadline:runnerDeadline,
    onDeferral:value=>deferredReads.push(value),read:()=>runtimeGithubRead(env.GITHUB_TOKEN,{deadlineMs:300000,
      maxRetries:0,bindingOverride:{run_id:String(producer?.id),run_attempt:producer?.run_attempt,source_sha:producer?.head_sha},
      operationDedupeKey:`${operationDedupePrefix}:read-${operationIndex++}`,...options})(api(route))});
  const readJson=async route=>(await boundedRead(route)).value;
  const readArchiveBytes=async route=>(await boundedRead(route,{responseMode:'bytes',maxBytes:8*1024*1024,
    allowArtifactRedirect:true})).value;
  const scheduleResume=async request=>{
    const schedule=createGithubReadResumeScheduleRequest({binding:request.binding,resumeAt:request.resumeAt,
      checkpointDigests:request.checkpointDigests});
    const call=(operation,args)=>JSON.parse(execFileSync('aws',['scheduler',operation,...args,'--region','ap-northeast-2',
      '--output','json','--no-cli-pager'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    let existing=null;
    try{existing=call('get-schedule',['--name',schedule.name,'--group-name','default']);}
    catch(error){if(!/ResourceNotFoundException/.test(String(error?.stderr||'')))throw Error('GITHUB_RESUME_SCHEDULE_LOOKUP_FAILED');}
    if(existing)return verifyGithubReadResumeScheduleReadback(schedule,existing);
    const target=JSON.stringify({Arn:schedule.dispatcherArn,RoleArn:schedule.schedulerRoleArn,Input:JSON.stringify(schedule.input),
      RetryPolicy:{MaximumEventAgeInSeconds:3600,MaximumRetryAttempts:2}});
    call('create-schedule',['--name',schedule.name,'--group-name','default','--client-token',schedule.clientToken,
      '--schedule-expression',schedule.scheduleExpression,'--schedule-expression-timezone','UTC','--action-after-completion','DELETE',
      '--state','ENABLED','--flexible-time-window','{"Mode":"OFF"}','--target',target]);
    const readback=call('get-schedule',['--name',schedule.name,'--group-name','default']);
    return verifyGithubReadResumeScheduleReadback(schedule,readback);
  };
  const receipt=await consumeGithubReadResumeHandoff({event,
    readJson,readArchiveBytes,deadline:runnerDeadline,scheduleResume});
  const terminal=buildGithubReadResumeTerminalReceipt({result:receipt,event,consumer:{run_id:env.GITHUB_RUN_ID,
    run_attempt:Number(env.GITHUB_RUN_ATTEMPT)},exactMainSha:consumerSha});
  const immutable=await sealGithubReadResumeReceipt({receipt:terminal,bucket:env.KIDULTS_AUTONOMOUS_RECEIPT_BUCKET,
    keyArn:env.KIDULTS_AUTONOMOUS_RECEIPT_KEY_ARN});
  fs.writeFileSync(`${dir}/receipt.json`,JSON.stringify({...receipt,consumer_run_id:env.GITHUB_RUN_ID,
    consumer_run_attempt:Number(env.GITHUB_RUN_ATTEMPT),consumer_sha:consumerSha,
    bounded_read_deferrals:deferredReads,immutable_terminal:terminal,immutable_copy:immutable})+'\n',{mode:0o600});
  console.log(JSON.stringify({state:receipt.state,run_id:receipt.run_id,artifact_id:receipt.artifact_id??null,
    actual_authority_granted:false,read_only:true}));
}catch(error){
  const checkpoint=error?.read_resume_checkpoint;
  const receipt={state:'HOLD',failure_code:error?.message||'UNKNOWN',consumer_run_id:env.GITHUB_RUN_ID,
    consumer_run_attempt:Number(env.GITHUB_RUN_ATTEMPT),consumer_sha:consumerSha,
    bounded_read_deferrals:deferredReads,
    ...(checkpoint?{read_resume_checkpoint:checkpoint}:{}),actual_authority_granted:false,read_only:true};
  if(/^[a-f0-9]{40}$/.test(consumerSha||'')&&/^[a-f0-9]{40}$/.test(expectedMainSha||'')&&consumerSha===expectedMainSha){
    try{
      const terminal=buildGithubReadResumeTerminalReceipt({result:{state:'HOLD',actual_authority_granted:false},event:normalizedEvent,
        consumer:{run_id:env.GITHUB_RUN_ID,run_attempt:Number(env.GITHUB_RUN_ATTEMPT)},exactMainSha:consumerSha});
      receipt.immutable_terminal=terminal;
      receipt.immutable_copy=await sealGithubReadResumeReceipt({receipt:terminal,bucket:env.KIDULTS_AUTONOMOUS_RECEIPT_BUCKET,
        keyArn:env.KIDULTS_AUTONOMOUS_RECEIPT_KEY_ARN});
    }catch(sealError){receipt.immutable_failure_code=sealError?.message||'IMMUTABLE_RECEIPT_SEAL_FAILED';}
  }
  fs.writeFileSync(`${dir}/receipt.json`,JSON.stringify(receipt)+'\n',{mode:0o600});
  throw error;
}
