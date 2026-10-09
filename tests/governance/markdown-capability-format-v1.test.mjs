import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateSemanticCapabilityDelta} from '../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from '../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';

const policy={delegated_internal_path_prefixes:['docs/']};
const file=(before,after)=>({filename:'docs/runtime.md',base_content:before,head_content:after});
test('prose apostrophes are not malformed JavaScript',()=>{
  const files=[file("The operator's notes.\n", "The operator's notes.\nA new example.\n")];
  assert.equal(evaluateSemanticCapabilityDelta({files,policy}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
});
test('Markdown guard removal remains fail closed',()=>{
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[file('Production must HOLD.\n','Replacement notes.\n')],policy}),/CAPABILITY_GUARD_REMOVED/);
});
test('Markdown new remote capability remains fail closed',()=>{
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[file('Notes.\n','Notes.\ncurl https://example.com\n')],policy}),/CAPABILITY_EXPANSION/);
});
test('independent governance authority scrutiny is preserved',()=>{
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[file('Notes.\n','Notes.\nNew authorization required.\n')],policy}),/INDEPENDENT_SECURITY_CAPABILITY_ADDED/);
});
