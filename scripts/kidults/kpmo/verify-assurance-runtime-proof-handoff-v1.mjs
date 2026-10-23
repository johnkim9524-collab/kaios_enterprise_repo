import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './lib/canonical-json-v1.mjs';
import {verifyAutonomousRuntimeReadiness} from './lib/assurance-full-proof-v1.mjs';
import {verifyAssuranceRuntimeProofHandoff} from './lib/assurance-runtime-proof-handoff-v1.mjs';
import {verifyHealthReceipt} from './lib/whole-platform-runtime-evidence-v1.mjs';

const fail=code=>{throw new Error(`ASSURANCE_PROOF_HANDOFF_GATE_${code}`);};
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const id=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value||'');
const repo='johnkim9524-collab/kaios_enterprise_repo';

export function verifyDeferredAssuranceRuntimeProof({producerRun,producerArtifact,proof,handoff,assuranceRun,
  assuranceAuditJob,assuranceArtifact,auditReceipt,assuranceArchive,currentMainSha,sentinelRun,sentinelArtifact,healthReceipt}){
  const sourceSha=assuranceRun?.head_sha;
  if(currentMainSha!==sourceSha||!/^[a-f0-9]{40}$/.test(sourceSha||''))fail('CURRENT_MAIN');
  if(producerRun?.path!=='.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml'
    ||producerRun?.repository?.full_name!==repo||producerRun?.head_repository?.full_name!==repo
    ||producerRun?.head_branch!=='main'||producerRun?.head_sha!==sourceSha||producerRun?.event!=='workflow_run'
    ||producerRun?.status!=='completed'||producerRun?.conclusion!=='success'||!id(producerRun.id)||!id(producerRun.run_attempt))fail('PRODUCER_RUN');
  if(!id(producerArtifact?.id)||!digest(producerArtifact?.digest)||producerArtifact?.expired!==false
    ||producerArtifact?.workflow_run?.id!==producerRun.id||producerArtifact?.workflow_run?.head_sha!==sourceSha)fail('PRODUCER_ARTIFACT');
  if(assuranceRun?.path!=='.github/workflows/kidults-platform-continuous-assurance-v1.yml'
    ||assuranceRun?.repository?.full_name!==repo||assuranceRun?.head_repository?.full_name!==repo
    ||assuranceRun?.head_branch!=='main'||assuranceRun?.status!=='completed'||assuranceRun?.conclusion!=='success'
    ||!id(assuranceRun.id)||!id(assuranceRun.run_attempt))fail('ASSURANCE_RUN');
  if(assuranceAuditJob?.name!=='audit'||assuranceAuditJob?.status!=='completed'||assuranceAuditJob?.conclusion!=='success'
    ||assuranceAuditJob?.run_id!==assuranceRun.id||assuranceAuditJob?.run_attempt!==assuranceRun.run_attempt)fail('ASSURANCE_AUDIT_JOB');
  if(!id(assuranceArtifact?.id)||!digest(assuranceArtifact?.digest)||assuranceArtifact?.expired!==false
    ||assuranceArtifact?.workflow_run?.id!==assuranceRun.id||assuranceArtifact?.workflow_run?.head_sha!==sourceSha
    ||assuranceArchive?.archive_digest!==assuranceArtifact.digest||!Array.isArray(assuranceArchive?.members))fail('ASSURANCE_ARTIFACT');
  const audits=assuranceArchive.members.filter(x=>x.encoding==='utf-8'&&x.name.split('/').at(-1)==='audit-receipt.json');
  if(audits.length!==1||assuranceArchive.members.length<1||assuranceArchive.members.length>512)fail('ASSURANCE_ARCHIVE');
  const unsignedAudit=Object.fromEntries(Object.entries(auditReceipt||{}).filter(([key])=>!['observed_at','receipt_digest'].includes(key)));
  if(auditReceipt?.receipt_type!=='KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE'||auditReceipt?.source?.sha!==sourceSha
    ||auditReceipt?.source?.actual_sha!==sourceSha||auditReceipt?.source?.expected_sha!==sourceSha||auditReceipt?.source?.match!==true
    ||String(auditReceipt?.execution?.workflow_run_id)!==String(assuranceRun.id)
    ||Number(auditReceipt?.execution?.workflow_run_attempt)!==Number(assuranceRun.run_attempt)
    ||auditReceipt?.states?.internal_control_state!=='VERIFIED_PASS'
    ||auditReceipt?.receipt_digest!==sha256(canonicalJson(unsignedAudit))
    ||audits[0].sha256!==sha256(audits[0].text))fail('AUDIT_RECEIPT');
  // The archive reader's member digest is over exact bytes, so also compare the parsed member text.
  const archiveAudit=JSON.parse(audits[0].text);
  if(canonicalJson(archiveAudit)!==canonicalJson(auditReceipt))fail('AUDIT_ARCHIVE_CONTENT');
  const producerBinding={id:producerRun.id,run_attempt:producerRun.run_attempt,
    path:producerRun.path,head_sha:producerRun.head_sha,head_branch:producerRun.head_branch,event:producerRun.event};
  const handoffResult=verifyAssuranceRuntimeProofHandoff({handoff,proof,assuranceRun,assuranceAudit:auditReceipt,
    assuranceArtifact,producerRun:producerBinding,repository:repo});
  const runtime=verifyAutonomousRuntimeReadiness(proof,sourceSha);
  const coreFour=proof.operating_checks?.filter(x=>x.id==='CORE_FOUR_CONTENT')||[];
  const sentinelPath='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
  if(coreFour.length!==1||coreFour[0].state!=='VERIFIED_PASS'||!Array.isArray(coreFour[0].evidence_refs)
    ||!coreFour[0].evidence_refs.length||sentinelRun?.path!==sentinelPath||sentinelRun?.head_sha!==sourceSha
    ||sentinelRun?.head_branch!=='main'||sentinelRun?.status!=='completed'||sentinelRun?.conclusion!=='success'
    ||sentinelRun?.run_attempt!==1||!['push','workflow_run','repository_dispatch'].includes(sentinelRun?.event)
    ||!coreFour[0].evidence_refs.map(String).includes(String(sentinelRun.id)))fail('CORE_FOUR_SENTINEL_BINDING');
  if(!id(sentinelArtifact?.id)||!digest(sentinelArtifact?.digest)||sentinelArtifact?.expired!==false
    ||sentinelArtifact?.workflow_run?.id!==sentinelRun.id||sentinelArtifact?.workflow_run?.head_sha!==sourceSha)fail('CORE_FOUR_ARTIFACT');
  verifyHealthReceipt(healthReceipt,sentinelRun,sourceSha);
  const healthEvidence=proof.protected_evidence.filter(x=>x.workflow_path===sentinelPath&&x.run_id===sentinelRun.id
    &&x.run_attempt===1&&x.source_sha===sourceSha&&x.artifact_id===sentinelArtifact.id
    &&x.artifact_digest===sentinelArtifact.digest);
  if(healthEvidence.length!==1)fail('CORE_FOUR_PROOF_ARTIFACT_BINDING');
  const body={receipt_id:'kpmo-deferred-assurance-runtime-proof-gate-v1',version:'1.0.0',state:'VERIFIED_PASS',
    repository:repo,source_sha:sourceSha,current_protected_main_sha:currentMainSha,
    assurance_run_id:assuranceRun.id,assurance_run_attempt:assuranceRun.run_attempt,
    assurance_audit_job_id:assuranceAuditJob.id,assurance_audit_receipt_digest:auditReceipt.receipt_digest,
    assurance_artifact_id:assuranceArtifact.id,assurance_artifact_digest:assuranceArtifact.digest,
    assurance_archive_digest:assuranceArchive.archive_digest,assurance_archive_readback:'PASS',
    proof_producer_run_id:producerRun.id,proof_producer_run_attempt:producerRun.run_attempt,
    proof_artifact_id:producerArtifact.id,proof_artifact_digest:producerArtifact.digest,
    producer_health_run_id:sentinelRun.id,producer_health_run_attempt:sentinelRun.run_attempt,
    producer_health_artifact_id:sentinelArtifact.id,producer_health_artifact_digest:sentinelArtifact.digest,
    producer_health_receipt_digest:healthReceipt.receipt_digest,
    proof_receipt_digest:proof.receipt_digest,handoff_receipt_digest:handoff.receipt_digest,
    scope:runtime.scope,verified_domain_count:runtime.verified_domain_count,required_domain_count:runtime.required_domain_count,
    whole_platform_authority:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
  return {...body,receipt_digest:sha256(canonicalJson(body)),handoff_verification:handoffResult};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [producerRunPath,producerArtifactPath,proofPath,handoffPath,assuranceRunPath,auditJobPath,
    assuranceArtifactPath,auditPath,archivePath,mainShaPath,outputPath]=process.argv.slice(2);
  if(![producerRunPath,producerArtifactPath,proofPath,handoffPath,assuranceRunPath,auditJobPath,
    assuranceArtifactPath,auditPath,archivePath,mainShaPath,outputPath].every(Boolean))fail('CLI_ARGUMENTS');
  const result=verifyDeferredAssuranceRuntimeProof({producerRun:read(producerRunPath),producerArtifact:read(producerArtifactPath),
    proof:read(proofPath),handoff:read(handoffPath),assuranceRun:read(assuranceRunPath),assuranceAuditJob:read(auditJobPath),
    assuranceArtifact:read(assuranceArtifactPath),auditReceipt:read(auditPath),assuranceArchive:read(archivePath),
    currentMainSha:fs.readFileSync(mainShaPath,'utf8').trim()});
  fs.writeFileSync(outputPath,`${JSON.stringify(result,null,2)}\n`,{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({state:result.state,assurance_run_id:result.assurance_run_id,
    proof_producer_run_id:result.proof_producer_run_id,receipt_digest:result.receipt_digest})+'\n');
}
