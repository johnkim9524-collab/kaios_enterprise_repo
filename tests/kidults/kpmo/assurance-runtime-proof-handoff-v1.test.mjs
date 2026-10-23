import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {createAssuranceRuntimeProofHandoff,verifyAssuranceRuntimeProofHandoff} from '../../../scripts/kidults/kpmo/lib/assurance-runtime-proof-handoff-v1.mjs';

const source='a'.repeat(40),digest='sha256:'+'b'.repeat(64);
const seal=value=>({...value,receipt_digest:sha256(canonicalJson(value))});
function fixture(){
  const assuranceRun={id:100,run_attempt:1,path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',
    head_sha:source,head_branch:'main',status:'completed',conclusion:'success',event:'workflow_run',
    repository:{full_name:'johnkim9524-collab/kaios_enterprise_repo'}};
  const assuranceAudit=seal({receipt_type:'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',source:{sha:source,actual_sha:source,
    expected_sha:source,match:true},execution:{workflow_run_id:'100',workflow_run_attempt:'1'}});
  const assuranceArtifact={id:200,digest,expired:false,workflow_run:{id:100,head_sha:source}};
  const producerRun={id:300,run_attempt:1,path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',
    head_sha:source,head_branch:'main',event:'workflow_run'};
  const proof=seal({id:'kidults-whole-platform-operating-proof-v1',repository:'johnkim9524-collab/kaios_enterprise_repo',source_sha:source,
    autonomous_runtime_readiness_proven:true,autonomous_runtime_readiness:{state:'VERIFIED_PASS',
      scope:'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM',verified_domain_count:1,required_domain_count:1}});
  return {assuranceRun,assuranceAudit,assuranceArtifact,producerRun,proof};
}

test('binds the later KPMO proof to its exact successful Assurance parent and source artifact',()=>{
  const result=createAssuranceRuntimeProofHandoff(fixture());
  assert.equal(result.state,'VERIFIED_PASS');
  assert.equal(result.assurance.run_id,100);
  assert.equal(result.assurance.artifact_digest,digest);
  assert.equal(result.producer.run_id,300);
  assert.equal(result.proof_receipt_digest,fixture().proof.receipt_digest);
  assert.equal(result.promotion_eligible,false);
  assert.equal(result.receipt_digest,sha256(canonicalJson(Object.fromEntries(Object.entries(result).filter(([k])=>k!=='receipt_digest')))));
});

test('rejects producer or source artifact drift instead of borrowing another run proof',()=>{
  for(const mutate of [
    f=>{f.producerRun.head_sha='c'.repeat(40);},
    f=>{f.assuranceArtifact.workflow_run.id=101;},
    f=>{f.assuranceArtifact.expired=true;},
    f=>{f.assuranceRun.conclusion='failure';},
    f=>{f.proof.source_sha='c'.repeat(40);},
    f=>{f.proof.receipt_digest=digest;},
  ]){
    const f=fixture();mutate(f);
    assert.throws(()=>createAssuranceRuntimeProofHandoff(f),/ASSURANCE_PROOF_HANDOFF_/);
  }
});

test('rejects a missing successful audit binding or noncanonical producer workflow',()=>{
  const missingAudit=fixture();missingAudit.assuranceAudit.execution.workflow_run_id='999';
  assert.throws(()=>createAssuranceRuntimeProofHandoff(missingAudit),/ASSURANCE_PROOF_HANDOFF_AUDIT_BINDING/);
  const wrongProducer=fixture();wrongProducer.producerRun.path='.github/workflows/other.yml';
  assert.throws(()=>createAssuranceRuntimeProofHandoff(wrongProducer),/ASSURANCE_PROOF_HANDOFF_PRODUCER_RUN/);
});

test('independent verification recomputes the handoff from both exact artifact bindings',()=>{
  const f=fixture(),handoff=createAssuranceRuntimeProofHandoff(f);
  assert.equal(verifyAssuranceRuntimeProofHandoff({...f,handoff}).state,'VERIFIED_PASS');
  handoff.assurance.artifact_digest='sha256:'+'c'.repeat(64);
  handoff.receipt_digest=sha256(canonicalJson(Object.fromEntries(Object.entries(handoff).filter(([k])=>k!=='receipt_digest'))));
  assert.throws(()=>verifyAssuranceRuntimeProofHandoff({...f,handoff}),/ASSURANCE_PROOF_HANDOFF_RECEIPT_BINDING/);
});
