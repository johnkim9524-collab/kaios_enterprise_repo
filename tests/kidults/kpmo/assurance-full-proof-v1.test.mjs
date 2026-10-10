import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {verifyAssuranceReadiness,verifyAssuranceRuntimeReadiness,verifyAutonomousRuntimeReadiness} from '../../../scripts/kidults/kpmo/lib/assurance-full-proof-v1.mjs';

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

function autonomousFixture(){
  const f=fixture(), c=f.runtimeDomainContract;
  c.runtime_domain_sources=c.runtime_domain_sources.filter(x=>x.domain_id==='SECURITY_SUPPLY_CHAIN');
  for(const d of f.proof.value_chain)if(d.id!=='SECURITY_SUPPLY_CHAIN'){
    d.runtime_state='UNVERIFIED';delete d.runtime_receipt_digest;delete d.run_id;
  }
  f.proof.runtime_domain_registry={state:'HOLD',required_domain_count:14,registered_domain_count:1};
  f.proof.assurance_runtime_readiness_proven=false;
  f.proof.assurance_runtime_readiness={state:'VERIFIED_HOLD',required_domain_count:14,verified_domain_count:1};
  f.proof.autonomous_runtime_readiness_proven=true;
  f.proof.autonomous_runtime_readiness={state:'VERIFIED_PASS',scope:'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM',
    required_domain_count:1,verified_domain_count:1,domain_ids:['SECURITY_SUPPLY_CHAIN'],
    deferred_domain_ids:c.value_chain_dimensions.filter(x=>x!=='SECURITY_SUPPLY_CHAIN')};
  f.proof=seal(Object.fromEntries(Object.entries(f.proof).filter(([k])=>k!=='receipt_digest')));
  f.runtimeScope='AUTONOMOUS_CONTROL_PLANE';return f;
}
test('unconnected 13 business domains do not block authenticated autonomous Assurance',()=>{
  const f=autonomousFixture(),r=verifyAssuranceReadiness(f);
  assert.equal(r.state,'VERIFIED_PASS');assert.equal(r.verified_domain_count,1);
  assert.equal(r.deferred_domain_ids.length,13);assert.equal(r.whole_platform_authority,false);
  assert.equal(r.promotion_eligible,false);assert.equal(f.proof.whole_platform_runtime_proven,false);
  assert.equal(f.proof.value_chain.filter(x=>x.runtime_state==='UNVERIFIED').length,13);
  assert.throws(()=>verifyAssuranceRuntimeReadiness(f.proof,source,f.runtimeDomainContract),/RUNTIME_CONTRACT_DOMAIN_SET/);
});
test('missing or forged baseline, deferred PASS, activation drift and unknown scopes fail closed',()=>{
  for(const mutate of [
    f=>{f.runtimeDomainContract.runtime_domain_sources=[];},
    f=>{f.runtimeDomainContract.autonomous_operating_readiness.required_operating_checks=[];},
    f=>{f.runtimeDomainContract.autonomous_operating_readiness.unregistered_domains_are_pass=true;},
    f=>{f.runtimeDomainContract.runtime_domain_sources.push({domain_id:'SOURCE_RIGHTS',workflow:'rights.yml'});},
    f=>{f.runtimeDomainContract.runtime_domain_sources.push({...f.runtimeDomainContract.runtime_domain_sources[0]});},
    f=>{f.proof.value_chain.find(x=>x.id==='SECURITY_SUPPLY_CHAIN').runtime_state='VERIFIED_FAIL';},
    f=>{f.proof.value_chain.find(x=>x.id==='SOURCE_RIGHTS').runtime_state='VERIFIED_PASS';},
    f=>{f.proof.value_chain.pop();},
    f=>{f.proof.autonomous_runtime_readiness.deferred_domain_ids.pop();},
    f=>{f.proof.autonomous_runtime_readiness_proven=false;},
    f=>{f.proof.protected_evidence.find(x=>x.workflow_path.endsWith('test-domain-11.yml')).source_sha='b'.repeat(40);},
    f=>{f.runtimeScope='UNKNOWN';},
  ]){
    const f=autonomousFixture();mutate(f);f.proof=seal(Object.fromEntries(Object.entries(f.proof).filter(([k])=>k!=='receipt_digest')));
    assert.throws(()=>verifyAssuranceReadiness(f),/ASSURANCE_FULL_PROOF_(AUTONOMOUS_|RUNTIME_SCOPE)/);
  }
});
test('default whole-runtime verification still requires all fourteen receipts',()=>{
  const f=autonomousFixture();delete f.runtimeScope;
  assert.throws(()=>verifyAssuranceReadiness(f),/RUNTIME_CONTRACT_DOMAIN_SET/);
});

function externalClockFixture(){
  const f=autonomousFixture();
  f.assuranceRun.event='repository_dispatch';
  Object.assign(f.audit.source,{kind:'PROTECTED_MAIN_EXTERNAL_NATURAL_CLOCK'});
  Object.assign(f.audit.execution,{trigger:'repository_dispatch',upstream:null,canonical_identity:{
    source_sha:source,upstream_class:'ASSURANCE_EXTERNAL_NATURAL_CLOCK',alias:false,
    canonical_run_id:'400',canonical_run_attempt:'1',
    generation_discriminator:`assurance-external-clock:kidults-natural-clock-v1:ASSURANCE:${source}:${'n'.repeat(32)}:slot:2026-10-10T14:30:00.000Z`}});
  f.assuranceJobs={total_count:1,jobs:[{id:402,name:'classify-canonical-identity',run_id:400,run_attempt:1,
    status:'completed',conclusion:'success',steps:[{name:'Verify independent natural-clock receipt',status:'completed',conclusion:'success'}]}]};
  f.sentinelRun={id:10,run_attempt:1,path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',
    head_sha:source,head_branch:'main',repository:{full_name:f.assuranceRun.repository.full_name},
    status:'completed',conclusion:'success',event:'repository_dispatch'};
  f.audit=seal(Object.fromEntries(Object.entries(f.audit).filter(([k])=>k!=='receipt_digest')));
  return f;
}
test('external clock uses native intake attestation and exact archived Sentinel proof without invented upstream',()=>{
  const f=externalClockFixture(),result=verifyAssuranceReadiness(f);
  assert.equal(result.state,'VERIFIED_PASS');
  assert.equal(result.observation_relationship,'EXTERNAL_CLOCK_PROOF_BOUND');
  assert.equal(f.audit.execution.upstream,null);
  assert.equal(result.promotion_eligible,false);
});
test('external clock preserves historical Sentinel rows and selects the exact native tuple',()=>{
  const f=externalClockFixture();
  const current=f.proof.protected_evidence.find(row=>row.run_id===10);
  assert.ok(current);
  f.proof.protected_evidence.push({...current,run_id:9,artifact_id:109});
  f.proof.protected_evidence.unshift({...current,run_id:8,artifact_id:108});
  f.proof=seal(Object.fromEntries(Object.entries(f.proof).filter(([k])=>k!=='receipt_digest')));
  assert.equal(verifyAssuranceReadiness(f).sentinel_run_id,10);
  for(const change of [row=>{row.run_id=10;},row=>{row.artifact_id=current.artifact_id;},
    row=>{row.artifact_digest='sha256:invalid';},row=>{row.source_sha='b'.repeat(40);}]){
    const invalid=structuredClone(f);change(invalid.proof.protected_evidence[0]);
    invalid.proof=seal(Object.fromEntries(Object.entries(invalid.proof).filter(([k])=>k!=='receipt_digest')));
    assert.throws(()=>verifyAssuranceReadiness(invalid));
  }
});
test('external clock rejects forged native intake, borrowed identity, incomplete jobs and proof drift',()=>{
  const mutations=[
    f=>{f.assuranceJobs.jobs[0].name='classify';},
    f=>{f.assuranceJobs.jobs[0].run_attempt=2;},
    f=>{f.assuranceJobs.jobs[0].run_id=399;},
    f=>{f.assuranceJobs.jobs[0].steps[0].conclusion='skipped';},
    f=>{f.assuranceJobs.jobs[0].steps[0].conclusion='failure';},
    f=>{f.assuranceJobs.jobs[0].steps=[];},
    f=>{f.assuranceJobs.jobs[0].steps.push({...f.assuranceJobs.jobs[0].steps[0]});},
    f=>{f.assuranceJobs.total_count=2;},
    f=>{f.audit.execution.canonical_identity.alias=true;},
    f=>{f.audit.execution.canonical_identity.canonical_run_id='399';},
    f=>{f.audit.execution.canonical_identity.generation_discriminator=f.audit.execution.canonical_identity.generation_discriminator.replace('ASSURANCE:','SENTINEL:');},
    f=>{f.audit.execution.upstream={run_id:10};},
    f=>{f.sentinelRun.head_sha='b'.repeat(40);},
    f=>{f.sentinelRun.run_attempt=2;},
    f=>{f.sentinelRun.conclusion='failure';},
    f=>{f.proof.protected_evidence.push({...f.proof.protected_evidence[0]});},
    f=>{f.sentinel.artifact_digest='sha256:'+'c'.repeat(64);},
    f=>{f.sentinelRun.event='workflow_dispatch';},
  ];
  for(const mutate of mutations){
    const f=externalClockFixture();mutate(f);
    f.audit=seal(Object.fromEntries(Object.entries(f.audit).filter(([k])=>k!=='receipt_digest')));
    f.proof=seal(Object.fromEntries(Object.entries(f.proof).filter(([k])=>k!=='receipt_digest')));
    assert.throws(()=>verifyAssuranceReadiness(f));
  }
});

test('actual selector CLI binds clock proof and refuses newer pending, RED, or mismatched green',()=>{
  const f=externalClockFixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'assurance-clock-selector-'));
  f.proof.protected_evidence.push({...f.proof.protected_evidence.find(row=>row.run_id===10),run_id:9,artifact_id:109});
  f.proof=seal(Object.fromEntries(Object.entries(f.proof).filter(([k])=>k!=='receipt_digest')));
  const observedAt='2026-10-10T14:40:00.000Z';
  const parent={...f.sentinelRun,name:'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',created_at:'2026-10-10T14:35:00.000Z'};
  const put=(name,value)=>{const file=path.join(dir,name+'.json');fs.writeFileSync(file,JSON.stringify(value));return file;};
  try{
    const args=[put('runs',{workflow_runs:[parent]}),source,observedAt,f.assuranceRun.repository.full_name,
      put('continuations',[]),put('audit',f.audit),put('run',f.assuranceRun),put('jobs',f.assuranceJobs),put('proof',f.proof)];
    const invoke=()=>spawnSync(process.execPath,['scripts/kidults/kpmo/select-latest-natural-sentinel-run-v1.mjs',...args],{encoding:'utf8'});
    assert.equal(invoke().status,0);
    for(const delta of [{status:'in_progress',conclusion:null},{conclusion:'failure'},{conclusion:'success'}]){
      put('runs',{workflow_runs:[parent,{...parent,id:11,created_at:'2026-10-10T14:39:00.000Z',...delta}]});
      assert.equal(invoke().status,1);
    }
    put('runs',{workflow_runs:[parent,{...parent,id:11,created_at:'2026-10-10T14:40:01.000Z'}]});
    assert.equal(invoke().status,1);
    f.audit.receipt_digest='sha256:'+'0'.repeat(64);put('audit',f.audit);
    assert.equal(invoke().status,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
