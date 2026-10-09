import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchesReviewedImmutableTransportRepair as match,IMMUTABLE_TRANSPORT_REPAIR as spec} from '../../../scripts/kidults/kpmo/lib/reviewed-immutable-transport-repair-v1.mjs';
import {evaluateSemanticCapabilityDelta as primary} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta as secondary} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';
const base_content=Buffer.from(fs.readFileSync('tests/fixtures/kidults/immutable-transport-base-v1.b64','utf8').trim(),'base64').toString('utf8');
const head_content=fs.readFileSync(spec.path,'utf8');
const file={filename:spec.path,base_content,head_content};
const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json'));
test('only the exact reviewed immutable transport replacement is admitted',()=>{
 assert.equal(match(file),true);
 assert.equal(primary({files:[file],policy}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
 assert.equal(secondary({files:[file],policy}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
});
for(const [name,change] of [
 ['path',f=>f.filename+='x'],['base byte',f=>f.base_content+='\n'],['head byte',f=>f.head_content+='\n'],
 ['missing bytes',f=>delete f.head_content],['swapped direction',f=>[f.base_content,f.head_content]=[f.head_content,f.base_content]]
])test(`transport exception rejects ${name}`,()=>{const f={...file};change(f);assert.equal(match(f),false);});
test('an appended guard removal cannot inherit the reviewed replacement',()=>{
 const f={...file,head_content:head_content.replace("if (envelope.repository !== repository || String(envelope.repository_id) !== repositoryId)","if (false)")};
 assert.equal(match(f),false);
 assert.throws(()=>primary({files:[f],policy}));assert.throws(()=>secondary({files:[f],policy}));
});
test('other changed files still undergo full capability checks',()=>{
 const bad={filename:'scripts/kidults/kpmo/other.mjs',base_content:"if(!token)throw Error('HOLD');",head_content:"console.log('ok');"};
 assert.throws(()=>primary({files:[file,bad],policy}));assert.throws(()=>secondary({files:[file,bad],policy}));
});
