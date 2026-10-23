import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './lib/canonical-json-v1.mjs';
import {verifyDeferredAssuranceRuntimeProof} from './verify-assurance-runtime-proof-handoff-v1.mjs';

const repo='johnkim9524-collab/kaios_enterprise_repo';
const required=(value,code)=>{if(!value)throw Error(`DEFERRED_PROOF_${code}`);return value;};
const ghJson=endpoint=>JSON.parse(execFileSync('gh',['api','-H','Accept: application/vnd.github+json',`/repos/${repo}/${endpoint}`],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024}));
const artifactPacket=(artifact)=>{
  const zip=execFileSync('gh',['api','-H','Accept: application/vnd.github+json',`/repos/${repo}/actions/artifacts/${artifact.id}/zip`],{encoding:'buffer',timeout:60000,maxBuffer:10*1024*1024});
  const parsed=spawnSync('python3',['scripts/kidults/kpmo/read-sentinel-artifact-v1.py',artifact.digest],{input:zip,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
  if(parsed.status!==0)throw Error(`DEFERRED_PROOF_ARCHIVE_${(parsed.stderr||'').trim().slice(0,120)}`);
  return JSON.parse(parsed.stdout);
};
const member=(packet,basename)=>{
  const found=packet.members.filter(row=>row.encoding==='utf-8'&&row.name.split('/').at(-1)===basename);
  required(found.length===1,`MEMBER_${basename}`);return JSON.parse(found[0].text);
};
const liveArtifact=(runId,artifactId,sourceSha)=>{
  const index=ghJson(`actions/runs/${runId}/artifacts?per_page=100`);
  required(Array.isArray(index.artifacts)&&index.total_count===index.artifacts.length,'ARTIFACT_INDEX');
  const rows=index.artifacts.filter(x=>x.id===artifactId&&x.expired===false&&x.workflow_run?.id===Number(runId)&&x.workflow_run?.head_sha===sourceSha);
  required(rows.length===1,'EXACT_ARTIFACT');
  return rows[0];
};

export function runDeferredAssuranceProofGate({producerRunId,producerRunAttempt,sourceSha,outputPath}){
  const initial={receipt_id:'kpmo-deferred-assurance-runtime-proof-gate-v1',version:'1.0.0',state:'VERIFIED_FAIL',
    failure_class:'DEFERRED_RUNTIME_PROOF_NOT_VERIFIED',repository:repo,producer_run_id:Number(producerRunId),
    producer_run_attempt:Number(producerRunAttempt),source_sha:sourceSha,whole_platform_authority:false,
    promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
  try{
    const producerRun=ghJson(`actions/runs/${producerRunId}`);
    required(producerRun.id===Number(producerRunId)&&producerRun.run_attempt===Number(producerRunAttempt)
      &&producerRun.path==='.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml'
      &&producerRun.head_sha===sourceSha&&producerRun.head_branch==='main'&&producerRun.event==='workflow_run'
      &&producerRun.status==='completed'&&producerRun.conclusion==='success'
      &&producerRun.repository?.full_name===repo&&producerRun.head_repository?.full_name===repo,'PRODUCER_RUN');
    const producerJobs=ghJson(`actions/runs/${producerRunId}/attempts/${producerRunAttempt}/jobs?per_page=100`);
    required(Array.isArray(producerJobs.jobs)&&producerJobs.total_count===producerJobs.jobs.length&&producerJobs.total_count<=100,'PRODUCER_JOBS');
    const reconciliationJobs=producerJobs.jobs.filter(x=>x.name==='Reconcile exact-main receipts through the shared read ledger');
    required(reconciliationJobs.length===1,'PRODUCER_RECONCILIATION_JOB');
    if(reconciliationJobs[0].conclusion==='skipped'){
      const body={...initial,state:'NOT_APPLICABLE',failure_class:null,disposition:'PRODUCER_RECONCILIATION_NOT_APPLICABLE',
        whole_platform_authority:false,promotion_eligible:false};
      const result={...body,receipt_digest:sha256(canonicalJson(body))};
      fs.writeFileSync(outputPath,`${JSON.stringify(result,null,2)}\n`,{flag:'wx',mode:0o600});return result;
    }
    required(reconciliationJobs[0].status==='completed'&&reconciliationJobs[0].conclusion==='success','PRODUCER_RECONCILIATION_JOB');
    const producerName=`kidults-whole-platform-operating-proof-${sourceSha}-${producerRunId}-${producerRunAttempt}`;
    const producerArtifacts=ghJson(`actions/runs/${producerRunId}/artifacts?per_page=100`);
    const producerRows=producerArtifacts.artifacts.filter(x=>x.name===producerName&&x.expired===false
      &&x.workflow_run?.id===Number(producerRunId)&&x.workflow_run?.head_sha===sourceSha);
    required(producerRows.length===1,'PRODUCER_ARTIFACT');
    const producerArtifact=producerRows[0],producerPacket=artifactPacket(producerArtifact);
    const skipped=producerPacket.members.filter(x=>x.encoding==='utf-8'&&x.name.split('/').at(-1)==='audit-skipped-disposition.json');
    if(skipped.length===1){
      const disposition=JSON.parse(skipped[0].text);
      if(disposition.state==='NOT_APPLICABLE'&&disposition.whole_platform_operating_proof===false){
        const body={...initial,state:'NOT_APPLICABLE',failure_class:null,disposition:'ASSURANCE_AUDIT_SKIPPED',
          whole_platform_authority:false,promotion_eligible:false};
        const result={...body,receipt_digest:sha256(canonicalJson(body))};
        fs.writeFileSync(outputPath,`${JSON.stringify(result,null,2)}\n`,{flag:'wx',mode:0o600});return result;
      }
    }
    const proof=member(producerPacket,'whole-platform-operating-proof-v1.json');
    const handoff=member(producerPacket,'assurance-runtime-proof-handoff-v1.json');
    const assuranceRunHint=member(producerPacket,'assurance-run.json');
    const assuranceArtifactHint=member(producerPacket,'assurance-artifact.json');
    const assuranceRun=ghJson(`actions/runs/${handoff.assurance?.run_id}`);
    required(assuranceRun.id===Number(handoff.assurance.run_id)&&assuranceRun.run_attempt===Number(handoff.assurance.run_attempt)
      &&assuranceRun.head_sha===sourceSha&&assuranceRun.id===assuranceRunHint.id
      &&assuranceRun.run_attempt===assuranceRunHint.run_attempt,'ASSURANCE_RUN_LIVE_BINDING');
    const jobIndex=ghJson(`actions/runs/${assuranceRun.id}/attempts/${assuranceRun.run_attempt}/jobs?per_page=100`);
    required(Array.isArray(jobIndex.jobs)&&jobIndex.total_count===jobIndex.jobs.length&&jobIndex.total_count<=100,'ASSURANCE_JOBS');
    const audits=jobIndex.jobs.filter(x=>x.run_id===assuranceRun.id&&x.run_attempt===assuranceRun.run_attempt
      &&x.name==='audit'&&x.status==='completed'&&x.conclusion==='success');
    required(audits.length===1,'ASSURANCE_AUDIT_JOB');
    const assuranceAuditJob=audits[0];
    const assuranceArtifact=liveArtifact(assuranceRun.id,handoff.assurance.artifact_id,sourceSha);
    required(assuranceArtifact.id===assuranceArtifactHint.id&&assuranceArtifact.digest===assuranceArtifactHint.digest,'ASSURANCE_ARTIFACT_HINT');
    const assuranceArchive=artifactPacket(assuranceArtifact);
    const auditReceipt=member(assuranceArchive,'audit-receipt.json');
    const currentMainSha=ghJson('branches/main').commit?.sha;
    const coreChecks=proof.operating_checks?.filter(x=>x.id==='CORE_FOUR_CONTENT')||[];
    required(coreChecks.length===1&&coreChecks[0].state==='VERIFIED_PASS'&&Array.isArray(coreChecks[0].evidence_refs)
      &&coreChecks[0].evidence_refs.length>0,'CORE_FOUR_PROOF');
    const sentinelPath='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
    const sentinelRows=proof.protected_evidence.filter(x=>x.workflow_path===sentinelPath
      &&String(x.run_id)===String(coreChecks[0].evidence_refs[0])&&x.run_attempt===1&&x.source_sha===sourceSha);
    required(sentinelRows.length===1,'CORE_FOUR_SENTINEL_BINDING');
    const sentinelEvidence=sentinelRows[0];
    const sentinelRun=ghJson(`actions/runs/${sentinelEvidence.run_id}`);
    required(sentinelRun.path===sentinelPath&&sentinelRun.head_sha===sourceSha&&sentinelRun.head_branch==='main'
      &&sentinelRun.status==='completed'&&sentinelRun.conclusion==='success'&&sentinelRun.run_attempt===1
      &&['push','workflow_run','repository_dispatch'].includes(sentinelRun.event),'CORE_FOUR_SENTINEL_RUN');
    const sentinelArtifact=liveArtifact(sentinelRun.id,sentinelEvidence.artifact_id,sourceSha);
    required(sentinelArtifact.digest===sentinelEvidence.artifact_digest,'CORE_FOUR_SENTINEL_ARTIFACT');
    const healthReceipt=member(artifactPacket(sentinelArtifact),'kpmo-continuous-assurance-sentinel-health-v1.json');
    const result=verifyDeferredAssuranceRuntimeProof({producerRun,producerArtifact,proof,handoff,assuranceRun,
      assuranceAuditJob,assuranceArtifact,auditReceipt,assuranceArchive,currentMainSha,sentinelRun,sentinelArtifact,healthReceipt});
    fs.writeFileSync(outputPath,`${JSON.stringify(result,null,2)}\n`,{flag:'wx',mode:0o600});
    return result;
  }catch(error){
    const failure={...initial,failure_class:String(error?.message||error).split(':')[0]};
    fs.writeFileSync(outputPath,`${JSON.stringify({...failure,receipt_digest:sha256(canonicalJson(failure))},null,2)}\n`,{flag:'wx',mode:0o600});
    throw error;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const outputPath=process.argv[2];required(outputPath,'OUTPUT_PATH');
  const result=runDeferredAssuranceProofGate({producerRunId:process.env.PRODUCER_RUN_ID,
    producerRunAttempt:process.env.PRODUCER_RUN_ATTEMPT,sourceSha:process.env.SOURCE_SHA,outputPath});
  process.stdout.write(JSON.stringify({state:result.state,source_sha:result.source_sha,
    assurance_run_id:result.assurance_run_id,producer_run_id:result.proof_producer_run_id,receipt_digest:result.receipt_digest})+'\n');
}
