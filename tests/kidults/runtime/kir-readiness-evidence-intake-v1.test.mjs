import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspectKirReadinessEvidence } from '../../../scripts/kidults/runtime/kir-readiness-evidence-intake-v1.mjs';
import { makeEvidenceFixture, writeEvidenceDirectory } from './kir-readiness-control-fixtures-v1.mjs';
const identity={repository:'johnkim9524-collab/kaios_enterprise_repo',source_sha:'a'.repeat(40),run_id:1,run_attempt:1,trigger_event:'pull_request'};
const withFixture=fn=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'kir-readiness-control-'));try{const f=makeEvidenceFixture(identity.source_sha);writeEvidenceDirectory(d,f);return fn(d,f);}finally{fs.rmSync(d,{recursive:true,force:true});}};
const inspect=d=>inspectKirReadinessEvidence({identity,evidenceDirectory:d});
const save=(d,x)=>fs.writeFileSync(path.join(d,'production-readiness-evidence-v1.json'),JSON.stringify(x));
const changeMember=(d,f,name,mutate)=>{const x=JSON.parse(f.rawByMember.get(name));mutate(x);const bytes=Buffer.from(JSON.stringify(x));fs.writeFileSync(path.join(d,name),bytes);const b=[...f.evidence.auxiliary_evidence_bindings,...f.evidence.support_evidence_bindings].find(b=>b.member===name);b.sha256='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');save(d,f.evidence);};
test('actual production member gate accepts complete synthetic content but creates no staging or release authority',()=>withFixture(d=>{
 const x=inspect(d);assert.equal(x.state,'TECHNICAL_CONTENT_VALIDATED_EXECUTION_UNATTESTED');assert.equal(x.bound_member_count,42);
 assert.equal(x.staging_delta_content_validated,true);assert.equal(x.technical_member_closure_validated,true);
 for(const k of ['producer_execution_attested','staging_business_workload_verified','runtime_activation_authorized','provider_authority','database_authority','empirical_authority','producer_health_authority','promotion_eligible']) assert.equal(x[k],false);
 assert.equal(x.natural_runs_observed_by_this_intake,0);assert.equal(x.empirical_current_sold_delta,0);
 assert.equal(x.blockers.length,9);assert.equal(x.production,'HOLD');
}));
for(const member of ['staging-production-delta.json','production-audit.json','support/pitr-receipt-v1.json','support/natural-runs/natural-run-01.json']) test(`missing ${member} cannot be replaced by a summary PASS`,()=>withFixture(d=>{fs.unlinkSync(path.join(d,member));assert.throws(()=>inspect(d),/TECHNICAL_GATE_REJECTED/);}));
for(const [name,mutate] of [
 ['wrong source SHA',x=>x.source_sha='b'.repeat(40)],
 ['wrong policy',x=>x.policy_binding.sha256='sha256:'+'b'.repeat(64)],
 ['retry natural run',x=>x.natural_runs[0].run_attempt=2],
 ['manual natural run',x=>x.natural_runs[0].trigger='workflow_dispatch'],
 ['duplicate natural run',x=>x.natural_runs[1]=structuredClone(x.natural_runs[0])],
 ['small beta sample',x=>x.beta_reliability.effective_n=1],
 ['fabricated release authority',x=>x.production_release_authorized=true],
 ['wrong recovery system',x=>x.recovery.pitr_source_system='IN_MEMORY_TEST_DOUBLE_NOT_POSTGRESQL'],
]) test(`real gate rejects ${name}`,()=>withFixture((d,f)=>{mutate(f.evidence);save(d,f.evidence);assert.throws(()=>inspect(d),/TECHNICAL_GATE_REJECTED/);}));
test('rehashed unsafe staging delta fails semantics rather than only digest verification',()=>withFixture((d,f)=>{changeMember(d,f,'staging-production-delta.json',x=>x.evidence.viewer_export_exposed=true);assert.throws(()=>inspect(d),/TECHNICAL_GATE_REJECTED/);}));
test('rehashed auxiliary source drift fails member identity',()=>withFixture((d,f)=>{changeMember(d,f,'production-audit.json',x=>x.source_sha='b'.repeat(40));assert.throws(()=>inspect(d),/TECHNICAL_GATE_REJECTED/);}));
test('mutated raw member is rejected even while declared summary stays PASS',()=>withFixture(d=>{fs.appendFileSync(path.join(d,'production-audit.json'),' ');assert.throws(()=>inspect(d),/TECHNICAL_GATE_REJECTED/);}));
test('symlink input and injected caller capability fail closed',()=>withFixture(d=>{
 const f=path.join(d,'production-audit.json');fs.renameSync(f,f+'.real');fs.symlinkSync(f+'.real',f);assert.throws(()=>inspect(d),/TECHNICAL_GATE_REJECTED/);
 assert.throws(()=>inspectKirReadinessEvidence({identity,evidenceDirectory:d,promotion_eligible:true}),/KIR_READINESS_INPUT/);
}));
test('unsafe evidence directory cannot enter production gate',()=>withFixture(d=>{fs.chmodSync(d,0o755);assert.throws(()=>inspect(d),/PRIVATE_DIRECTORY/);}));

test('actual composer and actual member gate complete a bounded KIR control probe',async()=>{
 const {runKirReadinessControlProbe}=await import('./kir-readiness-control-probe-v1.mjs');
 const packet=runKirReadinessControlProbe(identity);
 assert.equal(packet.state,'VERIFIED_PASS');assert.equal(packet.case_count,2);
 assert.equal(packet.production_readiness_verified,false);assert.equal(packet.natural_runs_observed,0);
});
test('KIR workflow makes readiness probe mandatory and observes its producer dependencies',()=>{
 const w=fs.readFileSync('.github/workflows/kidults-kir-runtime-contract-v1.yml','utf8');
 for(const term of ['kir-readiness-evidence-intake-v1.test.mjs','READINESS_OUTCOME: ${{ steps.readiness.outcome }}','readiness_control_integration',"'scripts/production/**'","'contracts/certification/**'",'kidults-kir-readiness-control-receipt-v1.json']) assert.ok(w.includes(term),term);
});
