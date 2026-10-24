// Read-only consumer for rate-limit checkpoints. A checkpoint is scheduling
// data only: it never authenticates a workflow, approval, reservation or write.
import {readArchive} from '../validate-sentinel-producer-content-v1.mjs';

const REPO='johnkim9524-collab/kaios_enterprise_repo';
const REPO_ID='1281328888';
const WORKFLOWS=new Map([
  ['track','.github/workflows/kidults-autonomous-track-authorization-v1.yml'],
  ['kpmo','.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml'],
  ['independent-verification','.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml'],
  ['assurance','.github/workflows/kidults-platform-continuous-assurance-v1.yml'],
]);
const check=(ok,code)=>{if(!ok)throw Error(`GITHUB_RESUME_${code}`);};

function routeAllowed(route,binding,now=()=>Date.now()){
  check(typeof route==='string'&&route.length<=512&&!route.includes('#'),'ROUTE');
  const prefix='/repos/'+REPO+'/';
  check(route.startsWith(prefix),'ROUTE_NOT_ALLOWLISTED');
  const path=route.slice(prefix.length);
  const allowed=[
    /^actions\/runs\/[1-9][0-9]{0,15}$/,
    /^actions\/runs\/[1-9][0-9]{0,15}\/attempts\/(?:[1-9]|[1-9][0-9]|100)\/jobs\?per_page=100$/,
    /^actions\/runs\/[1-9][0-9]{0,15}\/artifacts\?per_page=100$/,
    /^actions\/artifacts\/[1-9][0-9]{0,15}$/,
    /^actions\/artifacts\/[1-9][0-9]{0,15}\/zip$/,
    /^pulls\/[1-9][0-9]{0,5}$/,
    /^branches\/main$/,
    /^git\/commits\/[a-f0-9]{40}$/,
    /^compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40}(?:\?per_page=1&page=2)?$/,
    /^actions\/workflows\/kidults-autonomous-(?:track|kpmo|independent-verification)-authorization-v1\.yml\/runs\?branch=main&event=repository_dispatch&status=(?:failure|cancelled|timed_out)&per_page=100&page=[1-9][0-9]{0,2}$/,
  ];
  const trackHistory=/^actions\/workflows\/kidults-autonomous-track-authorization-v1\.yml\/runs\?branch=main&created=([^&]+)&per_page=(?:25|100)&page=([1-9][0-9]{0,2})$/.exec(path);
  const securityHistory=/^actions\/workflows\/kidults-security-assurance-empirical-r1\.yml\/runs\?branch=main&head_sha=([a-f0-9]{40})&created=([^&]+)&per_page=(?:25|100)&page=([1-9][0-9]{0,2})$/.exec(path);
  const validHistoryRange=(encoded,page,maxAgeMs)=>{
    if(!encoded||!page||Number(page)>100)return false;
    let decoded='';try{decoded=decodeURIComponent(encoded);}catch{return false;}
    const range= /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)\.\.(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)$/.exec(decoded);
    if(!range)return false;
    const start=Date.parse(range[1]),end=Date.parse(range[2]),observed=now();
    return Number.isFinite(start)&&Number.isFinite(end)&&new Date(start).toISOString()===range[1]&&new Date(end).toISOString()===range[2]
      &&Number.isSafeInteger(observed)&&start<=end&&end-start<=maxAgeMs&&end<=observed;
  };
  const originalRunIdBound=(typeof binding.original_run_id==='string'
    &&/^[1-9][0-9]{0,15}$/.test(binding.original_run_id))
    ||(Number.isSafeInteger(binding.original_run_id)&&binding.original_run_id>0&&binding.original_run_id<=9999999999999999);
  const originalMissionBound=originalRunIdBound
    &&Number.isSafeInteger(binding.original_run_attempt)&&binding.original_run_attempt>=1&&binding.original_run_attempt<=100
    &&Number.isSafeInteger(binding.original_artifact_id)&&binding.original_artifact_id>0
    &&/^sha256:[a-f0-9]{64}$/.test(binding.original_artifact_digest||'');
  const trackHistoryAllowed=Boolean(trackHistory)&&originalMissionBound
    &&validHistoryRange(trackHistory[1],trackHistory[2],31*24*60*60*1000);
  const securityHistoryAllowed=Boolean(securityHistory)&&securityHistory[1]===binding.source_sha
    &&validHistoryRange(securityHistory[2],securityHistory[3],31*24*60*60*1000);
  const sentinel=/^actions\/workflows\/kpmo-continuous-assurance-sentinel-health-v1\.yml\/runs\?head_sha=([a-f0-9]{40})&created=([^&]+)&per_page=100&page=([1-9][0-9]{0,2})$/;
  const match=sentinel.exec(path);
  let sentinelAllowed=false;
  if(match){
    let decoded='';try{decoded=decodeURIComponent(match[2]);}catch{decoded='';}
    const range=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)\.\.(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)$/.exec(decoded);
    if(range){
      const start=Date.parse(range[1]),end=Date.parse(range[2]);
      sentinelAllowed=match[1]===binding.source_sha&&Number.isFinite(start)&&Number.isFinite(end)
        &&start<=end&&end-start<=24*60*60*1000&&end<=now();
    }
  }
  check(allowed.some(pattern=>pattern.test(path))||trackHistoryAllowed||securityHistoryAllowed||sentinelAllowed,'ROUTE_NOT_ALLOWLISTED');
  const run=path.match(/^actions\/runs\/([1-9][0-9]{0,15})(?:\/attempts\/((?:[1-9]|[1-9][0-9]|100))\/jobs\?per_page=100|\/artifacts\?per_page=100)?$/);
  if(run){
    const boundRuns=[binding.run_id,binding.original_run_id,binding.parent_run_id,binding.deferred_target_run_id]
      .filter(value=>value!==undefined).map(String);
    check(boundRuns.includes(run[1]),'ROUTE_TARGET_RUN');
    if(run[2]&&run[1]===binding.run_id)check(Number(run[2])===binding.run_attempt,'ROUTE_TARGET_ATTEMPT');
    if(run[2]&&run[1]===String(binding.original_run_id))check(Number(run[2])===binding.original_run_attempt,'ROUTE_TARGET_ATTEMPT');
    if(run[2]&&run[1]===String(binding.parent_run_id)&&run[1]!==String(binding.run_id)&&run[1]!==String(binding.original_run_id))
      check(Number(run[2])===binding.parent_run_attempt,'ROUTE_TARGET_ATTEMPT');
  }
  const artifact=path.match(/^actions\/artifacts\/([1-9][0-9]{0,15})(?:\/zip)?$/);
  if(artifact)check(String(binding.original_artifact_id||'')===artifact[1],'ROUTE_TARGET_ARTIFACT');
  return {path};
}

export function validateGithubReadResumeCheckpoint({checkpoint,run,artifact,archiveBytes,expected,now=()=>Date.now(),archiveReader=readArchive,packet:providedPacket}){
  check(checkpoint?.id==='kidults-github-read-resume-checkpoint-v1'
    &&checkpoint.version==='1.0.0'&&checkpoint.state==='READ_DEFERRED_NOT_AUTHORITY','CHECKPOINT');
  const b=checkpoint.binding;
  check(b?.original_run_id===undefined||(Number.isSafeInteger(b.original_run_attempt)&&b.original_run_attempt>=1&&b.original_run_attempt<=100),'CHECKPOINT_ORIGINAL_ATTEMPT');
  check(b?.parent_run_id===undefined||(Number.isSafeInteger(b.parent_run_attempt)&&b.parent_run_attempt>=1&&b.parent_run_attempt<=100),'CHECKPOINT_PARENT_ATTEMPT');
  check(b?.root_mission==='AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION'
    &&b.source_sha===expected.source_sha&&b.run_id===String(expected.run_id)
    &&b.run_attempt===expected.run_attempt&&Number.isSafeInteger(b.run_attempt)
    &&b.run_attempt>=1&&b.run_attempt<=100,'CHECKPOINT_EXPECTED_BINDING');
  check(checkpoint.original_reservation_preserved===true&&checkpoint.reservation_write_performed===false
    &&checkpoint.producer_failure_claimed===false&&checkpoint.actual_authority_granted===false
    &&checkpoint.promotion_eligible===false&&checkpoint.mutation_retry_authorized===false,'CHECKPOINT_SCOPE');
  check(run?.id===Number(b.run_id)&&run.run_attempt===b.run_attempt&&run.head_sha===b.source_sha
    &&run.repository?.full_name===REPO&&String(run.repository?.id)===REPO_ID
    &&run.path===expected.workflow_path
    &&(['push','repository_dispatch','workflow_run'].includes(run.event)
      ||(run.event==='schedule'&&run.path==='.github/workflows/kidults-platform-continuous-assurance-v1.yml'
        &&run.conclusion==='failure'))
    &&run.head_branch==='main','NATIVE_RUN_BINDING');
  check([...WORKFLOWS.values()].includes(run.path),'WORKFLOW_NOT_ALLOWLISTED');
  const role=[...WORKFLOWS].find(([,path])=>path===run.path)[0];
  const name=`kidults-github-read-resume-${role}-${run.id}-${run.run_attempt}`;
  check(artifact?.id===expected.artifact_id&&artifact.name===name&&artifact.expired===false
    &&artifact.workflow_run?.id===run.id&&artifact.workflow_run?.head_sha===run.head_sha
    &&artifact.workflow_run?.repository_id===Number(REPO_ID)
    &&/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')&&artifact.digest===expected.artifact_digest
    &&Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=8*1024*1024
    &&Number.isFinite(Date.parse(artifact.expires_at))&&Date.parse(artifact.expires_at)>now(),'ARTIFACT_BINDING');
  check(Buffer.isBuffer(archiveBytes)&&archiveBytes.length===artifact.size_in_bytes,'ARCHIVE_SIZE');
  const packet=providedPacket??archiveReader(archiveBytes,artifact.digest);
  const members=packet.members.filter(m=>m.encoding==='utf-8'&&m.name==='checkpoints.jsonl');
  check(members.length===1,'CHECKPOINT_MEMBER_CARDINALITY');
  const lines=members[0].text.split(/\r?\n/).filter(Boolean);
  check(lines.length>0&&lines.length<=100,'CHECKPOINT_LINES');
  const entries=lines.map(line=>{try{return JSON.parse(line);}catch{check(false,'CHECKPOINT_JSON');}});
  const wanted=entries.filter(c=>c?.id==='kidults-github-read-resume-checkpoint-v1'
    &&c.binding?.run_id===b.run_id&&c.binding?.run_attempt===b.run_attempt&&c.binding?.source_sha===b.source_sha);
  check(wanted.length>=1&&wanted.length<=8&&wanted.some(value=>JSON.stringify(value)===JSON.stringify(checkpoint)),
    'CHECKPOINT_CARDINALITY_OR_DRIFT');
  const resumeAt=Date.parse(checkpoint.resume_at);
  check(Number.isFinite(resumeAt)&&new Date(resumeAt).toISOString()===checkpoint.resume_at,'RESUME_TIME');
  check(checkpoint.unfinished_operation?.method==='GET','METHOD');
  const deferredTarget=checkpoint.unfinished_operation.route.match(
    /^\/repos\/johnkim9524-collab\/kaios_enterprise_repo\/actions\/runs\/([1-9][0-9]{0,15})(?:\/artifacts\?per_page=100)?$/);
  const routeBinding={...b,...(deferredTarget?{deferred_target_run_id:deferredTarget[1]}:{})};
  const allowedRoute=routeAllowed(checkpoint.unfinished_operation.route,routeBinding,now);
  return {packet,resumeAt,route:checkpoint.unfinished_operation.route,allowedRoute};
}

export async function consumeGithubReadResumeCheckpoint({checkpoint,run,artifact,archiveBytes,expected,read,now=()=>Date.now(),archiveReader=readArchive,packet:providedPacket}){
  check(typeof read==='function','READ_CALLBACK');
  const validated=validateGithubReadResumeCheckpoint({checkpoint,run,artifact,archiveBytes,expected,now,archiveReader,packet:providedPacket});
  check(now()>=validated.resumeAt,'RESUME_NOT_DUE');
  const value=await read(validated.route);
  return {state:'READ_ONLY_CHECKPOINT_RESUMED',value,run_id:run.id,run_attempt:run.run_attempt,
    source_sha:run.head_sha,artifact_id:artifact.id,artifact_digest:artifact.digest,
    method:'GET',route:validated.route,route_count:1,checkpoint_consumed:true,
    actual_authority_granted:false,reservation_write_performed:false,approval_created:false};
}

export const githubReadResumeWorkflowAllowlist=Object.freeze([...WORKFLOWS.values()]);
