import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

import {verifyAuthenticatedSentinelContinuation} from '../../../scripts/kidults/kpmo/lib/authenticated-sentinel-continuation-v1.mjs';
import {coverageGenerationId} from '../../../scripts/kidults/kpmo/validate-kir-coverage-assurance-continuation-v1.mjs';
import {selectLatestNaturalSentinelRun} from '../../../scripts/kidults/kpmo/select-latest-natural-sentinel-run-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo';
function evidence({id=10,status='completed',conclusion='success',binding=true}={}){
 const run={id,run_attempt:1,event:'workflow_dispatch',path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',head_sha:source,head_branch:'main',repository:{full_name:repo},head_repository:{full_name:repo},created_at:'2026-10-09T10:01:00Z',status,conclusion};
 const b={slot:'SENTINEL_CHAIN',exact_main_sha:source,path:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',coverage_workflow_path:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',run_id:9,run_attempt:1,upstream_run_id:9,upstream_run_attempt:1,upstream_event:'workflow_run',generation_id:coverageGenerationId({sourceSha:source,runId:9,runAttempt:1}),continuation_artifact_id:99,continuation_artifact_digest:sentinelDigest,continuation_key:sentinelDigest};
 const receipt=seal({receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',repository:repo,source_sha:source,observer_run_id:id,observer_run_attempt:1,continuation_binding:binding?b:null,whole_platform_authority:false,promotion_eligible:false,public:'HOLD',production:'HOLD',g5:'HOLD'});
 const text=JSON.stringify(receipt);
 const artifact={id:100,name:`kpmo-continuous-assurance-sentinel-health-v1-${source}-${id}-1`,expired:false,workflow_run:{id,head_sha:source},digest:sentinelDigest};
 return {run,artifact,archivePacket:{archive_digest:artifact.digest,members:[{name:'kpmo-continuous-assurance-sentinel-health-v1.json',encoding:'utf-8',text,sha256:sha256(text)}]}};
}
const options={sourceSha:source,repository:repo,observedAt:'2026-10-09T11:00:00Z'};
const prior=()=>({...evidence().run,id:8,event:'workflow_run',created_at:'2026-10-09T10:00:00Z'});
test('authenticated continuation reaches selector and full proof with exact archive tuple',()=>{
 const e=evidence();assert.equal(verifyAuthenticatedSentinelContinuation({...e,...options}).state,'VERIFIED_PASS');
 assert.equal(selectLatestNaturalSentinelRun([prior(),e.run],{...options,continuationEvidence:[e]}).latest.id,10);
 const f=fixture();f.audit.execution.upstream.workflow_event='workflow_dispatch';f.audit=seal(Object.fromEntries(Object.entries(f.audit).filter(([k])=>k!=='receipt_digest')));
 f.sentinelContinuationEvidence=e;assert.equal(verifyAssuranceReadiness(f).sentinel_continuation.run_id,10);
});
test('manual dispatch remains excluded even with genuine manual archive',()=>{
 const e=evidence({binding:false});assert.equal(verifyAuthenticatedSentinelContinuation({...e,...options}),null);
 assert.equal(selectLatestNaturalSentinelRun([prior(),e.run],{...options,continuationEvidence:[e]}).latest.id,8);
 assert.equal(selectLatestNaturalSentinelRun([e.run],options).state,'VERIFIED_HOLD');
});
for(const [status,conclusion,state] of [['completed','failure','VERIFIED_FAIL'],['in_progress',null,'VERIFIED_HOLD']])test(`new authenticated ${status}/${conclusion} cannot fall back to old PASS`,()=>{
 const e=evidence({status,conclusion});const r=selectLatestNaturalSentinelRun([prior(),e.run],{...options,continuationEvidence:[e]});assert.equal(r.state,state);assert.equal(r.latest.id,10);
});
for(const [label,mutate] of [['run',e=>e.run.id++],['attempt',e=>e.run.run_attempt++],['sha',e=>e.run.head_sha='c'.repeat(40)],['repository',e=>e.run.head_repository.full_name='fork/repo'],['expired',e=>e.artifact.expired=true],['archive digest',e=>e.archivePacket.archive_digest='sha256:'+'c'.repeat(64)],['member digest',e=>e.archivePacket.members[0].sha256='sha256:'+'c'.repeat(64)],['duplicate member',e=>e.archivePacket.members.push({...e.archivePacket.members[0]})]])test(`rejects ${label} drift`,()=>{const e=evidence();mutate(e);assert.throws(()=>verifyAuthenticatedSentinelContinuation({...e,...options}));});
for(const key of ['slot','generation_id','continuation_key','upstream_run_attempt','coverage_workflow_path'])test(`rejects resealed ${key} binding tamper`,()=>{
 const e=evidence();let r=JSON.parse(e.archivePacket.members[0].text);r.continuation_binding[key]='bad';delete r.receipt_digest;r=seal(r);const text=JSON.stringify(r);e.archivePacket.members[0].text=text;e.archivePacket.members[0].sha256=sha256(text);assert.throws(()=>verifyAuthenticatedSentinelContinuation({...e,...options}));
});
test('full proof refuses continuation artifact substitution and manual Assurance',()=>{
 for(const change of [f=>f.sentinelContinuationEvidence.artifact.id++,f=>f.assuranceRun.event='workflow_dispatch']){const f=fixture();f.sentinelContinuationEvidence=evidence();f.audit.execution.upstream.workflow_event='workflow_dispatch';delete f.audit.receipt_digest;f.audit=seal(f.audit);change(f);assert.throws(()=>verifyAssuranceReadiness(f));}
});

test('authority workflow passes authenticated selected evidence through full proof and final enforcement',()=>{
 const w=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml','utf8');
 assert.ok(w.indexOf('collect-sentinel-continuation-evidence-v1.mjs')<w.indexOf('node scripts/kidults/kpmo/select-latest-natural-sentinel-run-v1.mjs'));
 assert.match(w,/sentinel-runs.json" "\$UPSTREAM_SHA" "\$UPSTREAM_CREATED_AT" "\$GITHUB_REPOSITORY" "\$GATE_DIR\/sentinel-continuation-evidence.json"/);
 assert.ok(w.indexOf('assurance-artifact-binding.json"',w.indexOf('node scripts/kidults/kpmo/lib/assurance-full-proof-v1.mjs'))<w.indexOf('selected-sentinel-continuation.json"',w.indexOf('node scripts/kidults/kpmo/lib/assurance-full-proof-v1.mjs')));
 assert.match(w,/producer_health_continuation.state=="VERIFIED_PASS"/);
 assert.match(w,/producer_health_continuation.artifact_digest==.producer_health_artifact_digest/);
 const collector=fs.readFileSync('scripts/kidults/kpmo/collect-sentinel-continuation-evidence-v1.mjs','utf8');
 assert.match(collector,/runs.length>50/);assert.match(collector,/deadline=Date.now\(\)\+210000/);
 assert.match(collector,/AUTHENTICATED_ARCHIVE_NOT_READY/);
});
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
function collectorRun({manual=false,missing=false,authenticatedStep=false,drift=false,pending=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-continuation-test-'));
 try{
  const e=evidence({binding:!manual,...(pending?{status:'in_progress',conclusion:null}:{})});const root=`/repos/${repo}/actions`;
  fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify({workflow_runs:[e.run]}));
  const rows={[`${root}/runs/10`]:{...e.run,run_attempt:drift?2:1},[`${root}/runs/10/artifacts?per_page=100`]:{total_count:missing?0:1,artifacts:missing?[]:[e.artifact]},[`${root}/runs/10/attempts/1/jobs?per_page=100`]:{total_count:1,jobs:[{steps:[{name:'Verify exact Coverage chain continuation',conclusion:authenticatedStep?'success':'skipped'}]}]}};
  const zip=spawnSync('python3',['-c','import io,zipfile,sys\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w") as z:z.writestr("kpmo-continuous-assurance-sentinel-health-v1.json",sys.stdin.read())\nsys.stdout.buffer.write(b.getvalue())'],{input:e.archivePacket.members[0].text});
  e.artifact.digest='sha256:'+crypto.createHash('sha256').update(zip.stdout).digest('hex');
  rows[`${root}/artifacts/100/zip`]={binary:zip.stdout.toString('base64')};
  fs.writeFileSync(path.join(dir,'rows.json'),JSON.stringify(rows));
  fs.writeFileSync(path.join(dir,'gh'),`#!${process.execPath}
const fs=require('fs');const rows=JSON.parse(fs.readFileSync(process.env.TEST_GH_ROWS,'utf8'));const r=rows[process.argv.at(-1)];if(!r)process.exit(2);process.stdout.write(r.binary?Buffer.from(r.binary,'base64'):JSON.stringify(r));
`,{mode:0o700});
  const out=path.join(dir,'out.json');
  const result=spawnSync(process.execPath,['scripts/kidults/kpmo/collect-sentinel-continuation-evidence-v1.mjs',path.join(dir,'index.json'),source,repo,out],{env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,TEST_GH_ROWS:path.join(dir,'rows.json')},encoding:'utf8'});
  return {...result,evidence:fs.existsSync(out)?JSON.parse(fs.readFileSync(out,'utf8')):null};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('actual collector authenticates downloaded ZIP before exposing selector evidence',()=>{const r=collectorRun();assert.equal(r.status,0,r.stderr);assert.equal(r.evidence.length,1);assert.equal(r.evidence[0].run.id,10);});
test('actual collector excludes genuine manual archive and missing manual artifact',()=>{for(const options of [{manual:true},{missing:true}]){const r=collectorRun(options);assert.equal(r.status,0,r.stderr);assert.deepEqual(r.evidence,[]);}});
test('actual collector fails closed on authenticated pending archive instead of old PASS fallback',()=>{const r=collectorRun({missing:true,authenticatedStep:true});assert.notEqual(r.status,0);assert.match(r.stderr,/AUTHENTICATED_ARCHIVE_NOT_READY/);assert.equal(r.evidence,null);});
test('actual collector rejects native attempt drift',()=>{const r=collectorRun({drift:true});assert.notEqual(r.status,0);assert.match(r.stderr,/INDEX_NATIVE_DRIFT/);});
test('actual collector holds an unclassified pending dispatch without falling back to old PASS',()=>{
 const r=collectorRun({missing:true,pending:true});assert.notEqual(r.status,0);assert.match(r.stderr,/PENDING_CLASSIFICATION/);assert.equal(r.evidence,null);
});
