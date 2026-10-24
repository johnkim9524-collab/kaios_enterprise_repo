const repository='johnkim9524-collab/kaios_enterprise_repo';
const gatePath='.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml';
const proofPrefix='kpmo-deferred-assurance-runtime-proof-gate-';
const check=(ok,code)=>{if(!ok)throw Error(`TERMINAL_PROOF_ADMISSION_${code}`);};
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value||'');
const positiveId=value=>Number.isSafeInteger(value)&&value>0;

function verifyProofReceipt({run,artifact,proofPacket}){
  check(proofPacket?.archive_digest===artifact.digest&&Array.isArray(proofPacket?.members)
    &&proofPacket.members.length===1,'PROOF_ARCHIVE_BINDING');
  const members=proofPacket.members.filter(member=>member.encoding==='utf-8'
    &&member.name.split('/').at(-1)==='kpmo-deferred-assurance-runtime-proof-gate-v1.json');
  check(members.length===1,'PROOF_RECEIPT_MEMBER');
  const receipt=JSON.parse(members[0].text);
  const artifactName=new RegExp(`^${proofPrefix}([a-f0-9]{40})-([1-9][0-9]*)-([1-9][0-9]*)$`).exec(artifact.name);
  check(artifactName&&artifactName[1]===run.head_sha,'PROOF_ARTIFACT_NAME_BINDING');
  const unsigned=Object.fromEntries(Object.entries(receipt).filter(([key])=>key!=='receipt_digest'));
  check(receipt.receipt_id==='kpmo-deferred-assurance-runtime-proof-gate-v1'&&receipt.version==='1.0.0'
    &&receipt.state==='VERIFIED_PASS'&&receipt.repository===repository&&receipt.source_sha===run.head_sha
    &&receipt.current_protected_main_sha===run.head_sha&&receipt.proof_producer_run_id===Number(artifactName[2])
    &&receipt.proof_producer_run_attempt===Number(artifactName[3])
    &&positiveId(receipt.assurance_run_id)&&positiveId(receipt.assurance_run_attempt)
    &&positiveId(receipt.assurance_audit_job_id)&&positiveId(receipt.assurance_artifact_id)
    &&positiveId(receipt.producer_health_run_id)&&positiveId(receipt.producer_health_run_attempt)
    &&positiveId(receipt.producer_health_artifact_id)&&positiveId(receipt.proof_artifact_id)
    &&digest(receipt.assurance_audit_receipt_digest)&&digest(receipt.assurance_artifact_digest)
    &&digest(receipt.assurance_archive_digest)&&receipt.assurance_archive_readback==='PASS'
    &&digest(receipt.proof_artifact_digest)&&digest(receipt.producer_health_artifact_digest)
    &&digest(receipt.producer_health_receipt_digest)&&digest(receipt.proof_receipt_digest)
    &&digest(receipt.handoff_receipt_digest)&&receipt.whole_platform_authority===false
    &&receipt.promotion_eligible===false&&receipt.production==='HOLD'&&receipt.public==='HOLD'&&receipt.g5==='HOLD'
    &&digest(receipt.receipt_digest),'PROOF_RECEIPT_SCHEMA_OR_BINDING');
  // The receipt digest seals every field except itself; canonical JSON makes
  // verification independent of ZIP member key ordering.
  check(proofPacket.member_sha256s?.[members[0].name]===members[0].sha256
    &&members[0].sha256===`sha256:${createHash('sha256').update(members[0].text).digest('hex')}`
    &&receipt.receipt_digest===sha256(canonicalJson(unsigned)),'PROOF_RECEIPT_DIGEST');
  return receipt;
}

import {createHash} from 'node:crypto';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';

export function verifyTerminalRecoveryProofAdmission({event,repositoryId='1281328888',jobsResponse,artifactsResponse,proofPacket}){
  const run=event?.workflow_run;
  check(event?.action==='completed'&&run?.id>0&&run?.name==='KPMO Continuous Assurance Success Authority Gate V1'
    &&run?.path===gatePath&&run?.status==='completed'&&run?.conclusion==='success'
    &&run?.run_attempt===1&&run?.head_branch==='main'&&/^[a-f0-9]{40}$/.test(run?.head_sha||'')
    &&run?.repository?.full_name===repository&&String(run?.repository?.id)===repositoryId
    &&run?.head_repository?.full_name===repository,'UPSTREAM_BINDING');
  const jobs=jobsResponse?.jobs;
  check(Array.isArray(jobs)&&jobsResponse.total_count===jobs.length&&jobs.length<=100
    &&new Set(jobs.map(job=>job.id)).size===jobs.length,'JOB_PAGE');
  const handoffs=jobs.filter(job=>job.name==='deferred-runtime-proof-handoff-gate'
    &&job.run_id===run.id&&(job.run_attempt===undefined||job.run_attempt===run.run_attempt)
    &&job.status==='completed'&&job.conclusion==='success');
  check(handoffs.length===1,'HANDOFF_JOB');
  const closureSteps=handoffs[0].steps?.filter(step=>step.name==='Require exact autonomous Assurance proof closure'
    &&step.status==='completed'&&step.conclusion==='success');
  check(closureSteps?.length===1,'HANDOFF_CLOSURE_STEP');
  const artifacts=artifactsResponse?.artifacts;
  check(Array.isArray(artifacts)&&artifactsResponse.total_count===artifacts.length&&artifacts.length<=100,'ARTIFACT_PAGE');
  const proofArtifacts=artifacts.filter(artifact=>artifact.name?.startsWith(`${proofPrefix}${run.head_sha}-`)
    &&artifact.expired===false&&/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')
    &&artifact.workflow_run?.id===run.id&&artifact.workflow_run?.head_sha===run.head_sha);
  check(proofArtifacts.length===1,'PROOF_ARTIFACT');
  const proofReceipt=verifyProofReceipt({run,artifact:proofArtifacts[0],proofPacket});
  return {state:'PROOF_HANDOFF_ADMITTED_NOT_AUTHORITY',gate_run_id:run.id,gate_run_attempt:run.run_attempt,
    source_sha:run.head_sha,proof_handoff_job_id:handoffs[0].id,proof_artifact_id:proofArtifacts[0].id,
    proof_artifact_digest:proofArtifacts[0].digest,proof_receipt_digest:proofReceipt.receipt_digest,
    verified_proof_receipt_state:proofReceipt.state,reservation_write_performed:false,actual_authority_granted:false,
    promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
}
