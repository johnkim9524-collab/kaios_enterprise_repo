import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {verifyTerminalRecoveryProofAdmission} from '../../../scripts/kidults/kpmo/lib/terminal-recovery-proof-admission-v1.mjs';

const repository='johnkim9524-collab/kaios_enterprise_repo',sha='a'.repeat(40),runId=90;
const d='sha256:'+'c'.repeat(64);
function seal(value){return {...value,receipt_digest:sha256(canonicalJson(value))};}
function fixture(){
  const proof=seal({receipt_id:'kpmo-deferred-assurance-runtime-proof-gate-v1',version:'1.0.0',state:'VERIFIED_PASS',repository,
    source_sha:sha,current_protected_main_sha:sha,assurance_run_id:201,assurance_run_attempt:1,assurance_audit_job_id:202,
    assurance_audit_receipt_digest:d,assurance_artifact_id:203,assurance_artifact_digest:d,assurance_archive_digest:d,
    assurance_archive_readback:'PASS',proof_producer_run_id:80,proof_producer_run_attempt:1,proof_artifact_id:204,
    proof_artifact_digest:d,producer_health_run_id:205,producer_health_run_attempt:1,producer_health_artifact_id:206,
    producer_health_artifact_digest:d,producer_health_receipt_digest:d,proof_receipt_digest:d,handoff_receipt_digest:d,
    scope:'CORE_FOUR_CONTENT',verified_domain_count:4,required_domain_count:4,whole_platform_authority:false,
    promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'});
  const proofText=JSON.stringify(proof),proofDigest=`sha256:${createHash('sha256').update(proofText).digest('hex')}`;
  const artifactDigest='sha256:'+'b'.repeat(64),memberName='kpmo-deferred-assurance-runtime-proof-gate-v1.json';
  return {event:{action:'completed',workflow_run:{id:runId,name:'KPMO Continuous Assurance Success Authority Gate V1',
      path:'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml',status:'completed',conclusion:'success',
      run_attempt:1,head_sha:sha,head_branch:'main',repository:{full_name:repository,id:1281328888},head_repository:{full_name:repository}}},
    jobsResponse:{total_count:1,jobs:[{id:91,run_id:runId,run_attempt:1,name:'deferred-runtime-proof-handoff-gate',status:'completed',conclusion:'success',
      steps:[{name:'Require exact autonomous Assurance proof closure',status:'completed',conclusion:'success'}]}]},
    artifactsResponse:{total_count:1,artifacts:[{id:92,name:`kpmo-deferred-assurance-runtime-proof-gate-${sha}-80-1`,digest:artifactDigest,expired:false,workflow_run:{id:runId,head_sha:sha}}]},
    proofPacket:{archive_digest:artifactDigest,members:[{name:memberName,encoding:'utf-8',text:proofText,sha256:proofDigest}],
      member_sha256s:{[memberName]:proofDigest}}};
}
test('admits only an exact successful proof-handoff gate before credentials',()=>{
  const r=verifyTerminalRecoveryProofAdmission(fixture());assert.equal(r.state,'PROOF_HANDOFF_ADMITTED_NOT_AUTHORITY');
  assert.equal(r.proof_handoff_job_id,91);assert.equal(r.proof_artifact_id,92);assert.equal(r.reservation_write_performed,false);
  assert.equal(r.verified_proof_receipt_state,'VERIFIED_PASS');
});
for(const [name,mutate,pattern] of [
  ['missing handoff',f=>{f.jobsResponse.jobs[0].conclusion='skipped';},/HANDOFF_JOB/],
  ['missing exact closure step',f=>{f.jobsResponse.jobs[0].steps[0].conclusion='failure';},/HANDOFF_CLOSURE_STEP/],
  ['missing proof artifact',f=>{f.artifactsResponse.artifacts=[];f.artifactsResponse.total_count=0;},/PROOF_ARTIFACT/],
  ['foreign proof artifact source',f=>{f.artifactsResponse.artifacts[0].workflow_run.head_sha='c'.repeat(40);},/PROOF_ARTIFACT/],
  ['NOT_APPLICABLE proof receipt',f=>{const p=JSON.parse(f.proofPacket.members[0].text);p.state='NOT_APPLICABLE';const body=Object.fromEntries(Object.entries(p).filter(([k])=>k!=='receipt_digest'));p.receipt_digest=sha256(canonicalJson(body));f.proofPacket.members[0].text=JSON.stringify(p);},/PROOF_RECEIPT_SCHEMA_OR_BINDING/],
  ['tampered proof receipt digest',f=>{const p=JSON.parse(f.proofPacket.members[0].text);p.receipt_digest='sha256:'+'d'.repeat(64);f.proofPacket.members[0].text=JSON.stringify(p);},/PROOF_RECEIPT_DIGEST/],
  ['archive digest mismatch',f=>{f.proofPacket.archive_digest='sha256:'+'d'.repeat(64);},/PROOF_ARCHIVE_BINDING/],
  ['producer run artifact-name mismatch',f=>{f.artifactsResponse.artifacts[0].name=`kpmo-deferred-assurance-runtime-proof-gate-${sha}-81-1`;},/PROOF_RECEIPT_SCHEMA_OR_BINDING/],
  ['wrong source workflow path',f=>{f.event.workflow_run.path='other.yml';},/UPSTREAM_BINDING/],
  ['non-success gate',f=>{f.event.workflow_run.conclusion='failure';},/UPSTREAM_BINDING/],
])test(name+' fails closed before credentials',()=>{const f=fixture();mutate(f);assert.throws(()=>verifyTerminalRecoveryProofAdmission(f),pattern);});
