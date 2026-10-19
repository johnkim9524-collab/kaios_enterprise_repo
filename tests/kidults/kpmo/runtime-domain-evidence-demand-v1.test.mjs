import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntimeEvidenceDemand} from '../../../scripts/kidults/kpmo/lib/runtime-domain-evidence-demand-v1.mjs';
const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json'));
const definition=JSON.parse(fs.readFileSync(contract.runtime_evidence_demand_definition));
const fixture=()=>({contract:structuredClone(contract),definition:structuredClone(definition),
  proof:{source_sha:'a'.repeat(40),value_chain:contract.value_chain_dimensions.map(id=>({id,runtime_state:'UNVERIFIED'}))}});
test('the required domain remains actionable while thirteen uncontracted domains are future expansion',()=>{
  const x=fixture();x.contract.runtime_domain_sources=[];
  const r=buildRuntimeEvidenceDemand(x);
  assert.equal(r.required_domain_count,14);assert.equal(r.registered_domain_count,0);assert.equal(r.verified_domain_count,0);
  assert.equal(r.state,'VERIFIED_INCOMPLETE');assert.equal(r.demands.length,14);
  const future=r.demands.filter(d=>d.state==='FUTURE_EXPANSION'),security=r.demands.find(d=>d.domain_id==='SECURITY_SUPPLY_CHAIN');
  assert.equal(future.length,13);assert.ok(future.every(d=>d.owner&&d.required_input&&d.blocker===null
    &&d.next_action==='ADD_AFTER_PROVIDER_CONTRACT'&&d.dispatch_authorized===false&&d.unmet_dependencies.length===0));
  assert.equal(security.state,'HOLD');assert.equal(security.blocker,'NATIVE_DOMAIN_PRODUCER_NOT_REGISTERED');
  assert.equal(r.autonomous_scope.state,'VERIFIED_HOLD');assert.equal(r.autonomous_scope.future_expansion_is_blocking,false);
  assert.equal(r.planning_is_runtime_proof,false);assert.equal(r.dispatch_authority,false);
});
test('registration alone is not runtime evidence',()=>{
  const x=fixture();x.contract.runtime_domain_sources=x.contract.value_chain_dimensions.map(domain_id=>({domain_id}));
  const r=buildRuntimeEvidenceDemand(x);
  assert.equal(r.registered_domain_count,14);assert.equal(r.verified_domain_count,0);
  assert.equal(r.demands.find(d=>d.domain_id==='SECURITY_SUPPLY_CHAIN').blocker,'AUTHENTICATED_EXACT_MAIN_RUNTIME_RECEIPT_REQUIRED');
  assert.equal(r.demands.filter(d=>d.state==='FUTURE_EXPANSION').length,13);
});
test('one authenticated Security receipt completes scoped runtime readiness without releasing the 13 future domains',()=>{
  const x=fixture(),domain=x.proof.value_chain.find(d=>d.id==='SECURITY_SUPPLY_CHAIN');
  Object.assign(domain,{runtime_state:'VERIFIED_PASS',runtime_receipt_digest:'sha256:'+'a'.repeat(64)});
  const r=buildRuntimeEvidenceDemand(x);
  assert.equal(r.state,'FUTURE_EXPANSION');assert.equal(r.autonomous_scope.state,'VERIFIED_PASS');
  assert.equal(r.autonomous_scope.verified_domain_count,1);assert.equal(r.autonomous_scope.future_expansion_domain_ids.length,13);
  assert.equal(r.autonomous_scope.future_expansion_is_blocking,false);assert.equal(r.whole_platform_state,'FUTURE_EXPANSION');
  assert.equal(r.demands.find(d=>d.domain_id==='SECURITY_SUPPLY_CHAIN').state,'VERIFIED_PASS');
  assert.equal(r.demands.filter(d=>d.state==='FUTURE_EXPANSION').length,13);
});
test('future-domain declaration keeps the original dependency map without activating demand',()=>{
  const r=buildRuntimeEvidenceDemand(fixture());
  assert.deepEqual(r.demands.find(d=>d.domain_id==='TRACK_B_VALIDATION').declared_dependencies,['IMMUTABLE_CANDIDATE']);
  assert.deepEqual(r.demands.find(d=>d.domain_id==='PORTAL_TRANSPARENCY_ACCESSIBILITY').declared_dependencies,['PROJECTION_TRUTH']);
  assert.equal(r.demands.find(d=>d.domain_id==='INTEGRATION_GATE').declared_dependencies.length,13);
  assert.equal(r.demands.find(d=>d.domain_id==='INTEGRATION_GATE').unmet_dependencies.length,0);
});
for(const [name,mutate] of [
  ['missing domain',x=>x.definition.domains.pop()],
  ['duplicate domain',x=>x.definition.domains[1].id=x.definition.domains[0].id],
  ['unknown dependency',x=>x.definition.domains[0].requires=['UNKNOWN']],
  ['dependency cycle',x=>x.definition.domains[0].requires=['INTEGRATION_GATE']],
  ['release elevation',x=>x.definition.production='PASS'],
  ['planning elevation',x=>x.definition.planning_is_runtime_proof=true],
  ['dispatch elevation',x=>x.definition.dispatch_authority=true],
  ['duplicate registry',x=>x.contract.runtime_domain_sources=[{domain_id:'SOURCE_RIGHTS'},{domain_id:'SOURCE_RIGHTS'}]],
  ['unregistered PASS',x=>Object.assign(x.proof.value_chain[0],{runtime_state:'VERIFIED_PASS',runtime_receipt_digest:'sha256:'+'a'.repeat(64)})]
])test(`rejects ${name}`,()=>{const x=fixture();mutate(x);assert.throws(()=>buildRuntimeEvidenceDemand(x),/RUNTIME_EVIDENCE_DEMAND_/);});
