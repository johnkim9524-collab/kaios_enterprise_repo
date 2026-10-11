import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOwnerReviewRequired} from '../../../scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
import {CapabilityDeltaError} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';

const sha=character=>character.repeat(40);
const pr={
  number:2039,
  base:{sha:sha('a'),repo:{id:1281328888,full_name:'johnkim9524-collab/kaios_enterprise_repo'}},
  head:{sha:sha('b')},
};

test('stale owner-review rejection preserves original and current-main bindings without authority',()=>{
  const result=buildOwnerReviewRequired({
    pr,
    mainSha:sha('c'),
    treeSha:sha('d'),
    files:[{filename:'scripts/kidults/kpmo/canonical-generation-v3-lib.mjs'}],
    error:new CapabilityDeltaError('CAPABILITY_GUARD_DEPENDENCY_CHANGED','scripts/kidults/kpmo/canonical-generation-v3-lib.mjs'),
  });
  assert.equal(result.state,'OWNER_REVIEW_REQUIRED');
  assert.equal(result.binding.base_sha,sha('a'));
  assert.equal(result.binding.current_main_sha,sha('c'));
  assert.equal(result.binding.stale_base,true);
  assert.equal(result.autonomous_eligible,false);
  assert.equal(result.landing_authorization_created,false);
  assert.equal(result.merge_authorized,false);
  assert.deepEqual([result.production,result.public,result.g5],['HOLD','HOLD','HOLD']);
});

test('fresh owner-review binding remains backward compatible and invalid SHAs fail closed',()=>{
  const result=buildOwnerReviewRequired({
    pr,
    mainSha:sha('a'),
    treeSha:sha('d'),
    files:[{filename:'scripts/kidults/kpmo/canonical-generation-v3-lib.mjs'}],
    error:new CapabilityDeltaError('CAPABILITY_GUARD_DEPENDENCY_CHANGED'),
  });
  assert.equal(result.binding.base_sha,sha('a'));
  assert.equal('current_main_sha' in result.binding,false);
  assert.equal('stale_base' in result.binding,false);
  assert.throws(()=>buildOwnerReviewRequired({
    pr:{...pr,base:{...pr.base,sha:'invalid'}},mainSha:sha('c'),treeSha:sha('d'),files:[{filename:'x'}],
    error:new CapabilityDeltaError('CAPABILITY_GUARD_DEPENDENCY_CHANGED'),
  }),/DISPATCH_OWNER_REVIEW_BINDING_INVALID/);
});
