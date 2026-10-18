import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateSemanticCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';

const policyPath='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json';
const policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));
const engines=[['primary',evaluateSemanticCapabilityDelta],['independent',independentlyVerifyCapabilityDelta]];

test('retired self-registered protected repair policy is absent',()=>{
  assert.equal(Object.hasOwn(policy,'protected_code_repair'),false);
});

for(const [name,verify] of engines){
  test(`${name} verifier rejects reintroduction of the retired repair registry`,()=>{
    const next=structuredClone(policy);
    next.protected_code_repair={
      enabled:true,
      executor:'EXACT_PROTECTED_MAIN',
      scope:'REGISTERED_NON_AUTHORIZING_FAILURE_DIAGNOSTICS',
      primary_and_independent_required:true,
      track_kpmo_quorum_required:true,
      candidate_policy_authority:false,
      transitions:[{id:'SELF_REGISTERED',path:'scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs',base_digest:'sha256:'+'a'.repeat(64),head_digest:'sha256:'+'b'.repeat(64)}],
    };
    assert.throws(()=>verify({policy,files:[{
      filename:policyPath,status:'modified',base_content:JSON.stringify(policy),head_content:JSON.stringify(next),
    }]}));
  });
}
