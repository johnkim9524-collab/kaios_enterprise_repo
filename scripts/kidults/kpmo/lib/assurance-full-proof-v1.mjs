import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';

const fail=(code)=>{throw new Error(`ASSURANCE_FULL_PROOF_${code}`);};
const isId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const verifyDigest=(value,excluded=[])=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const body=Object.fromEntries(Object.entries(value).filter(([key])=>!excluded.includes(key)));
  return value.receipt_digest===sha256(canonicalJson(body));
};

export function verifyAssuranceReadiness({audit,proof,assuranceRun,auditJob,sourceSha,sentinel,archivePacket,archiveReceipt,assuranceArtifact}){
  const assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
  const sentinelPath='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
  if(!/^[a-f0-9]{40}$/.test(sourceSha))fail('SOURCE_SHA');
  if(assuranceRun?.path!==assurancePath||assuranceRun?.head_sha!==sourceSha
    ||assuranceRun?.head_branch!=='main'||assuranceRun?.status!=='completed'
    ||assuranceRun?.conclusion!=='success'||assuranceRun?.run_attempt!==Number(sentinel.assurance_attempt)
    ||assuranceRun?.repository?.full_name!=='johnkim9524-collab/kaios_enterprise_repo')fail('ASSURANCE_RUN_BINDING');
  if(auditJob?.name!=='audit'||auditJob?.status!=='completed'||auditJob?.conclusion!=='success'
    ||String(auditJob?.run_id)!==String(assuranceRun.id)
    ||Number(auditJob?.run_attempt)!==Number(assuranceRun.run_attempt))fail('AUDIT_JOB');
  const archiveAuditMembers=(archivePacket?.members||[]).filter(x=>x.encoding==='utf-8'&&x.name.split('/').at(-1)==='audit-receipt.json');
  const archiveProofMembers=(archivePacket?.members||[]).filter(x=>x.encoding==='utf-8'&&x.name.split('/').at(-1)==='whole-platform-operating-proof-v1.json');
  if(!isId(assuranceArtifact?.id)||!/^sha256:[a-f0-9]{64}$/.test(assuranceArtifact?.digest||'')
    ||archivePacket?.archive_digest!==assuranceArtifact.digest||!Array.isArray(archivePacket?.members)
    ||archivePacket.members.length<1||archivePacket.members.length>512
    ||archiveAuditMembers.length!==1||archiveProofMembers.length!==1)fail('ARCHIVE_PACKET');
  if(archiveReceipt?.receipt_type!=='KPMO_ASSURANCE_ARCHIVE_VALIDATION'
    ||archiveReceipt?.state!=='VERIFIED_PASS'||archiveReceipt?.readback_verified!==true
    ||archiveReceipt?.source_sha!==sourceSha||String(archiveReceipt?.assurance_run_id)!==String(assuranceRun.id)
    ||Number(archiveReceipt?.assurance_run_attempt)!==Number(assuranceRun.run_attempt)
    ||String(archiveReceipt?.artifact_id)!==String(assuranceArtifact.id)
    ||archiveReceipt?.artifact_digest!==assuranceArtifact.digest||archiveReceipt?.archive_digest!==archivePacket.archive_digest
    ||!Number.isSafeInteger(archiveReceipt?.archive_size_bytes)||archiveReceipt.archive_size_bytes<1
    ||archiveReceipt.archive_size_bytes>8*1024*1024||archiveReceipt?.member_count!==archivePacket.members.length
    ||archiveReceipt?.audit_receipt_count!==1||archiveReceipt?.runtime_proof_count!==1
    ||archiveReceipt?.audit_receipt_archive_member_digest!==archiveAuditMembers[0].sha256
    ||archiveReceipt?.runtime_proof_archive_member_digest!==archiveProofMembers[0].sha256
    ||!verifyDigest(archiveReceipt,['receipt_digest']))fail('ARCHIVE_VALIDATION_RECEIPT');
  if(audit?.receipt_type!=='KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE'
    ||audit?.source?.sha!==sourceSha||audit?.source?.actual_sha!==sourceSha
    ||audit?.source?.expected_sha!==sourceSha||audit?.source?.match!==true
    ||String(audit?.execution?.workflow_run_id)!==String(assuranceRun.id)
    ||String(audit?.execution?.workflow_run_attempt)!==String(assuranceRun.run_attempt)
    ||audit?.states?.internal_control_state!=='VERIFIED_PASS'
    ||!verifyDigest(audit,['receipt_digest','observed_at']))fail('AUDIT_RECEIPT');
  if(proof?.id!=='kidults-whole-platform-operating-proof-v1'||proof?.source_sha!==sourceSha
    ||proof?.repository!=='johnkim9524-collab/kaios_enterprise_repo'
    ||proof?.assurance_runtime_readiness_proven!==true
    ||proof?.assurance_runtime_readiness?.state!=='VERIFIED_PASS'
    ||proof?.assurance_runtime_readiness?.verified_domain_count!==14
    ||proof?.assurance_runtime_readiness?.required_domain_count!==14
    ||!verifyDigest(proof,['receipt_digest']))fail('RUNTIME_READINESS_RECEIPT');
  if(!Array.isArray(proof.value_chain)||proof.value_chain.length!==14
    ||new Set(proof.value_chain.map(x=>x.id)).size!==14
    ||proof.value_chain.some(x=>x.runtime_state!=='VERIFIED_PASS'
      ||!/^sha256:[a-f0-9]{64}$/.test(x.runtime_receipt_digest||'')))fail('RUNTIME_DOMAIN_SET');
  if(!isId(sentinel?.run_id)||Number(sentinel?.run_attempt)!==1
    ||!isId(sentinel?.artifact_id)||!/^sha256:[a-f0-9]{64}$/.test(sentinel?.artifact_digest||''))fail('SENTINEL_INPUT');
  const bindings=(proof.protected_evidence||[]).filter(x=>x.workflow_path===sentinelPath
    &&String(x.run_id)===String(sentinel.run_id)&&Number(x.run_attempt)===1
    &&x.source_sha===sourceSha&&String(x.artifact_id)===String(sentinel.artifact_id)
    &&x.artifact_digest===sentinel.artifact_digest);
  if(bindings.length!==1)fail('SENTINEL_BINDING');
  return {state:'VERIFIED_PASS',source_sha:sourceSha,assurance_run_id:Number(assuranceRun.id),
    assurance_run_attempt:Number(assuranceRun.run_attempt),audit_job_id:Number(auditJob.id),
    audit_receipt_digest:audit.receipt_digest,runtime_proof_digest:proof.receipt_digest,
    archive_validation_receipt_digest:archiveReceipt.receipt_digest,
    verified_domain_count:14,sentinel_run_id:Number(sentinel.run_id),sentinel_run_attempt:1,
    sentinel_artifact_id:Number(sentinel.artifact_id),sentinel_artifact_digest:sentinel.artifact_digest,
    production:'HOLD',public:'HOLD',g5:'HOLD'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [auditPath,proofPath,runPath,jobPath,sentinelPath,packetPath,archiveReceiptPath,artifactPath]=process.argv.slice(2);
  if(![auditPath,proofPath,runPath,jobPath,sentinelPath,packetPath,archiveReceiptPath,artifactPath].every(Boolean))fail('CLI_ARGUMENTS');
  const result=verifyAssuranceReadiness({
    audit:JSON.parse(fs.readFileSync(auditPath,'utf8')),proof:JSON.parse(fs.readFileSync(proofPath,'utf8')),
    assuranceRun:JSON.parse(fs.readFileSync(runPath,'utf8')),auditJob:JSON.parse(fs.readFileSync(jobPath,'utf8')),
    sourceSha:process.env.UPSTREAM_SHA,sentinel:JSON.parse(fs.readFileSync(sentinelPath,'utf8')),
    archivePacket:JSON.parse(fs.readFileSync(packetPath,'utf8')),
    archiveReceipt:JSON.parse(fs.readFileSync(archiveReceiptPath,'utf8')),
    assuranceArtifact:JSON.parse(fs.readFileSync(artifactPath,'utf8'))});
  process.stdout.write(JSON.stringify(result)+'\n');
}
