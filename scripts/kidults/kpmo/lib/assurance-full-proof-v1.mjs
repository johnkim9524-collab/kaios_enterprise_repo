import {verifyAuthenticatedSentinelContinuation} from './authenticated-sentinel-continuation-v1.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';

const fail=(code,detail='')=>{throw new Error(`ASSURANCE_FULL_PROOF_${code}${detail?`:${detail}`:''}`);};
const isId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const runtimeContract=()=>JSON.parse(fs.readFileSync(new URL('../../../../coordination/kidults/kpmo/whole-platform-operating-proof-v1.json',import.meta.url),'utf8'));
const sameSet=(left,right)=>Array.isArray(left)&&Array.isArray(right)
  &&new Set(left).size===left.length&&new Set(right).size===right.length
  &&JSON.stringify([...left].sort())===JSON.stringify([...right].sort());
const verifyDigest=(value,excluded=[])=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const body=Object.fromEntries(Object.entries(value).filter(([key])=>!excluded.includes(key)));
  return value.receipt_digest===sha256(canonicalJson(body));
};

export function verifyAssuranceRuntimeReadiness(proof, sourceSha, contract=runtimeContract()) {
  const ids=contract?.value_chain_dimensions;
  const sources=contract?.runtime_domain_sources;
  if(contract?.id!=='kidults-whole-platform-operating-proof-v1'
    ||contract?.runtime_domain_registry_required_count!==14
    ||!Array.isArray(ids)||ids.length!==14||new Set(ids).size!==14
    ||!Array.isArray(sources)||!sameSet(sources.map(x=>x.domain_id),ids))fail('RUNTIME_CONTRACT_DOMAIN_SET');
  if(proof?.id!=='kidults-whole-platform-operating-proof-v1'||proof?.source_sha!==sourceSha
    ||proof?.repository!=='johnkim9524-collab/kaios_enterprise_repo'
    ||proof?.assurance_runtime_readiness_proven!==true
    ||proof?.assurance_runtime_readiness?.state!=='VERIFIED_PASS'
    ||proof?.assurance_runtime_readiness?.verified_domain_count!==14
    ||proof?.assurance_runtime_readiness?.required_domain_count!==14
    ||proof?.runtime_domain_registry?.state!=='VERIFIED_PASS'
    ||proof?.runtime_domain_registry?.registered_domain_count!==14
    ||proof?.runtime_domain_registry?.required_domain_count!==14
    ||!sameSet(proof?.assurance_runtime_readiness?.domain_ids,ids)
    ||!verifyDigest(proof,['receipt_digest']))fail('RUNTIME_READINESS_RECEIPT',
      `verified=${proof?.assurance_runtime_readiness?.verified_domain_count??'missing'},required=${proof?.assurance_runtime_readiness?.required_domain_count??'missing'},registered=${proof?.runtime_domain_registry?.registered_domain_count??'missing'}`);
  if(!Array.isArray(proof.value_chain)||proof.value_chain.length!==14
    ||!sameSet(proof.value_chain.map(x=>x.id),ids)
    ||proof.value_chain.some(x=>x.runtime_state!=='VERIFIED_PASS'
      ||!/^sha256:[a-f0-9]{64}$/.test(x.runtime_receipt_digest||'')))fail('RUNTIME_DOMAIN_SET');
  for(const domain of proof.value_chain){
    const source=sources.find(x=>x.domain_id===domain.id);
    if(typeof source.workflow!=='string'||!/^[-a-zA-Z0-9_.]+\.yml$/.test(source.workflow)
      ||!isId(domain.run_id)||!Array.isArray(proof.protected_evidence))fail('RUNTIME_DOMAIN_PRODUCER_BINDING');
    const matches=proof.protected_evidence.filter(x=>x.workflow_path===`.github/workflows/${source.workflow}`
      &&String(x.run_id)===String(domain.run_id)&&Number(x.run_attempt)===1&&x.source_sha===sourceSha
      &&isId(x.artifact_id)&&/^sha256:[a-f0-9]{64}$/.test(x.artifact_digest||''));
    if(matches.length!==1)fail('RUNTIME_DOMAIN_PRODUCER_BINDING',domain.id);
  }
  return {state:'VERIFIED_PASS', verified_domain_count:14};
}

// The control plane consumes every connected domain, without promoting absent business inputs.
export function verifyAutonomousRuntimeReadiness(proof, sourceSha, contract=runtimeContract()) {
  const policy=contract?.autonomous_operating_readiness;
  const ids=contract?.value_chain_dimensions, sources=contract?.runtime_domain_sources;
  if(contract?.id!=='kidults-whole-platform-operating-proof-v1'||contract.runtime_domain_registry_required_count!==14
    ||!Array.isArray(ids)||ids.length!==14||new Set(ids).size!==14
    ||!Array.isArray(sources)||sources.length<1||sources.length>14
    ||new Set(sources.map(x=>x.domain_id)).size!==sources.length||sources.some(x=>!ids.includes(x.domain_id))
    ||policy?.scope!=='AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM'
    ||!sameSet(policy.mandatory_runtime_domains,['SECURITY_SUPPLY_CHAIN'])
    ||policy.connected_registered_domains_required!==true||policy.unregistered_domains_block_autonomy!==false
    ||policy.unregistered_domains_are_pass!==false||policy.whole_platform_completion_requires_all_14_domains!==true
    ||policy.business_domain_activation_requires_authenticated_receipt!==true
    ||!sameSet(policy.required_operating_checks,['CORE_FOUR_CONTENT','DISTINCT_NATURAL_GENERATIONS','NATURAL_CHAIN_TERMINALS',
      'PROTECTED_LANDING','AWS_CONFIGURATION_AND_IMMUTABILITY','NATIVE_DISPATCH','NATIVE_RESUME_REUSE','FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL'])
    ||policy.mandatory_runtime_domains.some(id=>!sources.some(x=>x.domain_id===id)))fail('AUTONOMOUS_RUNTIME_CONTRACT');
  const required=sources.map(x=>x.domain_id), readiness=proof?.autonomous_runtime_readiness;
  if(proof?.id!==contract.id||proof?.source_sha!==sourceSha
    ||proof?.repository!==contract.repository||!verifyDigest(proof,['receipt_digest'])
    ||!Array.isArray(proof.value_chain)||!sameSet(proof.value_chain.map(x=>x.id),ids)
    ||proof.runtime_domain_registry?.registered_domain_count!==required.length
    ||proof.runtime_domain_registry?.required_domain_count!==14
    ||proof.autonomous_runtime_readiness_proven!==true||readiness?.state!=='VERIFIED_PASS'
    ||readiness.scope!==policy.scope||readiness.required_domain_count!==required.length
    ||readiness.verified_domain_count!==required.length||!sameSet(readiness.domain_ids,required)
    ||!sameSet(readiness.deferred_domain_ids,ids.filter(id=>!required.includes(id))))fail('AUTONOMOUS_RUNTIME_READINESS');
  for(const registration of sources){
    const domain=proof.value_chain.find(x=>x.id===registration.domain_id);
    if(domain.runtime_state!=='VERIFIED_PASS'||!/^sha256:[a-f0-9]{64}$/.test(domain.runtime_receipt_digest||''))fail('AUTONOMOUS_RUNTIME_DOMAIN',domain.id);
    if(!/^[-a-zA-Z0-9_.]+\.yml$/.test(registration.workflow||'')||!isId(domain.run_id)
      ||!Array.isArray(proof.protected_evidence))fail('AUTONOMOUS_RUNTIME_PRODUCER_BINDING');
    const matches=proof.protected_evidence.filter(x=>x.workflow_path===`.github/workflows/${registration.workflow}`
      &&String(x.run_id)===String(domain.run_id)&&Number(x.run_attempt)===1&&x.source_sha===sourceSha
      &&isId(x.artifact_id)&&/^sha256:[a-f0-9]{64}$/.test(x.artifact_digest||''));
    if(matches.length!==1)fail('AUTONOMOUS_RUNTIME_PRODUCER_BINDING',domain.id);
  }
  // Deferred entries remain explicit non-PASS observations. Registration activates their gate.
  if(proof.value_chain.some(x=>!required.includes(x.id)&&x.runtime_state==='VERIFIED_PASS'))fail('AUTONOMOUS_UNREGISTERED_PASS');
  return {state:'VERIFIED_PASS',scope:policy.scope,verified_domain_count:required.length,
    required_domain_count:required.length,deferred_domain_ids:readiness.deferred_domain_ids,
    whole_platform_authority:false,promotion_eligible:false};
}

export function verifyAssuranceReadiness({audit,proof,assuranceRun,auditJob,sourceSha,sentinel,archivePacket,archiveReceipt,assuranceArtifact,runtimeDomainContract,sentinelContinuationEvidence,runtimeScope='WHOLE_PLATFORM'}){
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
  if(!['WHOLE_PLATFORM','AUTONOMOUS_CONTROL_PLANE'].includes(runtimeScope))fail('RUNTIME_SCOPE');
  const runtimeReadiness=runtimeScope==='AUTONOMOUS_CONTROL_PLANE'
    ?verifyAutonomousRuntimeReadiness(proof,sourceSha,runtimeDomainContract)
    :verifyAssuranceRuntimeReadiness(proof,sourceSha,runtimeDomainContract);
  const upstream=audit.execution.upstream;
  let continuation=null;
  if(upstream?.workflow_event==='workflow_dispatch'){
    if(!sentinelContinuationEvidence)fail('AUDIT_SENTINEL_CAUSAL_BINDING');
    continuation=verifyAuthenticatedSentinelContinuation({...sentinelContinuationEvidence,sourceSha});
    if(!continuation||continuation.run_id!==Number(sentinel?.run_id)||continuation.run_attempt!==Number(sentinel?.run_attempt)||
      continuation.artifact_id!==Number(sentinel?.artifact_id)||continuation.artifact_digest!==sentinel?.artifact_digest||
      sentinelContinuationEvidence.run.status!=='completed'||sentinelContinuationEvidence.run.conclusion!=='success')fail('SENTINEL_CONTINUATION');
  }
  if(assuranceRun.event!=='workflow_run'||audit.execution.trigger!=='workflow_run'
    ||String(upstream?.run_id)!==String(sentinel?.run_id)
    ||Number(upstream?.run_attempt)!==Number(sentinel?.run_attempt)
    ||upstream?.repository!=='johnkim9524-collab/kaios_enterprise_repo'
    ||upstream?.head_branch!=='main'||upstream?.workflow_path!==sentinelPath
    ||upstream?.workflow_name!=='KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1'
    ||(!['workflow_run','repository_dispatch','schedule'].includes(upstream?.workflow_event)&&!continuation)
    ||upstream?.conclusion!=='success')fail('AUDIT_SENTINEL_CAUSAL_BINDING');
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
    verified_domain_count:runtimeReadiness.verified_domain_count,
    required_domain_count:runtimeReadiness.required_domain_count??14,
    scope:runtimeReadiness.scope??'WHOLE_PLATFORM_RUNTIME_DOMAINS',
    deferred_domain_ids:runtimeReadiness.deferred_domain_ids??[],
    whole_platform_authority:false,promotion_eligible:false,sentinel_run_id:Number(sentinel.run_id),sentinel_run_attempt:1,
    sentinel_artifact_id:Number(sentinel.artifact_id),sentinel_artifact_digest:sentinel.artifact_digest,
    sentinel_continuation:continuation,production:'HOLD',public:'HOLD',g5:'HOLD'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [auditPath,proofPath,runPath,jobPath,sentinelPath,packetPath,archiveReceiptPath,artifactPath,continuationPath]=process.argv.slice(2);
  if(![auditPath,proofPath,runPath,jobPath,sentinelPath,packetPath,archiveReceiptPath,artifactPath].every(Boolean))fail('CLI_ARGUMENTS');
  const result=verifyAssuranceReadiness({
    audit:JSON.parse(fs.readFileSync(auditPath,'utf8')),proof:JSON.parse(fs.readFileSync(proofPath,'utf8')),
    assuranceRun:JSON.parse(fs.readFileSync(runPath,'utf8')),auditJob:JSON.parse(fs.readFileSync(jobPath,'utf8')),
    runtimeScope:'AUTONOMOUS_CONTROL_PLANE',sourceSha:process.env.UPSTREAM_SHA,sentinel:JSON.parse(fs.readFileSync(sentinelPath,'utf8')),
    archivePacket:JSON.parse(fs.readFileSync(packetPath,'utf8')),
    archiveReceipt:JSON.parse(fs.readFileSync(archiveReceiptPath,'utf8')),
    assuranceArtifact:JSON.parse(fs.readFileSync(artifactPath,'utf8')),
    sentinelContinuationEvidence:continuationPath?JSON.parse(fs.readFileSync(continuationPath,'utf8')):undefined});
  process.stdout.write(JSON.stringify(result)+'\n');
}
