import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRegisteredOwnerReviewRoutingRepairDigest,
  matchesRegisteredOwnerReviewRoutingPolicyDelta,
} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {
  independentlyMatchesOwnerReviewRoutingRepairDigest,
  independentlyMatchesOwnerReviewRoutingPolicyDelta,
} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';
import fs from 'node:fs';

const exactPairs={
  'scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs':[
    'sha256:d3e4646a549c508d4d79784cf5f6b025dd21ba6aae3f3c6eb03afa399eafde73',
    'sha256:73af3b08d778756acbb6aba65f961c5bb0d253265e3be608687cea98f3c4f768',
  ],
  'tests/kidults/staging-operations/autonomous-dispatcher-v1.test.mjs':[
    'sha256:3d4888562344b21dfc7028c456e91ac0e32c66c38d23286bf58620e3d3bb6679',
    'sha256:fd3a7f93b6e6bd752ccc84af7f7b276baae1f6af12f9b1e4de46eb2670eb7bbf',
  ],
};
const verifiers=[
  ['primary',isRegisteredOwnerReviewRoutingRepairDigest,matchesRegisteredOwnerReviewRoutingPolicyDelta],
  ['independent',independentlyMatchesOwnerReviewRoutingRepairDigest,independentlyMatchesOwnerReviewRoutingPolicyDelta],
];

for(const [name,verify,verifyPolicy] of verifiers){
  test(`${name} verifier accepts only the exact non-authorizing Owner-review repair pair`,()=>{
    for(const [filename,[baseDigest,headDigest]] of Object.entries(exactPairs))
      assert.equal(verify(filename,baseDigest,headDigest),true,filename);
    assert.equal(verify('scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs',
      exactPairs['scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs'][0],
      exactPairs['scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs'][1]),false);
  });
  test(`${name} verifier rejects every altered or extended repair binding`,()=>{
    for(const [filename,[baseDigest,headDigest]] of Object.entries(exactPairs)){
      assert.equal(verify(filename,baseDigest,`sha256:${'0'.repeat(64)}`),false,`${filename}:head`);
      assert.equal(verify(filename,`sha256:${'0'.repeat(64)}`,headDigest),false,`${filename}:base`);
      assert.equal(verify(filename+'.extra',baseDigest,headDigest),false,`${filename}:path`);
    }
  });
  test(`${name} verifier permits only the non-authorizing policy delta`,()=>{
    const base=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
    const next=structuredClone(base),sourcePath='scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
    const dispatcherBaseDigest=base.immutable_source_read_profile.source_sha256[sourcePath];
    const dispatcherHeadDigest='sha256:'+ 'a'.repeat(64);
    const old=JSON.stringify(base),candidate=()=>structuredClone(next);
    next.version=`${Number(base.version.split('.')[0])}.${Number(base.version.split('.')[1])+1}.0`;
    next.capability_guard_owner_review_handoff.trigger_codes.push('DISPATCH_OWNER_RESERVED_ACTION');
    next.immutable_source_read_profile.source_sha256[sourcePath]=dispatcherHeadDigest;
    assert.equal(verifyPolicy(old,JSON.stringify(next),dispatcherBaseDigest,dispatcherHeadDigest,base),true);
    for(const mutate of [
      p=>p.capability_guard_owner_review_handoff.trigger_codes.push('CAPABILITY_PERMISSION_EXPANSION'),
      p=>p.capability_guard_owner_review_handoff.trigger_codes.pop(),
      p=>{p.immutable_source_read_profile.production='READY';},
      p=>{p.immutable_source_read_profile.source_sha256['scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs']='sha256:'+'b'.repeat(64);},
      p=>{p.version=`${Number(base.version.split('.')[0])}.${Number(base.version.split('.')[1])+2}.0`;},
    ]){
      const bad=candidate();mutate(bad);
      assert.equal(verifyPolicy(old,JSON.stringify(bad),dispatcherBaseDigest,dispatcherHeadDigest,base),false);
    }
  });
}
