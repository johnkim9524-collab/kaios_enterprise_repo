import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {SOURCE_PROFILE_PATHS as paths,SOURCE_PROFILE_LIMITS as limits,isBoundedGitSourceProfileEnabled as enabled} from '../../../scripts/kidults/kpmo/lib/bounded-git-source-profile-v1.mjs';
const bytes=new Map(paths.map(path=>[path,Buffer.from(path)]));
const profile={id:'kidults-bounded-public-git-source-profile-v1',version:'1.0.0',mode:'BOUNDED_PUBLIC_GIT_PACK_V1',repository:'johnkim9524-collab/kaios_enterprise_repo',
 policy_activation_requires_exact_head_owner_decision:true,candidate_policy_authority:false,authorization_created:false,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',limits,
 source_sha256:Object.fromEntries([...bytes].map(([path,b])=>[path,'sha256:'+createHash('sha256').update(b).digest('hex')]))};
test('uninstalled profile preserves legacy REST reads; exact installed profile changes no authority',()=>{assert.equal(enabled({},()=>{throw Error('must not read');}),false);assert.equal(enabled({immutable_source_read_profile:profile},path=>bytes.get(path)),true);assert.equal(profile.authorization_created,false);});
for(const [name,mutate] of [['wider request budget',p=>p.limits.maximum_requests=257],['no reserve',p=>p.limits.quota_reserve=0],['extra retry',p=>p.limits.retries=1],['foreign repository',p=>p.repository='other/repo'],['candidate authority',p=>p.candidate_policy_authority=true],['Owner gate deletion',p=>p.policy_activation_requires_exact_head_owner_decision=false],['provider activation',p=>p.provider_activation='ON'],['source removal',p=>delete p.source_sha256[paths[0]]],['extra source',p=>p.source_sha256['other.mjs']='sha256:'+'a'.repeat(64)],['unvalidated field',p=>p.fallback='credentials']])test('profile rejects '+name,()=>{const p=structuredClone(profile);mutate(p);assert.throws(()=>enabled({immutable_source_read_profile:p},path=>bytes.get(path)),/PROTECTED_PROFILE_INVALID/);});
test('source byte mismatch or missing source fails closed without policy fallback',()=>{assert.throws(()=>enabled({immutable_source_read_profile:profile},()=>Buffer.from('substitute')),/PROTECTED_PROFILE_INVALID/);assert.throws(()=>enabled({immutable_source_read_profile:profile},()=>{throw Error('missing');}),/PROTECTED_PROFILE_INVALID/);});
test('normal CLI selects only the installed protected profile and refuses policy-path substitution',()=>{const source=fs.readFileSync(paths[0],'utf8');assert.match(source,/sourceTransport=isBoundedGitSourceProfileEnabled/);assert.match(source,/DISPATCH_SOURCE_PROFILE_POLICY_PATH_INVALID/);assert.match(source,/generationSeed:process.env.GITHUB_RUN_ID,sourceTransport/);});

import {evaluateSemanticCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';
const policyPath='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json';
test('installed repository profile matches the actual protected source bytes',()=>{
 const policy=JSON.parse(fs.readFileSync(policyPath));
 assert.equal(enabled(policy,path=>fs.readFileSync(path)),true);
 for(const path of paths){
  assert.throws(()=>enabled(policy,source=>source===path?Buffer.concat([fs.readFileSync(source),Buffer.from('\n// drift')]):fs.readFileSync(source)),/PROTECTED_PROFILE_INVALID/);
 }
});
for(const [name,verify] of [['primary',evaluateSemanticCapabilityDelta],['independent',independentlyVerifyCapabilityDelta]])test(name+' treats source profile installation or mutation as protected activation authority',()=>{
 const before=JSON.parse(fs.readFileSync(policyPath));delete before.immutable_source_read_profile;const after={...before,immutable_source_read_profile:profile};
 assert.throws(()=>verify({files:[{filename:policyPath,status:'modified',base_content:JSON.stringify(before),head_content:JSON.stringify(after)}],policy:before}),/AUTHORITY_POLICY_CHANGED/);
 const head=structuredClone(after);head.immutable_source_read_profile.source_sha256[paths[0]]='sha256:'+'a'.repeat(64);
 assert.throws(()=>verify({files:[{filename:policyPath,status:'modified',base_content:JSON.stringify(after),head_content:JSON.stringify(head)}],policy:after}),/AUTHORITY_POLICY_CHANGED/);
});
