// Read-only authenticated evidence collection. Reuse native content validators;
// neither PASS strings nor caller-supplied verification booleans are authority.
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from './autonomous-internal-landing-v1.mjs';
import {POSTMERGE_RECOVERY_INCIDENT as I,buildPostmergeRecoveryTerminal,validatePostmergeRecoveryRequest,validateRecoveryEvidenceSnapshot} from './autonomous-postmerge-recovery-v1.mjs';
import {evaluatePostMergePushSuite,validatePolicy} from '../consume-direct-owner-postmerge-push-suite-v1.mjs';
import {SPECS} from '../resolve-continuous-assurance-sentinel-health-v1.mjs';
import {checkTransport,readArchive,validateProducerContent,validateCoverageAliasClosure} from '../validate-sentinel-producer-content-v1.mjs';
import {validateSentinelObservation} from '../validate-sentinel-observation-v1.mjs';
import {selectLatestNaturalSentinelRun} from '../select-latest-natural-sentinel-run-v1.mjs';

const assert=(ok,code)=>{if(!ok)throw new Error(code);};
const HOLD={production:'HOLD',public:'HOLD',g5:'HOLD'};
const SENTINEL='kpmo-continuous-assurance-sentinel-health-v1.yml';
const GATE='kpmo-continuous-assurance-success-authority-gate-v1.yml';
const ASSURANCE='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const positive=x=>Number.isSafeInteger(x)&&x>0;
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

export function createRecoveryExactMainEvidence({policy,readJson=route=>transport(route),readBytes=route=>transport(route,true),now=()=>Date.now()}){
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
    checkTransport(run,artifact,sha,observedAt);
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

  const collect=async(request,pinned=null)=>{
    validatePostmergeRecoveryRequest(request,{now:now()});
    const sha=request.source_sha,observedAt=new Date(now()).toISOString();
    if(pinned){
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
    assert(suite.ready&&suite.required.length===6&&suite.required.every(r=>r.conclusion==='success')
      &&suite.failure_count===0&&suite.invalid.length===0,'RECOVERY_EVIDENCE_PUSH_SUITE');
    const pushIdentity=pushRuns.map(r=>({id:r.id,run_attempt:r.run_attempt,path:r.path,head_sha:r.head_sha,status:r.status,conclusion:r.conclusion}));
    assert(pushRuns.every(r=>r.run_attempt===1&&r.repository?.full_name===I.repository&&String(r.repository?.id)===I.repository_id),'RECOVERY_EVIDENCE_PUSH_IDENTITY');
    const sentinel=pinned?await readRun(pinned.evidence?.sentinel?.run_id):await liveHealth(sha);
    const gate=pinned?await readRun(pinned.evidence?.success_authority_gate?.run_id):await latestGate(sha);
    assert(sentinel.path===`.github/workflows/${SENTINEL}`&&gate.path===`.github/workflows/${GATE}`
      &&gate.event==='workflow_run','RECOVERY_EVIDENCE_SNAPSHOT_RUN_PATH');
    const healthArtifacts=(await artifactList(sentinel)).filter(a=>a.name===`kpmo-continuous-assurance-sentinel-health-v1-${sha}-${sentinel.id}-1`);
    assert(healthArtifacts.length===1,'RECOVERY_EVIDENCE_SENTINEL_ARTIFACT');
    const healthPacket=await archive(sentinel,healthArtifacts[0],sha,observedAt);
    const health=member(healthPacket.packet,'kpmo-continuous-assurance-sentinel-health-v1.json');
    validateSentinelObservation(health,{GITHUB_REPOSITORY:I.repository,GITHUB_SHA:sha,GITHUB_RUN_ID:String(sentinel.id),GITHUB_RUN_ATTEMPT:'1',SENTINEL_RESOLVER_OUTCOME:'success'});
    const gateArtifacts=(await artifactList(gate)).filter(a=>a.name.startsWith(`kpmo-continuous-assurance-success-authority-gate-${sha}-`));
    assert(gateArtifacts.length===1,'RECOVERY_EVIDENCE_GATE_ARTIFACT');
    const gatePacket=await archive(gate,gateArtifacts[0],sha,observedAt,{authorityGateHealthDigest:healthArtifacts[0].digest});
    const gateReceipt=member(gatePacket.packet,'kpmo-continuous-assurance-success-authority-gate-v1.json');
    sealed(gateReceipt,'kpmo-continuous-assurance-success-authority-gate-v1');
    assert(gateReceipt.current_protected_main_sha===sha&&gateReceipt.coverage_scope==='CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM'
      &&gateReceipt.producer_health_run_id===sentinel.id&&gateReceipt.producer_health_run_attempt===1
      &&gateReceipt.producer_health_event===sentinel.event&&gateReceipt.producer_health_state==='VERIFIED_PASS'
      &&gateReceipt.producer_health_conclusion==='success'&&gateReceipt.producer_health_receipt_digest===health.receipt_digest
      &&['whole_platform_authority','promotion_eligible','empirical_authority','provider_authority','database_authority'].every(k=>gateReceipt[k]===false)
      &&gateReceipt.empirical_delta===0,'RECOVERY_EVIDENCE_GATE_HEALTH_BINDING');
    const upstream=gateReceipt.upstream_observation,assurance=await readRun(upstream?.run_id);
    assert(upstream.workflow_name===assurance.name&&assurance.path===ASSURANCE&&assurance.head_sha===sha
      &&assurance.head_branch==='main'&&assurance.status==='completed'&&assurance.conclusion==='success'
      &&upstream.head_sha===sha&&upstream.run_attempt===1&&upstream.event===assurance.event&&upstream.conclusion==='success'
      &&gateArtifacts[0].name===`kpmo-continuous-assurance-success-authority-gate-${sha}-${assurance.id}-1`,
      'RECOVERY_EVIDENCE_ASSURANCE_BINDING');
    const proofs=[];let canonicalNode;
    for(const selected of health.producers){
      const spec=SPECS.find(s=>s.id===selected.id);assert(spec,'RECOVERY_EVIDENCE_PRODUCER_SPEC');
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
    buildPostmergeRecoveryTerminal({request,recoveryRunId:'1',evidence});
    const reread=await readJson('branches/main');assert(reread.protected===true&&reread.commit?.sha===sha,'RECOVERY_EVIDENCE_MAIN_CHANGED');
    const latest=await liveHealth(sha);
    if(!pinned)assert(latest.id===sentinel.id,'RECOVERY_EVIDENCE_SNAPSHOT_MOVED');
    else await latestGate(sha); // Never use the pinned success to bypass a newer failure/HOLD.
    const core={id:'kidults-postmerge-recovery-evidence-snapshot-v1',version:'1.0.0',source_sha:sha,selected_at:pinned?.selected_at||observedAt,evidence,
      scope:'ORIGINAL_LANDING_TERMINAL_RECOVERY_ONLY_NOT_WHOLE_PLATFORM',...HOLD};
    const snapshot={...core,snapshot_digest:sha256(canonicalJson(core))};
    if(pinned)assert(canonicalJson(snapshot)===canonicalJson(pinned),'RECOVERY_EVIDENCE_PINNED_CONTENT_DRIFT');
    return snapshot;
  };
  return {selectSnapshot:request=>collect(request),verifySnapshot:(request,snapshot)=>collect(request,snapshot)};
}
