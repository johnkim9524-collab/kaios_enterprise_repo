// One scheduled sweep serializes discovery and recovery, avoiding workflow_run fan-out
// across all four producers that competes for the shared cross-runner read budget.
// It only reads exact producer runs/artifacts and hands validated checkpoints to the existing consumer.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {runtimeGithubRead} from './lib/runtime-github-read-v1.mjs';
import {readWithBoundedGithubDeferrals} from './lib/bounded-github-read-deferral-v1.mjs';
import {READ_RESUME_SWEEP_PRODUCERS,readResumeSweepRoute,selectReadResumeSweepCandidates,deterministicReadResumeSweepWakeAt,shouldStopReadResumeSweep}
  from './lib/github-read-resume-sweep-v1.mjs';
import {consumeGithubReadResumeHandoff} from './lib/github-read-resume-handoff-v1.mjs';
import {createGithubReadResumeScheduleRequest,verifyGithubReadResumeScheduleReadback} from './lib/github-read-resume-schedule-v1.mjs';
import {buildGithubReadResumeTerminalReceipt,sealGithubReadResumeReceipt} from './lib/github-read-resume-immutable-receipt-v1.mjs';

const env=process.env,repository='johnkim9524-collab/kaios_enterprise_repo',repoId=1281328888;
const dir='out/github-read-resume-handoff-v1',deadline=Date.now()+18*60*1000;
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const check=(ok,code)=>{if(!ok)throw Error(`GITHUB_READ_RESUME_SWEEP_${code}`);};
let consumerSha=env.GITHUB_SHA;
const receipts=[];
let stopSweep=false;
try{
  consumerSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  check(env.GITHUB_EVENT_NAME==='schedule'&&env.GITHUB_REPOSITORY===repository&&Number(env.GITHUB_REPOSITORY_ID)===repoId
    &&env.GITHUB_REF==='refs/heads/main'&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')&&consumerSha===env.GITHUB_SHA,'EXACT_MAIN');
  const raw=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  check(raw.repository?.full_name===repository&&Number(raw.repository?.id)===repoId,'EVENT_REPOSITORY');
  let index=0;
  const readJsonFor=binding=>async route=>(await readWithBoundedGithubDeferrals({route,expectedBinding:binding,deadline,
    read:()=>{
      const remaining=deadline-Date.now();check(remaining>0,'DEADLINE');
      return runtimeGithubRead(env.GITHUB_TOKEN,{deadlineMs:Math.min(300000,remaining),maxRetries:0,
        bindingOverride:{run_id:String(binding.run_id),run_attempt:binding.run_attempt,source_sha:binding.source_sha},
        operationDedupeKey:`github-read-resume-sweep:v1:${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}:read-${index++}`})
        (`https://api.github.com/repos/${repository}/${route}`);
    }})).value;
  const readArchiveFor=binding=>async route=>(await readWithBoundedGithubDeferrals({route,expectedBinding:binding,deadline,
    read:()=>{
      const remaining=deadline-Date.now();check(remaining>0,'DEADLINE');
      return runtimeGithubRead(env.GITHUB_TOKEN,{responseMode:'bytes',maxBytes:8*1024*1024,allowArtifactRedirect:true,
        deadlineMs:Math.min(300000,remaining),maxRetries:0,
        bindingOverride:{run_id:String(binding.run_id),run_attempt:binding.run_attempt,source_sha:binding.source_sha},
        operationDedupeKey:`github-read-resume-sweep:v1:${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}:read-${index++}`})
        (`https://api.github.com/repos/${repository}/${route}`);
    }})).value;
  const scheduleResume=async request=>{
    const schedule=createGithubReadResumeScheduleRequest({binding:request.binding,resumeAt:request.resumeAt,
      checkpointDigests:request.checkpointDigests});
    const call=(operation,args)=>JSON.parse(execFileSync('aws',['scheduler',operation,...args,'--region','ap-northeast-2',
      '--output','json','--no-cli-pager'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    let existing=null;
    try{existing=call('get-schedule',['--name',schedule.name,'--group-name','default']);}
    catch(error){if(!/ResourceNotFoundException/.test(String(error?.stderr||'')))throw Error('GITHUB_RESUME_SCHEDULE_LOOKUP_FAILED');}
    if(existing)return {...verifyGithubReadResumeScheduleReadback(schedule,existing),created_now:false};
    const target=JSON.stringify({Arn:schedule.dispatcherArn,RoleArn:schedule.schedulerRoleArn,Input:JSON.stringify(schedule.input),
      RetryPolicy:{MaximumEventAgeInSeconds:3600,MaximumRetryAttempts:2}});
    call('create-schedule',['--name',schedule.name,'--group-name','default','--client-token',schedule.clientToken,
      '--schedule-expression',schedule.scheduleExpression,'--schedule-expression-timezone','UTC','--action-after-completion','DELETE',
      '--state','ENABLED','--flexible-time-window','{"Mode":"OFF"}','--target',target]);
    return {...verifyGithubReadResumeScheduleReadback(schedule,call('get-schedule',['--name',schedule.name,'--group-name','default'])),created_now:true};
  };
  // Keep the scan window shorter than the deterministic wake delay. That lets
  // the next sweep see the same active schedule, then ages the producer out
  // before the schedule completes and cannot be enqueued a second time.
  const sweepWindowMs=28*60*1000;
  const createdAfter=new Date(Date.now()-sweepWindowMs).toISOString();
  const discoveryBinding={run_id:String(env.GITHUB_RUN_ID),run_attempt:Number(env.GITHUB_RUN_ATTEMPT),source_sha:consumerSha};
  for(const producer of READ_RESUME_SWEEP_PRODUCERS){
    const listing=await readJsonFor(discoveryBinding)(readResumeSweepRoute(producer,{createdAfter}));
    const candidates=selectReadResumeSweepCandidates({producer,listing,now:Date.now(),windowMs:sweepWindowMs,limit:3});
    for(const candidate of candidates){
      const event={action:'completed',workflow_run:candidate};
      const binding={run_id:String(candidate.id),run_attempt:candidate.run_attempt,source_sha:candidate.head_sha};
      const deterministicWakeAt=deterministicReadResumeSweepWakeAt({createdAt:candidate.created_at,
        checkpointResumeAt:Date.now(),now:Date.now(),windowMs:sweepWindowMs});
      const scheduleSweepResume=request=>scheduleResume({...request,
        resumeAt:Math.max(request.resumeAt,deterministicWakeAt)});
      const result=await consumeGithubReadResumeHandoff({event,readJson:readJsonFor(binding),readArchiveBytes:readArchiveFor(binding),
        deadline,scheduleResume:scheduleSweepResume,scheduleOnly:true});
      const terminal=buildGithubReadResumeTerminalReceipt({result,event,consumer:{run_id:env.GITHUB_RUN_ID,
        run_attempt:Number(env.GITHUB_RUN_ATTEMPT)},exactMainSha:consumerSha});
      const alreadyScheduled=result.state==='RESUME_SCHEDULED'&&result.created_now===false;
      const noCheckpoint=result.state==='NO_CHECKPOINT_ARTIFACT';
      const immutable=alreadyScheduled||noCheckpoint?null:await sealGithubReadResumeReceipt({receipt:terminal,
        bucket:env.KIDULTS_AUTONOMOUS_RECEIPT_BUCKET,keyArn:env.KIDULTS_AUTONOMOUS_RECEIPT_KEY_ARN});
      receipts.push({producer_role:producer.role,run_id:candidate.id,run_attempt:candidate.run_attempt,
        source_sha:candidate.head_sha,result,terminal_receipt:terminal,immutable_terminal:immutable?terminal:null,immutable_copy:immutable});
      if(shouldStopReadResumeSweep(result)){stopSweep=true;break;}
    }
    if(stopSweep)break;
  }
  const receipt={state:'READ_ONLY_SWEEP_COMPLETED',consumer_run_id:env.GITHUB_RUN_ID,
    consumer_run_attempt:Number(env.GITHUB_RUN_ATTEMPT),consumer_sha:consumerSha,window_started_at:createdAfter,
    window_ms:sweepWindowMs,scheduled_wake_policy:'SOURCE_CREATED_AT_PLUS_31_MINUTES_OR_CHECKPOINT_RESUME_AT',
    producer_count:READ_RESUME_SWEEP_PRODUCERS.length,candidate_count:receipts.length,results:receipts,
    actual_authority_granted:false,producer_rerun_dispatched:false,read_only:true};
  fs.writeFileSync(`${dir}/receipt.json`,JSON.stringify(receipt)+'\n',{mode:0o600});
  console.log(JSON.stringify({state:receipt.state,candidate_count:receipt.candidate_count,actual_authority_granted:false,read_only:true}));
}catch(error){
  const receipt={state:'HOLD',failure_code:error?.message||'UNKNOWN',consumer_run_id:env.GITHUB_RUN_ID,
    consumer_run_attempt:Number(env.GITHUB_RUN_ATTEMPT),consumer_sha:consumerSha,results:receipts,
    actual_authority_granted:false,producer_rerun_dispatched:false,read_only:true};
  fs.writeFileSync(`${dir}/receipt.json`,JSON.stringify(receipt)+'\n',{mode:0o600});
  throw error;
}
