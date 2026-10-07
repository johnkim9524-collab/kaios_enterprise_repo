import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {verifyAssuranceReadiness} from '../../../scripts/kidults/kpmo/lib/assurance-full-proof-v1.mjs';

const source='a'.repeat(40),sentinelDigest='sha256:'+'b'.repeat(64);
const seal=value=>({...value,receipt_digest:sha256(canonicalJson(value))});
function fixture(){
  const run={id:400,run_attempt:1,path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',
    head_sha:source,head_branch:'main',status:'completed',conclusion:'success',
    repository:{full_name:'johnkim9524-collab/kaios_enterprise_repo'}};
  const job={id:401,run_id:400,run_attempt:1,name:'audit',status:'completed',conclusion:'success'};
  const audit=seal({receipt_type:'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
    source:{sha:source,actual_sha:source,expected_sha:source,match:true},
    execution:{workflow_run_id:'400',workflow_run_attempt:'1'},states:{internal_control_state:'VERIFIED_PASS'}});
  const domains=Array.from({length:14},(_,i)=>({id:`DOMAIN_${i}`,runtime_state:'VERIFIED_PASS',runtime_receipt_digest:'sha256:'+String(i).padStart(64,'0')}));
  const sentinel={run_id:10,run_attempt:1,artifact_id:100,artifact_digest:sentinelDigest,assurance_attempt:1};
  const proof=seal({id:'kidults-whole-platform-operating-proof-v1',source_sha:source,
    repository:'johnkim9524-collab/kaios_enterprise_repo',assurance_runtime_readiness_proven:true,
    assurance_runtime_readiness:{state:'VERIFIED_PASS',verified_domain_count:14,required_domain_count:14},
    value_chain:domains,whole_platform_runtime_proven:false,
    protected_evidence:[{workflow_path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',
      run_id:10,run_attempt:1,source_sha:source,artifact_id:100,artifact_digest:sentinelDigest}]});
  return {audit,proof,assuranceRun:run,auditJob:job,sourceSha:source,sentinel};
}
test('accepts a direct exact-main audit, 14 runtime receipts, and exact Sentinel artifact tuple',()=>{
  const f=fixture();assert.equal(verifyAssuranceReadiness(f).state,'VERIFIED_PASS');
});
test('rejects skipped or failed audit jobs even if the workflow itself succeeded',()=>{
  const f=fixture();f.auditJob.conclusion='skipped';
  assert.throws(()=>verifyAssuranceReadiness(f),/ASSURANCE_FULL_PROOF_AUDIT_JOB/);
});
test('rejects incomplete runtime domain receipt sets and false readiness claims',()=>{
  for(const mutate of [f=>f.proof.value_chain.pop(),f=>{f.proof.assurance_runtime_readiness_proven=false;}]){
    const f=fixture();mutate(f);f.proof=seal(Object.fromEntries(Object.entries(f.proof).filter(([k])=>k!=='receipt_digest')));
    assert.throws(()=>verifyAssuranceReadiness(f),/ASSURANCE_FULL_PROOF_(RUNTIME_READINESS_RECEIPT|RUNTIME_DOMAIN_SET)/);
  }
});
test('rejects a different Sentinel artifact even when the source SHA matches',()=>{
  const f=fixture();f.sentinel.artifact_digest='sha256:'+'c'.repeat(64);
  assert.throws(()=>verifyAssuranceReadiness(f),/ASSURANCE_FULL_PROOF_SENTINEL_BINDING/);
});
