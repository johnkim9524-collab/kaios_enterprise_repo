import {runtimeGithubRead} from './runtime-github-read-v1.mjs';
import {readWithBoundedGithubDeferrals} from './bounded-github-read-deferral-v1.mjs';
import {createInvocationArchiveByteCache} from './invocation-archive-byte-cache-v1.mjs';
import {assuranceSentinelObservationRoute} from './assurance-sentinel-observation-route-v1.mjs';
import {assuranceClockObservationBoundary} from './assurance-clock-observation-boundary-v1.mjs';
import {selectLatestNaturalSentinelRun} from '../select-latest-natural-sentinel-run-v1.mjs';
import {bindAssuranceUpstreamSentinelReceipt} from '../bind-assurance-upstream-sentinel-receipt-v1.mjs';
import {verifyAuthenticatedSentinelContinuation} from './authenticated-sentinel-continuation-v1.mjs';
import {consumeKirCoverageAssuranceContinuation} from '../validate-kir-coverage-assurance-continuation-v1.mjs';
// Read-only authentication of the existing Gate workflow_run trigger.
import fs from 'node:fs';
import {readArchive,checkTransport} from '../validate-sentinel-producer-content-v1.mjs';
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';
const repository='johnkim9524-collab/kaios_enterprise_repo';
const assuranceName='KIDULTS Platform Continuous Assurance V1';
const assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const coverageName='KIDULTS Coverage';
const coveragePath='.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
const sentinelName='KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1';
const sentinelPath='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
const check=(ok,code)=>{if(!ok)throw new Error('INTERRUPTED_TRIGGER_'+code);};
export const recoveryNativeGet=route=>runtimeGithubRead(process.env.GITHUB_TOKEN||process.env.GH_TOKEN)(`https://api.github.com/repos/${repository}/${route}`);
export function createBoundedRecoveryRunGet({env=process.env,token=env.GITHUB_TOKEN||env.GH_TOKEN,
  readFactory=runtimeGithubRead,now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxRuntimeMs=18*60*1000,
  persistCheckpoint=checkpoint=>{
    const directory='out/github-read-resume-v1';fs.mkdirSync(directory,{recursive:true,mode:0o700});
    fs.appendFileSync(`${directory}/checkpoints.jsonl`,JSON.stringify(checkpoint)+'\n',{mode:0o600});
  }}={}){
  const deadline=now()+maxRuntimeMs;
  const expectedBinding={run_id:String(env.GITHUB_RUN_ID),run_attempt:Number(env.GITHUB_RUN_ATTEMPT),source_sha:env.GITHUB_SHA};
  return async route=>{
    let latestCheckpoint=null;
    try{
      const result=await readWithBoundedGithubDeferrals({route,expectedBinding,deadline,now,wait,
        read:async()=>{
          latestCheckpoint=null;
          try{return await readFactory(token,{deadlineMs:Math.max(1,Math.min(900000,deadline-now())),resumeDeadline:deadline,persistCheckpoints:false})
            (`https://api.github.com/repos/${repository}/${route}`);}
          catch(error){latestCheckpoint=error?.read_resume_checkpoint||latestCheckpoint;throw error;}
        }});
      return result.value;
    }catch(error){
      latestCheckpoint=error?.read_resume_checkpoint||latestCheckpoint;
      if(latestCheckpoint)persistCheckpoint(latestCheckpoint);
      throw error;
    }
  };
}
export const recoveryNativeRunGet=createBoundedRecoveryRunGet();
const nativeBytes=route=>execFileSync('gh',['api',`repos/${repository}/${route}`],{timeout:30000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
export async function verifyFailureAssuranceParent({run,eventAction='completed',sourceSha,get,readBytes,archiveReader=readArchive}){
  check(eventAction==='completed'&&run?.name===assuranceName&&run.path===assurancePath
    &&run.status==='completed'&&run.conclusion==='failure'&&run.run_attempt===1&&run.head_sha===sourceSha
    &&run.head_branch==='main'&&['workflow_run','repository_dispatch','workflow_dispatch'].includes(run.event)
    &&run.repository?.full_name===repository&&String(run.repository?.id)==='1281328888'
    &&run.head_repository?.full_name===repository,'FAILURE_ASSURANCE_TRIGGER');
  const live=await get(`actions/runs/${run.id}`);
  check(['id','name','path','event','head_sha','head_branch','run_attempt','status','conclusion'].every(k=>live[k]===run[k])
    &&live.repository?.full_name===repository&&String(live.repository?.id)==='1281328888'
    &&live.head_repository?.full_name===repository,'FAILURE_ASSURANCE_READBACK');
  const jobs=await get(`actions/runs/${live.id}/attempts/1/jobs?per_page=100`);
  check(Array.isArray(jobs.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.total_count<=100
    &&new Set(jobs.jobs.map(j=>j.id)).size===jobs.jobs.length,'FAILURE_ASSURANCE_JOBS');
  const failed=jobs.jobs.filter(j=>j.status==='completed'&&j.conclusion==='failure');
  check(failed.length===1&&failed[0].name==='audit'&&failed[0].run_id===live.id
    &&(failed[0].run_attempt===undefined||failed[0].run_attempt===1),'FAILURE_ASSURANCE_DISPOSITION');
    if(run.event==='workflow_dispatch'){
      const classifiers=jobs.jobs.filter(j=>j.name==='classify-canonical-identity');
      const classifierSteps=classifiers[0]?.steps||[];
      const exactStep=name=>classifierSteps.filter(step=>step.name===name&&step.status==='completed'&&step.conclusion==='success').length===1;
      check(classifiers.length===1&&classifiers[0].run_id===live.id&&classifiers[0].status==='completed'
        &&classifiers[0].conclusion==='success'&&exactStep('Reject partial forwarded Coverage continuation inputs')
        &&exactStep('Validate and consume forwarded exact Coverage continuation')
        &&exactStep('Retain one-time Coverage continuation consumption receipt'),'FAILURE_ASSURANCE_COVERAGE_STEPS');
    }
  const listing=await get(`actions/runs/${live.id}/artifacts?per_page=100`);
  check(Array.isArray(listing.artifacts)&&listing.total_count===listing.artifacts.length&&listing.total_count<=100,'FAILURE_ASSURANCE_ARTIFACT_LIST');
  const name=`kidults-continuous-assurance-${sourceSha}-${live.id}-1`,artifacts=listing.artifacts.filter(a=>a.name===name);
  check(artifacts.length===1,'FAILURE_ASSURANCE_ARTIFACT');const artifact=artifacts[0];
  checkTransport(live,artifact,sourceSha,new Date().toISOString(),{allowFailedConclusion:true});
  const bytes=await readBytes(`actions/artifacts/${artifact.id}/zip`);
  check(Buffer.isBuffer(bytes)&&bytes.length===artifact.size_in_bytes,'FAILURE_ASSURANCE_ARCHIVE_SIZE');
  const packet=archiveReader(bytes,artifact.digest),members=packet.members.filter(m=>m.encoding==='utf-8'&&m.name.split('/').at(-1)==='audit-receipt.json');
  check(members.length===1,'FAILURE_ASSURANCE_AUDIT_CARDINALITY');
  const audit=JSON.parse(members[0].text),unsigned=structuredClone(audit);delete unsigned.observed_at;delete unsigned.receipt_digest;
  const proofMembers=packet.members.filter(m=>m.encoding==='utf-8'&&m.name.split('/').at(-1)==='whole-platform-operating-proof-v1.json');
  check(proofMembers.length===1,'FAILURE_ASSURANCE_OPERATING_PROOF_CARDINALITY');
  const proof=JSON.parse(proofMembers[0].text),proofUnsigned=structuredClone(proof);delete proofUnsigned.receipt_digest;
  const failedChecks=(proof.operating_checks||[]).filter(c=>c.state==='VERIFIED_FAIL');
  const terminalCheck=failedChecks[0];
  const validTerminalRefs=refs=>Array.isArray(refs)&&refs.length===3
    &&/^[1-9][0-9]{0,15}$/.test(String(refs[0]))&&Number.isSafeInteger(Number(refs[0]))
    &&Number.isSafeInteger(refs[1])&&refs[1]>0&&/^sha256:[a-f0-9]{64}$/.test(refs[2]||'');
  const originalNull=proof.original_terminal_null_observation;
  const originalNullRefs=originalNull?.evidence_refs;
  const originalNullArtifactBound=validTerminalRefs(originalNullRefs)
    &&(proof.protected_evidence||[]).some(row=>row.workflow_path==='.github/workflows/kidults-autonomous-track-authorization-v1.yml'
      &&row.run_attempt===1&&/^[a-f0-9]{40}$/.test(row.source_sha||'')
      &&String(row.run_id)===String(originalNullRefs[0])
      &&row.artifact_id===originalNullRefs[1]&&row.artifact_digest===originalNullRefs[2]);
  const directTerminalNull=terminalCheck?.reason==='ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE'
    &&validTerminalRefs(terminalCheck.evidence_refs);
  const recoveredTerminalNull=terminalCheck?.reason==='WHOLE_RUNTIME_RECOVERY_HISTORY_CARDINALITY'
    &&originalNull?.state==='VERIFIED_FAIL'
    &&originalNull.reason==='ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE'
    &&originalNull.actual_authority_granted===false&&originalNull.retry_without_reconciliation===false
    &&originalNullArtifactBound;
  const terminalEvidenceRefs=directTerminalNull?terminalCheck.evidence_refs:recoveredTerminalNull?originalNull.evidence_refs:null;
  let upstream=audit.execution?.upstream;
  let authenticatedCoverageContinuation=false;
  let coverageContinuation=null;
  if(live.event==='repository_dispatch'){
    const observedAt=assuranceClockObservationBoundary({proof,assuranceRun:live,sourceSha,profile:'failed-terminal-recovery'});
    // Authenticate the archive snapshot, never a newer run observed later.
    const cutoff=Date.parse(observedAt),start=cutoff-24*60*60*1000;
    const created=encodeURIComponent(`${new Date(start).toISOString()}..${observedAt}`);
    const runs=[];let total=null;
    for(let page=1;page<=10;page++){
      const rows=await get(`actions/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml/runs?head_sha=${sourceSha}&created=${created}&per_page=100&page=${page}`);
      check(Array.isArray(rows.workflow_runs)&&Number.isSafeInteger(rows.total_count)&&rows.total_count>=0&&rows.total_count<=1000
        &&rows.workflow_runs.length<=100&&(total===null||total===rows.total_count),'FAILURE_CLOCK_SENTINEL_LIST');
      total=rows.total_count;runs.push(...rows.workflow_runs);
      check(runs.length<=total&&new Set(runs.map(row=>row.id)).size===runs.length,'FAILURE_CLOCK_SENTINEL_LIST');
      if(runs.length===total)break;
      check(rows.workflow_runs.length===100&&page<10,'FAILURE_CLOCK_SENTINEL_LIST');
    }
    const bounded=runs.filter(row=>Number.isFinite(Date.parse(row.created_at))&&Date.parse(row.created_at)>=start&&Date.parse(row.created_at)<=cutoff);
    const selected=selectLatestNaturalSentinelRun(bounded,{sourceSha,repository,observedAt});
    check(selected.latest?.conclusion==='success','FAILURE_CLOCK_SENTINEL_SELECTION');
    const route=assuranceSentinelObservationRoute({audit,proof,sourceSha,assuranceRun:live,jobs,sentinelRun:selected.latest,profile:'failed-terminal-recovery'});
    const binding=await bindAssuranceUpstreamSentinelReceipt({run:selected.latest,sourceSha,get,readBytes,archiveReader});
    check(binding.artifact_id===Number(route.sentinelBinding.artifact_id)&&binding.artifact_digest===route.sentinelBinding.artifact_digest,'FAILURE_CLOCK_SENTINEL_ARCHIVE');
    upstream={run_id:String(binding.run_id),run_attempt:'1',workflow_name:selected.latest.name,workflow_path:selected.latest.path,workflow_event:selected.latest.event,conclusion:'success',repository,head_branch:'main',source_receipt_digest:binding.receipt_digest};
  }
  if(live.event==='workflow_dispatch'){
    // The only dispatch failure eligible for recovery is the bot-created
    // continuation whose one-time Coverage consumption and exact Sentinel
    // archive are both independently re-read and bound to this Assurance run.
    check(live.actor?.login==='github-actions[bot]','COVERAGE_CONTINUATION_ACTOR');
    const consumedArtifacts=listing.artifacts.filter(a=>/^kidults-kir-coverage-assurance-consumption-v1-[1-9][0-9]*-1$/.test(a.name||'')
      &&a.workflow_run?.id===live.id&&a.workflow_run?.head_sha===sourceSha);
    check(consumedArtifacts.length===1,'COVERAGE_CONTINUATION_ARTIFACT');
    const consumedArtifact=consumedArtifacts[0];
    checkTransport(live,consumedArtifact,sourceSha,new Date().toISOString(),{allowFailedConclusion:true});
    check(Date.parse(consumedArtifact.created_at)<=Date.parse(live.updated_at),'COVERAGE_CONSUMPTION_ARTIFACT_TIME');
    const consumedBytes=await readBytes(`actions/artifacts/${consumedArtifact.id}/zip`);
    check(Buffer.isBuffer(consumedBytes)&&consumedBytes.length===consumedArtifact.size_in_bytes,'COVERAGE_CONTINUATION_ARCHIVE_SIZE');
    const consumedPacket=archiveReader(consumedBytes,consumedArtifact.digest);
    check(consumedPacket.archive_digest===consumedArtifact.digest&&consumedPacket.members.length===3,'COVERAGE_CONSUMPTION_ARCHIVE_BINDING');
    const findMember=(packet,basename,code)=>{
      const matches=packet.members.filter(m=>m.encoding==='utf-8'&&m.name.split('/').at(-1)===basename);
      check(matches.length===1&&matches[0].sha256===sha256(matches[0].text),code);return JSON.parse(matches[0].text);
    };
    const consumed=findMember(consumedPacket,'kir-coverage-assurance-consumption-v1.json','COVERAGE_CONSUMPTION_RECEIPT');
    const copiedDispatchReceipt=findMember(consumedPacket,'kir-coverage-assurance-continuation-v1.json','COVERAGE_DISPATCH_RECEIPT');
    const coverageRunId=Number(consumed.coverage_run_id),coverageAttempt=Number(consumed.coverage_run_attempt);
    check(Number.isSafeInteger(coverageRunId)&&coverageRunId>0&&coverageAttempt===1
      &&consumedArtifact.name===`kidults-kir-coverage-assurance-consumption-v1-${coverageRunId}-${coverageAttempt}`
      &&consumed.id==='kidults-kir-coverage-assurance-consumption-v1'&&consumed.version==='1.3.0'
      &&consumed.state==='CONSUMED_VERIFIED'&&consumed.consumer_workflow_run_id===live.id
      &&consumed.consumer_workflow_run_attempt===1&&consumed.source_sha===sourceSha
      &&consumed.input_validated===true&&consumed.receipt_verified===true&&consumed.one_time_consumed===true
      &&consumed.authoritative_coverage_verified===true&&consumed.promotion_eligible===false
      &&consumed.production==='HOLD'&&consumed.public==='HOLD'&&consumed.g5==='HOLD','COVERAGE_CONSUMPTION_BINDING');
    const coverageRun=await get(`actions/runs/${coverageRunId}`);
    check(coverageRun.id===coverageRunId&&coverageRun.run_attempt===coverageAttempt&&coverageRun.name===`${coverageName} / source-${sourceSha}`
      &&coverageRun.path===coveragePath&&coverageRun.event==='workflow_run'&&coverageRun.event===consumed.coverage_event&&coverageRun.status==='completed'
      &&coverageRun.conclusion==='success'&&coverageRun.head_sha===sourceSha&&coverageRun.head_branch==='main'
      &&coverageRun.repository?.full_name===repository&&coverageRun.head_repository?.full_name===repository
      &&Number.isFinite(Date.parse(coverageRun.created_at))&&Date.parse(coverageRun.created_at)<=Date.parse(live.created_at),
    'COVERAGE_NATIVE_RUN');
    const coverageArtifacts=await get(`actions/runs/${coverageRunId}/artifacts?per_page=100`);
    check(Array.isArray(coverageArtifacts.artifacts)&&coverageArtifacts.total_count===coverageArtifacts.artifacts.length
      &&coverageArtifacts.total_count<=100,'COVERAGE_NATIVE_ARTIFACTS');
    const dispatchArtifacts=coverageArtifacts.artifacts.filter(a=>a.id===consumed.coverage_artifact_id
      &&a.name===`kidults-kir-coverage-assurance-dispatch-v1-${coverageRunId}-${coverageAttempt}`
      &&a.expired===false&&a.workflow_run?.id===coverageRunId&&a.workflow_run?.head_sha===sourceSha
      &&a.digest===consumed.coverage_artifact_digest);
    check(dispatchArtifacts.length===1,'COVERAGE_DISPATCH_ARTIFACT');
    const dispatchArtifact=dispatchArtifacts[0];
    checkTransport(coverageRun,dispatchArtifact,sourceSha,new Date().toISOString());
    check(Date.parse(dispatchArtifact.created_at)<=Date.parse(coverageRun.updated_at),'COVERAGE_DISPATCH_ARTIFACT_TIME');
    const dispatchBytes=await readBytes(`actions/artifacts/${dispatchArtifact.id}/zip`);
    check(Buffer.isBuffer(dispatchBytes)&&dispatchBytes.length===dispatchArtifact.size_in_bytes,'COVERAGE_DISPATCH_ARCHIVE_SIZE');
    const dispatchPacket=archiveReader(dispatchBytes,dispatchArtifact.digest);
    check(dispatchPacket.archive_digest===dispatchArtifact.digest&&dispatchPacket.members.length===1,'COVERAGE_DISPATCH_ARCHIVE_BINDING');
    const dispatchReceipt=findMember(dispatchPacket,'kir-coverage-assurance-continuation-v1.json','COVERAGE_DISPATCH_ARCHIVE_RECEIPT');
    check(canonicalJson(dispatchReceipt)===canonicalJson(copiedDispatchReceipt),'COVERAGE_DISPATCH_COPY_DRIFT');
    const commit=await get(`git/commits/${sourceSha}`);
    check(commit.sha===sourceSha&&commit.tree?.sha===consumed.source_tree,'COVERAGE_SOURCE_TREE');
    const request={repository:dispatchReceipt.repository,source_sha:dispatchReceipt.source_sha,source_tree:dispatchReceipt.source_tree,
      coverage_event:dispatchReceipt.coverage_event,coverage_run_id:dispatchReceipt.coverage_run_id,
      coverage_run_attempt:dispatchReceipt.coverage_run_attempt,coverage_created_at:dispatchReceipt.coverage_created_at,
      generation_id:dispatchReceipt.generation_id,dispatch_artifact_id:dispatchArtifact.id,
      dispatch_artifact_digest:dispatchArtifact.digest,continuation_key:dispatchReceipt.continuation_key};
    const recomputed=consumeKirCoverageAssuranceContinuation({request,current:{repository,source_sha:sourceSha,source_tree:commit.tree.sha},
      dispatch_artifact:dispatchArtifact,dispatch_receipt:dispatchReceipt,run:coverageRun,prior_consumption_count:0,
      consumer:{run_id:live.id,run_attempt:1}});
    check(canonicalJson(recomputed)===canonicalJson(consumed),'COVERAGE_CONSUMPTION_RECOMPUTE');
    check(String(upstream?.run_id)===String(coverageRun.id)&&String(upstream?.run_attempt)==='1'
      &&upstream?.workflow_name===coverageRun.name&&upstream?.workflow_path===coveragePath
      &&upstream?.workflow_event===coverageRun.event&&upstream?.conclusion==='success'
      &&upstream?.repository===repository&&upstream?.head_branch==='main','COVERAGE_AUDIT_UPSTREAM');
    // The exact Sentinel identity comes from the proof's single protected row;
    // its authenticated continuation must point back to the consumed Coverage artifact.
    const boundRows=(proof.protected_evidence||[]).filter(row=>row.workflow_path===sentinelPath);
    check(boundRows.length===1,'COVERAGE_SENTINEL_PROOF_CARDINALITY');
    const sentinelRow=boundRows[0],sentinelRun=await get(`actions/runs/${sentinelRow.run_id}`);
    const auditJobs=jobs.jobs.filter(j=>j.name==='audit'&&j.run_id===live.id
      &&(j.run_attempt===undefined||j.run_attempt===1)&&j.status==='completed');
    const auditSteps=auditJobs[0]?.steps||[];
    const sentinelBarrier=auditSteps.map((step,index)=>({step,index})).filter(({step})=>
      step.name==='Enforce Sentinel terminal before Assurance'&&step.status==='completed'&&step.conclusion==='success');
    const auditExecution=auditSteps.map((step,index)=>({step,index})).filter(({step})=>
      step.name==='Run audit and always retain receipt'&&step.status==='completed'&&step.conclusion==='success');
    check(auditJobs.length===1&&sentinelBarrier.length===1&&auditExecution.length===1
      &&sentinelBarrier[0].index<auditExecution[0].index,'COVERAGE_SENTINEL_TERMINAL_BARRIER');
    check(sentinelRun.actor?.login==='github-actions[bot]'&&sentinelRun.name===sentinelName&&sentinelRun.path===sentinelPath
      &&sentinelRun.event==='workflow_dispatch'&&sentinelRun.status==='completed'&&sentinelRun.conclusion==='success'
      &&sentinelRun.run_attempt===1&&sentinelRun.head_sha===sourceSha&&sentinelRun.head_branch==='main'
      &&sentinelRun.repository?.full_name===repository&&sentinelRun.head_repository?.full_name===repository
      &&Number.isFinite(Date.parse(sentinelRun.created_at))&&Date.parse(coverageRun.created_at)<=Date.parse(sentinelRun.created_at)
      &&Number.isFinite(Date.parse(sentinelRun.updated_at))&&Date.parse(sentinelRun.updated_at)<=Date.parse(live.updated_at),
    'COVERAGE_SENTINEL_RUN');
    check(Date.parse(dispatchArtifact.created_at)<=Date.parse(sentinelRun.created_at),'COVERAGE_SENTINEL_DISPATCH_ORDER');
    const sentinelArtifacts=await get(`actions/runs/${sentinelRun.id}/artifacts?per_page=100`);
    check(Array.isArray(sentinelArtifacts.artifacts)&&sentinelArtifacts.total_count===sentinelArtifacts.artifacts.length
      &&sentinelArtifacts.total_count<=100,'COVERAGE_SENTINEL_ARTIFACTS');
    const sentinelMatches=sentinelArtifacts.artifacts.filter(a=>a.id===sentinelRow.artifact_id
      &&a.name===`kpmo-continuous-assurance-sentinel-health-v1-${sourceSha}-${sentinelRun.id}-1`
      &&a.expired===false&&a.digest===sentinelRow.artifact_digest&&a.workflow_run?.id===sentinelRun.id
      &&a.workflow_run?.head_sha===sourceSha);
    check(sentinelMatches.length===1,'COVERAGE_SENTINEL_ARTIFACT');
    checkTransport(sentinelRun,sentinelMatches[0],sourceSha,new Date().toISOString());
    const sentinelBytes=await readBytes(`actions/artifacts/${sentinelMatches[0].id}/zip`);
    check(Buffer.isBuffer(sentinelBytes)&&sentinelBytes.length===sentinelMatches[0].size_in_bytes,'COVERAGE_SENTINEL_ARCHIVE_SIZE');
    const sentinelPacket=archiveReader(sentinelBytes,sentinelMatches[0].digest);
    const authenticatedSentinel=verifyAuthenticatedSentinelContinuation({run:sentinelRun,artifact:sentinelMatches[0],
      archivePacket:sentinelPacket,sourceSha,repository});
    const binding=authenticatedSentinel?.continuation_binding;
    check(authenticatedSentinel?.state==='VERIFIED_PASS'&&binding?.upstream_run_id===coverageRunId
      &&binding.upstream_run_attempt===coverageAttempt&&binding.upstream_event==='workflow_run'
      &&binding.continuation_artifact_id===dispatchArtifact.id
      &&binding.continuation_artifact_digest===dispatchArtifact.digest&&binding.generation_id===consumed.generation_id,
    'COVERAGE_SENTINEL_CONTINUATION_BINDING');
    const route=assuranceSentinelObservationRoute({audit,proof,sourceSha,assuranceRun:live,jobs, sentinelRun,
      profile:'failed-terminal-recovery',authenticatedContinuation:true});
    check(route.mode==='AUTHENTICATED_COVERAGE_CONTINUATION'&&route.sentinelBinding.run_id===sentinelRun.id
      &&route.sentinelBinding.artifact_id===sentinelMatches[0].id,'COVERAGE_SENTINEL_ROUTE');
    upstream={run_id:String(sentinelRun.id),run_attempt:'1',workflow_name:sentinelName,workflow_path:sentinelPath,
      workflow_event:'workflow_dispatch',conclusion:'success',repository,head_branch:'main',
      source_receipt_digest:authenticatedSentinel.sentinel_receipt_digest};
    authenticatedCoverageContinuation=true;
    coverageContinuation={state:'VERIFIED_PASS',coverage_run_id:coverageRunId,coverage_run_attempt:coverageAttempt,
      coverage_event:coverageRun.event,coverage_artifact_id:dispatchArtifact.id,coverage_artifact_digest:dispatchArtifact.digest,
      consumption_artifact_id:consumedArtifact.id,consumption_artifact_digest:consumedArtifact.digest,
      sentinel_run_id:sentinelRun.id,sentinel_artifact_id:sentinelMatches[0].id,
      sentinel_artifact_digest:sentinelMatches[0].digest,sentinel_receipt_digest:authenticatedSentinel.sentinel_receipt_digest};
  }
  check(audit.receipt_type==='KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE'&&audit.source?.sha===sourceSha
    &&audit.source?.actual_sha===sourceSha&&audit.source?.expected_sha===sourceSha&&audit.source?.match===true
    &&String(audit.execution?.workflow_run_id)===String(live.id)&&String(audit.execution?.workflow_run_attempt)==='1'
    &&audit.execution?.trigger===live.event&&audit.execution?.workflow_run_id===String(live.id)
    &&audit.states?.internal_control_state==='VERIFIED_PASS'&&audit.states?.promotion_eligible===false
    &&Array.isArray(audit.checks)&&audit.checks.length>0&&audit.checks.every(c=>c.required===true)
    &&audit.checks.filter(c=>c.state!=='VERIFIED_PASS').length===0
    &&proof.id==='kidults-whole-platform-operating-proof-v1'&&proof.source_sha===sourceSha
    &&proof.repository===repository&&proof.state==='VERIFIED_FAIL'&&proof.whole_platform_runtime_proven===false
    &&proof.receipt_digest===sha256(canonicalJson(proofUnsigned))&&failedChecks.length===1
    &&terminalCheck?.id==='FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL'
    &&(directTerminalNull||recoveredTerminalNull)
    &&upstream?.workflow_name==='KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1'
    &&upstream.workflow_path==='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml'
    &&(['workflow_run','repository_dispatch'].includes(upstream.workflow_event)
      ||(authenticatedCoverageContinuation&&upstream.workflow_event==='workflow_dispatch'))&&upstream.conclusion==='success'
    &&upstream.repository===repository&&upstream.head_branch==='main'
    &&/^\d+$/.test(upstream.run_id||'')&&upstream.run_attempt==='1'
    &&/^sha256:[a-f0-9]{64}$/.test(upstream.source_receipt_digest||'')
    &&/^sha256:[a-f0-9]{64}$/.test(audit.receipt_digest||'')&&audit.receipt_digest===sha256(canonicalJson(unsigned)),
    'FAILURE_ASSURANCE_AUDIT_BINDING');
  const branch=await get('branches/main');check(branch.name==='main'&&branch.protected===true&&branch.commit?.sha===sourceSha,'FAILURE_ASSURANCE_MAIN');
  const parent={kind:'TERMINAL_NULL_ASSURANCE_FAILURE_V1',run_id:live.id,run_attempt:1,workflow_path:assurancePath,
    source_sha:sourceSha,artifact_id:artifact.id,artifact_digest:artifact.digest,archive_digest:packet.archive_digest,
    audit_receipt_digest:audit.receipt_digest,operating_proof_digest:proof.receipt_digest,
    terminal_check_id:terminalCheck.id,terminal_check_reason:'ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE',
    terminal_check_evidence_refs:terminalEvidenceRefs,
    upstream_run_id:upstream.run_id,upstream_receipt_digest:upstream.source_receipt_digest,
    ...(coverageContinuation?{coverage_continuation:coverageContinuation}:{}),
    audit_job_id:failed[0].id,conclusion:'failure',actual_authority_granted:false,
    platform_closure:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
  return {...live,recovery_parent:parent};
}
export async function verifyInterruptedRecoveryNativeTrigger({env=process.env,event,get=recoveryNativeGet,readBytes=nativeBytes,archiveReader=readArchive}){
  check(['workflow_run','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)&&env.GITHUB_RUN_ATTEMPT==='1'&&env.GITHUB_REF==='refs/heads/main'
    &&env.GITHUB_REPOSITORY===repository&&env.GITHUB_REPOSITORY_ID==='1281328888'
    &&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')&&env.GITHUB_WORKFLOW_SHA===env.GITHUB_SHA,'CONTEXT');
  event??=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  let upstream=event.workflow_run;
  if(env.GITHUB_EVENT_NAME==='workflow_dispatch'){
    const inputs=event.inputs||{};
    check(env.GITHUB_ACTOR==='github-actions[bot]'
      &&/^[1-9][0-9]{0,19}$/.test(inputs.gate_run_id||'')&&inputs.gate_run_attempt==='1'
      &&inputs.head_sha===env.GITHUB_SHA,'DISPATCH_GATE_HINT');
    upstream=await get(`actions/runs/${inputs.gate_run_id}`);
  }
  if(upstream?.name===assuranceName&&upstream.conclusion==='failure')
    return verifyFailureAssuranceParent({run:upstream,eventAction:event.action,sourceSha:env.GITHUB_SHA,get,readBytes,archiveReader});
  if(upstream?.name==='KIDULTS Autonomous Independent Verification V1'){
    check(event.action==='completed'&&upstream.path==='.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml'
      &&['workflow_run','workflow_dispatch'].includes(upstream.event)&&upstream.status==='completed'&&upstream.conclusion==='success'
      &&upstream.run_attempt===1&&upstream.head_branch==='main'&&upstream.head_sha===env.GITHUB_SHA
      &&upstream.repository?.full_name===repository&&String(upstream.repository?.id)==='1281328888','VERIFIER_TRIGGER');
    const role=await get(`actions/runs/${upstream.id}`);
    check(['id','name','path','event','head_sha','head_branch','run_attempt','status','conclusion'].every(k=>role[k]===upstream[k]),'VERIFIER_READBACK');
    const roleJobs=await get(`actions/runs/${role.id}/attempts/1/jobs?per_page=100`);
    check(Array.isArray(roleJobs.jobs)&&roleJobs.total_count===roleJobs.jobs.length&&roleJobs.total_count<=100
      &&new Set(roleJobs.jobs.map(j=>j.id)).size===roleJobs.jobs.length,'VERIFIER_JOBS');
    const recovery=roleJobs.jobs.filter(j=>j.name==='Bounded original reservation terminal recovery INDEPENDENT_VERIFIER');
    check(recovery.length===1&&recovery[0].run_id===role.id&&(recovery[0].run_attempt===undefined||recovery[0].run_attempt===1)
      &&recovery[0].status==='completed'&&recovery[0].conclusion==='success'
      &&recovery[0].steps?.filter(s=>s.name==='Run bounded signed terminal recovery workload'&&s.status==='completed'&&s.conclusion==='success').length===1,'VERIFIER_ACTUAL_RECOVERY');
    const artifacts=await get(`actions/runs/${role.id}/artifacts?per_page=100`);
    check(Array.isArray(artifacts.artifacts)&&artifacts.total_count===artifacts.artifacts.length&&artifacts.total_count<=100,'VERIFIER_ARTIFACT_LIST');
    const selected=artifacts.artifacts.filter(a=>a.name===`kidults-postmerge-terminal-recovery-independent_verifier-${role.id}-1`);
    check(selected.length===1,'VERIFIER_ARTIFACT');checkTransport(role,selected[0],env.GITHUB_SHA,new Date().toISOString());
    const bytes=await readBytes(`actions/artifacts/${selected[0].id}/zip`);check(Buffer.isBuffer(bytes)&&bytes.length===selected[0].size_in_bytes,'VERIFIER_ARCHIVE');
    const packet=archiveReader(bytes,selected[0].digest),members=packet.members.filter(m=>m.encoding==='utf-8'&&m.name.split('/').at(-1)==='interrupted-INDEPENDENT_VERIFIER.json');
    check(members.length===1,'VERIFIER_RECEIPT');const receipt=JSON.parse(members[0].text);
    check(receipt.source_sha===env.GITHUB_SHA&&receipt.role_run_id===String(role.id)&&receipt.actual_candidates>0,'VERIFIER_LINEAGE');
    if(receipt.recovery_parent?.kind==='TERMINAL_NULL_ASSURANCE_FAILURE_V1'){
      check(receipt.gate_run_id===undefined&&receipt.recovery_parent.source_sha===env.GITHUB_SHA,'VERIFIER_FAILURE_LINEAGE');
      const failed=await get(`actions/runs/${receipt.recovery_parent.run_id}`);
      upstream=await verifyFailureAssuranceParent({run:failed,eventAction:'completed',sourceSha:env.GITHUB_SHA,get,readBytes,archiveReader});
      check(canonicalJson(upstream.recovery_parent)===canonicalJson(receipt.recovery_parent),'VERIFIER_FAILURE_RECEIPT_BINDING');
      const branch=await get('branches/main');check(branch.name==='main'&&branch.protected===true&&branch.commit?.sha===env.GITHUB_SHA,'MAIN');
      return upstream;
    }
    check(Number.isSafeInteger(receipt.gate_run_id)&&receipt.gate_run_id>0,'VERIFIER_GATE_LINEAGE');
    upstream=await get(`actions/runs/${receipt.gate_run_id}`);
  }

  check((env.GITHUB_EVENT_NAME==='workflow_dispatch'||event.action==='completed')
    &&Number.isSafeInteger(upstream?.id)&&upstream.id>0
    &&upstream.name==='KPMO Continuous Assurance Success Authority Gate V1'
    &&upstream.path==='.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml'
    &&upstream.event==='workflow_run'&&upstream.status==='completed'&&upstream.conclusion==='success'
    &&upstream.run_attempt===1&&upstream.head_sha===env.GITHUB_SHA&&upstream.head_branch==='main'
    &&upstream.repository?.full_name===repository&&String(upstream.repository?.id)==='1281328888','UPSTREAM');
  const live=await get(`actions/runs/${upstream.id}`);
  check(['id','name','path','event','head_sha','head_branch','run_attempt','status','conclusion'].every(k=>live[k]===upstream[k])
    &&live.repository?.full_name===repository&&String(live.repository?.id)==='1281328888','UPSTREAM_READBACK');
  const jobs=await get(`actions/runs/${live.id}/attempts/1/jobs?per_page=100`);
  check(Array.isArray(jobs.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.total_count<=100
    &&new Set(jobs.jobs.map(j=>j.id)).size===jobs.jobs.length,'JOBS');
  const authority=jobs.jobs.filter(j=>j.name==='success-authority-gate');
  check(authority.length===1&&authority[0].run_id===live.id&&(authority[0].run_attempt===undefined||authority[0].run_attempt===1)
    &&authority[0].status==='completed'&&authority[0].conclusion==='success','ACTUAL_AUTHORITY');
  const branch=await get('branches/main');check(branch.name==='main'&&branch.protected===true&&branch.commit?.sha===env.GITHUB_SHA,'MAIN');
  return live;
}

// This private capability reuses only immutable bytes, never metadata/authority.
// The constructor still runs the complete native verifier immediately before AWS.
const invocationTokens=new WeakMap();
const boundEnvKeys=['GITHUB_ACTIONS','GITHUB_REPOSITORY','GITHUB_REPOSITORY_ID','GITHUB_REF','GITHUB_SHA',
  'GITHUB_WORKFLOW_SHA','GITHUB_WORKFLOW_REF','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_EVENT_NAME',
  'GITHUB_EVENT_PATH','GITHUB_ACTOR','KIDULTS_RECOVERY_ROLE','KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN',
  'KIDULTS_PRODUCTION_STATE','KIDULTS_PUBLIC_STATE','KIDULTS_G5_STATE'];
const envBinding=env=>canonicalJson(Object.fromEntries(boundEnvKeys.map(k=>[k,env[k]??null])));
const readEvent=env=>JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
const freeze=v=>{if(v&&typeof v==='object'){for(const value of Object.values(v))freeze(value);Object.freeze(v);}return v;};
export async function verifyInterruptedRecoveryNativeTriggerOnce(options={}){
  const env={...(options.env||process.env)},event=structuredClone(options.event??readEvent(env));
  check(['KIDULTS_PRODUCTION_STATE','KIDULTS_PUBLIC_STATE','KIDULTS_G5_STATE'].every(k=>env[k]==='HOLD'),'TOKEN_HOLD');
  const envDigest=envBinding(env),eventDigest=sha256(canonicalJson(event)),descriptors=new Map();
  const getBase=options.get||recoveryNativeGet,bytesBase=options.readBytes||nativeBytes;
  const get=async route=>{
    const value=await getBase(route);
    if(/^actions\/runs\/[1-9][0-9]*\/artifacts\?per_page=100$/.test(route)&&Array.isArray(value?.artifacts)){
      for(const a of value.artifacts)descriptors.set(a.id,structuredClone(a));
    }
    return value;
  };
  const cachedBytes=createInvocationArchiveByteCache({download:async(_,artifact)=>bytesBase(`actions/artifacts/${artifact.id}/zip`)});
  const readBytes=route=>{
    const match=route.match(/^actions\/artifacts\/([1-9][0-9]*)\/zip$/),artifact=match&&descriptors.get(Number(match[1]));
    check(artifact,'TOKEN_ARCHIVE_BINDING');
    return cachedBytes({repository,artifact,sourceSha:env.GITHUB_SHA,runAttempt:1});
  };
  const issuedAt=Date.now();
  const upstream=await verifyInterruptedRecoveryNativeTrigger({...options,env,event,get,readBytes});
  const proof=freeze(structuredClone(upstream)),token=Object.freeze(Object.create(null));
  const boundary=Date.parse(upstream.recovery_parent?upstream.updated_at:upstream.created_at);
  invocationTokens.set(token,{envDigest,eventDigest,proof,get,readBytes,archiveReader:options.archiveReader,
    issuedAt,expiresAt:Math.min(issuedAt+900000,Number.isFinite(boundary)?boundary+1800000:issuedAt+900000)});
  return Object.freeze({upstream:proof,token});
}
export async function consumeInterruptedRecoveryNativeTriggerToken({token,env=process.env,eventReader=readEvent,now=()=>Date.now()}){
  const record=token&&typeof token==='object'?invocationTokens.get(token):null;
  check(record,'TOKEN_UNKNOWN_OR_CONSUMED');invocationTokens.delete(token);
  env={...env};check(envBinding(env)===record.envDigest,'TOKEN_CONTEXT');
  const time=now();check(Number.isSafeInteger(time)&&time>=record.issuedAt&&time<record.expiresAt,'TOKEN_EXPIRED');
  const event=eventReader(env);check(sha256(canonicalJson(event))===record.eventDigest,'TOKEN_EVENT');
  // Run/index/jobs/main are live, and archive parsing/semantic checks repeat.
  // Only an exactly bound, digest-verified private byte copy is reused.
  const fresh=await verifyInterruptedRecoveryNativeTrigger({env,event,get:record.get,readBytes:record.readBytes,archiveReader:record.archiveReader});
  check(canonicalJson(fresh)===canonicalJson(record.proof),'TOKEN_PROOF_DRIFT');
  return freeze(structuredClone(fresh));
}
