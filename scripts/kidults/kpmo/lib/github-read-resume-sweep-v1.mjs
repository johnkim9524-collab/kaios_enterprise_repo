const REPO='johnkim9524-collab/kaios_enterprise_repo';
export const READ_RESUME_SWEEP_PRODUCERS=Object.freeze([
  {name:'KIDULTS Autonomous Track Authorization V1',path:'.github/workflows/kidults-autonomous-track-authorization-v1.yml',role:'track'},
  {name:'KIDULTS Autonomous KPMO Authorization V1',path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',role:'kpmo'},
  {name:'KIDULTS Autonomous Independent Verification V1',path:'.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml',role:'independent-verification'},
  {name:'KIDULTS Platform Continuous Assurance V1',path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',role:'assurance'},
]);
const check=(ok,code)=>{if(!ok)throw Error(`GITHUB_READ_RESUME_SWEEP_${code}`);};

export function readResumeSweepRoute(producer,{createdAfter}){
  check(READ_RESUME_SWEEP_PRODUCERS.some(item=>item.path===producer?.path&&item.name===producer?.name),'PRODUCER');
  const parsed=Date.parse(createdAfter);
  check(Number.isFinite(parsed)&&new Date(parsed).toISOString()===createdAfter,'CREATED_AFTER');
  const workflow=producer.path.split('/').at(-1);
  return `actions/workflows/${workflow}/runs?branch=main&status=completed&created=%3E%3D${createdAfter}&per_page=100&page=1`;
}

export function deterministicReadResumeSweepWakeAt({createdAt,checkpointResumeAt,now=Date.now(),windowMs=28*60*1000}={}){
  const created=Date.parse(createdAt||'');
  const canonicalCreated=Number.isFinite(created)&&(
    new Date(created).toISOString()===createdAt||new Date(created).toISOString().replace('.000Z','Z')===createdAt);
  check(Number.isSafeInteger(now)&&Number.isSafeInteger(windowMs)&&windowMs>0&&windowMs<=24*60*60*1000
    &&canonicalCreated&&created>=now-windowMs&&created<=now
    &&Number.isSafeInteger(checkpointResumeAt),'WAKE_CONFIG');
  const wakeAt=Math.max(created+31*60*1000,checkpointResumeAt);
  check(wakeAt>now,'WAKE_TIME');
  return wakeAt;
}

export function selectReadResumeSweepCandidates({producer,listing,now=Date.now(),windowMs=30*60*1000,limit=2}={}){
  check(READ_RESUME_SWEEP_PRODUCERS.some(item=>item.path===producer?.path&&item.name===producer?.name),'PRODUCER');
  check(Number.isSafeInteger(now)&&Number.isSafeInteger(windowMs)&&windowMs>0&&windowMs<=24*60*60*1000
    &&Number.isSafeInteger(limit)&&limit>=1&&limit<=10,'CONFIG');
  check(Array.isArray(listing?.workflow_runs)&&Number.isSafeInteger(listing.total_count)&&listing.total_count>=listing.workflow_runs.length
    &&listing.workflow_runs.length<=100,'LISTING');
  const cutoff=now-windowMs;
  const valid=listing.workflow_runs.filter(run=>{
    const created=Date.parse(run?.created_at||'');
    return Number.isSafeInteger(run?.id)&&run.id>0&&Number.isSafeInteger(run?.run_attempt)&&run.run_attempt>=1&&run.run_attempt<=100
      // GitHub may suffix the display name with "completed" for workflow_run
      // events. The workflow path is the stable identity and is already exact.
      &&(run.path===producer.path||run.path===`${producer.path}@refs/heads/main`)
      &&run.status==='completed'&&run.conclusion!=='success'&&run.head_branch==='main'&&/^[a-f0-9]{40}$/.test(run.head_sha||'')
      &&(['push','repository_dispatch','workflow_run'].includes(run.event)
        ||(producer.role==='assurance'&&run.event==='schedule'&&run.conclusion==='failure'))
      &&run.repository?.full_name===REPO&&Number(run.repository?.id)===1281328888
      &&run.head_repository?.full_name===REPO&&Number.isFinite(created)&&created>=cutoff&&created<=now;
  });
  const identities=new Set();
  for(const run of valid){
    const identity=`${run.id}:${run.run_attempt}`;
    check(!identities.has(identity),'DUPLICATE_RUN_IDENTITY');
    identities.add(identity);
  }
  valid.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
  return valid.slice(0,limit);
}
