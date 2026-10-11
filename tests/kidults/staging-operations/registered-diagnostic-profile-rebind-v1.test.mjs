import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {evaluateSemanticCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';
const policyPath='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json';
const dispatcher='scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
const hash=s=>'sha256:'+crypto.createHash('sha256').update(s).digest('hex');
const live=JSON.parse(fs.readFileSync(policyPath));
const before='export function read(){if(!bound)throw new Error("DENIED");return readOnly();}';
const after=before+'\nexport const diagnostic="BOUNDED_READ_COUNTS_ONLY";';
// This synthetic protected-main fixture pre-registers one exact reviewed pair.
// Candidate files never install or modify that registration.
const protectedPolicy=structuredClone(live);
Object.assign(protectedPolicy.protected_code_repair.transitions[0],{base_digest:hash(before),head_digest:hash(after)});
protectedPolicy.immutable_source_read_profile.source_sha256[dispatcher]=hash(before);
const candidate=structuredClone(protectedPolicy);
candidate.immutable_source_read_profile.source_sha256[dispatcher]=hash(after);
const input=()=>({policy:structuredClone(protectedPolicy),files:[
 {filename:dispatcher,status:'modified',base_content:before,head_content:after},
 {filename:policyPath,status:'modified',base_content:JSON.stringify(protectedPolicy),head_content:JSON.stringify(candidate)},
]});
const engines=[['primary',evaluateSemanticCapabilityDelta],['independent',independentlyVerifyCapabilityDelta]];
for(const [name,verify]of engines){
 test(name+' accepts exact pre-registered diagnostic hash rebind without authority',()=>{
  const result=verify(input());const receipt=(result.evidence||result.receipts).find(x=>x.filename===policyPath);
  assert.equal(receipt.transition,'PROTECTED_IMPLEMENTATION_PROFILE_REBIND');assert.equal(receipt.authority_created,false);
 });
 for(const [label,mutate]of [
  ['wrong head hash',x=>{const p=JSON.parse(x.files[1].head_content);p.immutable_source_read_profile.source_sha256[dispatcher]=hash('wrong');x.files[1].head_content=JSON.stringify(p);}],
  ['wrong base hash',x=>{const p=JSON.parse(x.files[1].base_content);p.immutable_source_read_profile.source_sha256[dispatcher]=hash('wrong');x.files[1].base_content=JSON.stringify(p);}],
  ['extra registry key',x=>{const p=JSON.parse(x.files[1].head_content);p.immutable_source_read_profile.source_sha256['scripts/new.mjs']=hash('x');x.files[1].head_content=JSON.stringify(p);}],
  ['limit expansion',x=>{const p=JSON.parse(x.files[1].head_content);p.immutable_source_read_profile.limits.maximum_requests++;x.files[1].head_content=JSON.stringify(p);}],
  ['owner activation flag removed',x=>{const p=JSON.parse(x.files[1].head_content);p.immutable_source_read_profile.policy_activation_requires_exact_head_owner_decision=false;x.files[1].head_content=JSON.stringify(p);}],
  ['HOLD changed',x=>{const p=JSON.parse(x.files[1].head_content);p.immutable_source_read_profile.production='READY';x.files[1].head_content=JSON.stringify(p);}],
  ['candidate self-registration',x=>{const p=JSON.parse(x.files[1].head_content);p.protected_code_repair.transitions[0].head_digest=hash('new');x.files[1].head_content=JSON.stringify(p);}],
  ['unreviewed authority source',x=>{x.files[0].head_content=x.files[0].head_content.replace('if(!bound)','if(false)');const p=JSON.parse(x.files[1].head_content);p.immutable_source_read_profile.source_sha256[dispatcher]=hash(x.files[0].head_content);x.files[1].head_content=JSON.stringify(p);}],
  ['protected verifier update',x=>{x.files.push({filename:'scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs',status:'modified',base_content:'const x=1;',head_content:'const x=2;'});} ],
  ['duplicate policy candidate',x=>x.files.push({...x.files[1]})],
  ['permission expansion',x=>x.files.push({filename:'.github/workflows/example.yml',status:'modified',base_content:'permissions:\n  contents: read\n',head_content:'permissions:\n  contents: write\n'})],
  ['secret access',x=>x.files.push({filename:'.github/workflows/example.yml',status:'modified',base_content:'jobs:\n  a:\n    steps:\n      - run: echo safe\n',head_content:'jobs:\n  a:\n    steps:\n      - run: echo ${{ secrets.TOKEN }}\n'})],
 ])test(name+' rejects '+label,()=>{const x=input();mutate(x);assert.throws(()=>verify(x));});
}
test('historic registered pair remains inapplicable to current main',()=>{
 const current=fs.readFileSync(dispatcher,'utf8');
 assert.notEqual(hash(current),live.protected_code_repair.transitions[0].base_digest);
 assert.notEqual(hash(current),live.protected_code_repair.transitions[0].head_digest);
});

for(const [name,verify]of engines)for(const path of [
 'scripts/kidults/kpmo/lib/bounded-git-source-reader-v1.mjs',
 'scripts/kidults/kpmo/lib/bounded-git-public-transport-v1.mjs',
 'scripts/kidults/kpmo/lib/bounded-git-source-profile-v1.mjs',
 'scripts/kidults/kpmo/lib/autonomous-operation-quarantine-v1.mjs',
])test(name+' cannot refresh trust-root bytes '+path,()=>{
 const x=input();x.files.push({filename:path,status:'modified',base_content:'const x=1;',head_content:'const x=2;'});
 assert.throws(()=>verify(x));
});

for(const [name,verify]of engines)test(name+' derives current-main dispatcher binding without historic registration',()=>{
 const source=fs.readFileSync(dispatcher,'utf8');const head=source+'// Bounded source-read audit documentation only.\n';
 const next=structuredClone(live);next.immutable_source_read_profile.source_sha256[dispatcher]=hash(head);
 const result=verify({policy:live,files:[{filename:dispatcher,status:'modified',base_content:source,head_content:head},
 {filename:policyPath,status:'modified',base_content:JSON.stringify(live),head_content:JSON.stringify(next)}]});
 assert.equal((result.evidence||result.receipts).find(x=>x.filename===policyPath).transition,'PROTECTED_IMPLEMENTATION_PROFILE_REBIND');
});

for(const [name,verify]of engines)test(name+' rejects current dispatcher env side effect plus matching profile hash',()=>{
 const source=fs.readFileSync(dispatcher,'utf8');const head=source.replace('\n',"\nprocess.env.KIDULTS_PR_NUMBER='';\n");
 const next=structuredClone(live);next.immutable_source_read_profile.source_sha256[dispatcher]=hash(head);
 assert.throws(()=>verify({policy:live,files:[{filename:dispatcher,status:'modified',base_content:source,head_content:head},
 {filename:policyPath,status:'modified',base_content:JSON.stringify(live),head_content:JSON.stringify(next)}]}));
});

for(const [name,verify]of engines)for(const addition of [
 "process['env'].KIDULTS_PR_NUMBER='';\n",
 "Object.assign(process.env,{KIDULTS_PR_NUMBER:''});\n",
 "globalThis.process.env.KIDULTS_PR_NUMBER='';\n",
 "const env=process.env;env.KIDULTS_PR_NUMBER='';\n",
 "// safe\nexport const scope='ALL_OPEN_PRS';\n",
 "// diagnostic\u2028process.env.KIDULTS_PR_NUMBER='';\n",
])test(name+' rejects executable/Unicode tail with matching derived hash '+JSON.stringify(addition),()=>{
 const source=fs.readFileSync(dispatcher,'utf8');const head=source+addition;
 const next=structuredClone(live);next.immutable_source_read_profile.source_sha256[dispatcher]=hash(head);
 assert.throws(()=>verify({policy:live,files:[{filename:dispatcher,status:'modified',base_content:source,head_content:head},
 {filename:policyPath,status:'modified',base_content:JSON.stringify(live),head_content:JSON.stringify(next)}]}));
});
