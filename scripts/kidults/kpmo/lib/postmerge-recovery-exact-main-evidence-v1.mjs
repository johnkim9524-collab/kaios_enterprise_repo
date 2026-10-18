// Read-only authenticated evidence collection. Reuse native content validators;
// neither PASS strings nor caller-supplied verification booleans are authority.
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from './autonomous-internal-landing-v1.mjs';
import {POSTMERGE_RECOVERY_INCIDENT as I,buildPostmergeRecoveryTerminal,validatePostmergeRecoveryRequest,validateRecoveryEvidenceSnapshot} from './autonomous-postmerge-recovery-v1.mjs';
import {evaluatePostMergePushSuite,validatePolicy} from '../consume-direct-owner-postmerge-push-suite-v1.mjs';
import {SPECS} from '../resolve-continuous-assurance-sentinel-health-v1.mjs';
import {checkTransport,readArchive,validateProducerContent,validateCoverageAliasClosure} from '../validate-sentinel-producer-content-v1.mjs';
import {validateSentinelObservation} from '../validate-sentinel-observation-v1.mjs';
import {validateInterruptedRecoveryRequest,observeInterruptedRecoveryNative} from './interrupted-reservation-recovery-v1.mjs';
import {verifyAssuranceReadiness} from './assurance-full-proof-v1.mjs';
import {selectLatestNaturalSentinelRun} from '../select-latest-natural-sentinel-run-v1.mjs';
import {verifyFailureAssuranceParent} from './interrupted-recovery-native-trigger-v1.mjs';
import {validateTerminalNullAssurancePacket} from './terminal-null-assurance-packet-v1.mjs';

const assert=(ok,code)=>{if(!ok)throw new Error(code);};
const HOLD={production:'HOLD',public:'HOLD',g5:'HOLD'};
const SENTINEL='kpmo-continuous-assurance-sentinel-health-v1.yml';
const GATE='kpmo-continuous-assurance-success-authority-gate-v1.yml';
const ASSURANCE='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const positive=x=>Number.isSafeInteger(x)&&x>0;
export function validateFailureRecoveryPushSuite(suite){
  assert(suite?.ready&&suite.required?.length===6&&suite.invalid?.length===0
    &&suite.required.every(r=>r.conclusion==='success'||r.path===ASSURANCE&&r.conclusion==='failure')
    &&suite.failure_count===suite.required.filter(r=>r.conclusion==='failure').length
    &&suite.failure_count<=1,'RECOVERY_EVIDENCE_PUSH_SUITE');
}
export function validateFailureRecoverySentinelBinding({audit,parent,run,sentinel,health}){
  assert(['workflow_run','repository_dispatch','workflow_dispatch'].includes(run.event)&&audit.execution?.trigger===run.event
    &&String(parent.upstream_run_id)===String(sentinel.id)&&parent.upstream_receipt_digest===health.receipt_digest,
    'RECOVERY_FAILURE_SENTINEL_BINDING');
  if(run.event==='repository_dispatch'){
    // verifyFailureAssuranceParent has already authenticated the clock intake,
    // snapshot, selected Sentinel and ZIP. Preserve the original null upstream.
    assert(audit.execution.upstream===null,'RECOVERY_FAILURE_CLOCK_PROVENANCE');
  }else if(run.event==='workflow_dispatch'){
    const continuation=parent.coverage_continuation,upstream=audit.execution.upstream;
    assert(continuation?.state==='VERIFIED_PASS'&&continuation.coverage_event==='workflow_run'
      &&String(continuation.sentinel_run_id)===String(sentinel.id)
      &&continuation.sentinel_receipt_digest===health.receipt_digest
      &&String(upstream?.run_id)===String(continuation.coverage_run_id)
      &&String(upstream?.run_attempt)==='1'&&upstream?.workflow_event==='workflow_run'
      &&upstream?.workflow_path==='.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml'
      &&upstream?.conclusion==='success'&&upstream?.repository===I.repository&&upstream?.head_branch==='main',
    'RECOVERY_FAILURE_COVERAGE_CONTINUATION');
  }else{
    const upstream=audit.execution.upstream;
    assert(String(upstream?.run_id)===String(sentinel.id)&&upstream?.workflow_name===sentinel.name
      &&upstream?.workflow_path===sentinel.path&&upstream?.workflow_event===sentinel.event
      &&upstream?.conclusion===sentinel.conclusion&&upstream?.repository===I.repository
      &&upstream?.head_branch==='main'&&upstream.run_attempt==='1'
      &&upstream.source_receipt_digest===health.receipt_digest,'RECOVERY_FAILURE_CAUSAL_SENTINEL');
  }
}
const transport=(route,binary=false)=>{
  try{
    const result=execFileSync('gh',['api','-H','Accept: application/vnd.github+json',`/repos/${I.repository}/${route}`],
      {encoding:binary?undefined:'utf8',timeout:30000,maxBuffer:binary?8*1024*1024:2*1024*1024,stdio:['ignore','pipe','pipe']});
    return binary?result:JSON.parse(result);
  }catch{throw new Error('RECOVERY_AUTHENTICATED_GITHUB_READ_FAILED');}
};
const member=(packet,basename)=>{
  const matches=packet.members.filter(m=>m.name.split('/').at(-1)===basename&&m.encoding==='utf-8');
  assert(matches.length===1,'RECOVERY_EVIDENCE_MEMBER_CARDINALITY');return JSON.parse(matches[0].text);
};
const sealed=(receipt,id)=>{
  assert(receipt.receipt_id===id&&receipt.state==='VERIFIED_PASS'&&receipt.repository===I.repository,'RECOVERY_EVIDENCE_RECEIPT_STATE');
  const {receipt_digest,...core}=receipt;assert(receipt_digest===sha256(canonicalJson(core)),'RECOVERY_EVIDENCE_RECEIPT_DIGEST');
  assert(Object.entries(HOLD).every(([k,v])=>receipt[k]===v),'RECOVERY_EVIDENCE_HOLD');
};

function createExactMainEvidence({policy,readJson=route=>transport(route),readBytes=route=>transport(route,true),now=()=>Date.now()},generic=false){
  validatePolicy(policy);assert(policy.required_workflows.length===6,'RECOVERY_EVIDENCE_REQUIRED_SET');
  const readRun=async id=>{
    assert(positive(Number(id)),'RECOVERY_EVIDENCE_RUN_ID');const run=await readJson(`actions/runs/${id}`);
    assert(run.id===Number(id)&&run.run_attempt===1&&run.repository?.full_name===I.repository
      &&String(run.repository?.id)===I.repository_id,'RECOVERY_EVIDENCE_RUN_BINDING');return run;
  };
  const runList=async(file,sha,event)=>{
    const runs=[];let total;
    for(let page=1;page<=policy.max_pages;page++){
      const x=await readJson(`actions/workflows/${file}/runs?branch=main&head_sha=${sha}${event?`&event=${event}`:''}&per_page=100&page=${page}`);
      assert(Number.isSafeInteger(x.total_count)&&x.total_count>=0&&Array.isArray(x.workflow_runs),'RECOVERY_EVIDENCE_RUN_LIST');
      if(total===undefined)total=x.total_count;
      assert(total===x.total_count&&total<=100*policy.max_pages,'RECOVERY_EVIDENCE_PAGINATION_DRIFT');
      runs.push(...x.workflow_runs);
      if(runs.length>=total){assert(runs.length===total&&new Set(runs.map(r=>r.id)).size===runs.length,'RECOVERY_EVIDENCE_RUN_CARDINALITY');return runs;}
      assert(x.workflow_runs.length===100,'RECOVERY_EVIDENCE_PAGINATION_INCOMPLETE');
    }
    throw new Error('RECOVERY_EVIDENCE_PAGINATION_EXHAUSTED');
  };
  const artifactList=async run=>{
    const x=await readJson(`actions/runs/${run.id}/artifacts?per_page=100`);
    assert(Array.isArray(x.artifacts)&&Number.isSafeInteger(x.total_count)&&x.total_count===x.artifacts.length
      &&x.total_count<=100,'RECOVERY_EVIDENCE_ARTIFACT_PAGINATION');return x.artifacts;
  };
  const archive=async(run,artifact,sha,observedAt,options={})=>{
    checkTransport(run,artifact,sha,observedAt,options);
    const bytes=await readBytes(`actions/artifacts/${artifact.id}/zip`);
    assert(Buffer.isBuffer(bytes)&&bytes.length===artifact.size_in_bytes,'RECOVERY_EVIDENCE_ARCHIVE_SIZE');
    try{return {bytes,packet:readArchive(bytes,artifact.digest,options)};}
    catch(error){throw new Error(`RECOVERY_EVIDENCE_ARCHIVE_REJECTED:${artifact.id}:${String(error.message).split(':')[0]}`);}
  };
  const latestGate=async sha=>{
    const runs=(await runList(GATE,sha)).filter(r=>r.head_sha===sha&&r.head_branch==='main'&&r.event==='workflow_run');
    assert(runs.every(r=>r.path===`.github/workflows/${GATE}`&&r.repository?.full_name===I.repository
      &&String(r.repository?.id)===I.repository_id&&r.run_attempt===1&&positive(r.id)
      &&Number.isFinite(Date.parse(r.created_at))&&Date.parse(r.created_at)<=now()),'RECOVERY_EVIDENCE_GATE_LIST_IDENTITY');
    runs.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id-b.id);
    const run=runs.at(-1);assert(run&&run.status==='completed'&&run.conclusion==='success','RECOVERY_LATEST_GATE_NOT_SUCCESS');return run;
  };
  const liveHealth=async sha=>{
    const selected=selectLatestNaturalSentinelRun(await runList(SENTINEL,sha),
      {sourceSha:sha,repository:I.repository,observedAt:new Date(now()).toISOString()});
    assert(selected.state==='VERIFIED_PASS','RECOVERY_LATEST_SENTINEL_NOT_SUCCESS');return selected.latest;
  };
  const proofNode=(run,digest,extra={})=>({state:'VERIFIED_PASS',source_sha:run.head_sha,run_id:String(run.id),receipt_digest:digest,...HOLD,...extra});
  const currentProducer=async(spec,selected,sha)=>{
    const events=spec.events.filter(e=>e!=='workflow_dispatch');
    const rows=(await Promise.all(events.map(e=>runList(spec.workflow,sha,e)))).flat();
    const native=rows.filter(r=>events.includes(r.event));
    assert(native.every(r=>r.path===spec.path&&r.head_sha===sha&&r.head_branch==='main'
      &&r.repository?.full_name===I.repository&&String(r.repository?.id)===I.repository_id
      &&positive(r.id)&&Number.isFinite(Date.parse(r.created_at))&&Date.parse(r.created_at)<=now()),'RECOVERY_EVIDENCE_PRODUCER_NATIVE_IDENTITY');
    native.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id-b.id);
    const latest=native.at(-1);
    assert(latest&&latest.id===selected.selected_run_id&&latest.run_attempt===1&&latest.status==='completed'
      &&latest.conclusion==='success','RECOVERY_EVIDENCE_NEWER_PRODUCER_INTERRUPTION');
  };

  const collectFailureEvidence=async({request,native,parent,originalArchive,sha,observedAt,pushRuns,suite,pushIdentity})=>{
    assert(parent?.kind==='TERMINAL_NULL_ASSURANCE_FAILURE_V1'&&parent.source_sha===sha
      &&parent.actual_authority_granted===false&&parent.platform_closure===false&&parent.promotion_eligible===false,
      'RECOVERY_FAILURE_PROFILE');
    const branch=await readJson('branches/main');assert(branch.name==='main'&&branch.protected===true&&branch.commit?.sha===sha,'RECOVERY_EVIDENCE_MAIN');
    const commit=await readJson(`commits/${sha}`);assert(commit.sha===sha,'RECOVERY_EVIDENCE_COMMIT');
    validateFailureRecoveryPushSuite(suite);
    assert(pushRuns.every(r=>r.run_attempt===1&&r.repository?.full_name===I.repository&&String(r.repository?.id)===I.repository_id),
      'RECOVERY_EVIDENCE_PUSH_IDENTITY');
    const sentinel=parent.coverage_continuation
      ?await readRun(parent.coverage_continuation.sentinel_run_id):await liveHealth(sha),healthArtifacts=(await artifactList(sentinel))
      .filter(a=>a.name===`kpmo-continuous-assurance-sentinel-health-v1-${sha}-${sentinel.id}-1`);
    assert(healthArtifacts.length===1,'RECOVERY_FAILURE_SENTINEL_ARTIFACT');
    const healthPacket=await archive(sentinel,healthArtifacts[0],sha,observedAt);
    const health=member(healthPacket.packet,'kpmo-continuous-assurance-sentinel-health-v1.json');
    validateSentinelObservation(health,{GITHUB_REPOSITORY:I.repository,GITHUB_SHA:sha,GITHUB_RUN_ID:String(sentinel.id),
      GITHUB_RUN_ATTEMPT:'1',SENTINEL_RESOLVER_OUTCOME:'success'});
    const parentRun=await readRun(parent.run_id);
    const checkedParent=await verifyFailureAssuranceParent({run:parentRun,sourceSha:sha,get:readJson,readBytes});
    assert(canonicalJson(checkedParent.recovery_parent)===canonicalJson(parent),'RECOVERY_FAILURE_PARENT_MOVED');
    const assuranceArtifacts=(await artifactList(parentRun)).filter(a=>a.id===parent.artifact_id
      &&a.name===`kidults-continuous-assurance-${sha}-${parent.run_id}-1`&&a.digest===parent.artifact_digest);
    assert(assuranceArtifacts.length===1,'RECOVERY_FAILURE_ASSURANCE_ARTIFACT');
    const assurancePacket=await archive(parentRun,assuranceArtifacts[0],sha,observedAt,{allowFailedConclusion:true});
    assert(assurancePacket.packet.archive_digest===parent.archive_digest,'RECOVERY_FAILURE_ASSURANCE_ARCHIVE');
    const audit=member(assurancePacket.packet,'audit-receipt.json');
    const operatingProof=member(assurancePacket.packet,'whole-platform-operating-proof-v1.json');
    assert(audit.receipt_digest===parent.audit_receipt_digest&&audit.states?.internal_control_state==='VERIFIED_PASS'
      &&audit.states?.promotion_eligible===false&&audit.execution?.trigger===parentRun.event,
      'RECOVERY_FAILURE_AUDIT_BINDING');
    const {receipt_digest:proofDigest,...proofBody}=operatingProof;
    const failedOperating=operatingProof.operating_checks?.filter(c=>c.state==='VERIFIED_FAIL')||[];
    const terminalCheck=failedOperating[0];
    assert(operatingProof.id==='kidults-whole-platform-operating-proof-v1'&&operatingProof.repository===I.repository
      &&operatingProof.source_sha===sha&&operatingProof.state==='VERIFIED_FAIL'
      &&operatingProof.whole_platform_runtime_proven===false&&proofDigest===sha256(canonicalJson(proofBody))
      &&failedOperating.length===1&&terminalCheck?.id===parent.terminal_check_id
      &&terminalCheck.reason===parent.terminal_check_reason
      &&terminalCheck.reason==='ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE'
      &&canonicalJson(terminalCheck.evidence_refs)===canonicalJson(parent.terminal_check_evidence_refs)
      &&String(terminalCheck.evidence_refs?.[0])===String(request.original_run_id)
      &&terminalCheck.evidence_refs?.[1]===originalArchive?.artifact_id
      &&terminalCheck.evidence_refs?.[2]===originalArchive?.archive_digest,'RECOVERY_FAILURE_TERMINAL_NULL_ONLY');
    const assuranceJobs=await jobsFor(parentRun),failedJobs=assuranceJobs.jobs.filter(j=>j.status==='completed'&&j.conclusion==='failure');
    assert(failedJobs.length===1&&failedJobs[0].name==='audit'&&failedJobs[0].id===parent.audit_job_id,
      'RECOVERY_FAILURE_AUDIT_ONLY');
    const assuranceRuns=(await runList(ASSURANCE,sha)).filter(r=>r.path===ASSURANCE&&r.head_sha===sha&&r.head_branch==='main'
      &&r.repository?.full_name===I.repository&&String(r.repository?.id)===I.repository_id&&r.run_attempt===1);
    assuranceRuns.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id-b.id);
    assert(assuranceRuns.at(-1)?.id===parentRun.id,'RECOVERY_FAILURE_ASSURANCE_NOT_LATEST');
    assert(request.pull_request===2655&&originalArchive?.artifact_id===parent.terminal_check_evidence_refs?.[1]
      &&originalArchive?.archive_digest===parent.terminal_check_evidence_refs?.[2]
      &&String(request.original_run_id)===String(parent.terminal_check_evidence_refs?.[0]),'RECOVERY_FAILURE_ORIGINAL_REFERENCE');
    const originalRun=await readRun(request.original_run_id);
    assert([`.github/workflows/kidults-autonomous-track-authorization-v1.yml`,
      `.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml`,
      `.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml`].includes(originalRun.path),
      'RECOVERY_FAILURE_ORIGINAL_PATH');
    const originalArtifacts=(await artifactList(originalRun)).filter(a=>a.id===originalArchive.artifact_id
      &&a.name===`kidults-autonomous-internal-landing-finalizer-${request.original_run_id}-1`
      &&a.digest===originalArchive.archive_digest);
    assert(originalArtifacts.length===1,'RECOVERY_FAILURE_ORIGINAL_ARTIFACT');
    const originalPacket=await archive(originalRun,originalArtifacts[0],request.base_sha,observedAt,{allowFailedConclusion:true});
    const originalMembers=originalPacket.packet.members.filter(m=>m.encoding==='utf-8'&&m.name.split('/').at(-1)==='receipt.json');
    assert(originalMembers.length===1,'RECOVERY_FAILURE_ORIGINAL_RECEIPT');
    const originalReceipt=JSON.parse(originalMembers[0].text),reservation=originalReceipt.original_reservation;
    assert(originalReceipt.id==='kidults-autonomous-internal-landing-terminal-receipt-v1'
      &&originalReceipt.state==='QUARANTINED'&&originalReceipt.merge_performed===true
      &&originalReceipt.terminal_evidence===null&&originalReceipt.retry_without_reconciliation===false
      &&reservation?.pull_request===2655&&String(reservation.original_run_id)===String(originalRun.id)
      &&reservation.original_run_attempt===1&&reservation.base_sha===request.base_sha
      &&reservation.head_sha===request.head_sha&&reservation.head_tree_sha===request.head_tree_sha
      &&reservation.original_generation===request.original_generation&&reservation.nonce_digest===request.nonce_digest
      &&['production','public','g5'].every(k=>originalReceipt[k]==='HOLD'),'RECOVERY_FAILURE_ORIGINAL_NULL_BINDING');
    // checkedParent above authenticates either original causal provenance or
    // the sealed external-clock snapshot. Never fabricate audit.upstream.
    validateFailureRecoverySentinelBinding({audit,parent,run:parentRun,sentinel,health});
    const failedPush=suite.required.find(r=>r.conclusion==='failure');
    if(failedPush){
      const pushRun=await readRun(failedPush.run_id);
      const artifacts=(await artifactList(pushRun)).filter(a=>a.name===`kidults-continuous-assurance-${sha}-${pushRun.id}-1`);
      assert(artifacts.length===1,'RECOVERY_FAILURE_PUSH_ARTIFACT');
      const packet=await archive(pushRun,artifacts[0],sha,observedAt,{allowFailedConclusion:true});
      validateTerminalNullAssurancePacket({run:pushRun,audit:member(packet.packet,'audit-receipt.json'),
        proof:member(packet.packet,'whole-platform-operating-proof-v1.json'),sourceSha:sha});
    }
    const gateRuns=(await runList(GATE,sha)).filter(r=>r.path===`.github/workflows/${GATE}`&&r.head_sha===sha
      &&r.head_branch==='main'&&r.event==='workflow_run'&&r.repository?.full_name===I.repository
      &&String(r.repository?.id)===I.repository_id&&r.run_attempt===1);
    gateRuns.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id-b.id);
    const latestGateRun=gateRuns.at(-1);assert(latestGateRun,'RECOVERY_FAILURE_GATE_OBSERVATION_REQUIRED');
    const latestGateJobs=await jobsFor(await readRun(latestGateRun.id));
    const authority=latestGateJobs.jobs.filter(j=>j.name==='success-authority-gate');
    assert(authority.length===1&&!(authority[0].status==='completed'&&authority[0].conclusion==='success'),
      'RECOVERY_FAILURE_MUST_NOT_MASK_AUTHORITY_SUCCESS');
    const p0=suite.required.find(r=>r.path==='.github/workflows/kidults-p0-control-plane-closure-v1.yml');
    assert(p0,'RECOVERY_FAILURE_P0_REQUIRED');
    const p0Run=await readRun(p0.run_id),p0Artifacts=(await artifactList(p0Run)).filter(a=>a.name==='kidults-p0-control-plane-closure-v1');
    assert(p0Artifacts.length===1,'RECOVERY_FAILURE_P0_ARTIFACT');
    const p0Packet=await archive(p0Run,p0Artifacts[0],sha,observedAt),p0Receipt=member(p0Packet.packet,'kidults-p0-control-plane-closure-receipt-v1.json');
    assert(p0Receipt.id==='kidults-p0-control-plane-closure-receipt-v1'&&p0Receipt.state==='VERIFIED_PASS'
      &&p0Receipt.exact_source_sha===sha&&p0Receipt.repository===I.repository&&p0Receipt.run_id===p0Run.id
      &&p0Receipt.run_attempt===1,'RECOVERY_FAILURE_P0_CONTENT');
    const proofs=[];let canonicalNode;
    for(const selected of health.producers){
      const spec=SPECS.find(s=>s.id===selected.id);assert(spec,'RECOVERY_FAILURE_PRODUCER_SPEC');
      await currentProducer(spec,selected,sha);
      const run=await readRun(selected.selected_run_id),rows=await artifactList(run);
      const matches=rows.filter(a=>a.id===selected.artifact_id&&a.name===selected.artifact_name&&a.digest===selected.artifact_digest);
      assert(matches.length===1,'RECOVERY_FAILURE_PRODUCER_ARTIFACT');
      let content=validateProducerContent(spec,run,matches[0],await readBytes(`actions/artifacts/${matches[0].id}/zip`),sha,observedAt);
      if(content.alias){
        const alias=content.alias,leaderArtifact=await readJson(`actions/artifacts/${alias.canonical_artifact_id}`);
        const leaderRun=await readRun(leaderArtifact.workflow_run?.id),leaderBytes=await readBytes(`actions/artifacts/${leaderArtifact.id}/zip`);
        content=validateCoverageAliasClosure(content,validateProducerContent(spec,leaderRun,leaderArtifact,leaderBytes,sha,observedAt),leaderRun,leaderArtifact);
      }
      assert(content.state==='VERIFIED_PASS'&&content.artifact_content_validated===true,'RECOVERY_FAILURE_PRODUCER_CONTENT');
      const proof={id:spec.id,state:'VERIFIED_PASS',run_id:String(run.id),artifact_id:matches[0].id,
        artifact_digest:matches[0].digest,member_digests:content.member_digests};proofs.push(proof);
      if(spec.id==='CANONICAL_TRUTH')canonicalNode=proofNode(run,sha256(canonicalJson(proof)),
        {proof_digest_kind:'AUTHENTICATED_NATIVE_ARTIFACT_CONTENT_PROOF',artifact_id:matches[0].id,artifact_digest:matches[0].digest});
    }
    assert(canonicalNode,'RECOVERY_FAILURE_CANONICAL_TRUTH');
    const p0Digest=sha256(canonicalJson({pushIdentity,p0Receipt}));
    const check=(kind,run,artifact,receiptDigest,conclusion='success')=>({kind,run_id:String(run.id),run_attempt:1,
      source_sha:sha,conclusion,artifact_id:artifact.id,archive_digest:artifact.digest,receipt_digest:receiptDigest});
    const result={...native,evidence_profile:'TERMINAL_NULL_ASSURANCE_FAILURE_V1',
      original_archive:{artifact_id:originalArchive.artifact_id,archive_digest:originalArchive.archive_digest},checks:[
      check('REQUIRED_PUSH_SUITE',p0Run,p0Artifacts[0],p0Digest),
      check('CANONICAL_TRUTH',{id:canonicalNode.run_id},{id:canonicalNode.artifact_id,digest:canonicalNode.artifact_digest},canonicalNode.receipt_digest),
      check('SENTINEL',sentinel,healthArtifacts[0],health.receipt_digest),
      {...check('TERMINAL_NULL_ASSURANCE_FAILURE',parentRun,assuranceArtifacts[0],audit.receipt_digest,'failure'),
        terminal_null_evidence_refs:parent.terminal_check_evidence_refs}]};
    const finalMain=await readJson('branches/main');assert(finalMain.protected===true&&finalMain.commit?.sha===sha,'RECOVERY_EVIDENCE_MAIN_CHANGED');
    const latestSentinel=parent.coverage_continuation
      ?await readRun(parent.coverage_continuation.sentinel_run_id):await liveHealth(sha);
    assert(latestSentinel.id===sentinel.id,'RECOVERY_EVIDENCE_SNAPSHOT_MOVED');
    return result;
  };

  const jobsFor=async run=>{
    const response=await readJson(`actions/runs/${run.id}/attempts/1/jobs?per_page=100`);
    assert(Array.isArray(response.jobs)&&response.total_count===response.jobs.length&&response.total_count<=100
      &&new Set(response.jobs.map(j=>j.id)).size===response.jobs.length,'RECOVERY_EVIDENCE_JOB_CARDINALITY');
    assert(response.jobs.every(j=>positive(j.id)&&j.run_id===run.id&&(j.run_attempt===undefined||j.run_attempt===1)),'RECOVERY_EVIDENCE_JOB_ATTEMPT');
    return {...response,jobs:response.jobs.map(j=>({...j,run_attempt:1}))};
  };
  const collect=async(request,pinned=null,native=null,originalArchive=null)=>{
    const failureParent=generic&&native?.recovery_parent?.kind==='TERMINAL_NULL_ASSURANCE_FAILURE_V1'?native.recovery_parent:null;
    const nativeBase=native?{...native}:null;if(nativeBase)delete nativeBase.recovery_parent;
    if(generic){
      validateInterruptedRecoveryRequest(request,{now:now()});
      const authenticated=await observeInterruptedRecoveryNative({request,get:readJson,now:now()});
      assert(canonicalJson(authenticated)===canonicalJson(nativeBase),'RECOVERY_EVIDENCE_NATIVE_CONTEXT');
      if(failureParent){
        const parentRun=await readRun(failureParent.run_id);
        const verified=await verifyFailureAssuranceParent({run:parentRun,sourceSha:request.source_sha,
          get:readJson,readBytes});
        assert(canonicalJson(verified.recovery_parent)===canonicalJson(failureParent),'RECOVERY_FAILURE_PARENT_BINDING');
      }
    }
    else validatePostmergeRecoveryRequest(request,{now:now()});
    const sha=request.source_sha,observedAt=new Date(now()).toISOString();
    if(pinned&&!generic){
      validateRecoveryEvidenceSnapshot(pinned,request,{now:now()});
      const {snapshot_digest,...core}=pinned;
      assert(pinned.id==='kidults-postmerge-recovery-evidence-snapshot-v1'&&pinned.version==='1.0.0'
        &&pinned.source_sha===sha&&Number.isFinite(Date.parse(pinned.selected_at))&&Date.parse(pinned.selected_at)<=now()
        &&snapshot_digest===sha256(canonicalJson(core)),'RECOVERY_EVIDENCE_PINNED_SNAPSHOT');
    }
    const branch=await readJson('branches/main');assert(branch.name==='main'&&branch.protected===true&&branch.commit?.sha===sha,'RECOVERY_EVIDENCE_MAIN');
    const commit=await readJson(`commits/${sha}`);assert(commit.sha===sha,'RECOVERY_EVIDENCE_COMMIT');
    const pushRuns=(await Promise.all(policy.required_workflows.map(s=>runList(s.path.split('/').at(-1),sha,'push')))).flat();
    const suite=evaluatePostMergePushSuite(pushRuns,policy,sha,commit.commit?.committer?.date);
    if(failureParent)validateFailureRecoveryPushSuite(suite);
    else assert(suite.ready&&suite.required.length===6&&suite.required.every(r=>r.conclusion==='success')
      &&suite.failure_count===0&&suite.invalid.length===0,'RECOVERY_EVIDENCE_PUSH_SUITE');
    const pushIdentity=pushRuns.map(r=>({id:r.id,run_attempt:r.run_attempt,path:r.path,head_sha:r.head_sha,status:r.status,conclusion:r.conclusion}));
    assert(pushRuns.every(r=>r.run_attempt===1&&r.repository?.full_name===I.repository&&String(r.repository?.id)===I.repository_id),'RECOVERY_EVIDENCE_PUSH_IDENTITY');
    if(failureParent)return collectFailureEvidence({request,native:nativeBase,parent:failureParent,originalArchive,sha,observedAt,pushRuns,suite,pushIdentity});
    const sentinel=pinned&&!generic?await readRun(pinned.evidence?.sentinel?.run_id):await liveHealth(sha);
    const gate=pinned&&!generic?await readRun(pinned.evidence?.success_authority_gate?.run_id):await latestGate(sha);
    assert(sentinel.path===`.github/workflows/${SENTINEL}`&&gate.path===`.github/workflows/${GATE}`
      &&gate.event==='workflow_run','RECOVERY_EVIDENCE_SNAPSHOT_RUN_PATH');
    const gateJobs=await jobsFor(gate);
    const authority=gateJobs.jobs.filter(j=>j.name==='success-authority-gate');
    assert(authority.length===1&&authority[0].status==='completed'&&authority[0].conclusion==='success',
      'RECOVERY_EVIDENCE_ACTUAL_AUTHORITY_NOT_SUCCESS');
    const healthArtifacts=(await artifactList(sentinel)).filter(a=>a.name===`kpmo-continuous-assurance-sentinel-health-v1-${sha}-${sentinel.id}-1`);
    assert(healthArtifacts.length===1,'RECOVERY_EVIDENCE_SENTINEL_ARTIFACT');
    const healthPacket=await archive(sentinel,healthArtifacts[0],sha,observedAt);
    const health=member(healthPacket.packet,'kpmo-continuous-assurance-sentinel-health-v1.json');
    validateSentinelObservation(health,{GITHUB_REPOSITORY:I.repository,GITHUB_SHA:sha,GITHUB_RUN_ID:String(sentinel.id),GITHUB_RUN_ATTEMPT:'1',SENTINEL_RESOLVER_OUTCOME:'success'});
    const gateArtifacts=(await artifactList(gate)).filter(a=>a.name.startsWith(`kpmo-continuous-assurance-success-authority-gate-${sha}-`));
    assert(gateArtifacts.length===1,'RECOVERY_EVIDENCE_GATE_ARTIFACT');
    // Artifact name is only a discovery hint. Native run/artifact identity and
    // the sealed Gate's upstream tuple must independently agree below.
    const association=gateArtifacts[0].name.match(new RegExp(`^kpmo-continuous-assurance-success-authority-gate-${sha}-([1-9][0-9]*)-1$`));
    assert(association,'RECOVERY_EVIDENCE_GATE_ARTIFACT_NAME');
    const assurance=await readRun(association[1]);
    const assuranceArtifacts=(await artifactList(assurance)).filter(a=>a.name===`kidults-continuous-assurance-${sha}-${assurance.id}-1`);
    assert(assuranceArtifacts.length===1,'RECOVERY_EVIDENCE_ASSURANCE_ARTIFACT');
    const gatePacket=await archive(gate,gateArtifacts[0],sha,observedAt,{authorityGateHealthDigest:healthArtifacts[0].digest,authorityGateAssuranceDigest:assuranceArtifacts[0].digest});
    const gateReceipt=member(gatePacket.packet,'kpmo-continuous-assurance-success-authority-gate-v1.json');
    sealed(gateReceipt,'kpmo-continuous-assurance-success-authority-gate-v1');
    assert(gateReceipt.current_protected_main_sha===sha&&gateReceipt.coverage_scope==='CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM'
      &&gateReceipt.producer_health_run_id===sentinel.id&&gateReceipt.producer_health_run_attempt===1
      &&gateReceipt.producer_health_event===sentinel.event&&gateReceipt.producer_health_state==='VERIFIED_PASS'
      &&gateReceipt.producer_health_conclusion==='success'&&gateReceipt.producer_health_receipt_digest===health.receipt_digest
      &&['whole_platform_authority','promotion_eligible','empirical_authority','provider_authority','database_authority'].every(k=>gateReceipt[k]===false)
      &&gateReceipt.empirical_delta===0,'RECOVERY_EVIDENCE_GATE_HEALTH_BINDING');
    const upstream=gateReceipt.upstream_observation;
    assert(upstream?.run_id===assurance.id,'RECOVERY_EVIDENCE_ASSURANCE_BINDING');
    assert(upstream.workflow_name===assurance.name&&assurance.path===ASSURANCE&&assurance.head_sha===sha
      &&assurance.head_branch==='main'&&assurance.status==='completed'&&assurance.conclusion==='success'
      &&upstream.head_sha===sha&&upstream.run_attempt===1&&upstream.event===assurance.event&&upstream.conclusion==='success'
      &&gateArtifacts[0].name===`kpmo-continuous-assurance-success-authority-gate-${sha}-${assurance.id}-1`,
      'RECOVERY_EVIDENCE_ASSURANCE_BINDING');
    const assuranceJobs=await jobsFor(assurance),audits=assuranceJobs.jobs.filter(j=>j.name==='audit');
    assert(audits.length===1&&audits[0].status==='completed'&&audits[0].conclusion==='success','RECOVERY_EVIDENCE_ACTUAL_AUDIT_NOT_SUCCESS');
    const assurancePacket=await archive(assurance,assuranceArtifacts[0],sha,observedAt);
    readArchive(gatePacket.bytes,gateArtifacts[0].digest,{authorityGateHealthDigest:healthArtifacts[0].digest,authorityGateAssuranceDigest:assuranceArtifacts[0].digest});
    const audit=member(assurancePacket.packet,'audit-receipt.json'),operatingProof=member(assurancePacket.packet,'whole-platform-operating-proof-v1.json');
    const auditMember=assurancePacket.packet.members.find(m=>m.name.split('/').at(-1)==='audit-receipt.json');
    const proofMember=assurancePacket.packet.members.find(m=>m.name.split('/').at(-1)==='whole-platform-operating-proof-v1.json');
    const archiveCore={receipt_type:'KPMO_ASSURANCE_ARCHIVE_VALIDATION',state:'VERIFIED_PASS',readback_verified:true,
      source_sha:sha,assurance_run_id:assurance.id,assurance_run_attempt:1,artifact_id:assuranceArtifacts[0].id,
      artifact_digest:assuranceArtifacts[0].digest,archive_digest:assurancePacket.packet.archive_digest,
      archive_size_bytes:assurancePacket.bytes.length,member_count:assurancePacket.packet.members.length,
      audit_receipt_count:1,runtime_proof_count:1,audit_receipt_archive_member_digest:auditMember.sha256,
      runtime_proof_archive_member_digest:proofMember.sha256};
    const readiness=verifyAssuranceReadiness({audit,proof:operatingProof,assuranceRun:assurance,auditJob:audits[0],sourceSha:sha,
      sentinel:{run_id:sentinel.id,run_attempt:1,artifact_id:healthArtifacts[0].id,artifact_digest:healthArtifacts[0].digest,assurance_attempt:1},
      archivePacket:assurancePacket.packet,archiveReceipt:{...archiveCore,receipt_digest:sha256(canonicalJson(archiveCore))},
      assuranceArtifact:assuranceArtifacts[0],assuranceJobs,sentinelRun:sentinel,runtimeScope:'AUTONOMOUS_CONTROL_PLANE'});
    assert(readiness.sentinel_run_id===sentinel.id,'RECOVERY_EVIDENCE_ASSURANCE_LATEST_TUPLE');
    assert(gateReceipt.producer_health_artifact_id===healthArtifacts[0].id&&gateReceipt.producer_health_artifact_digest===healthArtifacts[0].digest
      &&gateReceipt.assurance_artifact_id===assuranceArtifacts[0].id&&gateReceipt.assurance_artifact_digest===assuranceArtifacts[0].digest
      &&gateReceipt.assurance_audit_receipt_digest===readiness.audit_receipt_digest
      &&gateReceipt.assurance_runtime_proof_digest===readiness.runtime_proof_digest,'RECOVERY_EVIDENCE_GATE_ARCHIVE_BINDING');
    const proofs=[];let canonicalNode;

    for(const selected of health.producers){
      const spec=SPECS.find(s=>s.id===selected.id);assert(spec,'RECOVERY_EVIDENCE_PRODUCER_SPEC');
      if(generic)await currentProducer(spec,selected,sha);
      const run=await readRun(selected.selected_run_id),rows=await artifactList(run);
      const matches=rows.filter(a=>a.id===selected.artifact_id&&a.name===selected.artifact_name&&a.digest===selected.artifact_digest);
      assert(matches.length===1,'RECOVERY_EVIDENCE_PRODUCER_ARTIFACT');const artifact=matches[0];
      const bytes=await readBytes(`actions/artifacts/${artifact.id}/zip`);
      let content=validateProducerContent(spec,run,artifact,bytes,sha,observedAt);
      if(content.alias){
        const alias=content.alias,leaderArtifact=await readJson(`actions/artifacts/${alias.canonical_artifact_id}`);
        const leaderRun=await readRun(leaderArtifact.workflow_run?.id);
        const leaderBytes=await readBytes(`actions/artifacts/${leaderArtifact.id}/zip`);
        const leader=validateProducerContent(spec,leaderRun,leaderArtifact,leaderBytes,sha,observedAt);
        content=validateCoverageAliasClosure(content,leader,leaderRun,leaderArtifact);
      }
      assert(content.state==='VERIFIED_PASS'&&content.artifact_content_validated===true,'RECOVERY_EVIDENCE_PRODUCER_CONTENT');
      const proof={id:spec.id,state:'VERIFIED_PASS',run_id:String(run.id),artifact_id:artifact.id,artifact_digest:artifact.digest,member_digests:content.member_digests};
      proofs.push(proof);
      if(spec.id==='CANONICAL_TRUTH')canonicalNode=proofNode(run,sha256(canonicalJson(proof)),{proof_digest_kind:'AUTHENTICATED_NATIVE_ARTIFACT_CONTENT_PROOF',artifact_id:artifact.id,artifact_digest:artifact.digest});
    }
    const evidence={state:'VERIFIED_PASS',source_sha:sha,...HOLD,
      push_suite:proofNode(pushRuns[0],sha256(canonicalJson(pushIdentity)),{required_success_count:6,required_failure_count:0,runs:pushIdentity}),
      canonical_truth:canonicalNode,sentinel:proofNode(sentinel,health.receipt_digest,{producers:proofs,failed_producers:[],waiting_producers:[],artifact_id:healthArtifacts[0].id,artifact_digest:healthArtifacts[0].digest}),
      success_authority_gate:proofNode(gate,gateReceipt.receipt_digest,{assurance_run_id:String(assurance.id),artifact_id:gateArtifacts[0].id,artifact_digest:gateArtifacts[0].digest})};
    // Reuse the terminal contract validator without writing a terminal receipt.
    if(!generic)buildPostmergeRecoveryTerminal({request,recoveryRunId:'1',evidence});
    const reread=await readJson('branches/main');assert(reread.protected===true&&reread.commit?.sha===sha,'RECOVERY_EVIDENCE_MAIN_CHANGED');
    const latest=await liveHealth(sha);
    assert(latest.id===sentinel.id,'RECOVERY_EVIDENCE_SNAPSHOT_MOVED');
    assert((await latestGate(sha)).id===gate.id,'RECOVERY_EVIDENCE_GATE_MOVED'); // // Never use the pinned success to bypass a newer failure/HOLD.
    if(generic){
      assert(native&&native.source_sha===sha&&native.merge_sha===request.merge_sha,'RECOVERY_EVIDENCE_NATIVE_CONTEXT');
      const p0=suite.required.find(r=>r.path==='.github/workflows/kidults-p0-control-plane-closure-v1.yml');
      assert(p0,'RECOVERY_EVIDENCE_P0_REQUIRED');
      const p0Run=await readRun(p0.run_id),p0Artifacts=(await artifactList(p0Run)).filter(a=>a.name==='kidults-p0-control-plane-closure-v1');
      assert(p0Artifacts.length===1,'RECOVERY_EVIDENCE_P0_ARTIFACT');
      const p0Packet=await archive(p0Run,p0Artifacts[0],sha,observedAt),p0Receipt=member(p0Packet.packet,'kidults-p0-control-plane-closure-receipt-v1.json');
      assert(p0Receipt.id==='kidults-p0-control-plane-closure-receipt-v1'&&p0Receipt.state==='VERIFIED_PASS'
        &&p0Receipt.exact_source_sha===sha&&p0Receipt.repository===I.repository&&p0Receipt.run_id===p0Run.id&&p0Receipt.run_attempt===1,'RECOVERY_EVIDENCE_P0_CONTENT');
      const check=(kind,run,artifact,digest)=>({kind,run_id:String(run.id),run_attempt:1,source_sha:sha,conclusion:'success',
        artifact_id:artifact.id,archive_digest:artifact.digest,receipt_digest:digest});
      const result={...native,checks:[check('REQUIRED_PUSH_SUITE',p0Run,p0Artifacts[0],sha256(canonicalJson({pushIdentity,p0Receipt}))),
        check('CANONICAL_TRUTH',{id:canonicalNode.run_id},{id:canonicalNode.artifact_id,digest:canonicalNode.artifact_digest},canonicalNode.receipt_digest),
        check('SENTINEL',sentinel,healthArtifacts[0],health.receipt_digest),check('SUCCESS_AUTHORITY_GATE',gate,gateArtifacts[0],gateReceipt.receipt_digest)]};
      if(pinned)assert(canonicalJson(result)===canonicalJson(pinned),'RECOVERY_EVIDENCE_PINNED_CONTENT_DRIFT');
      const last=await readJson('branches/main');assert(last.protected===true&&last.commit?.sha===sha,'RECOVERY_EVIDENCE_MAIN_CHANGED');
      for(const selected of health.producers)await currentProducer(SPECS.find(s=>s.id===selected.id),selected,sha);
      const finalMain=await readJson('branches/main');assert(finalMain.protected===true&&finalMain.commit?.sha===sha,'RECOVERY_EVIDENCE_MAIN_CHANGED');
      return result;
    }
    const core={id:'kidults-postmerge-recovery-evidence-snapshot-v1',version:'1.0.0',source_sha:sha,selected_at:pinned?.selected_at||observedAt,evidence,
      scope:'ORIGINAL_LANDING_TERMINAL_RECOVERY_ONLY_NOT_WHOLE_PLATFORM',...HOLD};
    const snapshot={...core,snapshot_digest:sha256(canonicalJson(core))};
    if(pinned)assert(canonicalJson(snapshot)===canonicalJson(pinned),'RECOVERY_EVIDENCE_PINNED_CONTENT_DRIFT');
    return snapshot;
  };
  return generic?{verifyEvidence:({request,native,pinned=null,originalArchive=null})=>collect(request,pinned,native,originalArchive)}
    :{selectSnapshot:request=>collect(request),verifySnapshot:(request,snapshot)=>collect(request,snapshot)};
}

export const createRecoveryExactMainEvidence=options=>createExactMainEvidence(options);
export const createInterruptedRecoveryNativeEvidence=options=>createExactMainEvidence(options,true);
