import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {INTERNAL_RECOVERY_CHECKS,verifyInternalOperatingRecovery,observeInternalOperatingRecovery} from '../../../scripts/kidults/kpmo/lib/internal-operating-recovery-v1.mjs';
import {verifyAssuranceRuntimeReadiness} from '../../../scripts/kidults/kpmo/lib/assurance-full-proof-v1.mjs';
import {buildOperatingProofFailureReceipt} from '../../../scripts/kidults/kpmo/collect-whole-platform-operating-proof-v1.mjs';
const source='a'.repeat(40);
const runtimeContract=(()=>{const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json','utf8'));
  return {...contract,runtime_domain_sources:contract.value_chain_dimensions.map(domain_id=>({domain_id,workflow:`${domain_id.toLowerCase().replaceAll('_','-')}.yml`}))};})();
const seal=p=>{const {receipt_digest,...body}=p;return {...body,receipt_digest:sha256(canonicalJson(body))};};
const fixture=()=>seal({id:'kidults-whole-platform-operating-proof-v1',source_sha:source,
  repository:'johnkim9524-collab/kaios_enterprise_repo',production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',
  assurance_runtime_readiness_proven:false,assurance_runtime_readiness:{state:'VERIFIED_HOLD',verified_domain_count:0,required_domain_count:14},
  operating_checks:INTERNAL_RECOVERY_CHECKS.map(id=>({id,state:'VERIFIED_PASS',evidence_refs:[100]}))});
test('internal recovery is independent of missing business proof, without granting business or terminal authority',()=>{
  const p=fixture(),r=verifyInternalOperatingRecovery(p,source);
  assert.equal(r.state,'VERIFIED_PASS');assert.equal(r.business_runtime_state,'VERIFIED_HOLD');
  for(const k of ['whole_platform_authority','whole_platform_runtime_proven','natural_chain_terminal_authority','promotion_authority'])assert.equal(r[k],false);
  assert.throws(()=>verifyAssuranceRuntimeReadiness(p,source,runtimeContract),/RUNTIME_READINESS/);
  assert.throws(()=>verifyAssuranceRuntimeReadiness(r,source,runtimeContract),/RUNTIME_READINESS/);
});
for(const id of INTERNAL_RECOVERY_CHECKS)test(`missing, failed, duplicate or evidence-free ${id} rejects recovery`,()=>{
  for(const mutation of [p=>p.operating_checks=p.operating_checks.filter(c=>c.id!==id),p=>p.operating_checks.find(c=>c.id===id).state='VERIFIED_HOLD',p=>p.operating_checks.push(p.operating_checks.find(c=>c.id===id)),p=>p.operating_checks.find(c=>c.id===id).evidence_refs=[]]){
    const p=fixture();mutation(p);assert.throws(()=>verifyInternalOperatingRecovery(seal(p),source));
  }
});
test('drift, tampering and authority elevation fail closed',()=>{
  assert.throws(()=>verifyInternalOperatingRecovery(fixture(),'b'.repeat(40)),/SOURCE_BINDING/);
  const p=fixture();p.source_sha='b'.repeat(40);assert.throws(()=>verifyInternalOperatingRecovery(p,p.source_sha),/DIGEST/);
  for(const k of ['production','public','g5','provider_activation']){const p=fixture();p[k]='PASS';assert.throws(()=>verifyInternalOperatingRecovery(seal(p),source),/AUTHORITY/);}
});
test('audit emits a distinct internal artifact through the existing KPMO trust while strict consumer stays unchanged',()=>{
  const assurance=fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
  const kpmo=fs.readFileSync('.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml','utf8');
  const assurancePolicy=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/platform-continuous-assurance-v1.json','utf8'));
  const assuranceValidator=fs.readFileSync('scripts/kidults/kpmo/validate-platform-continuous-assurance-v1.mjs','utf8');
  assert.equal(assurancePolicy.closure.protected_main_consecutive_successes_required,0);
  assert.match(assuranceValidator,/protected_main_consecutive_successes_required !== 0/);
  assert.match(assurance,/- name: Upload exact-run assurance packet/);
  assert.doesNotMatch(assurance,/validate-internal-operating-recovery-v1\.mjs/);
  const reconcile=kpmo.indexOf('reconcile-protected-main-operating-receipts:');
  const validation=kpmo.indexOf('node scripts/kidults/kpmo/validate-internal-operating-recovery-v1.mjs',reconcile);
  assert.ok(reconcile>0&&validation>reconcile);
  const job=kpmo.slice(reconcile);
  assert.match(job,/environment: KIDULTS-AUTONOMOUS-KPMO/);
  assert.match(job,/KIDULTS_GITHUB_READ_BUDGET_MODE: SHARED_REQUIRED/);
  assert.match(job,/internal-operating-recovery-observation-v1\.json[\s\S]*--observe/);
  assert.match(job,/name: Preserve read-only rate wait checkpoint[\s\S]*?name: kidults-github-read-resume-kpmo-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}[\s\S]*?path: out\/github-read-resume-v1\//);
  const consumer=fs.readFileSync('scripts/kidults/kpmo/lib/assurance-full-proof-v1.mjs','utf8');
  assert.match(consumer,/verified_domain_count!==14/);
  assert.doesNotMatch(consumer,/verifyInternalOperatingRecovery/);
});
test('pending observation is not a completion receipt and strict completion still rejects it',()=>{
  const p=fixture();p.operating_checks[0]={id:INTERNAL_RECOVERY_CHECKS[0],state:'UNVERIFIED'};
  const sealed=seal(p),r=observeInternalOperatingRecovery(sealed,source);
  assert.equal(r.state,'VERIFIED_INCOMPLETE');assert.equal(r.operating_recovery_proven,false);
  assert.equal(r.recovery_receipt,null);assert.equal(r.promotion_authority,false);
  assert.throws(()=>verifyInternalOperatingRecovery(sealed,source));
  assert.throws(()=>verifyAssuranceRuntimeReadiness(r,source));
});
test('observation preserves real failure evidence while malformed checks still fail closed',()=>{
  const failed=fixture();failed.operating_checks[0]={id:INTERNAL_RECOVERY_CHECKS[0],state:'VERIFIED_FAIL',reason:'GITHUB_READ_RESPONSE_BOUND'};
  const observed=observeInternalOperatingRecovery(seal(failed),source);
  assert.equal(observed.state,'VERIFIED_FAIL');assert.equal(observed.failed_checks.length,1);
  assert.deepEqual(observed.failed_checks[0],{id:INTERNAL_RECOVERY_CHECKS[0],state:'VERIFIED_FAIL',reason:'GITHUB_READ_RESPONSE_BOUND',evidence_refs:[]});
  assert.equal(observed.recovery_receipt,null);assert.equal(observed.operating_recovery_proven,false);
  for(const state of ['PASS','UNKNOWN']){
    const p=fixture();p.operating_checks[0].state=state;assert.throws(()=>observeInternalOperatingRecovery(seal(p),source));
  }
  const duplicate=fixture();duplicate.operating_checks.push(duplicate.operating_checks[0]);
  assert.throws(()=>observeInternalOperatingRecovery(seal(duplicate),source));
  const missing=fixture();missing.operating_checks.pop();assert.throws(()=>observeInternalOperatingRecovery(seal(missing),source));
  const p=fixture();p.production='PASS';assert.throws(()=>observeInternalOperatingRecovery(seal(p),source));
  assert.throws(()=>observeInternalOperatingRecovery({...fixture(),receipt_digest:'bad'},source));
});
test('a deferred read stays HOLD and produces incomplete, non-authorizing proof',()=>{
  const error=Error('GITHUB_READ_DEFERRED');
  error.read_resume_checkpoint={state:'READ_DEFERRED_NOT_AUTHORITY',reason:'RATE_WAIT'};
  const proof=buildOperatingProofFailureReceipt({contract:{id:'kidults-whole-platform-operating-proof-v1'},sourceSha:source,error});
  const observed=observeInternalOperatingRecovery(proof,source);
  assert.equal(proof.state,'VERIFIED_INCOMPLETE');
  assert.ok(proof.operating_checks.every(check=>check.state==='VERIFIED_HOLD'));
  assert.equal(observed.state,'VERIFIED_INCOMPLETE');
  assert.equal(observed.pending_checks.length,INTERNAL_RECOVERY_CHECKS.length);
  assert.ok(observed.pending_checks.every(check=>check.reason==='GITHUB_READ_DEFERRED_NOT_AUTHORITY'));
  assert.equal(observed.failed_checks.length,0);assert.equal(observed.recovery_receipt,null);
  assert.equal(observed.operating_recovery_proven,false);
  assert.equal(observed.whole_platform_runtime_proven,false);assert.equal(observed.promotion_authority,false);
  assert.throws(()=>verifyInternalOperatingRecovery(proof,source));
  const failure=buildOperatingProofFailureReceipt({contract:{id:'kidults-whole-platform-operating-proof-v1'},sourceSha:source,error:Error('HTTP_403_PERMISSION')});
  assert.equal(failure.state,'VERIFIED_FAIL');assert.equal(failure.failure_class,'HTTP_403_PERMISSION');
  assert.ok(failure.operating_checks.every(check=>check.state==='UNVERIFIED'));
  assert.throws(()=>observeInternalOperatingRecovery(proof,'b'.repeat(40)),/SOURCE_BINDING/);
});
test('complete observation embeds only strictly verified internal recovery',()=>{
  const r=observeInternalOperatingRecovery(fixture(),source);
  assert.equal(r.operating_recovery_proven,true);assert.equal(r.recovery_receipt.state,'VERIFIED_PASS');
  assert.equal(r.whole_platform_runtime_proven,false);assert.equal(r.natural_chain_terminal_authority,false);
});
