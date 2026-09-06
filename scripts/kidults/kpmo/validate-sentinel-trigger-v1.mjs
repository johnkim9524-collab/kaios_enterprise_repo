import fs from 'node:fs';
const REPO='johnkim9524-collab/kaios_enterprise_repo';
const sha=/^[0-9a-f]{40}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const terminal=new Set(['success','failure','cancelled','timed_out','action_required','neutral','skipped','stale']);
export const PRODUCER_COMPLETIONS=Object.freeze([
  {name:'KIDULTS ASI SHADOW Operating Evidence v1',path:'.github/workflows/kidults-asi-shadow-operating-evidence-v1.yml',events:['schedule','push','workflow_dispatch']},
  {name:'KIDULTS ASI Requirement-to-Adapter Coverage v1',path:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',events:['workflow_run']},
  {name:'KIDULTS ASI Sharded Source Reserve v1',path:'.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',events:['workflow_run','schedule','workflow_dispatch']},
  {name:'KPMO Live Canonical Issue Truth V1',path:'.github/workflows/kpmo-live-canonical-issue-truth-v1.yml',events:['push','workflow_dispatch','issues']},
]);
const fail=code=>{throw new Error(code);};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
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
    if(!object(payload))fail('SENTINEL_EVENT_SHAPE');
    return payload;
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function validateRun(run,sourceSha){
  if(!object(run)||!positive(run.id)||!positive(run.run_attempt))fail('SENTINEL_UPSTREAM_IDENTITY');
  if(run.repository?.full_name!==REPO||run.head_repository?.full_name!==REPO)fail('SENTINEL_UPSTREAM_REPOSITORY');
  if(!sha.test(sourceSha||'')||run.head_sha!==sourceSha||run.head_branch!=='main')fail('SENTINEL_UPSTREAM_MAIN_SHA');
  const source=PRODUCER_COMPLETIONS.find(x=>x.path===run.path&&x.name===run.name);
  if(!source||!source.events.includes(run.event))fail('SENTINEL_UPSTREAM_WORKFLOW_EVENT');
  if(run.status!=='completed'||!terminal.has(run.conclusion))fail('SENTINEL_UPSTREAM_NOT_TERMINAL');
}
export function validateSentinelTrigger(env,payload=null,remoteRun=null){
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||!sha.test(env.GITHUB_SHA||''))fail('SENTINEL_TRIGGER_MAIN_CONTEXT');
  if(['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))return null;
  if(env.GITHUB_EVENT_NAME!=='workflow_run')fail('SENTINEL_EVENT_NOT_ALLOWED');
  if(!object(payload)||payload.action!=='completed'||payload.repository?.full_name!==REPO)fail('SENTINEL_EVENT_COMPLETION_CONTEXT');
  const run=payload.workflow_run;
  validateRun(run,env.GITHUB_SHA);
  if(remoteRun!==null){
    validateRun(remoteRun,env.GITHUB_SHA);
    for(const key of ['id','run_attempt','name','path','event','head_branch','head_sha','status','conclusion']){
      if(remoteRun[key]!==run[key])fail('SENTINEL_UPSTREAM_REMOTE_CHANGED');
    }
    for(const key of ['repository','head_repository']){
      if(!positive(remoteRun[key].id)||remoteRun[key].id!==run[key].id)fail('SENTINEL_UPSTREAM_REMOTE_REPOSITORY_CHANGED');
    }
  }
  return {run_id:run.id,run_attempt:run.run_attempt,path:run.path,event:run.event,conclusion:run.conclusion};
}
