import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {INTERNAL_RECOVERY_CHECKS,verifyInternalOperatingRecovery,observeInternalOperatingRecovery} from '../../../scripts/kidults/kpmo/lib/internal-operating-recovery-v1.mjs';
import {verifyAssuranceRuntimeReadiness} from '../../../scripts/kidults/kpmo/lib/assurance-full-proof-v1.mjs';
const source='a'.repeat(40);
const seal=p=>{const {receipt_digest,...body}=p;return {...body,receipt_digest:sha256(canonicalJson(body))};};
const fixture=()=>seal({id:'kidults-whole-platform-operating-proof-v1',source_sha:source,
  repository:'johnkim9524-collab/kaios_enterprise_repo',production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',
  assurance_runtime_readiness_proven:false,assurance_runtime_readiness:{state:'VERIFIED_HOLD',verified_domain_count:0,required_domain_count:14},
  operating_checks:INTERNAL_RECOVERY_CHECKS.map(id=>({id,state:'VERIFIED_PASS',evidence_refs:[100]}))});
test('internal recovery is independent of missing business proof, without granting business or terminal authority',()=>{
  const p=fixture(),r=verifyInternalOperatingRecovery(p,source);
  assert.equal(r.state,'VERIFIED_PASS');assert.equal(r.business_runtime_state,'VERIFIED_HOLD');
  for(const k of ['whole_platform_authority','whole_platform_runtime_proven','natural_chain_terminal_authority','promotion_authority'])assert.equal(r[k],false);
  assert.throws(()=>verifyAssuranceRuntimeReadiness(p,source),/RUNTIME_READINESS/);
  assert.throws(()=>verifyAssuranceRuntimeReadiness(r,source),/RUNTIME_READINESS/);
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
test('audit emits a distinct internal artifact while strict whole-platform consumer remains unchanged',()=>{
  const w=fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
  assert.match(w,/validate-internal-operating-recovery-v1\.mjs/);
  assert.match(w,/internal-operating-recovery-observation-v1\.json/);
  assert.match(w,/--observe/);
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
test('observation rejects real failures, malformed checks, tampering and authority elevation',()=>{
  for(const state of ['VERIFIED_FAIL','PASS','UNKNOWN']){
    const p=fixture();p.operating_checks[0].state=state;assert.throws(()=>observeInternalOperatingRecovery(seal(p),source));
  }
  const duplicate=fixture();duplicate.operating_checks.push(duplicate.operating_checks[0]);
  assert.throws(()=>observeInternalOperatingRecovery(seal(duplicate),source));
  const missing=fixture();missing.operating_checks.pop();assert.throws(()=>observeInternalOperatingRecovery(seal(missing),source));
  const p=fixture();p.production='PASS';assert.throws(()=>observeInternalOperatingRecovery(seal(p),source));
  assert.throws(()=>observeInternalOperatingRecovery({...fixture(),receipt_digest:'bad'},source));
});
test('complete observation embeds only strictly verified internal recovery',()=>{
  const r=observeInternalOperatingRecovery(fixture(),source);
  assert.equal(r.operating_recovery_proven,true);assert.equal(r.recovery_receipt.state,'VERIFIED_PASS');
  assert.equal(r.whole_platform_runtime_proven,false);assert.equal(r.natural_chain_terminal_authority,false);
});
