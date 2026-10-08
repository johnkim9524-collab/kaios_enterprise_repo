import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inventoryWholePlatform} from '../../../scripts/kidults/kpmo/lib/whole-platform-operating-proof-v1.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const contract=read('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json');
const scorecard=read(contract.value_chain_source);
test('historical score remains historical even when its source SHA equals the observation',()=>{
  for(const sha of ['a'.repeat(40),scorecard.protected_main_truth_at_update]){
    const proof=inventoryWholePlatform(contract,scorecard,sha);
    assert.equal(proof.scorecard_observation.current_runtime_completion_weight,null);
    assert.equal(proof.scorecard_observation.static_pass_is_current_runtime_completion,false);
    assert.equal(proof.scorecard_observation.historical_pass_weight,scorecard.evidenced_pass_weight);
    assert.equal(proof.whole_platform_runtime_proven,false);
  }
});
test('all fourteen value-chain dimensions remain unverified even when static declarations say PASS',()=>{
  const proof=inventoryWholePlatform(contract,{...scorecard,dimensions:scorecard.dimensions.map(d=>({...d,state:'PASS'}))},'a'.repeat(40));
  assert.equal(proof.value_chain.length,14);
  assert.equal(proof.whole_platform_runtime_proven,false);
  assert.ok(proof.value_chain.every(d=>d.runtime_state==='UNVERIFIED'));
  assert.ok(proof.operating_checks.every(d=>d.retry_authorized===false));
  assert.equal(proof.provider_activation,'HOLD');
});
test('omitted, duplicated and newly introduced dimensions cannot silently shrink platform coverage',()=>{
  for(const dimensions of [scorecard.dimensions.slice(1),[...scorecard.dimensions,scorecard.dimensions[0]],
    [...scorecard.dimensions,{id:'UNREGISTERED'}]])
    assert.throws(()=>inventoryWholePlatform(contract,{...scorecard,dimensions},'a'.repeat(40)),/COVERAGE_DRIFT/);
  assert.throws(()=>inventoryWholePlatform(contract,scorecard,'LOCAL'),/SOURCE_SHA/);
});
