import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {createAssuranceRuntimeProofHandoff} from '../../../scripts/kidults/kpmo/lib/assurance-runtime-proof-handoff-v1.mjs';
import {verifyDeferredAssuranceRuntimeProof} from '../../../scripts/kidults/kpmo/verify-assurance-runtime-proof-handoff-v1.mjs';
import {SPECS} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';

const repo='johnkim9524-collab/kaios_enterprise_repo',source='a'.repeat(40);
const seal=value=>({...value,receipt_digest:sha256(canonicalJson(value))});
function fixture(){
  const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json','utf8'));
  const assuranceRun={id:100,run_attempt:1,path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',
    repository:{full_name:repo},head_repository:{full_name:repo},head_sha:source,head_branch:'main',status:'completed',conclusion:'success',event:'workflow_run'};
  const auditBody={receipt_type:'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',source:{sha:source,actual_sha:source,expected_sha:source,match:true},
    execution:{workflow_run_id:'100',workflow_run_attempt:'1'},states:{internal_control_state:'VERIFIED_PASS'}};
  const auditReceipt={...auditBody,observed_at:'2026-10-23T00:00:00Z',receipt_digest:sha256(canonicalJson(auditBody))};
  const auditText=JSON.stringify(auditReceipt);
  const assuranceArtifact={id:200,digest:'sha256:'+'b'.repeat(64),expired:false,workflow_run:{id:100,head_sha:source}};
  const assuranceArchive={archive_digest:assuranceArtifact.digest,members:[{name:'audit-receipt.json',encoding:'utf-8',text:auditText,sha256:sha256(auditText)}]};
  const assuranceAuditJob={id:101,run_id:100,run_attempt:1,name:'audit',status:'completed',conclusion:'success'};
  const producerRun={id:300,run_attempt:1,path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',
    repository:{full_name:repo},head_repository:{full_name:repo},head_sha:source,head_branch:'main',status:'completed',conclusion:'success',event:'workflow_run'};
  const producerArtifact={id:301,digest:'sha256:'+'c'.repeat(64),expired:false,workflow_run:{id:300,head_sha:source}};
  const sentinelRun={id:900,run_attempt:1,path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',
    repository:{full_name:repo},head_repository:{full_name:repo},head_sha:source,head_branch:'main',status:'completed',conclusion:'success',event:'workflow_run'};
  const sentinelArtifact={id:910,digest:'sha256:'+'9'.repeat(64),expired:false,workflow_run:{id:900,head_sha:source}};
  const healthReceipt=seal({receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',source_sha:source,repository:repo,
    observer_run_id:900,observer_run_attempt:1,state:'VERIFIED_PASS',semantic_content_verified:true,
    coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',producers:SPECS.map((spec,i)=>({id:spec.id,state:'VERIFIED_PASS',
      artifact_content_validated:true,artifact_transport_verified:true,selected_run_id:920+i,selected_run_attempt:1,
      selected_event:spec.events[0],selected_created_at:`2026-10-23T00:${String(i*5).padStart(2,'0')}:00Z`})),
    production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false});
  const domain=contract.autonomous_operating_readiness.mandatory_runtime_domains[0];
  const valueChain=contract.value_chain_dimensions.map(id=>id===domain
    ?{id,run_id:700,runtime_state:'VERIFIED_PASS',runtime_receipt_digest:'sha256:'+'d'.repeat(64)}
    :{id,runtime_state:'FUTURE_EXPANSION'});
  const proofBody={id:contract.id,repository:repo,source_sha:source,value_chain:valueChain,
    runtime_domain_registry:{state:'HOLD',registered_domain_count:1,required_domain_count:14},
    operating_checks:[{id:'CORE_FOUR_CONTENT',state:'VERIFIED_PASS',evidence_refs:[900,901]}],
    autonomous_runtime_readiness_proven:true,autonomous_runtime_readiness:{state:'VERIFIED_PASS',
      scope:'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM',verified_domain_count:1,required_domain_count:1,
      domain_ids:[domain],future_expansion_domain_ids:[...contract.autonomous_operating_readiness.future_expansion_domains].sort()},
    protected_evidence:[{workflow_path:'.github/workflows/kidults-security-assurance-empirical-r1.yml',run_id:700,run_attempt:1,
      source_sha:source,artifact_id:701,artifact_digest:'sha256:'+'e'.repeat(64)},
      {workflow_path:sentinelRun.path,run_id:900,run_attempt:1,source_sha:source,artifact_id:910,artifact_digest:sentinelArtifact.digest}]};
  const proof=seal(proofBody);
  const assuranceBindingRun={...assuranceRun};
  const handoff=createAssuranceRuntimeProofHandoff({proof,assuranceRun:assuranceBindingRun,assuranceAudit:auditReceipt,
    assuranceArtifact,producerRun:{id:producerRun.id,run_attempt:1,path:producerRun.path,head_sha:source,head_branch:'main',event:'workflow_run'}});
  return {producerRun,producerArtifact,proof,handoff,assuranceRun,assuranceAuditJob,assuranceArtifact,auditReceipt,
    assuranceArchive,currentMainSha:source,sentinelRun,sentinelArtifact,healthReceipt};
}

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
