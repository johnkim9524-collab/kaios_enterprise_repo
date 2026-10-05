import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectStableHealth} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
test('moving snapshot retry is bounded and never retries authority or byte-integrity failures',async()=>{
  for(const code of ['SENTINEL_GENERATION_ADVANCED_DURING_READ','SENTINEL_GENERATION_CHANGED_DURING_READ','SENTINEL_MAIN_CHANGED_DURING_READ','ARCHIVE_DIGEST','HTTP_503']){
    let reads=0;const waits=[];
    await assert.rejects(collectStableHealth({readInput:async()=>{reads++;throw new Error(code);},sleep:async ms=>waits.push(ms)}),new RegExp(code));
    const moving=code==='SENTINEL_GENERATION_ADVANCED_DURING_READ';
    assert.equal(reads,moving?3:1);assert.deepEqual(waits,moving?[5000,5000]:[]);
  }
});
test('retry observes a fresh snapshot instead of returning an older green',async()=>{
  let reads=0;
  await assert.rejects(collectStableHealth({readInput:async()=>{reads++;throw new Error(reads===1?'SENTINEL_GENERATION_ADVANCED_DURING_READ':'ARCHIVE_DIGEST');},sleep:async()=>{}}),/ARCHIVE_DIGEST/);
  assert.equal(reads,2);
  await assert.rejects(collectStableHealth({maximumAttempts:4}),/RETRY_BOUND/);
});
