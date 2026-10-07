import fs from 'node:fs';
import { nativeWorkflowRunNameMatches } from '../source-intelligence/native-workflow-run-identity-v1.mjs';
import { loadAuthorityChainTriggerContract, validateAuthorityChainTriggerCompatibility } from '../source-intelligence/lib/authority-chain-trigger-compatibility-v1.mjs';
const REPO='johnkim9524-collab/kaios_enterprise_repo';
const ASSURANCE_WORKFLOW='KIDULTS Platform Continuous Assurance V1';
const sha=/^[0-9a-f]{40}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const positiveText=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x)&&positive(Number(x));
const terminal=new Set(['success','failure','cancelled','timed_out','action_required','neutral','skipped','stale']);
const inlineEvents=new Set(['push','schedule','workflow_dispatch','workflow_run','repository_dispatch']);
export const PRODUCER_COMPLETIONS=Object.freeze([
  {name:'KIDULTS ASI SHADOW Operating Evidence v1',path:'.github/workflows/kidults-asi-shadow-operating-evidence-v1.yml',events:['schedule','push','workflow_dispatch']},
  {name:'KIDULTS ASI Requirement-to-Adapter Coverage v1',path:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',events:['workflow_run','workflow_dispatch']},
  {name:'KIDULTS ASI Sharded Source Reserve v1',path:'.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',events:['repository_dispatch','workflow_run','schedule','workflow_dispatch']},
  {name:'KPMO Live Canonical Issue Truth V1',path:'.github/workflows/kpmo-live-canonical-issue-truth-v1.yml',events:['workflow_run','workflow_dispatch']},
]);
const fail=code=>{throw new Error(code);};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
function validateNaturalClockEvent(env,payload,expectedSlot){
  const expectedAction=`kidults.natural.clock.${expectedSlot.toLowerCase()}.v1`;
  if(!object(payload)||payload.action!==expectedAction
    ||payload.repository?.full_name!==REPO)fail('SENTINEL_NATURAL_CLOCK_EVENT_CONTEXT');
  if(payload.sender?.type!=='Bot'||payload.sender?.login!=='kidults-autonomous-landing-staging[bot]')fail('SENTINEL_NATURAL_CLOCK_SENDER');
  const clock=payload.client_payload;
  if(!object(clock)||clock.source!=='AWS_EVENTBRIDGE_SCHEDULER'||clock.slot!==expectedSlot
    ||clock.exact_main_sha!==env.GITHUB_SHA||!sha.test(clock.exact_main_sha)
    ||typeof clock.nonce!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(clock.nonce)
    ||clock.dispatch_id!==`kidults-natural-clock-v1:${expectedSlot}:${env.GITHUB_SHA}:${clock.nonce}`
    ||typeof clock.issued_at!=='string'||!Number.isFinite(Date.parse(clock.issued_at))
    ||new Date(Date.parse(clock.issued_at)).toISOString()!==clock.issued_at
    ||Object.keys(clock).sort().join(',')!=='dispatch_id,exact_main_sha,issued_at,nonce,slot,source'){
    fail('SENTINEL_NATURAL_CLOCK_BINDING_INVALID');
  }
  return {slot:expectedSlot,exact_main_sha:clock.exact_main_sha,dispatch_id:clock.dispatch_id,issued_at:clock.issued_at};
}
function validateCoverageChainContinuationEvent(env,payload){
  if(!object(payload)||payload.repository?.full_name!==REPO||payload.ref!=='main')
    fail('SENTINEL_CHAIN_CONTINUATION_EVENT_CONTEXT');
  if(payload.sender?.type!=='Bot'||payload.sender?.login!=='github-actions[bot]')fail('SENTINEL_CHAIN_CONTINUATION_SENDER');
  const continuation=payload.inputs;
  const keys='continuation_artifact_digest,continuation_artifact_id,continuation_event_type,continuation_key,continuation_slot,continuation_source,exact_main_sha,upstream_event,upstream_run_attempt,upstream_run_id'.split(',').sort().join(',');
  if(!object(continuation)||continuation.continuation_event_type!=='kidults.assurance.continuation.v1'
    ||continuation.continuation_source!=='KIDULTS_COVERAGE_CHAIN_CONTINUATION'||continuation.continuation_slot!=='SENTINEL_CHAIN'
    ||continuation.exact_main_sha!==env.GITHUB_SHA||!sha.test(continuation.exact_main_sha)
    ||!positiveText(continuation.upstream_run_id)||!positiveText(continuation.upstream_run_attempt)
    ||!['workflow_run','workflow_dispatch'].includes(continuation.upstream_event)
    ||!positiveText(continuation.continuation_artifact_id)||!/^sha256:[0-9a-f]{64}$/.test(continuation.continuation_artifact_digest||'')
    ||!/^sha256:[0-9a-f]{64}$/.test(continuation.continuation_key||'')
    ||Object.keys(continuation).sort().join(',')!==keys)fail('SENTINEL_CHAIN_CONTINUATION_BINDING_INVALID');
  try {
    validateAuthorityChainTriggerCompatibility({
      producerEvent:continuation.upstream_event,
      consumerEvent:'workflow_dispatch',
      producerWorkflowPath:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
      consumerWorkflowPath:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',
      eventType:'kidults.assurance.continuation.v1',
      exactTriggeringRunBound:true,
      authenticatedReceiptBound:true,
    }, loadAuthorityChainTriggerContract());
  } catch (error) {
    fail(`SENTINEL_CHAIN_TRIGGER_COMPATIBILITY:${error.message}`);
  }
  const runId=Number(continuation.upstream_run_id),runAttempt=Number(continuation.upstream_run_attempt);
  return {slot:'SENTINEL_CHAIN',exact_main_sha:continuation.exact_main_sha,run_id:runId,run_attempt:runAttempt,
    upstream_run_id:runId,upstream_run_attempt:runAttempt,upstream_event:continuation.upstream_event,
    path:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',continuation_artifact_id:Number(continuation.continuation_artifact_id),
    continuation_artifact_digest:continuation.continuation_artifact_digest,continuation_key:continuation.continuation_key};
}
export function readSentinelEvent(file){
  if(typeof file!=='string'||!file)fail('SENTINEL_EVENT_PATH_MISSING');
  let fd;
  try{
    const before=fs.lstatSync(file);
    if(!before.isFile()||before.size<2||before.size>4194304)fail('SENTINEL_EVENT_FILE_BOUNDARY');
    fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    const opened=fs.fstatSync(fd);
    if(!opened.isFile()||opened.ino!==before.ino||opened.dev!==before.dev||opened.size!==before.size)fail('SENTINEL_EVENT_FILE_CHANGED');
    const bytes=fs.readFileSync(fd);
    const after=fs.fstatSync(fd);
    if(bytes.length!==before.size||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs)fail('SENTINEL_EVENT_FILE_CHANGED');
    let payload;
    try{payload=JSON.parse(bytes.toString('utf8'));}catch{fail('SENTINEL_EVENT_JSON_INVALID');}
    // GitHub workflow_dispatch may encode protected main as refs/heads/main;
    // canonicalize only the immutable event object before the unchanged guard.
    object(payload)&&(payload.ref=payload.ref==='refs/heads/main'?'main':payload.ref);
    if(!object(payload))fail('SENTINEL_EVENT_SHAPE');
    return payload;
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function validateBaseRun(run,sourceSha){
  if(!object(run)||!positive(run.id)||!positive(run.run_attempt))fail('SENTINEL_UPSTREAM_IDENTITY');
  if(run.repository?.full_name!==REPO||run.head_repository?.full_name!==REPO)fail('SENTINEL_UPSTREAM_REPOSITORY');
  if(!sha.test(sourceSha||'')||run.head_sha!==sourceSha||run.head_branch!=='main')fail('SENTINEL_UPSTREAM_MAIN_SHA');
  if(typeof run.path!=='string'||!/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(run.path))fail('SENTINEL_UPSTREAM_WORKFLOW_PATH');
  if(typeof run.event!=='string'||!run.event)fail('SENTINEL_UPSTREAM_EVENT');
  if(run.status!=='completed'||!terminal.has(run.conclusion))fail('SENTINEL_UPSTREAM_NOT_TERMINAL');
}
function validateRun(run,sourceSha){
  validateBaseRun(run,sourceSha);
  const source=PRODUCER_COMPLETIONS.find(x=>nativeWorkflowRunNameMatches(run,x.name,x.path));
  if(!source||!source.events.includes(run.event))fail('SENTINEL_UPSTREAM_WORKFLOW_EVENT');
}
function validateRemoteIdentity(remoteRun,run,sourceSha,inline=false){
  (inline?validateBaseRun:validateRun)(remoteRun,sourceSha);
  for(const key of ['id','run_attempt','name','display_title','path','event','head_branch','head_sha','status','conclusion']){
    if(remoteRun[key]!==run[key])fail('SENTINEL_UPSTREAM_REMOTE_CHANGED');
  }
  for(const key of ['repository','head_repository']){
    if(!positive(remoteRun[key].id)||remoteRun[key].id!==run[key].id)fail('SENTINEL_UPSTREAM_REMOTE_REPOSITORY_CHANGED');
  }
}
export function validateSentinelTrigger(env,payload=null,remoteRun=null){
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||!sha.test(env.GITHUB_SHA||''))fail('SENTINEL_TRIGGER_MAIN_CONTEXT');
  const inline=env.KPMO_INLINE_ASSURANCE_HEALTH_GATE==='true';
  if(inline){
    if(env.GITHUB_WORKFLOW!==ASSURANCE_WORKFLOW)fail('SENTINEL_INLINE_ASSURANCE_WORKFLOW_INVALID');
    if(!inlineEvents.has(env.GITHUB_EVENT_NAME))fail('SENTINEL_INLINE_ASSURANCE_EVENT_INVALID');
    if(['push','schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))return null;
    if(env.GITHUB_EVENT_NAME==='repository_dispatch')return validateNaturalClockEvent(env,payload,'ASSURANCE');
    if(!object(payload)||payload.action!=='completed'||payload.repository?.full_name!==REPO)fail('SENTINEL_EVENT_COMPLETION_CONTEXT');
    const run=payload.workflow_run;
    validateBaseRun(run,env.GITHUB_SHA);
    if(remoteRun!==null)validateRemoteIdentity(remoteRun,run,env.GITHUB_SHA,true);
    return {run_id:run.id,run_attempt:run.run_attempt,path:run.path,event:run.event,conclusion:run.conclusion};
  }
  if(['push','schedule'].includes(env.GITHUB_EVENT_NAME))return null;
  if(env.GITHUB_EVENT_NAME==='workflow_dispatch'){
    if(!object(payload?.inputs)||!payload.inputs.continuation_event_type)return null;
    const binding=validateCoverageChainContinuationEvent(env,payload);
    if(remoteRun!==null){
      validateRun(remoteRun,env.GITHUB_SHA);
      if(remoteRun.id!==binding.run_id||remoteRun.run_attempt!==binding.run_attempt||remoteRun.path!==binding.path
        ||remoteRun.event!==binding.upstream_event||remoteRun.conclusion!=='success')fail('SENTINEL_CHAIN_CONTINUATION_REMOTE_CHANGED');
    }
    return binding;
  }
  if(env.GITHUB_EVENT_NAME==='repository_dispatch'){
    return validateNaturalClockEvent(env,payload,'SENTINEL');
  }
  if(env.GITHUB_EVENT_NAME!=='workflow_run')fail('SENTINEL_EVENT_NOT_ALLOWED');
  if(!object(payload)||payload.action!=='completed'||payload.repository?.full_name!==REPO)fail('SENTINEL_EVENT_COMPLETION_CONTEXT');
  const run=payload.workflow_run;
  validateRun(run,env.GITHUB_SHA);
  if(remoteRun!==null)validateRemoteIdentity(remoteRun,run,env.GITHUB_SHA,false);
  return {run_id:run.id,run_attempt:run.run_attempt,path:run.path,event:run.event,conclusion:run.conclusion};
}
