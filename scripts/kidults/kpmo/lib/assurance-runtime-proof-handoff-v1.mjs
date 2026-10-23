import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';

const fail=(code)=>{throw new Error(`ASSURANCE_PROOF_HANDOFF_${code}`);};
const validId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const validDigest=value=>/^sha256:[a-f0-9]{64}$/.test(value||'');

export function createAssuranceRuntimeProofHandoff({proof,assuranceRun,assuranceAudit,assuranceArtifact,producerRun,repository='johnkim9524-collab/kaios_enterprise_repo'}){
  if(repository!=='johnkim9524-collab/kaios_enterprise_repo'||assuranceRun?.repository?.full_name!==repository
    ||assuranceRun?.path!=='.github/workflows/kidults-platform-continuous-assurance-v1.yml'
    ||assuranceRun?.head_branch!=='main'||assuranceRun?.status!=='completed'||assuranceRun?.conclusion!=='success'
    ||!validId(assuranceRun.id)||!validId(assuranceRun.run_attempt)||!/^([a-f0-9]{40})$/.test(assuranceRun.head_sha||''))fail('ASSURANCE_RUN');
  if(assuranceAudit?.receipt_type!=='KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE'
    ||assuranceAudit?.source?.sha!==assuranceRun.head_sha||assuranceAudit?.source?.actual_sha!==assuranceRun.head_sha
    ||assuranceAudit?.source?.expected_sha!==assuranceRun.head_sha||assuranceAudit?.source?.match!==true
    ||String(assuranceAudit?.execution?.workflow_run_id)!==String(assuranceRun.id)
    ||Number(assuranceAudit?.execution?.workflow_run_attempt)!==Number(assuranceRun.run_attempt)
    ||!validDigest(assuranceAudit.receipt_digest))fail('AUDIT_BINDING');
  if(!validId(assuranceArtifact?.id)||!validDigest(assuranceArtifact?.digest)
    ||assuranceArtifact?.expired!==false||String(assuranceArtifact?.workflow_run?.id)!==String(assuranceRun.id)
    ||assuranceArtifact?.workflow_run?.head_sha!==assuranceRun.head_sha)fail('ASSURANCE_ARTIFACT');
  if(producerRun?.path!=='.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml'
    ||producerRun?.head_sha!==assuranceRun.head_sha||producerRun?.head_branch!=='main'
    ||producerRun?.event!=='workflow_run'||!validId(producerRun.id)||!validId(producerRun.run_attempt))fail('PRODUCER_RUN');
  if(proof?.id!=='kidults-whole-platform-operating-proof-v1'||proof?.repository!==repository
    ||proof?.source_sha!==assuranceRun.head_sha||proof?.autonomous_runtime_readiness_proven!==true
    ||proof?.autonomous_runtime_readiness?.state!=='VERIFIED_PASS'
    ||proof?.autonomous_runtime_readiness?.scope!=='AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM'
    ||proof?.autonomous_runtime_readiness?.verified_domain_count!==1
    ||proof?.autonomous_runtime_readiness?.required_domain_count!==1
    ||!validDigest(proof.receipt_digest))fail('PROOF_BINDING');
  const unsignedProof=Object.fromEntries(Object.entries(proof).filter(([key])=>key!=='receipt_digest'));
  if(proof.receipt_digest!==sha256(canonicalJson(unsignedProof)))fail('PROOF_DIGEST');
  const body={receipt_type:'KPMO_ASSURANCE_RUNTIME_PROOF_HANDOFF',version:'1.0.0',state:'VERIFIED_PASS',
    repository,source_sha:assuranceRun.head_sha,
    assurance:{run_id:Number(assuranceRun.id),run_attempt:Number(assuranceRun.run_attempt),workflow_path:assuranceRun.path,
      event:assuranceRun.event,audit_receipt_digest:assuranceAudit.receipt_digest,
      artifact_id:Number(assuranceArtifact.id),artifact_digest:assuranceArtifact.digest},
    producer:{run_id:Number(producerRun.id),run_attempt:Number(producerRun.run_attempt),workflow_path:producerRun.path,
      event:producerRun.event},proof_receipt_digest:proof.receipt_digest,
    promotion_eligible:false,whole_platform_authority:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
  return {...body,receipt_digest:sha256(canonicalJson(body))};
}

export function verifyAssuranceRuntimeProofHandoff({handoff,proof,assuranceRun,assuranceAudit,assuranceArtifact,producerRun,repository}){
  if(!handoff||typeof handoff!=='object'||handoff.receipt_type!=='KPMO_ASSURANCE_RUNTIME_PROOF_HANDOFF'
    ||handoff.state!=='VERIFIED_PASS'||!validDigest(handoff.receipt_digest))fail('RECEIPT');
  const expected=createAssuranceRuntimeProofHandoff({proof,assuranceRun,assuranceAudit,assuranceArtifact,producerRun,repository});
  if(canonicalJson(handoff)!==canonicalJson(expected))fail('RECEIPT_BINDING');
  return {state:'VERIFIED_PASS',assurance_run_id:expected.assurance.run_id,
    producer_run_id:expected.producer.run_id,proof_receipt_digest:expected.proof_receipt_digest,
    receipt_digest:expected.receipt_digest,promotion_eligible:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [proofPath,assuranceRunPath,auditPath,artifactPath,outputPath]=process.argv.slice(2);
  if(![proofPath,assuranceRunPath,auditPath,artifactPath,outputPath].every(Boolean))fail('CLI_ARGUMENTS');
  const result=createAssuranceRuntimeProofHandoff({proof:JSON.parse(fs.readFileSync(proofPath,'utf8')),
    assuranceRun:JSON.parse(fs.readFileSync(assuranceRunPath,'utf8')),
    assuranceAudit:JSON.parse(fs.readFileSync(auditPath,'utf8')),
    assuranceArtifact:JSON.parse(fs.readFileSync(artifactPath,'utf8')),
    producerRun:{id:process.env.GITHUB_RUN_ID,run_attempt:process.env.GITHUB_RUN_ATTEMPT,
      path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',
      head_sha:process.env.KPMO_SOURCE_SHA,head_branch:process.env.GITHUB_REF_NAME,event:process.env.GITHUB_EVENT_NAME}});
  fs.writeFileSync(outputPath,`${JSON.stringify(result,null,2)}\n`,{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({state:result.state,assurance_run_id:result.assurance.run_id,
    producer_run_id:result.producer.run_id,proof_receipt_digest:result.proof_receipt_digest})+'\n');
}
