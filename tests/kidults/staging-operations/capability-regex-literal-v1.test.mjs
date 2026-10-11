import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSemanticCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';

const filename='scripts/kidults/kpmo/regex-guard-fixture.mjs';
const policy={delegated_internal_path_prefixes:['scripts/kidults/'],delegated_internal_exact_path_exceptions:[]};
const source=`const sha=/^[0-9a-f]{40}$/;
const template=/\\{\\{[^}]*\\}\\}/i;
const ratio=total / count;
if(!sha.test(value)||template.test(value)){throw new Error('deny');}
export {ratio};
`;
const file=head_content=>({filename,base_content:source,head_content});

test('regex quantifiers, character classes, escaped braces, and division remain structurally distinct',()=>{
  assert.equal(evaluateSemanticCapabilityDelta({files:[file(source)],policy}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.equal(independentlyVerifyCapabilityDelta({files:[file(source)],policy}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
});

test('regex parsing does not weaken fail-closed guard comparison',()=>{
  const weakened=source.replace('||template.test(value)','');
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[file(weakened)],policy}),
    error=>error.code==='CAPABILITY_GUARD_DEPENDENCY_CHANGED');
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[file(weakened)],policy}),
    error=>error.code==='INDEPENDENT_GUARD_DEPENDENCY_CHANGED');
});
