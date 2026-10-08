import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntimeEvidenceDemand} from '../../../scripts/kidults/kpmo/lib/runtime-domain-evidence-demand-v1.mjs';
const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json'));
const definition=JSON.parse(fs.readFileSync(contract.runtime_evidence_demand_definition));
const fixture=()=>({contract:structuredClone(contract),definition:structuredClone(definition),
  proof:{source_sha:'a'.repeat(40),value_chain:contract.value_chain_dimensions.map(id=>({id,runtime_state:'UNVERIFIED'}))}});
test('all fourteen missing native producers receive concrete non-authorizing recovery demands',()=>{
  const r=buildRuntimeEvidenceDemand(fixture());
  assert.equal(r.required_domain_count,14);assert.equal(r.registered_domain_count,0);assert.equal(r.verified_domain_count,0);
  assert.equal(r.state,'VERIFIED_INCOMPLETE');assert.equal(r.demands.length,14);
  assert.ok(r.demands.every(d=>d.owner&&d.required_input&&d.blocker==='NATIVE_DOMAIN_PRODUCER_NOT_REGISTERED'
    &&d.next_action==='IMPLEMENT_AND_REGISTER_NATIVE_DOMAIN_RECEIPT_PRODUCER'&&d.dispatch_authorized===false));
  assert.equal(r.planning_is_runtime_proof,false);assert.equal(r.dispatch_authority,false);
});
test('registration alone is not runtime evidence',()=>{
  const x=fixture();x.contract.runtime_domain_sources=x.contract.value_chain_dimensions.map(domain_id=>({domain_id}));
  const r=buildRuntimeEvidenceDemand(x);
  assert.equal(r.registered_domain_count,14);assert.equal(r.verified_domain_count,0);
  assert.ok(r.demands.every(d=>d.blocker==='AUTHENTICATED_EXACT_MAIN_RUNTIME_RECEIPT_REQUIRED'));
});
test('immutable pair, Track B and Portal retain their actual dependency order',()=>{
  const r=buildRuntimeEvidenceDemand(fixture());
  assert.deepEqual(r.demands.find(d=>d.domain_id==='TRACK_B_VALIDATION').unmet_dependencies,['IMMUTABLE_CANDIDATE']);
  assert.deepEqual(r.demands.find(d=>d.domain_id==='PORTAL_TRANSPARENCY_ACCESSIBILITY').unmet_dependencies,['PROJECTION_TRUTH']);
  assert.equal(r.demands.find(d=>d.domain_id==='INTEGRATION_GATE').unmet_dependencies.length,13);
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
