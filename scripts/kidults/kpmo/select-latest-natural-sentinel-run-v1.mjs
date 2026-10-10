import {assuranceSentinelObservationRoute} from './lib/assurance-sentinel-observation-route-v1.mjs';
import {verifyAuthenticatedSentinelContinuation} from './lib/authenticated-sentinel-continuation-v1.mjs';
const SHA=/^[0-9a-f]{40}$/;
// Select only authoritative natural Sentinel outcomes for the Assurance cohort.
// Administrative skipped/stale/neutral outcomes must never shadow a real terminal receipt.
const NATURAL_EVENTS=new Set(['workflow_run','repository_dispatch','schedule']);
const WORKFLOW_PATH='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
const PENDING_STATUSES=new Set(['queued','in_progress','waiting','requested','pending']);
const NON_AUTHORITATIVE_CONCLUSIONS=new Set(['skipped','stale','neutral','action_required']);
const TERMINAL_CONCLUSIONS=new Set(['success','failure','cancelled','timed_out','startup_failure']);
const positive=value=>Number.isSafeInteger(value)&&value>0;

export function selectLatestNaturalSentinelRun(runs,{sourceSha,repository,observedAt,continuationEvidence=[],causalParent=null}){
  if(!Array.isArray(runs)||!SHA.test(String(sourceSha||''))||typeof repository!=='string'||
    !Number.isFinite(Date.parse(observedAt||'')))throw new TypeError('SENTINEL_SELECTION_INPUT_INVALID');
  const cutoff=Date.parse(observedAt);
  if(causalParent!==null&&(!positive(Number(causalParent.run_id))||Number(causalParent.run_attempt)!==1||
    causalParent.repository!==repository||causalParent.head_branch!=='main'||causalParent.workflow_path!==WORKFLOW_PATH||
    causalParent.workflow_name!=='KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1'||
    ![...NATURAL_EVENTS,'workflow_dispatch'].includes(causalParent.workflow_event)||causalParent.conclusion!=='success'))
    throw new Error('SENTINEL_SELECTION_CAUSAL_PARENT_INVALID');
  if(causalParent!==null&&runs.filter(run=>Number(run?.id)===Number(causalParent.run_id)&&
    Number(run?.run_attempt)===Number(causalParent.run_attempt)).length!==1)
    throw new Error('SENTINEL_SELECTION_CAUSAL_PARENT_CARDINALITY');
  const candidates=[];
  const seen=new Map();
  for(const run of runs){
    if(causalParent!==null&&Number(run?.id)!==Number(causalParent.run_id))continue;
    if(causalParent!==null&&(run.event!==causalParent.workflow_event||run.head_sha!==sourceSha||run.head_branch!=='main'||
      run.status!=='completed'||run.conclusion!==causalParent.conclusion))throw new Error('SENTINEL_SELECTION_CAUSAL_PARENT_DRIFT');
    if(run?.head_sha!==sourceSha||run?.head_branch!=='main')continue;
    if(!NATURAL_EVENTS.has(run?.event)){
      if(run?.event!=='workflow_dispatch')continue;
      const matches=continuationEvidence.filter(x=>x.run?.id===run.id);
      if(matches.length===0)continue;
      if(matches.length!==1||JSON.stringify(matches[0].run)!==JSON.stringify(run))throw new Error('SENTINEL_SELECTION_CONTINUATION_NATIVE_DRIFT');
      if(!verifyAuthenticatedSentinelContinuation({...matches[0],sourceSha,repository}))continue;
    }
    if(run?.path!==WORKFLOW_PATH)throw new Error('SENTINEL_SELECTION_WORKFLOW_PATH_INVALID');
    if(run?.repository?.full_name!==repository)throw new Error('SENTINEL_SELECTION_REPOSITORY_INVALID');
    if(!positive(run.id)||run.run_attempt!==1)throw new Error('SENTINEL_SELECTION_RUN_IDENTITY_INVALID');
    const created=Date.parse(run.created_at||'');
    if(!Number.isFinite(created)||created>cutoff)throw new Error('SENTINEL_SELECTION_TIME_INVALID');
    if(run.status!=='completed'&&!PENDING_STATUSES.has(run.status))throw new Error('SENTINEL_SELECTION_STATUS_INVALID');
    if(run.status==='completed'&&!TERMINAL_CONCLUSIONS.has(run.conclusion)&&!NON_AUTHORITATIVE_CONCLUSIONS.has(run.conclusion))
      throw new Error('SENTINEL_SELECTION_CONCLUSION_INVALID');
    if(run.status!=='completed'&&run.conclusion!==null)throw new Error('SENTINEL_SELECTION_PENDING_CONCLUSION_INVALID');
    const fingerprint=JSON.stringify([run.run_attempt,run.event,run.created_at,run.status,run.conclusion,run.head_sha]);
    if(seen.has(run.id)&&seen.get(run.id)!==fingerprint)throw new Error('SENTINEL_SELECTION_DUPLICATE_ID');
    seen.set(run.id,fingerprint);
    candidates.push({...run,_created:created});
  }
  candidates.sort((a,b)=>a._created-b._created||a.id-b.id);
  const pending=candidates.filter(run=>run.status!=='completed');
  const terminal=candidates.filter(run=>run.status==='completed'&&!NON_AUTHORITATIVE_CONCLUSIONS.has(run.conclusion));
  const latestPending=pending.at(-1);
  const latestTerminal=terminal.at(-1);
  const latest=latestPending&&(!latestTerminal||latestPending._created>latestTerminal._created||
    (latestPending._created===latestTerminal._created&&latestPending.id>latestTerminal.id))?latestPending:latestTerminal;
  if(!latest){
    const administrative=candidates.at(-1);
    const clean=administrative?{...administrative}:null;
    if(clean)delete clean._created;
    return {state:'VERIFIED_HOLD',failure_class:candidates.length?'NATURAL_SENTINEL_SUCCESS_NOT_READY':'NATURAL_SENTINEL_NOT_FOUND',latest:null,latest_observed:clean,candidate_count:candidates.length,eligible_terminal_count:0};
  }
  const state=latest.status!=='completed'?'VERIFIED_HOLD':latest.conclusion==='success'?'VERIFIED_PASS':'VERIFIED_FAIL';
  const clean={...latest};delete clean._created;
  return {state,failure_class:state==='VERIFIED_FAIL'?'LATEST_NATURAL_SENTINEL_NOT_SUCCESS':null,latest:clean,candidate_count:candidates.length,eligible_terminal_count:terminal.length};
}

if(import.meta.url==='file://'+process.argv[1]){
  try{
    const [inputPath,sourceSha,observedAt,repository,evidencePath,auditPath,runPath,jobsPath,proofPath]=process.argv.slice(2);
    const input=JSON.parse(await (await import('node:fs/promises')).readFile(inputPath,'utf8'));
    const continuationEvidence=evidencePath?JSON.parse(await (await import('node:fs/promises')).readFile(evidencePath,'utf8')):[];
    let causalParent=null,observationRoute=null;
    if(auditPath){
      const audit=JSON.parse(await (await import('node:fs/promises')).readFile(auditPath,'utf8'));
      const read=async file=>JSON.parse(await (await import('node:fs/promises')).readFile(file,'utf8'));
      const context={audit,sourceSha,assuranceRun:runPath?await read(runPath):undefined,
        jobs:jobsPath?await read(jobsPath):undefined,proof:proofPath?await read(proofPath):undefined};
      if(audit.execution?.trigger==='repository_dispatch'){
        const selection=selectLatestNaturalSentinelRun(input.workflow_runs,{sourceSha,repository,observedAt,continuationEvidence});
        if(selection.state!=='VERIFIED_PASS')throw new Error('SENTINEL_SELECTION_CLOCK_NOT_SUCCESS');
        context.sentinelRun=selection.latest;
      }
      const route=assuranceSentinelObservationRoute(context);
      observationRoute=route;
      const matches=input.workflow_runs.filter(run=>Number(run.id)===route.sentinelRunId);
      if(matches.length!==1)throw new Error('SENTINEL_SELECTION_ASSURANCE_BINDING_CARDINALITY');
      causalParent=assuranceSentinelObservationRoute({...context,sentinelRun:matches[0]}).causalParent;
      if(route.mode==='CAUSAL_SENTINEL'&&!causalParent)throw new Error('SENTINEL_SELECTION_ASSURANCE_CAUSAL_INPUT');
    }
    const result=selectLatestNaturalSentinelRun(input.workflow_runs,{sourceSha,repository,observedAt,continuationEvidence,causalParent});
    if(observationRoute?.mode==='EXTERNAL_CLOCK_PROOF_BOUND'&&Number(result.latest?.id)!==observationRoute.sentinelRunId)throw new Error('SENTINEL_SELECTION_CLOCK_PROOF_STALE');
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){
    process.stderr.write('SENTINEL_LATEST_RUN_SELECTION_FAILED\n');
    process.exitCode=1;
  }
}
