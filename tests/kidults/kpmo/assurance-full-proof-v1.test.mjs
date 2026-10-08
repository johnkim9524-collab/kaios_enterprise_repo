import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {verifyAssuranceReadiness,verifyAssuranceRuntimeReadiness} from '../../../scripts/kidults/kpmo/lib/assurance-full-proof-v1.mjs';

const source='a'.repeat(40),sentinelDigest='sha256:'+'b'.repeat(64);
const seal=value=>({...value,receipt_digest:sha256(canonicalJson(value))});
function fixture(){
  const runtimeDomainContract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json','utf8'));
  runtimeDomainContract.runtime_domain_sources=runtimeDomainContract.value_chain_dimensions.map((domain_id,i)=>({domain_id,workflow:`test-domain-${i}.yml`}));
  const run={id:400,run_attempt:1,path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',
    head_sha:source,head_branch:'main',status:'completed',conclusion:'success',event:'workflow_run',
    repository:{full_name:'johnkim9524-collab/kaios_enterprise_repo'}};
  const job={id:401,run_id:400,run_attempt:1,name:'audit',status:'completed',conclusion:'success'};
  const audit=seal({receipt_type:'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
    source:{sha:source,actual_sha:source,expected_sha:source,match:true},
    execution:{trigger:'workflow_run',workflow_run_id:'400',workflow_run_attempt:'1',upstream:{run_id:'10',run_attempt:'1',
      workflow_name:'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',
      workflow_path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',workflow_event:'workflow_run',
      repository:'johnkim9524-collab/kaios_enterprise_repo',head_branch:'main',conclusion:'success'}},states:{internal_control_state:'VERIFIED_PASS'}});
  const domains=runtimeDomainContract.value_chain_dimensions.map((id,i)=>({id,run_id:700+i,runtime_state:'VERIFIED_PASS',runtime_receipt_digest:'sha256:'+String(i).padStart(64,'0')}));
  const sentinel={run_id:10,run_attempt:1,artifact_id:100,artifact_digest:sentinelDigest,assurance_attempt:1};
  const archivePacket={archive_digest:'sha256:'+'d'.repeat(64),members:[
    {name:'audit-receipt.json',encoding:'utf-8',sha256:'sha256:'+'e'.repeat(64)},
    {name:'whole-platform-operating-proof-v1.json',encoding:'utf-8',sha256:'sha256:'+'f'.repeat(64)}]};
  const assuranceArtifact={id:500,digest:archivePacket.archive_digest};
  const archiveReceipt=seal({receipt_type:'KPMO_ASSURANCE_ARCHIVE_VALIDATION',state:'VERIFIED_PASS',
    readback_verified:true,source_sha:source,assurance_run_id:400,assurance_run_attempt:1,
    artifact_id:500,artifact_digest:archivePacket.archive_digest,archive_digest:archivePacket.archive_digest,
    archive_size_bytes:1024,member_count:2,audit_receipt_count:1,runtime_proof_count:1,
    audit_receipt_archive_member_digest:'sha256:'+'e'.repeat(64),
    runtime_proof_archive_member_digest:'sha256:'+'f'.repeat(64)});
  const proof=seal({id:'kidults-whole-platform-operating-proof-v1',source_sha:source,
    repository:'johnkim9524-collab/kaios_enterprise_repo',assurance_runtime_readiness_proven:true,
    assurance_runtime_readiness:{state:'VERIFIED_PASS',verified_domain_count:14,required_domain_count:14,domain_ids:domains.map(d=>d.id)},
    runtime_domain_registry:{state:'VERIFIED_PASS',required_domain_count:14,registered_domain_count:14},
    value_chain:domains,whole_platform_runtime_proven:false,
    protected_evidence:[{workflow_path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',
      run_id:10,run_attempt:1,source_sha:source,artifact_id:100,artifact_digest:sentinelDigest},
      ...domains.map((d,i)=>({workflow_path:`.github/workflows/test-domain-${i}.yml`,run_id:d.run_id,
        run_attempt:1,source_sha:source,artifact_id:800+i,artifact_digest:'sha256:'+String(i+1).padStart(64,'0')}))]});
  return {audit,proof,assuranceRun:run,auditJob:job,sourceSha:source,sentinel,archivePacket,archiveReceipt,assuranceArtifact,runtimeDomainContract};
}
test('accepts a direct exact-main audit, 14 runtime receipts, and exact Sentinel artifact tuple',()=>{
  const f=fixture();assert.equal(verifyAssuranceReadiness(f).state,'VERIFIED_PASS');
});
test('real workflow audit producer emits exact upstream repository and main branch',()=>{
  const workflow=fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
  const expression=workflow.match(/upstream: (process\.env\.KPMO_UPSTREAM_RUN_ID \? \{[\s\S]*?\} : null),/)[1];
  const f=fixture();
  const env={KPMO_UPSTREAM_RUN_ID:'10',KPMO_UPSTREAM_RUN_ATTEMPT:'1',
    KPMO_UPSTREAM_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',KPMO_UPSTREAM_HEAD_BRANCH:'main',
    KPMO_UPSTREAM_WORKFLOW_NAME:'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',
    KPMO_UPSTREAM_WORKFLOW_PATH:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',
    KPMO_UPSTREAM_EVENT:'workflow_run',KPMO_UPSTREAM_CONCLUSION:'success'};
  f.audit.execution.upstream=JSON.parse(JSON.stringify(vm.runInNewContext(`(${expression})`,{process:{env}})));
  f.audit=seal(Object.fromEntries(Object.entries(f.audit).filter(([k])=>k!=='receipt_digest')));
  assert.equal(verifyAssuranceReadiness(f).state,'VERIFIED_PASS');
  delete env.KPMO_UPSTREAM_REPOSITORY;
  f.audit.execution.upstream=JSON.parse(JSON.stringify(vm.runInNewContext(`(${expression})`,{process:{env}})));
  f.audit=seal(Object.fromEntries(Object.entries(f.audit).filter(([k])=>k!=='receipt_digest')));
  assert.throws(()=>verifyAssuranceReadiness(f),/AUDIT_SENTINEL_CAUSAL_BINDING/);
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
test('rejects an archive validation receipt with a mismatched archive digest',()=>{
  const f=fixture();f.archiveReceipt.archive_digest='sha256:'+'c'.repeat(64);
  f.archiveReceipt=seal(Object.fromEntries(Object.entries(f.archiveReceipt).filter(([k])=>k!=='receipt_digest')));
  assert.throws(()=>verifyAssuranceReadiness(f),/ASSURANCE_FULL_PROOF_ARCHIVE_VALIDATION_RECEIPT/);
});

test('reports missing registered domains instead of an opaque readiness failure',()=>{
  const f=fixture();
  f.proof.assurance_runtime_readiness={state:'VERIFIED_HOLD',verified_domain_count:0,required_domain_count:14};
  f.proof.assurance_runtime_readiness_proven=false;
  f.proof.runtime_domain_registry={registered_domain_count:0};
  assert.throws(()=>verifyAssuranceRuntimeReadiness(f.proof,source,f.runtimeDomainContract),/verified=0,required=14,registered=0/);
});
test('canonical domains, registry state and readiness domain identities cannot be forged by counts',()=>{
  for(const mutate of [
    f=>{f.proof.value_chain[0].id='FAKE_DOMAIN';},
    f=>{f.proof.value_chain[0].id=f.proof.value_chain[1].id;},
    f=>{f.proof.runtime_domain_registry.state='HOLD';},
    f=>{f.proof.runtime_domain_registry.registered_domain_count=0;},
    f=>{f.proof.assurance_runtime_readiness.domain_ids.pop();},
    f=>{f.runtimeDomainContract.runtime_domain_sources.pop();},
  ]){
    const f=fixture();mutate(f);f.proof=seal(Object.fromEntries(Object.entries(f.proof).filter(([k])=>k!=='receipt_digest')));
    assert.throws(()=>verifyAssuranceReadiness(f),/ASSURANCE_FULL_PROOF_RUNTIME/);
  }
});
test('each domain must consume one exact registered protected producer tuple',()=>{
  for(const mutate of [
    f=>{delete f.proof.value_chain[0].run_id;},
    f=>{f.proof.protected_evidence[1].source_sha='b'.repeat(40);},
    f=>{f.proof.protected_evidence[1].workflow_path='.github/workflows/unregistered.yml';},
    f=>{f.proof.protected_evidence[1].run_attempt=2;},
    f=>{f.proof.protected_evidence[1].artifact_digest='missing';},
    f=>{f.proof.protected_evidence.push({...f.proof.protected_evidence[1]});},
  ]){
    const f=fixture();mutate(f);f.proof=seal(Object.fromEntries(Object.entries(f.proof).filter(([k])=>k!=='receipt_digest')));
    assert.throws(()=>verifyAssuranceReadiness(f),/ASSURANCE_FULL_PROOF_RUNTIME_DOMAIN_PRODUCER_BINDING/);
  }
});
test('full audit must have been triggered by the selected exact Sentinel tuple',()=>{
  for(const mutate of [
    f=>{delete f.audit.execution.upstream;},
    f=>{f.audit.execution.upstream.run_id='11';},
    f=>{f.audit.execution.upstream.run_attempt='2';},
    f=>{f.audit.execution.upstream.repository='fork/repository';},
    f=>{f.audit.execution.upstream.workflow_path='.github/workflows/other.yml';},
    f=>{f.audit.execution.upstream.head_branch='feature';},
    f=>{f.audit.execution.upstream.workflow_event='workflow_dispatch';},
    f=>{f.audit.execution.upstream.conclusion='failure';},
    f=>{f.assuranceRun.event='workflow_dispatch';},
  ]){
    const f=fixture();mutate(f);f.audit=seal(Object.fromEntries(Object.entries(f.audit).filter(([k])=>k!=='receipt_digest')));
    assert.throws(()=>verifyAssuranceReadiness(f),/ASSURANCE_FULL_PROOF_AUDIT_SENTINEL_CAUSAL_BINDING/);
  }
});
test('full audit distinguishes internal recovery from the unchanged whole-platform runtime predicate',()=>{
  const workflow=fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
  const validation=workflow.indexOf('node scripts/kidults/kpmo/validate-internal-operating-recovery-v1.mjs');
  const upload=workflow.indexOf('- name: Upload exact-run assurance packet');
  const preserve=workflow.indexOf('- name: Preserve control result');
  assert.ok(validation>0&&validation<upload&&upload<preserve);
  assert.match(workflow,/node scripts\/kidults\/kpmo\/validate-internal-operating-recovery-v1\.mjs/);
  assert.match(workflow.slice(validation,upload),/internal-operating-recovery-observation-v1\.json[\s\S]*--observe/);
});
