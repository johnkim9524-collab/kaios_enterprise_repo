// Long deferrals request an exact one-time AWS wake-up under the bounded executor.
// Consumes one naturally-triggered producer artifact as bounded, read-only work.
// It never dispatches another run and never treats a checkpoint as authority.
import {consumeGithubReadResumeCheckpoint,validateGithubReadResumeCheckpoint} from './github-read-resume-consumer-v1.mjs';
import {createHash} from 'node:crypto';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';
import {readArchive} from '../validate-sentinel-producer-content-v1.mjs';

const REPO='johnkim9524-collab/kaios_enterprise_repo';
const REPO_ID=1281328888;
const MAX_RESUME_WAIT_MS=12*60*1000;
const check=(ok,code)=>{if(!ok)throw Error(`GITHUB_RESUME_HANDOFF_${code}`);};
const ROLES=new Map([
  ['.github/workflows/kidults-autonomous-track-authorization-v1.yml','track'],
  ['.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml','kpmo'],
  ['.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml','independent-verification'],
  ['.github/workflows/kidults-platform-continuous-assurance-v1.yml','assurance'],
]);
function canonicalProducerWorkflowPath(path){
  for(const candidate of ROLES.keys()){
    if(path===candidate||path===`${candidate}@main`||path===`${candidate}@refs/heads/main`)return candidate;
  }
  return null;
}

export async function consumeGithubReadResumeHandoff({event,readJson,readArchiveBytes,archiveReader=readArchive,now=()=>Date.now(),
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),deadline=Number.MAX_SAFE_INTEGER,scheduleResume,scheduleOnly=false}){
  check(event?.action==='completed'&&typeof readJson==='function'&&typeof readArchiveBytes==='function','INPUT');
  const triggered=event.workflow_run;
  check(triggered&&Number.isSafeInteger(triggered.id)&&triggered.id>0&&Number.isSafeInteger(triggered.run_attempt)
    &&triggered.run_attempt>=1&&triggered.run_attempt<=100&&/^[a-f0-9]{40}$/.test(triggered.head_sha||'')
    &&triggered.head_branch==='main'&&triggered.repository?.full_name===REPO&&Number(triggered.repository?.id)===REPO_ID
    &&['push','repository_dispatch','workflow_run','schedule'].includes(triggered.event),'TRIGGER_BINDING');
  const resumeSchedule=event.resume_schedule;
  if(resumeSchedule){
    const binding=resumeSchedule.resume_binding;
    check(resumeSchedule.source==='AWS_EVENTBRIDGE_SCHEDULER'&&resumeSchedule.slot==='READ_RESUME'
      &&resumeSchedule.schedule_id===resumeSchedule.dispatch_id&&/^kidults-read-resume-[a-f0-9]{40}$/.test(resumeSchedule.schedule_id||'')
      &&binding?.run_id===String(triggered.id)&&binding?.run_attempt===triggered.run_attempt
      &&binding?.source_sha===triggered.head_sha&&binding?.producer_event===triggered.event
      &&binding?.producer_conclusion===triggered.conclusion&&Number.isSafeInteger(binding?.artifact_id)
      &&/^sha256:[a-f0-9]{64}$/.test(binding?.artifact_digest||'')
      &&Array.isArray(resumeSchedule.checkpoint_digests)&&resumeSchedule.checkpoint_digests.length>=1
      &&resumeSchedule.checkpoint_digests.length<=8&&resumeSchedule.checkpoint_digests.every(value=>/^[a-f0-9]{64}$/.test(value))
      &&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(resumeSchedule.resume_at||''),'SCHEDULE_BINDING');
  }
  const runRoute=`actions/runs/${triggered.id}`;
  const run=await readJson(runRoute);
  const producerWorkflowPath=canonicalProducerWorkflowPath(run?.path);
  check(run?.id===triggered.id&&run.run_attempt===triggered.run_attempt&&run.head_sha===triggered.head_sha
    &&producerWorkflowPath&&run.event===triggered.event&&run.head_branch==='main'
    &&(run.event!=='schedule'||(producerWorkflowPath==='.github/workflows/kidults-platform-continuous-assurance-v1.yml'
      &&run.conclusion==='failure'))
    &&run.status==='completed'&&run.conclusion===triggered.conclusion
    &&run.repository?.full_name===REPO&&Number(run.repository?.id)===REPO_ID,'RUN_READBACK');
  const producerRun={...run,path:producerWorkflowPath};
  const role=ROLES.get(producerWorkflowPath);
  const listing=await readJson(`actions/runs/${run.id}/artifacts?per_page=100`);
  check(Array.isArray(listing?.artifacts)&&Number.isSafeInteger(listing.total_count)
    &&listing.total_count===listing.artifacts.length&&listing.total_count<=100,'ARTIFACT_LIST');
  const artifactName=`kidults-github-read-resume-${role}-${run.id}-${run.run_attempt}`;
  const matches=listing.artifacts.filter(item=>item?.name===artifactName);
  if(matches.length===0)return {state:'NO_CHECKPOINT_ARTIFACT',run_id:run.id,run_attempt:run.run_attempt,source_sha:run.head_sha,
    read_only:true,actual_authority_granted:false};
  check(matches.length===1,'ARTIFACT_CARDINALITY');
  const artifact=await readJson(`actions/artifacts/${matches[0].id}`);
  check(artifact?.id===matches[0].id&&artifact.name===artifactName&&artifact.expired===false
    &&artifact.workflow_run?.id===run.id&&artifact.workflow_run?.head_sha===run.head_sha
    &&artifact.workflow_run?.repository_id===REPO_ID,'ARTIFACT_READBACK');
  if(resumeSchedule)check(resumeSchedule.resume_binding.artifact_id===artifact.id
    &&resumeSchedule.resume_binding.artifact_digest===artifact.digest,'SCHEDULE_ARTIFACT_BINDING');
  const archiveBytes=await readArchiveBytes(`actions/artifacts/${artifact.id}/zip`);
  check(Buffer.isBuffer(archiveBytes)&&archiveBytes.length===artifact.size_in_bytes,'ARCHIVE_BYTES');
  const packet=archiveReader(archiveBytes,artifact.digest);
  const checkpointRows=packet.members.filter(member=>member.encoding==='utf-8'&&member.name==='checkpoints.jsonl');
  check(checkpointRows.length===1,'CHECKPOINT_FILE');
  const entries=checkpointRows[0].text.split(/\r?\n/).filter(Boolean).map(line=>{
    try{return JSON.parse(line);}catch{check(false,'CHECKPOINT_JSON');}
  });
  const candidates=entries.filter(item=>item?.id==='kidults-github-read-resume-checkpoint-v1'
    &&item.binding?.run_id===String(run.id)&&item.binding?.run_attempt===run.run_attempt&&item.binding?.source_sha===run.head_sha);
  const uniqueCandidates=[...new Map(candidates.map(item=>[canonicalJson(item),item])).values()];
  check(uniqueCandidates.length>=1&&uniqueCandidates.length<=8,'CHECKPOINT_CARDINALITY');
  const expected={source_sha:run.head_sha,run_id:run.id,run_attempt:run.run_attempt,workflow_path:producerWorkflowPath,
    artifact_id:artifact.id,artifact_digest:artifact.digest};
  // Validate every row before waiting or performing any of the scheduled GETs.
  const validated=uniqueCandidates.map(checkpoint=>({checkpoint,...validateGithubReadResumeCheckpoint({
    checkpoint,run:producerRun,artifact,archiveBytes,expected,now,packet,archiveReader:()=>packet})}));
  // Several 403/429 observations can describe the same pending GET with
  // different diagnostics or resume times. Keep one row per bound route and
  // binding, choosing the latest resume time so coalescing never reads early.
  const grouped=new Map();
  for(const item of validated){
    const key=canonicalJson({binding:item.checkpoint.binding,route:item.route});
    const current=grouped.get(key);
    const itemDigest=sha256(canonicalJson(item.checkpoint));
    const currentDigest=current?sha256(canonicalJson(current.checkpoint)):null;
    if(!current||item.resumeAt>current.resumeAt||(item.resumeAt===current.resumeAt&&itemDigest<currentDigest))
      grouped.set(key,{...item,coalesced_count:(current?.coalesced_count??0)+1});
    else current.coalesced_count++;
  }
  const resumed=Array.from(grouped.values());
  const checkpointResumeAt=Math.max(...resumed.map(value=>value.resumeAt));
  const maxResumeAt=Math.max(checkpointResumeAt,resumeSchedule?Date.parse(resumeSchedule.resume_at):0),delta=maxResumeAt-now();
  check(Number.isSafeInteger(deadline)&&now()<deadline,'RUNNER_DEADLINE');
  const checkpointDigests=validated.map(value=>sha256(canonicalJson(value.checkpoint))).sort();
  if(resumeSchedule){
    const expectedDigests=[...new Set(checkpointDigests.map(value=>value.replace(/^sha256:/,'')))].sort();
    check(resumeSchedule.checkpoint_digests.join(',')===[...resumeSchedule.checkpoint_digests].sort().join(',')
      &&canonicalJson(expectedDigests)===canonicalJson(resumeSchedule.checkpoint_digests),'SCHEDULE_CHECKPOINT_BINDING');
  }
  const defer=async reason=>{
    if(typeof scheduleResume!=='function')return {state:'RESUME_DEFERRED_WINDOW',reason,run_id:run.id,run_attempt:run.run_attempt,
      source_sha:run.head_sha,artifact_id:artifact.id,artifact_digest:artifact.digest,resume_at:new Date(checkpointResumeAt).toISOString(),
      checkpoint_digests:checkpointDigests,read_only:true,actual_authority_granted:false};
    const scheduledResumeAt=Math.max(checkpointResumeAt,now()+60_000);
    const scheduled=await scheduleResume({binding:{run_id:String(run.id),run_attempt:run.run_attempt,source_sha:run.head_sha,
      artifact_id:artifact.id,artifact_digest:artifact.digest,producer_event:run.event,producer_conclusion:run.conclusion},
      resumeAt:scheduledResumeAt,originalResumeAt:checkpointResumeAt,checkpointDigests});
    check(scheduled?.state==='RESUME_SCHEDULED','SCHEDULE_READBACK');
    return {...scheduled,reason,run_id:run.id,run_attempt:run.run_attempt,source_sha:run.head_sha,
      artifact_id:artifact.id,artifact_digest:artifact.digest,checkpoint_digests:checkpointDigests,
      original_resume_at:new Date(checkpointResumeAt).toISOString(),read_only:true,actual_authority_granted:false};
  };
  if(scheduleOnly)return defer('SWEEP_HANDOFF');
  if(delta>Math.min(MAX_RESUME_WAIT_MS,deadline-now()))return defer('RUNNER_WINDOW');
  if(delta>0)await wait(delta);
  if(now()>=deadline)return defer('RUNNER_DEADLINE');
  const results=[];
  for(const item of resumed){
    const result=await consumeGithubReadResumeCheckpoint({checkpoint:item.checkpoint,run:producerRun,artifact,archiveBytes,expected,packet,
      read:async route=>{
        const relative=route.replace(/^\/repos\/johnkim9524-collab\/kaios_enterprise_repo\//,'');
        if(relative.endsWith('/zip')){
          const bytes=await readArchiveBytes(relative);
          check(item.checkpoint.binding.original_artifact_digest
            &&/^sha256:[a-f0-9]{64}$/.test(item.checkpoint.binding.original_artifact_digest)
            &&`sha256:${createHash('sha256').update(bytes).digest('hex')}`===item.checkpoint.binding.original_artifact_digest,
          'RESUMED_ARCHIVE_DIGEST');
          return {kind:'ARCHIVE_BYTES',size_bytes:bytes.length,digest:item.checkpoint.binding.original_artifact_digest};
        }
        return readJson(relative);
      },now,archiveReader:()=>packet});
    results.push({...result,checkpoint_digest:sha256(canonicalJson(item.checkpoint)),coalesced_checkpoint_count:item.coalesced_count});
  }
  return results.length===1?{...results[0],read_only:true}:
    {state:'READ_ONLY_CHECKPOINTS_RESUMED',results,run_id:run.id,run_attempt:run.run_attempt,source_sha:run.head_sha,
      artifact_id:artifact.id,artifact_digest:artifact.digest,checkpoint_digests:checkpointDigests,route_count:results.length,
      actual_authority_granted:false,reservation_write_performed:false,approval_created:false,read_only:true};
}
