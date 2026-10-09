import {canonicalJson,sha256} from './canonical-json-v1.mjs';
import {coverageGenerationId} from '../validate-kir-coverage-assurance-continuation-v1.mjs';
const REPO='johnkim9524-collab/kaios_enterprise_repo';
const PATH='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
const COVERAGE='.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const fail=code=>{throw new Error(`SENTINEL_CONTINUATION_${code}`);};
// archivePacket is produced only by the digest-checking bounded ZIP reader.
// Caller must obtain native run/artifact metadata from the canonical API.
export function verifyAuthenticatedSentinelContinuation({run,artifact,archivePacket,sourceSha,repository=REPO}){
  if(repository!==REPO||run?.repository?.full_name!==repository||run?.head_repository?.full_name!==repository||
    run?.path!==PATH||run?.head_sha!==sourceSha||! /^[a-f0-9]{40}$/.test(sourceSha||'')||run?.head_branch!=='main'||
    run?.event!=='workflow_dispatch'||!positive(run?.id)||run?.run_attempt!==1)fail('NATIVE_RUN');
  if(!positive(artifact?.id)||artifact.expired!==false||artifact.name!==`kpmo-continuous-assurance-sentinel-health-v1-${sourceSha}-${run.id}-1`||
    artifact.workflow_run?.id!==run.id||artifact.workflow_run?.head_sha!==sourceSha||!DIGEST.test(artifact.digest||'')||archivePacket?.archive_digest!==artifact.digest)fail('ARTIFACT');
  if(!Array.isArray(archivePacket.members)||archivePacket.members.length<1||archivePacket.members.length>512)fail('ARCHIVE');
  const members=archivePacket.members.filter(x=>x.name?.split('/').at(-1)==='kpmo-continuous-assurance-sentinel-health-v1.json');
  if(members.length!==1||members[0].encoding!=='utf-8'||typeof members[0].text!=='string'||members[0].sha256!==sha256(members[0].text))fail('MEMBER');
  let receipt;try{receipt=JSON.parse(members[0].text);}catch{fail('JSON');}
  const unsigned={...receipt};delete unsigned.receipt_digest;
  if(!DIGEST.test(receipt.receipt_digest||'')||receipt.receipt_digest!==sha256(canonicalJson(unsigned)))fail('RECEIPT_DIGEST');
  if(receipt.receipt_id!=='kpmo-continuous-assurance-sentinel-health-v1'||receipt.repository!==repository||receipt.source_sha!==sourceSha||
    receipt.observer_run_id!==run.id||receipt.observer_run_attempt!==run.run_attempt||receipt.whole_platform_authority!==false||
    receipt.promotion_eligible!==false||receipt.public!=='HOLD'||receipt.production!=='HOLD'||receipt.g5!=='HOLD')fail('RECEIPT_BINDING');
  const b=receipt.continuation_binding;
  if(!b)return null; // A genuine manual recovery archive is not a continuation.
  if(b.slot!=='SENTINEL_CHAIN'||b.exact_main_sha!==sourceSha||b.path!==COVERAGE||b.coverage_workflow_path!==COVERAGE||
    !positive(b.upstream_run_id)||!positive(b.upstream_run_attempt)||b.run_id!==b.upstream_run_id||b.run_attempt!==b.upstream_run_attempt||
    !['workflow_run','workflow_dispatch'].includes(b.upstream_event)||!positive(b.continuation_artifact_id)||
    !DIGEST.test(b.continuation_artifact_digest||'')||!DIGEST.test(b.continuation_key||'')||
    b.generation_id!==coverageGenerationId({sourceSha,runId:b.upstream_run_id,runAttempt:b.upstream_run_attempt}))fail('BINDING');
  return {state:'VERIFIED_PASS',run_id:run.id,run_attempt:run.run_attempt,artifact_id:artifact.id,artifact_digest:artifact.digest,
    sentinel_receipt_digest:receipt.receipt_digest,continuation_binding:b};
}
