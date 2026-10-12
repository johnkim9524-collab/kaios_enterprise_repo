// Read-only consumer for rate-limit checkpoints. A checkpoint is scheduling
// data only: it never authenticates a workflow, approval, reservation or write.
import {readArchive} from '../validate-sentinel-producer-content-v1.mjs';

const REPO='johnkim9524-collab/kaios_enterprise_repo';
const REPO_ID='1281328888';
const WORKFLOWS=new Map([
  ['track','.github/workflows/kidults-autonomous-track-authorization-v1.yml'],
  ['kpmo','.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml'],
  ['independent-verification','.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml'],
]);
const check=(ok,code)=>{if(!ok)throw Error(`GITHUB_RESUME_${code}`);};

function routeAllowed(route){
  check(typeof route==='string'&&route.length<=512&&!route.includes('#'),'ROUTE');
  const prefix='/repos/'+REPO+'/';
  check(route.startsWith(prefix),'ROUTE_NOT_ALLOWLISTED');
  const path=route.slice(prefix.length);
  const allowed=[
    /^actions\/runs\/[1-9][0-9]{0,15}$/,
    /^actions\/runs\/[1-9][0-9]{0,15}\/attempts\/1\/jobs\?per_page=100$/,
    /^actions\/runs\/[1-9][0-9]{0,15}\/artifacts\?per_page=100$/,
    /^actions\/artifacts\/[1-9][0-9]{0,15}$/,
    /^pulls\/[1-9][0-9]{0,5}$/,
    /^branches\/main$/,
    /^git\/commits\/[a-f0-9]{40}$/,
    /^compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40}$/,
    /^actions\/workflows\/kidults-autonomous-(?:track|kpmo|independent-verification)-authorization-v1\.yml\/runs\?branch=main&event=repository_dispatch&status=(?:failure|cancelled|timed_out)&per_page=100&page=[1-9][0-9]{0,2}$/,
  ];
  check(allowed.some(pattern=>pattern.test(path)),'ROUTE_NOT_ALLOWLISTED');
  return {path};
}

export async function consumeGithubReadResumeCheckpoint({checkpoint,run,artifact,archiveBytes,expected,read,now=()=>Date.now(),archiveReader=readArchive}){
  check(typeof read==='function'&&checkpoint?.id==='kidults-github-read-resume-checkpoint-v1'
    &&checkpoint.version==='1.0.0'&&checkpoint.state==='READ_DEFERRED_NOT_AUTHORITY','CHECKPOINT');
  const b=checkpoint.binding;
  check(b?.root_mission==='AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION'
    &&b.source_sha===expected.source_sha&&b.run_id===String(expected.run_id)
    &&b.run_attempt===expected.run_attempt&&Number.isSafeInteger(b.run_attempt)
    &&b.run_attempt>=1&&b.run_attempt<=100,'CHECKPOINT_EXPECTED_BINDING');
  check(run?.id===Number(b.run_id)&&run.run_attempt===b.run_attempt&&run.head_sha===b.source_sha
    &&run.repository?.full_name===REPO&&String(run.repository?.id)===REPO_ID
    &&run.path===expected.workflow_path&&run.event==='repository_dispatch'
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
  const packet=archiveReader(archiveBytes,artifact.digest);
  const members=packet.members.filter(m=>m.encoding==='utf-8'&&m.name==='checkpoints.jsonl');
  check(members.length===1,'CHECKPOINT_MEMBER_CARDINALITY');
  const lines=members[0].text.split(/\r?\n/).filter(Boolean);
  check(lines.length>0&&lines.length<=100,'CHECKPOINT_LINES');
  const entries=lines.map(line=>{try{return JSON.parse(line);}catch{check(false,'CHECKPOINT_JSON');}});
  const wanted=entries.filter(c=>c?.id==='kidults-github-read-resume-checkpoint-v1'
    &&c.binding?.run_id===b.run_id&&c.binding?.run_attempt===b.run_attempt&&c.binding?.source_sha===b.source_sha);
  check(wanted.length===1&&JSON.stringify(wanted[0])===JSON.stringify(checkpoint),'CHECKPOINT_CARDINALITY_OR_DRIFT');
  const resumeAt=Date.parse(checkpoint.resume_at);
  check(Number.isFinite(resumeAt)&&new Date(resumeAt).toISOString()===checkpoint.resume_at&&now()>=resumeAt,'RESUME_NOT_DUE');
  check(checkpoint.unfinished_operation?.method==='GET','METHOD');
  routeAllowed(checkpoint.unfinished_operation.route);
  const value=await read(checkpoint.unfinished_operation.route);
  return {state:'READ_ONLY_CHECKPOINT_RESUMED',value,run_id:run.id,run_attempt:run.run_attempt,
    source_sha:run.head_sha,artifact_id:artifact.id,artifact_digest:artifact.digest,
    method:'GET',route:checkpoint.unfinished_operation.route,checkpoint_consumed:true,
    actual_authority_granted:false,reservation_write_performed:false,approval_created:false};
}

export const githubReadResumeWorkflowAllowlist=Object.freeze([...WORKFLOWS.values()]);
