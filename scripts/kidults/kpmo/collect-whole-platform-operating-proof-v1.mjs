import {createInvocationArchiveByteCache} from './lib/invocation-archive-byte-cache-v1.mjs';
import {verifyFailureTerminalReconciliation} from './lib/failure-terminal-reconciliation-proof-v1.mjs';
import {verifyOriginalTerminalRepairReconciliation} from './lib/original-terminal-repair-reconciliation-proof-v1.mjs';
import {observeInterruptedRecoveryNative} from './lib/interrupted-reservation-recovery-v1.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {authenticatedGithubRead,downloadArtifact,selectProducerGeneration,SPECS} from './resolve-continuous-assurance-sentinel-health-v1.mjs';
import {readArchive,REPOSITORY} from './validate-sentinel-producer-content-v1.mjs';
import {inventoryWholePlatform} from './lib/whole-platform-operating-proof-v1.mjs';
import {verifyHealthReceipt,distinctNaturalGenerations,verifyMissionTerminal,verifyValueChainDomainReceipt,verifyNaturalChainTerminal} from './lib/whole-platform-runtime-evidence-v1.mjs';
import {assuranceClockObservationBoundary} from './lib/assurance-clock-observation-boundary-v1.mjs';
import {assuranceSentinelObservationRoute} from './lib/assurance-sentinel-observation-route-v1.mjs';
import {selectLatestNaturalSentinelRun} from './select-latest-natural-sentinel-run-v1.mjs';
import {verifyNativeResumeReuse} from './lib/native-resume-reuse-proof-v1.mjs';
import {canonicalJson,sha256} from './lib/canonical-json-v1.mjs';
import {buildRuntimeEvidenceDemand} from './lib/runtime-domain-evidence-demand-v1.mjs';
import {INTERNAL_RECOVERY_CHECKS} from './lib/internal-operating-recovery-v1.mjs';
const requireEvidence=(ok,code)=>{if(!ok)throw new Error(`WHOLE_RUNTIME_${code}`);};
const spec=(id,workflow,events)=>({id,workflow,path:`.github/workflows/${workflow}`,events});
const sentinel=spec('SENTINEL','kpmo-continuous-assurance-sentinel-health-v1.yml',['push','workflow_run','repository_dispatch']);
const gateSpec=spec('SUCCESS_GATE','kpmo-continuous-assurance-success-authority-gate-v1.yml',['workflow_run']);
const canary=spec('IMMUTABILITY','kidults-autonomous-object-lock-canary-v1.yml',['push','schedule','workflow_dispatch']);
const dispatcher=spec('DISPATCHER','kidults-autonomous-dispatcher-v1.yml',['workflow_run','schedule','workflow_dispatch']);
const finalizers=['track','kpmo','independent-verification'].map(role=>spec(`FINALIZER_${role}`,`kidults-autonomous-${role}-authorization-v1.yml`,['repository_dispatch','workflow_run']));
const rootUrl=`https://api.github.com/repos/${REPOSITORY}`;
// Read the maximum GitHub page size to keep complete historical reconciliation
// inside the invocation call budget. A 100-run Actions index is still bounded
// by the explicit 4 MiB response cap below.
const RUN_INDEX_PAGE_SIZE=100;
const RUN_INDEX_MAX_PAGES=40;
const RUN_INDEX_MAX_RESPONSE_BYTES=4*1024*1024;
const RECOVERY_HISTORY_PAGE_SIZE=RUN_INDEX_PAGE_SIZE;
const RECOVERY_HISTORY_SEARCH_RESULT_CAP=1000;
const RECOVERY_HISTORY_MAX_READS=240;
const member=(packet,basename)=>{
  const values=packet.members.filter(m=>path.posix.basename(m.name)===basename);
  requireEvidence(values.length===1,'MEMBER_CARDINALITY');return JSON.parse(values[0].text);
};
export function operatingProofFailureDisposition(error){
  if(error?.read_resume_checkpoint?.state==='READ_DEFERRED_NOT_AUTHORITY')
    return {state:'VERIFIED_HOLD',reason:'GITHUB_READ_DEFERRED_NOT_AUTHORITY'};
  const result={state:'VERIFIED_FAIL',reason:String(error?.message||error).split(':')[0]};
  if(error?.read_diagnostic?.method==='GET'&&typeof error.read_diagnostic.route_path==='string'
    &&Number.isSafeInteger(error.read_diagnostic.observed_bytes)&&Number.isSafeInteger(error.read_diagnostic.max_bytes))
    result.read_diagnostic=error.read_diagnostic;
  return result;
}
export function buildAutonomousOperatingCompletion({policy,runtimeReadiness,operatingChecks,normalTerminalProven}){
  const requiredChecks=policy?.required_operating_checks||[];
  const expectedChecks=['CORE_FOUR_CONTENT','DISTINCT_NATURAL_GENERATIONS','NATURAL_CHAIN_TERMINALS','PROTECTED_LANDING',
    'AWS_CONFIGURATION_AND_IMMUTABILITY','NATIVE_DISPATCH','NATIVE_RESUME_REUSE','FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL'];
  const exactChecks=Array.isArray(requiredChecks)&&JSON.stringify([...requiredChecks].sort())===JSON.stringify([...expectedChecks].sort());
  const exactFutureExpansion=Array.isArray(policy?.future_expansion_domains)
    &&Array.isArray(runtimeReadiness?.future_expansion_domain_ids)
    &&policy.future_expansion_domains.length===13&&new Set(policy.future_expansion_domains).size===13
    &&JSON.stringify([...policy.future_expansion_domains].sort())===JSON.stringify([...runtimeReadiness.future_expansion_domain_ids].sort());
  const verifiedChecks=operatingChecks.filter(c=>requiredChecks.includes(c.id)&&c.state==='VERIFIED_PASS').map(c=>c.id).sort();
  const proven=normalTerminalProven===true&&policy?.scope==='AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM'
    &&Array.isArray(policy.mandatory_runtime_domains)&&policy.mandatory_runtime_domains.length===1
    &&policy.mandatory_runtime_domains[0]==='SECURITY_SUPPLY_CHAIN'
    &&policy.unregistered_domains_block_autonomy===false&&policy.unregistered_domains_are_pass===false
    &&policy.unregistered_domains_are_future_expansion===true&&policy.future_expansion_scope==='WHOLE_PLATFORM_ONLY'
    &&exactFutureExpansion
    &&runtimeReadiness?.state==='VERIFIED_PASS'&&runtimeReadiness.scope==='AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM'
    &&runtimeReadiness.required_domain_count===1&&runtimeReadiness.verified_domain_count===1
    &&runtimeReadiness.domain_ids?.length===1&&runtimeReadiness.domain_ids[0]==='SECURITY_SUPPLY_CHAIN'
    &&exactChecks&&requiredChecks.every(id=>operatingChecks.some(c=>c.id===id&&c.state==='VERIFIED_PASS'));
  return {proven,completion:{state:proven?'VERIFIED_PASS':'VERIFIED_HOLD',
    scope:policy?.scope||'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM',
    required_runtime_domain_count:runtimeReadiness?.required_domain_count??0,
    verified_runtime_domain_count:runtimeReadiness?.verified_domain_count??0,
    future_expansion_runtime_domain_ids:[...(runtimeReadiness?.future_expansion_domain_ids||[])].sort(),
    required_operating_check_ids:requiredChecks,verified_operating_check_ids:verifiedChecks,
    whole_platform_runtime_proven:false,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'}};
}
export function originalRecoveryHistoryQuery(originalRun,observedAt,page,windowStart,windowEnd){
  const start=Date.parse(originalRun?.created_at),end=Date.parse(observedAt);
  const queryStart=Math.floor(start/1000)*1000,queryEnd=Math.floor(end/1000)*1000;
  const from=windowStart===undefined?queryStart:windowStart,to=windowEnd===undefined?queryEnd:windowEnd;
  requireEvidence(originalRun?.id===38132692877&&Number.isFinite(start)&&Number.isFinite(end)&&start<=end
    &&Number.isInteger(from)&&Number.isInteger(to)&&from>=queryStart&&to<=queryEnd&&from<=to
    &&Number.isInteger(page)&&page>=1&&page<=RUN_INDEX_MAX_PAGES,'RECOVERY_HISTORY_INCIDENT_WINDOW');
  // A terminal recovering this reservation cannot predate its original run.
  // Keep all source SHAs: reconciliation survives later protected-main merges.
  // Status is mutable even for runs created before the fixed cutoff. Filtering
  // success here changes page membership as in-flight runs finish.
  return new URLSearchParams({branch:'main',created:`${new Date(from).toISOString()}..${new Date(to).toISOString()}`,
    per_page:String(RECOVERY_HISTORY_PAGE_SIZE),page:String(page)});
}
export async function collectBoundedWorkflowRunWindow({get,workflow,sourceSha,after,before}){
  requireEvidence(typeof get==='function'&&/^[a-f0-9]{40}$/.test(sourceSha||'')
    &&typeof workflow==='string'&&workflow.length>0&&Number.isFinite(after)&&Number.isFinite(before)&&after<=before,'RUN_WINDOW_INPUT');
  const values=[];let count;
  for(let page=1;page<=RUN_INDEX_MAX_PAGES;page++){
    const query=new URLSearchParams({branch:'main',head_sha:sourceSha,
      created:`${new Date(after).toISOString()}..${new Date(before).toISOString()}`,
      per_page:String(RUN_INDEX_PAGE_SIZE),page:String(page)});
    const index=await get(`actions/workflows/${workflow}/runs?${query}`);
    requireEvidence(Array.isArray(index.workflow_runs)&&index.workflow_runs.length<=RUN_INDEX_PAGE_SIZE
      &&Number.isSafeInteger(index.total_count)&&index.total_count>=0&&index.total_count<=1000,'RUN_WINDOW_INDEX');
    if(count===undefined)count=index.total_count;requireEvidence(count===index.total_count,'RUN_WINDOW_CHANGED');
    const expected=Math.min(RUN_INDEX_PAGE_SIZE,count-(page-1)*RUN_INDEX_PAGE_SIZE);
    requireEvidence(index.workflow_runs.length===expected,'RUN_WINDOW_PAGE_CARDINALITY');
    values.push(...index.workflow_runs);requireEvidence(values.length<=count,'RUN_WINDOW_CARDINALITY');
    if(values.length===count)break;
    requireEvidence(index.workflow_runs.length===RUN_INDEX_PAGE_SIZE&&page<RUN_INDEX_MAX_PAGES,'RUN_WINDOW_TRUNCATED');
  }
  requireEvidence(values.length===count,'RUN_WINDOW_TRUNCATED');
  return values;
}
export async function listOriginalRecoveryHistory({originalRun,observedAt,get,workflow}){
  const start=Date.parse(originalRun?.created_at),end=Date.parse(observedAt);
  requireEvidence(Number.isFinite(start)&&Number.isFinite(end)&&start<=end,'RECOVERY_HISTORY_INCIDENT_WINDOW');
  const queryStart=Math.floor(start/1000)*1000,queryEnd=Math.floor(end/1000)*1000;
  let reads=0;
  const queryPage=async(range,page)=>{
    requireEvidence(reads<RECOVERY_HISTORY_MAX_READS,'RECOVERY_HISTORY_READ_BUDGET');
    reads++;
    const query=originalRecoveryHistoryQuery(originalRun,observedAt,page,range.start,range.end);
    const index=await get(`actions/workflows/${workflow}/runs?${query}`);
    requireEvidence(Array.isArray(index.workflow_runs)&&index.workflow_runs.length<=RECOVERY_HISTORY_PAGE_SIZE
      &&Number.isSafeInteger(index.total_count)&&index.total_count>=0
      &&index.incomplete_results!==true,'RECOVERY_HISTORY_INDEX');
    return index;
  };
  const history=[],pending=[{start:queryStart,end:queryEnd}];let completeTotal=0;
  while(pending.length){
    const range=pending.shift();
    const first=await queryPage(range,1);
    if(first.total_count>=RECOVERY_HISTORY_SEARCH_RESULT_CAP){
      // GitHub caps each created-range search at 1,000 rows. A result count
      // exactly at the cap is ambiguous too, so split until every query is
      // strictly below it. Use disjoint UTC-second ranges, matching GitHub's
      // created timestamp precision.
      // This keeps every search complete while preserving a hard read ceiling.
      requireEvidence(range.end-range.start>=1000,'RECOVERY_HISTORY_TIMESTAMP_DENSITY');
      const middle=range.start+Math.floor((range.end-range.start)/2000)*1000;
      requireEvidence(middle>=range.start&&middle+1000<=range.end,'RECOVERY_HISTORY_TIMESTAMP_DENSITY');
      pending.push({start:middle+1000,end:range.end},{start:range.start,end:middle});
      continue;
    }
    let count=first.total_count;
    // A capped parent query reports 1,000 even when the full window contains
    // more rows. Only disjoint, uncapped leaf windows contribute to the
    // complete snapshot cardinality.
    completeTotal+=count;
    const pages=Math.max(1,Math.ceil(count/RECOVERY_HISTORY_PAGE_SIZE));
    for(let page=1;page<=pages;page++){
      const index=page===1?first:await queryPage(range,page);
      requireEvidence(index.total_count===count,'RECOVERY_HISTORY_CHANGED');
      const expected=Math.min(RECOVERY_HISTORY_PAGE_SIZE,count-(page-1)*RECOVERY_HISTORY_PAGE_SIZE);
      requireEvidence(index.workflow_runs.length===expected,'RECOVERY_HISTORY_PAGE_CARDINALITY');
      history.push(...index.workflow_runs);
      requireEvidence(history.length<=completeTotal,'RECOVERY_HISTORY_CARDINALITY');
    }
  }
  const unique=new Map();
  for(const run of history){
    const created=Date.parse(run?.created_at);
    requireEvidence(Number.isSafeInteger(run?.id)&&run.id>0&&Number.isFinite(created)
      &&created>=queryStart&&created<=queryEnd,'RECOVERY_HISTORY_INCIDENT_WINDOW');
    requireEvidence(!unique.has(run.id),'RECOVERY_HISTORY_DUPLICATE');
    unique.set(run.id,run);
  }
  requireEvidence(unique.size===completeTotal,'RECOVERY_HISTORY_SNAPSHOT_CARDINALITY');
  const exact= [...unique.values()].filter(run=>Date.parse(run.created_at)>=start&&Date.parse(run.created_at)<=end);
  return {workflow_runs:exact,total_count:exact.length,complete:true,read_count:reads};
}
export async function collectWholePlatform({sourceSha,contract,scorecard,token,read=authenticatedGithubRead,download=downloadArtifact,
  demandDefinition=JSON.parse(fs.readFileSync(contract.runtime_evidence_demand_definition,'utf8')),
  listRuns=null,archiveReader=readArchive,archiveByteCacheFactory=createInvocationArchiveByteCache,observedAt=new Date().toISOString()}){
  const out=inventoryWholePlatform(contract,scorecard,sourceSha);
  out.observed_at=observedAt;out.repository=REPOSITORY;out.protected_evidence=[];
  const get=p=>read(`${rootUrl}/${p}`,token,
    /^actions\/workflows\/[^/]+\/runs\?/.test(p)?{maxBytes:RUN_INDEX_MAX_RESPONSE_BYTES}:undefined);
  const readBytes=archiveByteCacheFactory({download});
  const main=await get('branches/main');requireEvidence(main.commit?.sha===sourceSha,'EXACT_MAIN');
  const commit=await get(`git/commits/${sourceSha}`);
  requireEvidence(commit.sha===sourceSha,'COMMIT');
  const check=id=>out.operating_checks.find(c=>c.id===id);
  const mark=(id,state,reason,refs=[])=>Object.assign(check(id),{state,reason,evidence_refs:refs});
  const attempt=async(ids,work)=>{try{await work();}catch(error){const disposition=operatingProofFailureDisposition(error);
    for(const id of ids){mark(id,disposition.state,disposition.reason);if(disposition.read_diagnostic)check(id).read_diagnostic=disposition.read_diagnostic;}}};
  const runs=async(s,sha=sourceSha)=>{
    let values;
    if(listRuns)values=await listRuns(REPOSITORY,s,sha,token);
    else{
      const before=sha===sourceSha?Date.parse(observedAt):Date.parse(commit.committer?.date);
      requireEvidence(Number.isFinite(before),'RUN_WINDOW_TIME');
      const after=before-(sha===sourceSha?contract.maximum_evidence_age_seconds:7200)*1000;
      values=await collectBoundedWorkflowRunWindow({get,workflow:s.workflow,sourceSha:sha,after,before});
    }
    return selectProducerGeneration(values,s,sha,observedAt).candidates.reverse();
  };
  const packet=async(run,name,readerOptions={})=>{
    requireEvidence(run.status==='completed'&&run.run_attempt===1,'RUN_TERMINAL_ATTEMPT');
    const index=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
    requireEvidence(Array.isArray(index.artifacts)&&index.total_count===index.artifacts.length,'ARTIFACT_INDEX');
    const values=index.artifacts.filter(a=>a.name===name);
    if(!values.length)return null;
    requireEvidence(values.length===1,'ARTIFACT_CARDINALITY');const artifact=values[0];
    requireEvidence(artifact.expired===false&&artifact.workflow_run?.id===run.id&&artifact.workflow_run.head_sha===run.head_sha&&Date.parse(artifact.expires_at)>Date.parse(observedAt),'ARTIFACT_BINDING');
    const bytes=await readBytes({repository:REPOSITORY,artifact,sourceSha:run.head_sha,runAttempt:run.run_attempt,token});
    const parsed=archiveReader(bytes,artifact.digest,readerOptions);
    const fresh=await get(`actions/runs/${run.id}`);
    requireEvidence(fresh.status===run.status&&fresh.conclusion===run.conclusion&&fresh.run_attempt===run.run_attempt&&fresh.head_sha===run.head_sha&&fresh.path===run.path,'RUN_CHANGED');
    out.protected_evidence.push({workflow_path:run.path,run_id:run.id,run_attempt:run.run_attempt,
      source_sha:run.head_sha,artifact_id:artifact.id,artifact_digest:artifact.digest});return parsed;
  };
  let gateCandidates,nativeSentinelRuns=[];
  const gatePackets=new Map(),healthArchiveDigests=new Map();
  const chainTerminal=async health=>{
    gateCandidates??=await runs(gateSpec);
    for(const run of gateCandidates.slice(0,contract.maximum_observation_history)){
      if(run.status!=='completed'||run.conclusion!=='success')continue;
      if(!gatePackets.has(run.id)){
        const index=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
        requireEvidence(Array.isArray(index.artifacts)&&index.total_count===index.artifacts.length,'GATE_ARTIFACT_INDEX');
        const artifacts=index.artifacts.filter(a=>a.name.startsWith(`kpmo-continuous-assurance-success-authority-gate-${sourceSha}-`));
        requireEvidence(artifacts.length<=1,'GATE_ARTIFACT_CARDINALITY');
        if(!artifacts.length){gatePackets.set(run.id,null);continue;}
        // Resolve the causal parent from the authenticated Assurance archive
        // before admitting the Gate's one narrowly allowed nested health ZIP.
        const prefix=`kpmo-continuous-assurance-success-authority-gate-${sourceSha}-`;
        const binding=artifacts[0].name.slice(prefix.length).match(/^([1-9][0-9]*)-1$/);
        requireEvidence(binding&&Number.isSafeInteger(Number(binding[1])),'GATE_ASSURANCE_NAME_BINDING');
        const assurance=await get(`actions/runs/${binding[1]}`);
        const auditPacket=await packet(assurance,`kidults-continuous-assurance-${sourceSha}-${assurance.id}-${assurance.run_attempt}`);
        requireEvidence(auditPacket,'CHAIN_ASSURANCE_ARTIFACT');
        const audit=member(auditPacket,'audit-receipt.json');
        const context={gateJobs:await get(`actions/runs/${run.id}/attempts/1/jobs?per_page=100`)};
        let sentinelRunId=Number(audit.execution?.upstream?.run_id);
        if(assurance.event==='repository_dispatch'){
          // Select at the sealed producer snapshot boundary, retaining newer pending/red
          // observations inside that boundary rather than falling back to old green.
          context.proof=member(auditPacket,'whole-platform-operating-proof-v1.json');
          const cutoff=assuranceClockObservationBoundary({proof:context.proof,assuranceRun:assurance,sourceSha});
          context.sentinelRuns=nativeSentinelRuns.filter(r=>Date.parse(r.created_at)<=Date.parse(cutoff));
          const latest=selectLatestNaturalSentinelRun(context.sentinelRuns,{sourceSha,repository:REPOSITORY,observedAt:cutoff});
          requireEvidence(latest.state==='VERIFIED_PASS','CHAIN_CLOCK_LATEST_SENTINEL');
          context.assuranceJobs=await get(`actions/runs/${assurance.id}/attempts/1/jobs?per_page=100`);
          const route=assuranceSentinelObservationRoute({audit,sourceSha,assuranceRun:assurance,jobs:context.assuranceJobs,proof:context.proof,sentinelRun:latest.latest});
          requireEvidence(route.mode==='EXTERNAL_CLOCK_PROOF_BOUND','CHAIN_CLOCK_ROUTE');
          sentinelRunId=route.sentinelRunId;
        }
        if(sentinelRunId!==health.observer_run_id)continue;
        const bindings=out.protected_evidence.filter(row=>row.workflow_path===sentinel.path&&row.run_id===health.observer_run_id);
        requireEvidence(bindings.length===1,'CHAIN_SENTINEL_ARTIFACT_CARDINALITY');
        context.sentinelArtifact={id:bindings[0].artifact_id,digest:bindings[0].artifact_digest};
        const healthDigest=healthArchiveDigests.get(health.observer_run_id);
        requireEvidence(/^sha256:[0-9a-f]{64}$/.test(healthDigest||''),'CHAIN_HEALTH_ARCHIVE_DIGEST');
        const p=await packet(run,artifacts[0].name,{authorityGateHealthDigest:healthDigest,authorityGateAssuranceDigest:auditPacket.archive_digest});
        gatePackets.set(run.id,{receipt:member(p,'kpmo-continuous-assurance-success-authority-gate-v1.json'),assurance,audit,context});
      }
      const selected=gatePackets.get(run.id);
      if(!selected||selected.receipt.producer_health_run_id!==health.observer_run_id)continue;
      const {receipt,assurance,audit,context}=selected;
      verifyNaturalChainTerminal(receipt,run,assurance,audit,health,sourceSha,context);
      return {sentinel_run_id:health.observer_run_id,assurance_run_id:assurance.id,gate_run_id:run.id,
        sentinel_receipt_digest:health.receipt_digest,gate_receipt_digest:receipt.receipt_digest};
    }
    return null;
  };
  const age=run=>requireEvidence(Date.parse(observedAt)>=Date.parse(run.created_at)&&Date.parse(observedAt)-Date.parse(run.created_at)<=contract.maximum_evidence_age_seconds*1000,'EVIDENCE_STALE');
  let verifiedHealths=[];
  await attempt(['CORE_FOUR_CONTENT','DISTINCT_NATURAL_GENERATIONS'],async()=>{
    requireEvidence(Number.isSafeInteger(contract.maximum_observation_history)&&contract.maximum_observation_history>=2&&contract.maximum_observation_history<=24,'OBSERVATION_HISTORY_BOUND');
    const candidates=await runs(sentinel),selected=[],healths=[];
    nativeSentinelRuns=candidates;
    let archivesRead=0;
    if(!candidates.length)return;
    for(const run of candidates){
      if(run.status!=='completed'||run.conclusion!=='success'){
        if(!healths.length)mark('CORE_FOUR_CONTENT','VERIFIED_HOLD','LATEST_SENTINEL_NOT_SUCCESS');
        break; // A red/nonterminal observation interrupts consecutiveness.
      }
      if(healths.length&&Date.parse(observedAt)-Date.parse(run.created_at)>contract.maximum_evidence_age_seconds*1000)break;
      if(archivesRead>=contract.maximum_observation_history)break;
      age(run);
      if(!healths.length)requireEvidence(Date.parse(observedAt)-Date.parse(run.created_at)<=contract.maximum_observer_age_seconds*1000,'LATEST_OBSERVER_STALE');
      const p=await packet(run,`kpmo-continuous-assurance-sentinel-health-v1-${sourceSha}-${run.id}-${run.run_attempt}`);
      if(!p)return;
      const h=verifyHealthReceipt(member(p,'kpmo-continuous-assurance-sentinel-health-v1.json'),run,sourceSha);
      healthArchiveDigests.set(run.id,p.archive_digest);
      archivesRead++;
      if(healths.length&&!distinctNaturalGenerations([healths[0],h]))continue;
      for(const producer of h.producers){
        const native=await get(`actions/runs/${producer.selected_run_id}`),s=SPECS.find(s=>s.id===producer.id);
        requireEvidence(native.path===s.path&&native.repository?.full_name===REPOSITORY&&native.head_sha===sourceSha&&native.head_branch==='main'&&native.run_attempt===producer.selected_run_attempt&&native.status==='completed'&&native.conclusion==='success'
          &&native.event===producer.selected_event&&native.created_at===producer.selected_created_at,'PRODUCER_NATIVE_BINDING');
        const artifact=await get(`actions/artifacts/${producer.artifact_id}`);
        requireEvidence(artifact.digest===producer.artifact_digest&&artifact.workflow_run?.id===native.id&&artifact.workflow_run.head_sha===sourceSha&&artifact.expired===false,'PRODUCER_ARTIFACT_BINDING');
      }
      healths.push(h);
      selected.push(run);
      mark('CORE_FOUR_CONTENT','VERIFIED_PASS','PROTECTED_SEMANTIC_RECEIPTS_RECONCILED',selected.map(r=>r.id));
      mark('DISTINCT_NATURAL_GENERATIONS','VERIFIED_HOLD','TWO_DISTINCT_COMPLETE_PRODUCER_TUPLES_REQUIRED',selected.map(r=>r.id));
      if(healths.length===2)break;
    }
    verifiedHealths=healths;
    if(healths.length)mark('DISTINCT_NATURAL_GENERATIONS',distinctNaturalGenerations(healths)?'VERIFIED_PASS':'VERIFIED_HOLD','TWO_DISTINCT_COMPLETE_PRODUCER_TUPLES_REQUIRED',selected.map(r=>r.id));
  });
  await attempt(['NATURAL_CHAIN_TERMINALS'],async()=>{
    if(!verifiedHealths.length)return;
    const terminals=[];
    for(const health of verifiedHealths){const terminal=await chainTerminal(health);if(terminal)terminals.push(terminal);}
    out.natural_chain_terminals=terminals;
    mark('NATURAL_CHAIN_TERMINALS',terminals.length===2?'VERIFIED_PASS':'VERIFIED_HOLD',
      'TWO_EXACT_SENTINEL_ASSURANCE_GATE_CHAINS_REQUIRED',terminals);
  });
  await attempt(['PROTECTED_LANDING'],async()=>{
    const prs=await get(`commits/${sourceSha}/pulls?per_page=100`);
    requireEvidence(Array.isArray(prs)&&prs.length<100,'MERGED_PR_INDEX');
    const exact=prs.filter(p=>p.merged_at&&p.merge_commit_sha===sourceSha&&p.base.ref==='main'&&p.head.repo?.full_name===REPOSITORY);
    if(exact.length!==1)return;
    const p=exact[0];requireEvidence(commit.parents.length===2&&commit.parents[0].sha===p.base.sha&&commit.parents[1].sha===p.head.sha,'LANDING_PARENTS');
    mark('PROTECTED_LANDING','VERIFIED_PASS','EXACT_MERGE_GRAPH_RECONCILED',[p.number,sourceSha]);
  });
  await attempt(['AWS_CONFIGURATION_AND_IMMUTABILITY'],async()=>{
    const run=(await runs(canary))[0];if(!run||run.status!=='completed'||run.conclusion!=='success')return;age(run);
    const p=await packet(run,`kidults-object-lock-assurance-${sourceSha}-${run.id}`);if(!p)return;
    const r=member(p,'terminal-receipt.json');
    requireEvidence(r.id==='kidults-autonomous-object-lock-canary-terminal-receipt-v1'&&r.state==='VERIFIED_PASS'&&r.exact_sha===sourceSha&&String(r.run_id)===String(run.id),'CANARY_BINDING');
    requireEvidence(r.continuous_assurance?.environment_binding==='PASS'&&r.continuous_assurance.finalizer_iam_oidc_readback==='PASS'&&r.continuous_assurance.cloudformation_drift==='IN_SYNC'&&r.positive_canary==='PASS'&&r.negative_canary==='PASS'&&r.object_lock_mode==='COMPLIANCE','CANARY_CONTENT');
    requireEvidence(['production','public','g5'].every(k=>r[k]==='HOLD'),'CANARY_HOLD');
    mark('AWS_CONFIGURATION_AND_IMMUTABILITY','VERIFIED_PASS','CANARY_IS_CONFIGURATION_PROOF_ONLY',[run.id]);
  });
  await attempt(['NATIVE_DISPATCH','NATIVE_RESUME_REUSE'],async()=>{
    const base=commit.parents?.[0]?.sha;if(!base)return;
    for(const run of (await runs(dispatcher,base)).slice(0,contract.maximum_observation_history)){
      if(run.status!=='completed'||run.conclusion!=='success')continue;
      const p=await packet(run,`kidults-autonomous-dispatcher-${run.id}`);if(!p)continue;
      for(const m of p.members.filter(m=>/^pr-\d+-protected-resume.json$/.test(path.posix.basename(m.name)))){
        const first=JSON.parse(m.text),binding=first.receipt?.receipt?.binding;
        if(binding?.base_sha!==base||binding?.head_sha!==commit.parents[1]?.sha||binding?.head_tree_sha!==commit.tree.sha)continue;
        requireEvidence(first.ok===true&&['EXECUTED_VERIFIED','REUSED_SUCCESS'].includes(first.state)&&first.receipt.receipt.state==='DISPATCH_ACCEPTED','DISPATCH_STATE');
        mark('NATIVE_DISPATCH','VERIFIED_PASS','ORIGINAL_TRANSPORT_CONSUMED',[run.id,first.key]);
        const reuse=p.members.find(x=>x.name===m.name.replace('-protected-resume.json','-protected-reuse.json'));
        if(!reuse)continue;
        const proof=verifyNativeResumeReuse(first,JSON.parse(reuse.text));
        mark('NATIVE_RESUME_REUSE','VERIFIED_PASS','SAME_OPERATION_DURABLE_RECEIPT_REUSED',[run.id,proof.operation_key]);
      }
      if(check('NATIVE_RESUME_REUSE').state==='VERIFIED_PASS')break;
    }
  });
  await attempt(['FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL'],async()=>{
    // Incident-specific read-only binding: only the preserved native PR #2655
    // winner and its exact archive can establish this terminal-null finding.
    const run=await get('actions/runs/38132692877');
    // Generic collector fixtures and non-incident adapters explicitly return
    // null when this historical incident is outside their evidence universe.
    // A live GitHub 404 or transport error still throws and fails closed.
    if(!run)return;
    requireEvidence(run.id===38132692877&&run.run_attempt===1&&run.event==='repository_dispatch'
      &&run.head_branch==='main'&&run.repository?.full_name===REPOSITORY&&run.status==='completed'
      &&run.conclusion==='failure'&&finalizers.some(s=>s.path===run.path),'ORIGINAL_TERMINAL_NULL_RUN_IDENTITY');
    const p=await packet(run,`kidults-autonomous-internal-landing-finalizer-${run.id}-1`);if(!p)return;
    const artifact=out.protected_evidence.find(x=>String(x.run_id)===String(run.id));
    requireEvidence(artifact?.artifact_id===11700046124
      &&artifact.artifact_digest==='sha256:b29d657aabd33895864a838dd84b836579a3febd9a4bd1299437580578f07ab4'
      &&p.archive_digest===artifact.artifact_digest,'ORIGINAL_TERMINAL_NULL_ARTIFACT_BINDING');
    const members=p.members.filter(x=>path.posix.basename(x.name)==='receipt.json'&&x.encoding==='utf-8');
    requireEvidence(members.length===1,'ORIGINAL_TERMINAL_NULL_RECEIPT_CARDINALITY');
    const receipt=JSON.parse(members[0].text),original=receipt.original_reservation;
    requireEvidence(receipt.id==='kidults-autonomous-internal-landing-terminal-receipt-v1'
      &&receipt.state==='QUARANTINED'&&receipt.merge_performed===true&&receipt.terminal_evidence===null
      &&receipt.retry_without_reconciliation===false&&original?.pull_request===2655
      &&String(original.original_run_id)===String(run.id)&&original.original_run_attempt===1
      &&['production','public','g5'].every(k=>receipt[k]==='HOLD'),'ORIGINAL_TERMINAL_NULL_RECEIPT');
    mark('FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL','VERIFIED_FAIL',
      'ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE',[run.id,artifact.artifact_id,artifact.artifact_digest]);
    // Preserve the independently authenticated original finding even when a
    // later recovery lookup fails. It does not satisfy the terminal check or
    // suppress that lookup failure in the strict Assurance classifier.
    out.original_terminal_null_observation={state:'VERIFIED_FAIL',
      reason:'ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE',
      evidence_refs:[run.id,artifact.artifact_id,artifact.artifact_digest],
      actual_authority_granted:false,retry_without_reconciliation:false};
    const recoverySpec=finalizers.find(s=>s.id==='FINALIZER_track');
    // A recovered debt survives later main commits and observation windows.
    // Search the native archive history, never mint a replacement generation.
    let recoveryIndex;
    if(listRuns)recoveryIndex={workflow_runs:await listRuns(REPOSITORY,recoverySpec,null,token),complete:true};
    else recoveryIndex=await listOriginalRecoveryHistory({originalRun:run,observedAt,get,workflow:recoverySpec.workflow});
    const recoveryHistory=recoveryIndex.workflow_runs;
    requireEvidence(new Set(recoveryHistory.map(r=>r.id)).size===recoveryHistory.length,'RECOVERY_HISTORY_DUPLICATE');
    for(const recovery of recoveryHistory){
      if(recovery.run_attempt!==1||!recoverySpec.events.includes(recovery.event))continue;
      requireEvidence(recovery.path===recoverySpec.path&&recovery.head_branch==='main'
        &&recovery.repository?.full_name===REPOSITORY&&recovery.run_attempt===1
        &&recoverySpec.events.includes(recovery.event),'RECOVERY_HISTORY_IDENTITY');
      if(recovery.status!=='completed'||recovery.conclusion!=='success')continue;
      const recoveryPacket=await packet(recovery,`kidults-postmerge-terminal-recovery-finalizer-${recovery.id}-1`);
      if(!recoveryPacket)continue;
      const jobs=await get(`actions/runs/${recovery.id}/attempts/1/jobs?per_page=100`);
      requireEvidence(Array.isArray(jobs.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.total_count<=100
        &&new Set(jobs.jobs.map(j=>j.id)).size===jobs.jobs.length,'RECOVERY_NATIVE_JOBS');
      const actual=jobs.jobs.filter(j=>j.name==='Bounded original reservation terminal recovery FINALIZER');
      requireEvidence(actual.length===1&&actual[0].run_id===recovery.id
        &&(actual[0].run_attempt===undefined||actual[0].run_attempt===1)
        &&actual[0].status==='completed'&&actual[0].conclusion==='success'
        &&actual[0].steps?.filter(s=>s.name==='Run bounded signed terminal recovery workload'
          &&s.status==='completed'&&s.conclusion==='success').length===1,'RECOVERY_ACTUAL_FINALIZER');
      const result=member(recoveryPacket,'interrupted-FINALIZER.json');
      requireEvidence(result.source_sha===recovery.head_sha&&result.role_run_id===String(recovery.id)
        &&Array.isArray(result.results),'RECOVERY_RESULT_BINDING');
      const repaired=result.results.filter(r=>r.state==='ORIGINAL_RESERVATION_TERMINATED_RECOVERY_ONLY'
        &&r.request?.original_run_id===String(run.id));
      if(repaired.length){
        requireEvidence(repaired.length===1,'ORIGINAL_REPAIR_RESULT_CARDINALITY');
        const verifiedRepair=verifyOriginalTerminalRepairReconciliation(repaired[0],
          {sourceSha:recovery.head_sha,runId:recovery.id,original,observedAt});
        out.original_terminal_reconciliation={...verifiedRepair,recovery_run_id:recovery.id,
          supersedes:[run.id,artifact.artifact_id,artifact.artifact_digest],normal_landing_terminal_proven:false};
        mark('FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL','VERIFIED_PASS',
          'ORIGINAL_RESERVATION_TERMINATED_RECOVERY_ONLY_NOT_NORMAL_LANDING_TERMINAL',
          [recovery.id,verifiedRepair.terminal_digest,verifiedRepair.immutable.version_id]);
        break;
      }
      const recovered=result.results.filter(r=>r.state==='RECOVERED_FAILURE_ASSURANCE_TERMINAL_ONLY'
        &&r.request?.original_run_id===String(run.id));
      if(!recovered.length)continue;
      requireEvidence(recovered.length===1,'RECOVERY_RESULT_CARDINALITY');
      const verified=verifyFailureTerminalReconciliation(recovered[0],{sourceSha:recovery.head_sha,runId:recovery.id,original,observedAt});
      await observeInterruptedRecoveryNative({request:recovered[0].request,get,now:Date.parse(observedAt),currentSourceSha:sourceSha});
      out.original_terminal_reconciliation={...verified,recovery_run_id:recovery.id,
        supersedes:[run.id,artifact.artifact_id,artifact.artifact_digest],normal_landing_terminal_proven:false};
      mark('FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL','VERIFIED_PASS',
        'ORIGINAL_FAILURE_TERMINAL_RECONCILED_NOT_OPERATING_AUTHORITY',
        [recovery.id,verified.terminal_digest,verified.immutable.version_id]);
      break;
    }
    if(!out.original_terminal_reconciliation&&!recoveryIndex.complete){
      mark('FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL','VERIFIED_HOLD',
        'RECOVERY_HISTORY_PREFIX_CANNOT_PROVE_TERMINAL_ABSENCE',[run.id,recoveryIndex.total_count]);
    }

  });
  // Failure debt reconciliation never substitutes for a normal eligible
  // landing. Independently consume that landing's native exact-main terminal.
  await attempt(['FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL'],async()=>{
    if(!out.original_terminal_reconciliation)return;
    const base=commit.parents?.[0]?.sha;if(!base)return;
    for(const s of finalizers){
      for(const run of (await runs(s,base)).slice(0,contract.maximum_observation_history)){
        if(run.status!=='completed'||run.conclusion!=='success'||run.event!=='repository_dispatch')continue;
        const p=await packet(run,`kidults-autonomous-internal-landing-finalizer-${run.id}-1`);if(!p)continue;
        const jobs=await get(`actions/runs/${run.id}/attempts/1/jobs?per_page=100`);
        requireEvidence(Array.isArray(jobs.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.total_count<=100
          &&new Set(jobs.jobs.map(j=>j.id)).size===jobs.jobs.length,'NORMAL_TERMINAL_JOBS');
        const actual=jobs.jobs.filter(j=>j.name==='Finalize exact internal landing only after durable quorum');
        requireEvidence(actual.length===1&&actual[0].run_id===run.id
          &&(actual[0].run_attempt===undefined||actual[0].run_attempt===1)
          &&actual[0].status==='completed'&&actual[0].conclusion==='success'
          &&actual[0].steps?.filter(s=>s.name==='Finalize only after durable Track KPMO Verifier quorum'
            &&s.status==='completed'&&s.conclusion==='success').length===1,'NORMAL_ACTUAL_FINALIZER');
        const terminal=verifyMissionTerminal(member(p,'receipt.json'),sourceSha,commit);
        requireEvidence(terminal.binding?.repository===REPOSITORY
          &&/^[A-Za-z0-9_.:-]{12,160}$/.test(terminal.binding.authorization_generation||'')
          &&/^sha256:[a-f0-9]{64}$/.test(terminal.binding.nonce_digest||'')
          &&terminal.durable_reservation?.remote_binding?.contract_version==='3.0.0'
          &&terminal.durable_reservation.remote_binding.action==='CONSUME_RESERVATION'
          &&terminal.durable_reservation.remote_binding.state==='CONSUMED'
          &&terminal.durable_reservation.remote_binding.conditional_write===true
          &&terminal.durable_reservation.remote_binding.authorization_generation===terminal.binding.authorization_generation
          &&terminal.durable_reservation.remote_binding.nonce_digest===terminal.binding.nonce_digest
          &&terminal.durable_reservation.ledger_key?.pk===`RESERVE#${terminal.binding.authorization_generation}`
          &&terminal.durable_reservation.ledger_key?.sk===`NONCE#${terminal.binding.nonce_digest}`
          &&String(terminal.durable_reservation.remote_binding.run_id)===String(run.id)
          &&terminal.durable_reservation.remote_binding.head_sha===terminal.binding.head_sha
          &&terminal.durable_reservation.remote_binding.merge_sha===sourceSha,'NORMAL_TERMINAL_OWNER');
        out.normal_landing_terminal={run_id:run.id,receipt_digest:terminal.receipt_digest,source_sha:sourceSha};
        out.original_terminal_reconciliation.normal_landing_terminal_proven=true;
        return;
      }
    }
  });
  await attempt(['WHOLE_VALUE_CHAIN_RUNTIME'],async()=>{
    const sources=contract.runtime_domain_sources||[],ids=new Set();
    const requiredDomainCount=Number(contract.runtime_domain_registry_required_count);
    requireEvidence(Number.isSafeInteger(requiredDomainCount)&&requiredDomainCount===14,'DOMAIN_REGISTRY_REQUIRED_COUNT');
    requireEvidence(Array.isArray(sources)&&sources.length<=requiredDomainCount,'DOMAIN_REGISTRY');
    const registeredIds=sources.map(x=>x.domain_id),mandatoryIds=contract.autonomous_operating_readiness?.mandatory_runtime_domains||[];
    const exactWholeRegistry=sources.length===requiredDomainCount&&new Set(registeredIds).size===requiredDomainCount
      &&contract.value_chain_dimensions.every(id=>registeredIds.includes(id));
    const scopedRegistry=mandatoryIds.length===1&&mandatoryIds.includes('SECURITY_SUPPLY_CHAIN')
      &&mandatoryIds.every(id=>registeredIds.includes(id));
    const registryState=exactWholeRegistry?'VERIFIED_PASS':scopedRegistry?'FUTURE_EXPANSION':'HOLD';
    out.runtime_domain_registry={state:registryState,required_domain_count:requiredDomainCount,registered_domain_count:sources.length,
      reason:registryState==='VERIFIED_PASS'?'EXACT_REGISTERED_RUNTIME_DOMAIN_SET':registryState==='FUTURE_EXPANSION'
        ?'SCOPED_AUTONOMY_REGISTRY_COMPLETE_FUTURE_EXPANSION':'AUTHENTICATED_EXACT_MAIN_RUNTIME_RECEIPT_REQUIRED'};
    for(const source of sources){
      requireEvidence(contract.value_chain_dimensions.includes(source.domain_id)&&!ids.has(source.domain_id),'DOMAIN_REGISTRY_COVERAGE');ids.add(source.domain_id);
      requireEvidence(/^kidults-[a-z0-9-]+\.yml$/.test(source.workflow||'')&&/^kidults-[a-z0-9-]+$/.test(source.artifact_prefix||''),'DOMAIN_PRODUCER_REGISTRATION');
      const s=spec(source.domain_id,source.workflow,['push','schedule','workflow_run','repository_dispatch']);
      const run=(await runs(s))[0];if(!run||run.status!=='completed'||run.conclusion!=='success')continue;age(run);
      const p=await packet(run,`${source.artifact_prefix}-${sourceSha}-${run.id}-${run.run_attempt}`);if(!p)continue;
      const r=verifyValueChainDomainReceipt(member(p,'runtime-domain-receipt.json'),source.domain_id,run,sourceSha);
      const domain=out.value_chain.find(d=>d.id===source.domain_id);
      Object.assign(domain,{runtime_state:'VERIFIED_PASS',reason:'REGISTERED_PROTECTED_LIVE_RUNTIME_PRODUCER_RECEIPT',runtime_receipt_digest:r.receipt_digest,run_id:run.id});
    }
    const complete=out.value_chain.every(d=>d.runtime_state==='VERIFIED_PASS');
    mark('WHOLE_VALUE_CHAIN_RUNTIME',complete?'VERIFIED_PASS':'VERIFIED_HOLD',complete?'ALL_REGISTERED_DOMAIN_RUNTIME_RECEIPTS_VERIFIED':'ADMITTED_IMMUTABLE_PAIR_TRACK_B_WORKLOAD_AND_HUMAN_ACCEPTANCE_RECEIPTS_REQUIRED');
  });
  if((await get('branches/main')).commit?.sha!==sourceSha)throw new Error('WHOLE_RUNTIME_MAIN_CHANGED');
  const verifiedDomains=out.value_chain.filter(d=>d.runtime_state==='VERIFIED_PASS'&&/^sha256:[a-f0-9]{64}$/.test(d.runtime_receipt_digest||''));
  const assuranceRuntimeReady=out.runtime_domain_registry?.state==='VERIFIED_PASS'&&out.runtime_domain_registry.registered_domain_count===14&&out.value_chain.length===14&&verifiedDomains.length===14&&new Set(verifiedDomains.map(d=>d.id)).size===14;
  out.assurance_runtime_readiness={state:assuranceRuntimeReady?'VERIFIED_PASS':'VERIFIED_HOLD',verified_domain_count:verifiedDomains.length,required_domain_count:14,registered_domain_count:out.runtime_domain_registry?.registered_domain_count??0,domain_ids:verifiedDomains.map(d=>d.id).sort()};
  out.assurance_runtime_readiness_proven=assuranceRuntimeReady;
  const autonomyPolicy=contract.autonomous_operating_readiness;
  const connected=(contract.runtime_domain_sources||[]).map(x=>x.domain_id);
  const autonomyRequired=autonomyPolicy?.mandatory_runtime_domains||[];
  const expectedFutureExpansion=contract.value_chain_dimensions.filter(id=>!autonomyRequired.includes(id)).sort();
  const autonomyReady=autonomyPolicy?.scope==='AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM'
    &&autonomyPolicy.connected_registered_domains_required===true
    &&Array.isArray(autonomyPolicy.mandatory_runtime_domains)
    &&autonomyPolicy.mandatory_runtime_domains.includes('SECURITY_SUPPLY_CHAIN')
    &&autonomyRequired.length===1&&autonomyRequired.includes('SECURITY_SUPPLY_CHAIN')
    &&autonomyRequired.every(id=>connected.includes(id))
    &&Array.isArray(autonomyPolicy.future_expansion_domains)
    &&JSON.stringify([...autonomyPolicy.future_expansion_domains].sort())===JSON.stringify(expectedFutureExpansion)
    &&connected.length>0&&new Set(connected).size===connected.length
    &&autonomyRequired.every(id=>verifiedDomains.some(d=>d.id===id));
  out.autonomous_runtime_readiness={state:autonomyReady?'VERIFIED_PASS':'VERIFIED_HOLD',
    scope:'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM',required_domain_count:autonomyRequired.length,
    verified_domain_count:verifiedDomains.filter(d=>autonomyRequired.includes(d.id)).length,
    domain_ids:verifiedDomains.filter(d=>autonomyRequired.includes(d.id)).map(d=>d.id).sort(),
    future_expansion_domain_ids:[...autonomyPolicy.future_expansion_domains].sort()};
  if(!assuranceRuntimeReady&&autonomyReady)out.assurance_runtime_readiness.state='FUTURE_EXPANSION';
  out.autonomous_runtime_readiness_proven=autonomyReady;
  const normalTerminalProven=out.original_terminal_reconciliation?.normal_landing_terminal_proven!==false;
  const completion=buildAutonomousOperatingCompletion({policy:autonomyPolicy,runtimeReadiness:out.autonomous_runtime_readiness,
    operatingChecks:out.operating_checks,normalTerminalProven});
  out.autonomous_operating_proven=completion.proven;
  out.autonomous_operating_completion=completion.completion;
  out.runtime_evidence_demand=buildRuntimeEvidenceDemand({definition:demandDefinition,contract,proof:out});
  out.whole_platform_runtime_proven=normalTerminalProven&&out.operating_checks.every(c=>c.state==='VERIFIED_PASS')&&out.value_chain.every(c=>c.runtime_state==='VERIFIED_PASS');
  out.state=out.operating_checks.some(c=>c.state==='VERIFIED_FAIL')?'VERIFIED_FAIL':out.whole_platform_runtime_proven?'VERIFIED_PASS':'VERIFIED_INCOMPLETE';
  out.receipt_digest=sha256(canonicalJson(out));return out;
}
async function main(){
  const index=process.argv.indexOf('--output'),output=index>=0?process.argv[index+1]:null;
  if(!output)throw new Error('WHOLE_RUNTIME_OUTPUT_REQUIRED');
  const sourceSha=process.env.KPMO_SOURCE_SHA,contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json')),
    scorecard=JSON.parse(fs.readFileSync(contract.value_chain_source));
  try{
    requireEvidence(process.env.GITHUB_REPOSITORY===REPOSITORY&&process.env.GITHUB_REF==='refs/heads/main'&&execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()===sourceSha,'EXECUTION_SOURCE');
    const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;requireEvidence(!!token,'TOKEN');
    const result=await collectWholePlatform({sourceSha,contract,scorecard,token});
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({state:result.state,autonomous_operating_completion:result.autonomous_operating_completion,
      whole_platform_runtime_proven:result.whole_platform_runtime_proven}));
    if(result.state==='VERIFIED_FAIL')process.exitCode=1;
  }catch(error){
    const failureBody={id:contract.id,source_sha:sourceSha,repository:REPOSITORY,state:'VERIFIED_FAIL',
      failure_class:String(error.message).split(':')[0],whole_platform_runtime_proven:false,retry_authorized:false,
      production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',
      operating_checks:INTERNAL_RECOVERY_CHECKS.map(id=>({id,state:'UNVERIFIED',reason:String(error.message).split(':')[0],evidence_refs:[]}))};
    const failure={...failureBody,receipt_digest:sha256(canonicalJson(failureBody))};
    fs.mkdirSync(path.dirname(output),{recursive:true});if(!fs.existsSync(output))fs.writeFileSync(output,JSON.stringify(failure)+'\n',{flag:'wx',mode:0o600});
    console.error(failure.failure_class);process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
