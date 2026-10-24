import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {createAssuranceRuntimeProofHandoff} from '../../../scripts/kidults/kpmo/lib/assurance-runtime-proof-handoff-v1.mjs';
import {verifyDeferredAssuranceRuntimeProof} from '../../../scripts/kidults/kpmo/verify-assurance-runtime-proof-handoff-v1.mjs';
import {fixture,repo,source,seal} from './fixtures/deferred-assurance-runtime-proof-fixture-v1.mjs';

test('verifies a later KPMO proof against its exact Assurance audit and both artifact tuples',()=>{
  const f=fixture();
  const result=verifyDeferredAssuranceRuntimeProof(f);
  assert.equal(result.state,'VERIFIED_PASS');
  assert.equal(result.assurance_run_id,100);
  assert.equal(result.proof_producer_run_id,300);
  assert.equal(result.producer_health_run_id,900);
  assert.equal(result.scope,'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM');
  assert.equal(result.whole_platform_authority,false);
  assert.equal(result.promotion_eligible,false);
});

test('rejects a stale main, wrong proof producer, or audit artifact substitution',()=>{
  for(const mutate of [
    f=>{f.currentMainSha='f'.repeat(40);},
    f=>{f.producerRun.id=999;},
    f=>{f.producerArtifact.workflow_run.id=999;},
    f=>{f.assuranceAuditJob.conclusion='skipped';},
    f=>{f.assuranceArtifact.digest='sha256:'+'f'.repeat(64);},
    f=>{f.handoff.assurance.run_attempt=2;},
  ]){
    const f=fixture();mutate(f);
    assert.throws(()=>verifyDeferredAssuranceRuntimeProof(f),/ASSURANCE_(PROOF_HANDOFF|FULL_PROOF)_/);
  }
});

test('does not turn future expansion into PASS or accept altered audit bytes',()=>{
  const f=fixture();f.proof.value_chain.find(x=>x.runtime_state==='FUTURE_EXPANSION').runtime_state='VERIFIED_PASS';
  f.proof=seal(Object.fromEntries(Object.entries(f.proof).filter(([k])=>k!=='receipt_digest')));
  f.handoff=createAssuranceRuntimeProofHandoff({proof:f.proof,assuranceRun:f.assuranceRun,assuranceAudit:f.auditReceipt,
    assuranceArtifact:f.assuranceArtifact,producerRun:{id:f.producerRun.id,run_attempt:1,
      path:f.producerRun.path,head_sha:source,head_branch:'main',event:'workflow_run'}});
  assert.throws(()=>verifyDeferredAssuranceRuntimeProof(f),/ASSURANCE_FULL_PROOF_AUTONOMOUS_UNREGISTERED_PASS/);
  const altered=fixture();altered.auditReceipt.execution.workflow_run_id='999';
  assert.throws(()=>verifyDeferredAssuranceRuntimeProof(altered),/ASSURANCE_PROOF_HANDOFF_GATE_AUDIT_RECEIPT/);
});
