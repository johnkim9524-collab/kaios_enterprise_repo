import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
// Keep repair diagnostics in the existing protected-main and PR CI entrypoint.
import './capability-repair-analysis-v1.test.mjs';
import './protected-diagnostic-repair-v1.test.mjs';
import './bounded-git-source-reader-v1.test.mjs';
import './bounded-git-pack-decoder-v1.test.mjs';
import './bounded-git-public-transport-v1.test.mjs';
import './bounded-git-source-profile-v1.test.mjs';
import {isGlobalReadFailure,classifyEmptyTreeRedundant,recordDispatcherScan,createDispatcherReadClient,discover,buildPolicyRepairRequired,buildOwnerReviewRequired,classifyCandidate,classifyStaleBaseCandidate,DispatcherError,isCandidateRejection,isUnknownClassification,reclassifyUnknownCandidate} from '../../../scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
import {CapabilityDeltaError} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {buildDispatchRequest,transitionDispatchReceipt,validateDispatchEvent,DISPATCH_ROLES} from '../../../scripts/kidults/kpmo/lib/autonomous-dispatch-fanout-v1.mjs';
const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json'));
const sha=c=>c.repeat(40);
test('exhausted reads retain only bounded resource counts and reject injected diagnostics',async()=>{
  const client=createDispatcherReadClient({token:'secret-token',maxRequests:2,fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>[]})});
  await client.request('/repos/owner/repo/pulls?state=open');
  await client.request('/repos/owner/repo/pulls/42/files?per_page=100&page=1');
  let failure;
  await assert.rejects(client.request('/repos/owner/repo/contents/secret-path?ref='+sha('a')),error=>{failure=error;return error.code==='DISPATCH_READ_BUDGET_EXHAUSTED';});
  assert.equal(client.requestCount(),2);
  assert.equal(failure.read_diagnostics.resource_counts.pulls,1);
  assert.equal(failure.read_diagnostics.resource_counts.files,1);
  assert.equal(failure.read_diagnostics.next_resource_family,'contents');
  const outputDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'dispatcher-counts-'));
  try {
    await assert.rejects(recordDispatcherScan({outputDirectory,scan:async()=>{throw failure;}}));
    let receipt=JSON.parse(fs.readFileSync(path.join(outputDirectory,'failure.json')));
    assert.deepEqual(receipt.read_diagnostics,failure.read_diagnostics);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDirectory,'results.json'))),[]);
    assert.doesNotMatch(JSON.stringify(receipt),/secret-token|secret-path|\/repos\//);
    for(const mutate of [d=>({...d,url:'secret-token'}),d=>({...d,resource_counts:{...d.resource_counts,files:99}}),d=>({...d,next_resource_family:'secret-path'})]){
      const injected=new DispatcherError('DISPATCH_READ_BUDGET_EXHAUSTED');injected.read_diagnostics=mutate(failure.read_diagnostics);
      await assert.rejects(recordDispatcherScan({outputDirectory,scan:async()=>{throw injected;}}));
      receipt=JSON.parse(fs.readFileSync(path.join(outputDirectory,'failure.json')));
      assert.equal('read_diagnostics' in receipt,false);
    }
  }finally{fs.rmSync(outputDirectory,{recursive:true,force:true});}
});
test('failed scan retains its original error and invalidates old eligible results without leaking details',async()=>{
  const outputDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'dispatcher-failure-'));
  try {
    fs.writeFileSync(path.join(outputDirectory,'results.json'),JSON.stringify([{state:'ELIGIBLE'}]));
    const error=new DispatcherError('DISPATCH_READ_BUDGET_EXHAUSTED','secret-token');
    await assert.rejects(recordDispatcherScan({outputDirectory,repository:'owner/repo',sourceSha:sha('a'),runId:'123',scan:async()=>{throw error;}}),e=>e===error);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDirectory,'results.json'))),[]);
    const failure=JSON.parse(fs.readFileSync(path.join(outputDirectory,'failure.json')));
    assert.equal(failure.failure_class,error.code);
    assert.equal(failure.fanout_authorized,false);
    assert.equal(failure.partial_candidates_consumable,false);
    assert.equal(failure.binding.source_sha,sha('a'));
    assert.doesNotMatch(JSON.stringify(failure),/secret-token/);
    await recordDispatcherScan({outputDirectory,scan:async()=>[]});
    assert.equal(fs.existsSync(path.join(outputDirectory,'failure.json')),false);
  } finally {fs.rmSync(outputDirectory,{recursive:true,force:true});}
});
const pr={number:42,state:'open',merged:false,draft:false,base:{ref:'main',sha:sha('a'),repo:{id:1281328888,full_name:'johnkim9524-collab/kaios_enterprise_repo'}},head:{sha:sha('b'),repo:{full_name:'johnkim9524-collab/kaios_enterprise_repo'}}};
const input={pr,mainSha:sha('a'),treeSha:sha('c'),files:[{filename:'src/a.js'}],statuses:[{context:'required',state:'success'}],checks:[{id:101,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success',external_id:'unit-101'}],requiredChecks:[{context:'unit',integration_id:7}],policy,generationSeed:'987654321',now:new Date('2026-09-24T12:00:00Z')};
for(const code of ['CAPABILITY_DERIVED_METADATA_SCOPE_CHANGED','INDEPENDENT_DERIVED_METADATA_SCOPE_CHANGED',
  'INDEPENDENT_SECURITY_CAPABILITY_ADDED','INDEPENDENT_GUARD_DEPENDENCY_CHANGED']) {
  const error=new CapabilityDeltaError(code,'src/a.js:private content must never appear');
  const repair=buildPolicyRepairRequired({...input,error});
  assert.equal(repair.state,'POLICY_REPAIR_REQUIRED');
  assert.equal(repair.classification_failure.changed_path,'src/a.js');
  assert.equal(repair.binding.head_sha,pr.head.sha);
  assert.equal(repair.binding.head_tree_sha,input.treeSha);
  assert.equal(repair.binding.scope_digest,'sha256:'+crypto.createHash('sha256').update('src/a.js').digest('hex'));
  for(const field of ['automatic_retry_performed','autonomous_eligible','landing_authorization_created','merge_authorized'])assert.equal(repair[field],false);
  assert.equal(repair.classification_failure.authority_created,false);
  assert.doesNotMatch(JSON.stringify(repair),/private content/);
  for(const change of [{mainSha:sha('d')},{treeSha:'invalid'},{files:[]}])
    assert.throws(()=>buildPolicyRepairRequired({...input,...change,error}),/DISPATCH_POLICY_REPAIR_BINDING_INVALID/);
}
assert.equal(buildPolicyRepairRequired({...input,error:new DispatcherError('DISPATCH_CHECKS_NOT_GREEN')}),null);
assert.equal(buildPolicyRepairRequired({...input,error:new CapabilityDeltaError('CAPABILITY_PERMISSION_EXPANSION')}),null);
console.log(JSON.stringify({state:'VERIFIED_PASS',suite:'non-authorizing-policy-repair-routing',positive:4,negative:14,authority_created:false}));
const approvalPolicy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json'));
const unknown=new CapabilityDeltaError('CAPABILITY_SOURCE_MISSING','private payload');
let reads=0;
const recovered=await reclassifyUnknownCandidate({context:input,error:unknown,approvalPolicy,
  readCandidate:async()=>{reads++;return input;}});
assert.equal(reads,1);
assert.deepEqual(recovered.candidate,classifyCandidate(input));
assert.equal(recovered.receipt.authority_created,false);
assert.doesNotMatch(JSON.stringify(recovered.receipt),/private payload/);
reads=0;
const unknownContext={...input,files:[{filename:'.github/workflows/x.yml',base_content:'name: x\n',head_content:'name: x\n odd: unsupported\n',patch:'@@ -1 +1,2 @@\n name: x\n+ odd: unsupported'}]};
const unresolved=await reclassifyUnknownCandidate({context:unknownContext,error:unknown,approvalPolicy,
  readCandidate:async()=>{reads++;return unknownContext;}});
assert.equal(reads,2);
assert.equal(unresolved.unresolved,true);
assert.equal(unresolved.candidate,undefined);
assert.equal(unresolved.receipt.authority_created,false);
assert.equal(unresolved.receipt.repository_mutation_performed,false);
assert.deepEqual(unresolved.receipt.attempts.map(x=>x.attempt),[1,2]);
for(const code of policy.capability_guard_owner_review_handoff.trigger_codes||[
  'CAPABILITY_GUARD_DEPENDENCY_CHANGED','CAPABILITY_GUARD_WEAKENED','CAPABILITY_GUARD_REMOVED',
  'CAPABILITY_AUTHORITY_POLICY_CHANGED','CAPABILITY_EXPANSION','CAPABILITY_PERMISSION_EXPANSION',
  'INDEPENDENT_SECURITY_CAPABILITY_CHANGED','INDEPENDENT_AUTHORITY_POLICY_CHANGED']) {
  assert.equal(isUnknownClassification({code}),false);
  await assert.rejects(()=>reclassifyUnknownCandidate({context:input,error:{code},approvalPolicy,
    readCandidate:async()=>{throw new Error('MUST_NOT_READ');}}),/DISPATCH_RECLASSIFICATION_NOT_UNKNOWN/);
}
for(const fresh of [{...input,mainSha:sha('d')},{...input,treeSha:sha('d')},
  {...input,pr:{...pr,draft:true}},{...input,files:[{filename:'src/b.js'}]},
  {...input,protectedRulesetDigest:'sha256:'+ 'a'.repeat(64)}]) {
  const drift=await reclassifyUnknownCandidate({context:input,error:unknown,approvalPolicy,readCandidate:async()=>fresh});
  assert.equal(drift.error.code,'DISPATCH_RECLASSIFICATION_SOURCE_DRIFT');
  assert.equal(drift.candidate,undefined);
}
const readFailed=await reclassifyUnknownCandidate({context:input,error:unknown,approvalPolicy,
  readCandidate:async()=>{throw new Error('REMOTE_READ_FAILED_PRIVATE');}});
assert.equal(readFailed.unresolved,true);
assert.equal(readFailed.receipt.attempts.length,2);
assert.doesNotMatch(JSON.stringify(readFailed.receipt),/PRIVATE/);
const injectedClassify=await reclassifyUnknownCandidate({context:input,error:unknown,approvalPolicy,
  readCandidate:async()=>input,classify:()=>({merge_authorized:true})});
assert.deepEqual(injectedClassify.candidate,classifyCandidate(input));
assert.equal(injectedClassify.candidate.merge_authorized,undefined);
for(const code of ['INDEPENDENT_SCRIPT_PARSE_FAILED','INDEPENDENT_JSON_PARSE_FAILED','INDEPENDENT_IMMUTABLE_BLOBS_REQUIRED']) {
  assert.equal(isUnknownClassification({code}),true);
}
const invalidMode=await reclassifyUnknownCandidate({context:input,error:unknown,approvalPolicy,
  readCandidate:async()=>({...input,classificationMode:'OWNER_BYPASS'})});
assert.equal(invalidMode.error.code,'DISPATCH_RECLASSIFICATION_SOURCE_DRIFT');
const changedRisk=await reclassifyUnknownCandidate({context:unknownContext,error:unknown,approvalPolicy,
  readCandidate:async()=>({...unknownContext,files:[{filename:'.github/workflows/x.yml',base_content:'name: x\n',head_content:'name: x\npermissions: write-all\n',patch:'@@ -1 +1,2 @@\n name: x\n+permissions: write-all'}]})});
assert.equal(changedRisk.error.code,'DISPATCH_OWNER_RESERVED_ACTION');
assert.equal(changedRisk.receipt.attempts.length,1);
assert.equal(changedRisk.candidate,undefined);
await assert.rejects(()=>reclassifyUnknownCandidate({context:input,error:unknown,approvalPolicy:{classes:{UNKNOWN:{}}},
  readCandidate:async()=>input}),/DISPATCH_RECLASSIFICATION_POLICY_INVALID/);
const governedFile=(filename,base_content,head_content,patch)=>({filename,base_content,head_content,...(patch?{patch}:{})});
assert.equal(policy.capability_guard_owner_review_handoff.disposition,'OWNER_REVIEW_REQUIRED');
assert.equal(policy.capability_guard_owner_review_handoff.autonomous_quorum_before_owner_decision,false);
assert.equal(policy.capability_guard_owner_review_handoff.merge_authorization_created_by_handoff,false);
const ownerReview=buildOwnerReviewRequired({pr,mainSha:input.mainSha,treeSha:input.treeSha,
  files:[{filename:'scripts/guard.mjs'},{filename:'.github/workflows/sentinel.yml'}],
  error:new CapabilityDeltaError('CAPABILITY_GUARD_DEPENDENCY_CHANGED','scripts/guard.mjs')});
assert.equal(ownerReview.state,'OWNER_REVIEW_REQUIRED');
assert.equal(ownerReview.reason,'CAPABILITY_GUARD_DEPENDENCY_CHANGED');
assert.deepEqual(ownerReview.classification_failure,{code:'CAPABILITY_GUARD_DEPENDENCY_CHANGED',changed_path:'scripts/guard.mjs',
  stage:'IMMUTABLE_CAPABILITY_DELTA',authority_created:false});
const privateDetail=buildOwnerReviewRequired({pr,mainSha:input.mainSha,treeSha:input.treeSha,
  files:[{filename:'scripts/guard.mjs'}],error:new CapabilityDeltaError('CAPABILITY_GUARD_DEPENDENCY_CHANGED','secret command payload')});
assert.equal(privateDetail.classification_failure.changed_path,null);
assert.doesNotMatch(JSON.stringify(privateDetail),/secret command payload/);
assert.equal(ownerReview.autonomous_eligible,false);
assert.equal(ownerReview.landing_authorization_created,false);
assert.equal(ownerReview.merge_authorized,false);
assert.deepEqual(ownerReview.binding.changed_paths,['.github/workflows/sentinel.yml','scripts/guard.mjs']);
assert.equal(ownerReview.binding.base_sha,input.mainSha);
assert.equal(ownerReview.binding.head_sha,pr.head.sha);
assert.equal(ownerReview.binding.head_tree_sha,input.treeSha);
assert.equal(ownerReview.binding.scope_digest,`sha256:${crypto.createHash('sha256').update(ownerReview.binding.changed_paths.join('\n')).digest('hex')}`);
assert.throws(()=>buildOwnerReviewRequired({pr,mainSha:sha('d'),treeSha:input.treeSha,files:input.files,
  error:new CapabilityDeltaError('CAPABILITY_GUARD_DEPENDENCY_CHANGED')}),/DISPATCH_OWNER_REVIEW_BINDING_INVALID/);
assert.throws(()=>buildOwnerReviewRequired({pr,mainSha:input.mainSha,treeSha:input.treeSha,files:input.files,
  error:new CapabilityDeltaError('CAPABILITY_IMMUTABLE_BLOBS_REQUIRED')}),/DISPATCH_OWNER_REVIEW_BINDING_INVALID/);
const e=classifyCandidate(input);assert.match(e.authorization_generation,/^pr-42-b{20}-[0-9a-f]{16}$/);assert.equal(e.production,'HOLD');assert.deepEqual(e.changed_paths,['src/a.js']);
const sameRunEnvelope=classifyCandidate({...input,now:new Date('2026-09-24T12:00:01Z')});
assert.equal(sameRunEnvelope.authorization_generation,e.authorization_generation);
assert.equal(sameRunEnvelope.nonce_digest,e.nonce_digest);
const nextRunEnvelope=classifyCandidate({...input,generationSeed:'987654322'});
assert.notEqual(nextRunEnvelope.authorization_generation,e.authorization_generation);
assert.notEqual(nextRunEnvelope.nonce_digest,e.nonce_digest);
const fanout=buildDispatchRequest({envelope:e,runId:'987654321',runAttempt:2,now:'2026-09-30T09:00:00.000Z'});
assert.equal(fanout.request.event_type,'kidults.authorization.generation.v1');
assert.deepEqual(fanout.receipt.target_roles,DISPATCH_ROLES);
assert.deepEqual(Object.values(fanout.receipt.role_delivery_bitmap),DISPATCH_ROLES.map(()=>'PENDING_COMMON_EVENT'));
assert.equal(validateDispatchEvent({eventAction:fanout.request.event_type,envelope:e,dispatch:fanout.request.client_payload.dispatch,role:'KPMO'}).dispatch_id,fanout.receipt.dispatch_id);
const acceptedFanout=transitionDispatchReceipt(fanout.receipt,{state:'DISPATCH_ACCEPTED',now:'2026-09-30T09:00:01.000Z'});
assert.equal(acceptedFanout.terminal,true);
assert.deepEqual(Object.values(acceptedFanout.role_delivery_bitmap),DISPATCH_ROLES.map(()=>'COMMON_EVENT_ACCEPTED'));
const failedFanout=transitionDispatchReceipt(fanout.receipt,{state:'DISPATCH_FAILED',failureCode:'TEST_FAILURE',now:'2026-09-30T09:00:01.000Z'});
assert.equal(failedFanout.failure_code,'TEST_FAILURE');
assert.throws(()=>validateDispatchEvent({eventAction:fanout.request.event_type,envelope:e,dispatch:{...fanout.receipt,binding:{...fanout.receipt.binding,head_sha:sha('d')}},role:'KPMO'}));
assert.throws(()=>transitionDispatchReceipt(acceptedFanout,{state:'DISPATCH_ACCEPTED'}));
const deny=(patch,code)=>assert.throws(()=>classifyCandidate({...input,...patch}),x=>x instanceof DispatcherError&&x.code===code);
const stalePr={...pr,base:{...pr.base,sha:sha('d')}};
const staleBinding=classifyStaleBaseCandidate({pr:stalePr,mainSha:sha('a'),files:[governedFile('src/a.js','const a=1;\n','const a=2;\n','@@ -1 +1 @@\n-const a=1;\n+const a=2;')],policy});
const staleContext={...input,pr:stalePr,classificationMode:'STALE_BASE',
  files:[governedFile('src/a.js','const a=1;\n','const a=2;\n','@@ -1 +1 @@\n-const a=1;\n+const a=2;')]};
const staleRecovered=await reclassifyUnknownCandidate({context:staleContext,error:unknown,approvalPolicy,
  readCandidate:async()=>staleContext});
assert.equal(staleRecovered.candidate.state,'STALE_RECOVERABLE');
assert.equal(staleRecovered.candidate.authorization_generation,undefined);
assert.equal(staleRecovered.receipt.binding.base_sha,sha('d'));
assert.equal(staleRecovered.receipt.binding.current_main_sha,sha('a'));
assert.equal(staleBinding.state,'STALE_RECOVERABLE');
assert.equal(staleBinding.old_base_sha,sha('d'));
assert.equal(staleBinding.current_main_sha,sha('a'));
assert.equal(staleBinding.expected_head_sha,sha('b'));
assert.throws(()=>classifyStaleBaseCandidate({pr:{...stalePr,head:{...stalePr.head,repo:{full_name:'fork/repo'}}},mainSha:sha('a'),files:[governedFile('src/a.js','a','b','@@ -1 +1 @@')],policy}),/DISPATCH_REPOSITORY_SCOPE_INVALID/);
assert.throws(()=>classifyStaleBaseCandidate({pr:stalePr,mainSha:sha('a'),files:[{filename:'.github/workflows/x.yml',patch:'@@ -1 +1,2 @@\n name: x\n+permissions: write-all',base_content:'name: x\n',head_content:'name: x\npermissions: write-all\n'}],policy}),/DISPATCH_OWNER_RESERVED_ACTION/);
assert.equal(classifyCandidate({...input,pr:{...pr,draft:true}}).authorization_generation,e.authorization_generation);
deny({mainSha:sha('d')},'DISPATCH_BASE_STALE');
deny({generationSeed:''},'DISPATCH_GENERATION_SEED_INVALID');
const safeWorkflowPatch='@@ -1 +1,2 @@\n name: x\n+concurrency: internal-safe';
assert.deepEqual(classifyCandidate({...input,files:[governedFile('.github/workflows/x.yml','name: x\n','name: x\nconcurrency: internal-safe\n',safeWorkflowPatch)]}).changed_paths,['.github/workflows/x.yml']);
deny({files:[{filename:'.github/workflows/x.yml'}]},'AUTONOMOUS_OWNER_RESERVED_CLASSIFICATION_UNKNOWN');
deny({files:[{filename:'.github/workflows/x.yml',patch:'@@ -1 +1,2 @@\n name: x\n+permissions: write-all'}]},'DISPATCH_OWNER_RESERVED_ACTION');
deny({files:[{filename:'.github/workflows/x.yml',patch:'@@ -1 +1,2 @@\n name: x\n+  id-token: write'}]},'DISPATCH_OWNER_RESERVED_ACTION');
const canonicalFiles=[
  governedFile('.github/workflows/kpmo-canonical-generation-v3.yml','name: canonical\n','name: canonical\n','@@ +1 @@\n+# immutable fixture'),
  governedFile('.github/workflows/kpmo-canonical-generation-v3-apply.yml','name: apply\n','name: apply\n','@@ +1 @@\n+# immutable fixture'),
  governedFile('scripts/kidults/kpmo/canonical-generation-v3.mjs','export const stable=true;\n','export const stable=true;\n','@@ +1 @@\n+// immutable fixture'),
  governedFile('coordination/kidults/governance/approval-policy-file-manifest-v1.json','{}\n','{}\n','@@ +1 @@\n+# immutable fixture'),
  governedFile('coordination/kidults/governance/approval-policy-inventory-v1.json','{}\n','{}\n','@@ +1 @@\n+# immutable fixture'),
];
assert.equal(classifyCandidate({...input,files:canonicalFiles}).changed_paths.length,5);
deny({files:[{filename:'coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json',patch:'@@ -1 +1 @@'}]},'DISPATCH_OWNER_RESERVED_ACTION');
deny({checks:[{id:101,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'failure'}]},'DISPATCH_CHECKS_NOT_GREEN');
const unrelatedPending=classifyCandidate({...input,checks:[...input.checks,{id:102,name:'KIDULTS Autonomous Dispatcher V1',head_sha:sha('b'),app:{id:7},status:'in_progress',conclusion:''}]});
assert.equal(unrelatedPending.test_evidence.required_check_runs[0].id,101);
deny({requiredChecks:[{context:'unit',integration_id:7},{context:'slow-required',integration_id:7}]},'DISPATCH_REQUIRED_CONTEXT_MISSING');
deny({requiredChecks:[{context:'unit',integration_id:8}]},'DISPATCH_REQUIRED_CONTEXT_MISSING');
{
  const envelope=classifyCandidate({...input,checks:[
    {id:101,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success'},
    {id:102,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success'},
  ]});
  assert.equal(envelope.test_evidence.required_check_runs[0].id,102);
}
deny({requiredChecks:[{context:'unit',integration_id:0}],checks:[
  {id:101,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success'},
  {id:102,name:'unit',head_sha:sha('b'),app:{id:8},status:'completed',conclusion:'success'},
]},'DISPATCH_REQUIRED_CONTEXT_AMBIGUOUS');
deny({checks:[
  {id:101,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success'},
  {id:102,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'failure'},
]},'DISPATCH_CHECKS_NOT_GREEN');
deny({checks:[],statuses:[]},'DISPATCH_EVIDENCE_MISSING');
deny({pr:{...pr,head:{...pr.head,repo:{full_name:'fork/repo'}}}},'DISPATCH_REPOSITORY_SCOPE_INVALID');
deny({requiredChecks:[{context:'KPMO Live Canonical Issue Truth V1',integration_id:7}],checks:[{id:201,name:'KPMO Live Canonical Issue Truth V1',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success',output:{summary:'IMPLEMENTED_NOT_VERIFIED'}}]},'DISPATCH_CANONICAL_SEMANTIC_STATE_NOT_VERIFIED');
const canonicalVerified=classifyCandidate({...input,requiredChecks:[{context:'KPMO Live Canonical Issue Truth V1',integration_id:7}],checks:[{id:202,name:'KPMO Live Canonical Issue Truth V1',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success',output:{summary:'VERIFIED_PASS'}}]});
assert.equal(canonicalVerified.test_evidence.required_check_runs[0].id,202);
const githubActionsAvatar='https://avatars.githubusercontent.com/in/7?v=4';
const statusBound=classifyCandidate({...input,requiredChecks:[
  {context:'unit',integration_id:7},
  {context:'KIDULTS Scope-Aware Authoritative Status V1',integration_id:7},
  {context:'KIDULTS Governed Landing Authorization V1',integration_id:7}],
  statuses:[{id:301,context:'KIDULTS Scope-Aware Authoritative Status V1',state:'success',sha:sha('b'),avatar_url:githubActionsAvatar},
    {id:302,context:'KIDULTS Governed Landing Authorization V1',state:'pending',sha:sha('b'),avatar_url:githubActionsAvatar}]});
assert.deepEqual(statusBound.test_evidence.required_check_runs.map(x=>x.kind),['status','check']);
assert.deepEqual(statusBound.test_evidence.required_check_runs.map(x=>x.id),[301,101]);
assert.equal(classifyCandidate({...input,requiredChecks:[{context:'KIDULTS Scope-Aware Authoritative Status V1',integration_id:7}],
  statuses:[{id:301,context:'KIDULTS Scope-Aware Authoritative Status V1',state:'success',avatar_url:githubActionsAvatar}]}).test_evidence.required_check_runs[0].id,301);
assert.deepEqual(statusBound.test_evidence.required_contexts.map(x=>x.context),[
  'KIDULTS Governed Landing Authorization V1','KIDULTS Scope-Aware Authoritative Status V1','unit']);
const requiredSetSource=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
assert.match(requiredSetSource,/const bindingRequired=requireEnvelopeBinding\?envelopeRequired:requiredChecks/);
assert.match(requiredSetSource,/liveByContext\.size!==requiredChecks\.length/);
assert.match(requiredSetSource,/live\.integration_id>0 && live\.integration_id!==dispatched\.integration_id/);
assert.match(requiredSetSource,/bindRequiredGateEvidence\(\{required:bindingRequired/);
assert.match(requiredSetSource,/required_contexts\\|\\|envelope\\.test_evidence\\?\\.required_evidence/);
assert.match(requiredSetSource,/value\\.integration_id\\|\\|value\\.app_id\\|\\|0/);
assert.match(fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8'),/draftDevelopment:requireEnvelopeBinding\?envelopeRequiresDraftDevelopment:pr\.draft===true/);
assert.doesNotMatch(requiredSetSource,/allow_draft_recovery:Boolean\\(envelope\\.recovery\\)/);
assert.match(requiredSetSource,/required_check_runs\\|\\|envelope\\.test_evidence\\?\\.required_evidence/);
assert.equal(classifyCandidate({...input,requiredChecks:[{context:'KIDULTS Governed Landing Authorization V1',integration_id:7}],statuses:[]}).test_evidence.required_check_runs.length,0);
deny({requiredChecks:[{context:'KIDULTS Scope-Aware Authoritative Status V1',integration_id:7}],
  statuses:[{id:301,context:'KIDULTS Scope-Aware Authoritative Status V1',state:'success',sha:sha('c'),avatar_url:githubActionsAvatar}]},'DISPATCH_REQUIRED_CONTEXT_MISSING');
deny({requiredChecks:[{context:'KIDULTS Scope-Aware Authoritative Status V1',integration_id:7}],
  statuses:[{id:301,context:'KIDULTS Scope-Aware Authoritative Status V1',state:'success',sha:sha('b'),avatar_url:'https://avatars.githubusercontent.com/in/8?v=4'}]},'DISPATCH_REQUIRED_CONTEXT_MISSING');
console.log(JSON.stringify({state:'VERIFIED_PASS',positive:4,negative:13}));

const dispatcherWorkflow=fs.readFileSync('.github/workflows/kidults-autonomous-dispatcher-v1.yml','utf8');
const governedWorkflow=fs.readFileSync('.github/workflows/kidults-governed-landing-authorization-v1.yml','utf8');
const deployWorkflow=fs.readFileSync('.github/workflows/kidults-autonomous-event-broker-deploy-v1.yml','utf8');
assert.doesNotMatch(dispatcherWorkflow,/\/tmp\/broker-response\.json/);
assert.doesNotMatch(dispatcherWorkflow,/mint_lifecycle_token|curl[^\n]*-X (PATCH|PUT)/);
assert.match(deployWorkflow,/\n  push:/);
assert.match(deployWorkflow,/validate-staging-no-authority-expansion-v1\.mjs/);
assert.doesNotMatch(dispatcherWorkflow,/^  pull_request_target:/m);
assert.match(dispatcherWorkflow,/cron: '17 \* \* \* \*'/);
assert.match(dispatcherWorkflow,/workflow_run:[\s\S]*workflows: \[KIDULTS Scope-Aware Authoritative Status V1\][\s\S]*types: \[completed\]/);
assert.doesNotMatch(dispatcherWorkflow,/validate-governed-readiness-consumption-v1\.mjs/);
assert.doesNotMatch(dispatcherWorkflow,/READINESS_BASE_SHA/);
assert.doesNotMatch(dispatcherWorkflow,/DRAFT_READY_TRANSITION/);
assert.doesNotMatch(dispatcherWorkflow,/waitForDraftDevelopmentAuthority/);
assert.doesNotMatch(dispatcherWorkflow,/Draft non-promotable/);
assert.doesNotMatch(dispatcherWorkflow,/DRAFT_DEVELOPMENT_AUTHORITY_FAILED/);
assert.doesNotMatch(dispatcherWorkflow,/DRAFT_DEVELOPMENT_AUTHORITY_TIMEOUT/);
assert.doesNotMatch(governedWorkflow,/await status\('success','Draft development controls verified; landing remains blocked',scopePolicy\.draft_development_status_context\)/);
assert.match(dispatcherWorkflow,/environment: KIDULTS-AUTONOMOUS-DISPATCHER/);
assert.match(dispatcherWorkflow,/KIDULTS Scope-Aware Authoritative Status V1/);
assert.doesNotMatch(dispatcherWorkflow,/^\s+contents:\s*write\s*$/m);
assert.match(dispatcherWorkflow,/run-protected-lifecycle-operation-v1\.sh.*STALE_BASE_CONVERGENCE/);
assert.match(dispatcherWorkflow,/run-protected-lifecycle-operation-v1\.sh.*REDUNDANT_PR_HYGIENE/);
const lifecycleSource=fs.readFileSync('scripts/kidults/staging-operations/lib/broker-resume-lifecycle-v1.mjs','utf8');
assert.match(lifecycleSource,/resumeOperation/);
assert.match(lifecycleSource,/expected_head_sha:b.expected_head_sha/);
assert.match(lifecycleSource,/fresh_ci_required:true,fresh_authorization_generation_required:true/);
assert.doesNotMatch(lifecycleSource,/force:true|force-with-lease/);
assert.equal(policy.merge.manual_update_branch_forbidden,true);
assert.equal(policy.merge.autonomous_stale_base_convergence.executor,'DISPATCHER_BROKERED_GITHUB_APP_ONLY');
assert.equal(policy.merge.autonomous_stale_base_convergence.post_update_full_ci_and_fresh_authorization_generation_required,true);
assert.match(fs.readFileSync('scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs','utf8'),/filter\(x=>x\.context!=='KIDULTS Governed Landing Authorization V1'\)/);
assert.match(fs.readFileSync('scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs','utf8'),/requiredChecks=pr\.draft===true[\s\S]*baseRequiredChecks\.map\(x=>x\.context==='KIDULTS Scope-Aware Authoritative Status V1'/);
assert.match(fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8'),/draftDevelopment:requireEnvelopeBinding\?envelopeRequiresDraftDevelopment:pr\.draft===true/);
assert.match(fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8'),/requireEnvelopeBinding:false/);
assert.doesNotMatch(dispatcherWorkflow,/transition_draft/);
assert.doesNotMatch(dispatcherWorkflow,/assertDraftReadyTransitionCandidate|assertDraftReadyPostMutation/);
assert.doesNotMatch(governedWorkflow,/id-token: write|Mint exact draft-ready GitHub App token|DRAFT_READY_TOKEN_STEP_OUTCOME/);
assert.match(governedWorkflow,/state:'DRAFT_DEVELOPMENT_VALIDATED_NON_PROMOTABLE'[\s\S]*exact_base_sha:base[\s\S]*promotion_eligible:false/);
assert.match(governedWorkflow,/state:'READY_OPERATION_AUTHORITY_PENDING'[\s\S]*exact_base_sha:base/);
assert.match(dispatcherWorkflow,/github\.event\.workflow_run\.conclusion == 'success'/);
assert.match(dispatcherWorkflow,/github\.event\.workflow_run\.event == 'pull_request_target'/);
assert.match(dispatcherWorkflow,/github\.event\.workflow_run\.pull_requests\[0\]\.head\.repo\.id == github\.repository_id/);
assert.doesNotMatch(dispatcherWorkflow,/workflow_run\.pull_requests\[0\]\.head\.repo\.full_name/);
assert.match(dispatcherWorkflow,/github\.event\.workflow_run\.pull_requests\[0\]\.number \|\| inputs\.pull_request/);
assert.match(dispatcherWorkflow,/cancel-in-progress: false/);
assert.match(dispatcherWorkflow,/required: true/);
assert.match(dispatcherWorkflow,/KIDULTS_PR_NUMBER="\$pr_number" node scripts\/kidults\/kpmo\/run-autonomous-dispatcher-v1\.mjs/);
assert.doesNotMatch(dispatcherWorkflow,/for event in kidults\.track\.authorization\.v1/);
assert.match(dispatcherWorkflow,/manage-autonomous-dispatch-fanout-v1\.mjs --phase initialize/);
assert.match(dispatcherWorkflow,/action:"RESUME_AUTHORIZATION_DISPATCH"/);
assert.doesNotMatch(dispatcherWorkflow,/curl[^\n]*\/dispatches/);
assert.match(dispatcherWorkflow,/FunctionError/);
assert.match(dispatcherWorkflow,/REUSED_SUCCESS/);
assert.match(dispatcherWorkflow,/jq '\.receipt\.receipt' \"\$response_path\"/);
assert.match(dispatcherWorkflow,/if: \$\{\{ always\(\) \}\}[\s\S]*Upload bounded scan and terminal fanout evidence|Upload bounded scan and terminal fanout evidence[\s\S]*if: \$\{\{ always\(\) \}\}/);
const finalizerSource=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
assert.match(finalizerSource,/const finalizerRunId=required\('GITHUB_RUN_ID'\);[\s\S]*state:'FINALIZER_ROLE_FOLLOWER'[\s\S]*let reservation;[\s\S]*writerAttempts[\s\S]*action:'CREATE_RESERVATION'[\s\S]*state:'FINALIZER_FOLLOWER'[\s\S]*const eventToken=await acquireEventToken\(\)/);
assert.match(finalizerSource,/state:'FINALIZER_FOLLOWER'[\s\S]*merge_performed:false[\s\S]*process\.exit\(0\)/);
for(const marker of ['main_sha:','stack_name:','change_set_name:','authorization_id:','create-change-set','execute-change-set']) assert.match(deployWorkflow,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

assert.match(deployWorkflow,/expected_authorization_id="DEPLOY-STAGING-BROKER-\$\{GITHUB_SHA:0:12\}-\$\{CHANGE_SET_NAME\}"/);
assert.match(deployWorkflow,/AUTO-STAGING-BROKER-\$\{GITHUB_SHA:0:12\}-\$\{GITHUB_RUN_ID\}/);
assert.match(deployWorkflow,/if \[ "\$GITHUB_EVENT_NAME" = workflow_dispatch \]/);

assert.match(dispatcherWorkflow,/id: discover[\s\S]*eligible_count=\$\(jq/);
assert.equal((dispatcherWorkflow.match(/if: steps\.discover\.outputs\.eligible_count != '0'/g)||[]).length,1);
assert.match(dispatcherWorkflow,/Upload bounded scan and terminal fanout evidence/);

const oidcWorkflowPaths=[
  '.github/workflows/kidults-autonomous-event-broker-deploy-v1.yml',
  '.github/workflows/kidults-autonomous-dispatcher-v1.yml',
  '.github/workflows/kidults-autonomous-track-authorization-v1.yml',
  '.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',
  '.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml',
];
for(const workflowPath of oidcWorkflowPaths){
  const workflow=fs.readFileSync(workflowPath,'utf8');
  if(workflowPath.includes('authorization-v1.yml')&&!workflowPath.includes('broker-deploy')) {
    assert.match(workflow,/kidults\.authorization\.generation\.v1/);
    assert.doesNotMatch(workflow,/kidults\.(?:track|kpmo|independent)\.(?:authorization|verification)\.v1/);
  }
  const sessions=(workflow.match(/read -r AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN/g)||[]).length;
  const oidcTokens=(workflow.match(/OIDC_TOKEN=\$\(jq -e?r/g)||[]).length;
  assert.ok(sessions>0,`expected OIDC session blocks in ${workflowPath}`);
  assert.equal((workflow.match(/echo "::add-mask::\$AWS_ACCESS_KEY_ID"/g)||[]).length,sessions);
  assert.equal((workflow.match(/echo "::add-mask::\$AWS_SECRET_ACCESS_KEY"/g)||[]).length,sessions);
  assert.equal((workflow.match(/echo "::add-mask::\$AWS_SESSION_TOKEN"/g)||[]).length,sessions);
  assert.ok((workflow.match(/unset CREDS OIDC_JSON OIDC_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN/g)||[]).length>=sessions);
  assert.equal((workflow.match(/echo "::add-mask::\$OIDC_TOKEN"/g)||[]).length,oidcTokens);
  assert.doesNotMatch(workflow,/AWS_ACCESS_KEY_ID=\$AWS_ACCESS_KEY_ID[\s\S]{0,200}\$GITHUB_ENV/);
  assert.equal((workflow.match(/export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN/g)||[]).length,sessions);
  assert.equal((workflow.match(/trap 'unset CREDS OIDC_JSON OIDC_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_REGION' EXIT/g)||[]).length,sessions);
}
const allWorkflowText=fs.readdirSync('.github/workflows')
  .filter(name=>name.endsWith('.yml'))
  .map(name=>fs.readFileSync(`.github/workflows/${name}`,'utf8'))
  .join('\n');
assert.doesNotMatch(allWorkflowText,/echo "AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)=\$AWS_/);
for(const workflowPath of [
  '.github/workflows/kidults-autonomous-object-lock-canary-v1.yml',
  '.github/workflows/kidults-aws-cloudtrail-continuous-assurance-v1.yml',
]){
  const workflow=fs.readFileSync(workflowPath,'utf8');
  assert.match(workflow,/credential_process = bash .*aws-oidc-credential-process-v1\.sh/);
  assert.doesNotMatch(workflow,/read -r AWS_ACCESS_KEY_ID/);
}
const credentialProcess=fs.readFileSync('scripts/kidults/kpmo/aws-oidc-credential-process-v1.sh','utf8');
assert.match(credentialProcess,/env -u AWS_PROFILE -u AWS_CONFIG_FILE -u AWS_SHARED_CREDENTIALS_FILE/);
assert.match(credentialProcess,/Version:1,AccessKeyId,SecretAccessKey,SessionToken,Expiration/);

assert.match(deployWorkflow,/change_status.*describe-change-set/);
assert.match(deployWorkflow,/didn't contain changes/);
assert.match(deployWorkflow,/continuing with canary verification/);

// Unsupported workflow syntax remains owner-reserved for this PR without stopping unrelated scans.
assert.equal(isCandidateRejection(new CapabilityDeltaError('CAPABILITY_YAML_UNSUPPORTED_SYNTAX')),true);
const independentError=new Error('INDEPENDENT_SECURITY_CAPABILITY_ADDED');independentError.code='INDEPENDENT_SECURITY_CAPABILITY_ADDED';
assert.equal(isCandidateRejection(independentError),true);
assert.equal(isCandidateRejection(new DispatcherError('DISPATCH_PR_NOT_OPEN')),true);
assert.equal(isCandidateRejection(new Error('unexpected transport failure')),false);

import './broker-resume-lifecycle-v1.test.mjs';
import './broker-caller-identity-v1.test.mjs';
import './protected-lifecycle-shell-v1.test.mjs';

const fakeResponse=(status=200,body={value:1},remaining=null)=>({status,ok:status>=200&&status<300,
  headers:{get:name=>name==='x-ratelimit-remaining'?remaining:null},json:async()=>body});
const immutablePath=`/repos/owner/repo/contents/src/a.js?ref=${sha('a')}`;
test('dispatcher coalesces only exact immutable file reads and serializes requests',async()=>{
  let calls=0,active=0,peak=0;
  const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{
    calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return fakeResponse();}});
  await Promise.all([client.request(immutablePath),client.request(immutablePath),client.request('/repos/owner/repo/branches/main')]);
  await client.request('/repos/owner/repo/branches/main');
  await client.request(immutablePath.replace(sha('a'),sha('b')));
  assert.equal(calls,4);assert.equal(peak,1);
});
test('symbolic refs are never cached',async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{calls++;return fakeResponse();}});
  await client.request(immutablePath.replace(sha('a'),'main'));await client.request(immutablePath.replace(sha('a'),'main'));
  assert.equal(calls,2);
});
for(const [label,response,code] of [
  ['exhausted successful response',fakeResponse(200,{},'0'),'DISPATCH_RATE_LIMITED'],
  ['reserved remaining quota',fakeResponse(200,{},'100'),'DISPATCH_RATE_LIMITED'],
  ['HTTP 429',fakeResponse(429),'DISPATCH_RATE_LIMITED'],
  ['HTTP 403',fakeResponse(403),'DISPATCH_READ_ACCESS_DENIED'],
  ['HTTP 401',fakeResponse(401),'DISPATCH_READ_ACCESS_DENIED'],
  ['HTTP 500',fakeResponse(500),'DISPATCH_READ_SERVICE_UNAVAILABLE'],
  ['HTTP 503',fakeResponse(503),'DISPATCH_READ_SERVICE_UNAVAILABLE'],
  ['HTTP 599',fakeResponse(599),'DISPATCH_READ_SERVICE_UNAVAILABLE'],
])test(`dispatcher stops all queued reads after ${label}`,async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{calls++;return response;}});
  const results=await Promise.allSettled([client.request('/one'),client.request('/two'),client.request('/three')]);
  assert.ok(results.every(result=>result.status==='rejected'&&result.reason.code===code));
  await assert.rejects(client.request(immutablePath),error=>error.code===code);assert.equal(calls,1);
});
test('dispatcher request budget is invocation scoped and cannot be exceeded',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;return fakeResponse();};
  const client=createDispatcherReadClient({token:'offline',fetchImpl,maxRequests:1});await client.request('/one');
  await assert.rejects(client.request('/two'),error=>error.code==='DISPATCH_READ_BUDGET_EXHAUSTED');
  await createDispatcherReadClient({token:'offline',fetchImpl,maxRequests:1}).request('/two');assert.equal(calls,2);
});
const socketFailure=code=>Object.assign(new TypeError('fetch failed'),{cause:{code,message:'must not be recorded'}});
for(const code of ['UND_ERR_SOCKET','ECONNRESET','EPIPE'])test(`interrupted GET ${code} is repeated once inside the original budget`,async()=>{
  const seen=[];const client=createDispatcherReadClient({token:'offline',fetchImpl:async(url,options)=>{
    seen.push({url,options});if(seen.length===1)throw socketFailure(code);return fakeResponse(200,{verified:true});
  }});
  assert.deepEqual(await client.request(immutablePath),{verified:true});
  assert.deepEqual(await client.request(immutablePath),{verified:true});
  assert.equal(seen.length,2);assert.equal(client.requestCount(),2);assert.equal(seen[0].url,seen[1].url);
  for(const {options} of seen){assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);}
});
test('exhausted interrupted read fences queued and later requests',async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{calls++;throw socketFailure('UND_ERR_SOCKET');}});
  const results=await Promise.allSettled([client.request('/one'),client.request('/two'),client.request('/three')]);
  assert.equal(calls,2);assert.ok(results.every(x=>x.reason.code==='DISPATCH_READ_TRANSPORT_FAILED'));
  assert.deepEqual(results[0].reason.transport_diagnostics,{resource_family:'other',attempt_count:2,request_count:2,cause_code:'UND_ERR_SOCKET'});
  assert.equal(isGlobalReadFailure(results[0].reason),true);
  await assert.rejects(client.request('/later'),x=>x===results[0].reason);assert.equal(calls,2);
});
test('read recovery cannot exceed the original request budget',async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',maxRequests:1,fetchImpl:async()=>{calls++;throw socketFailure('ECONNRESET');}});
  await assert.rejects(client.request('/one'),x=>x.code==='DISPATCH_READ_BUDGET_EXHAUSTED');assert.equal(calls,1);
});
for(const status of [401,403,429])test(`HTTP ${status} after interrupted read stops without a third attempt`,async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{if(++calls===1)throw socketFailure('UND_ERR_SOCKET');return fakeResponse(status);}});
  const results=await Promise.allSettled([client.request('/one'),client.request('/two')]);
  assert.equal(calls,2);assert.ok(results.every(x=>x.status==='rejected'));
  assert.equal(results[0].reason.code,status===429?'DISPATCH_RATE_LIMITED':'DISPATCH_READ_ACCESS_DENIED');
});
for(const code of ['CERT_HAS_EXPIRED','UNREGISTERED'])test(`unregistered transport failure ${code} is not repeated`,async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{calls++;throw socketFailure(code);}});
  const results=await Promise.allSettled([client.request('/one'),client.request('/two')]);
  assert.equal(calls,1);assert.ok(results.every(x=>x.reason.code==='DISPATCH_READ_TRANSPORT_FAILED'));
  assert.equal(results[0].reason.transport_diagnostics.cause_code,'UNCLASSIFIED');
});
test('interrupted JSON body is discarded before one complete GET recovery',async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{
    if(++calls===1)return {...fakeResponse(),json:async()=>{throw socketFailure('UND_ERR_SOCKET');}};
    return fakeResponse(200,{complete:true});
  }});
  assert.deepEqual(await client.request(immutablePath),{complete:true});assert.equal(calls,2);
});
test('invalid JSON stops queued reads without retry or partial cache',async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{calls++;return {...fakeResponse(),json:async()=>{throw new SyntaxError('sensitive raw response');}};}});
  const results=await Promise.allSettled([client.request(immutablePath),client.request('/later')]);
  assert.equal(calls,1);assert.ok(results.every(x=>x.reason.code==='DISPATCH_READ_RESPONSE_INVALID'));
});
test('bounded request timeout aborts and fences queued reads',async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',requestTimeoutMs:5,fetchImpl:async(_url,{signal})=>{
    calls++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(fakeResponse()),100);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});});
  }});
  const results=await Promise.allSettled([client.request('/one'),client.request('/two')]);
  assert.equal(calls,1);assert.ok(results.every(x=>x.reason.code==='DISPATCH_READ_TIMEOUT'));
  assert.equal(results[0].reason.transport_diagnostics.cause_code,'TIMEOUT');
  assert.throws(()=>createDispatcherReadClient({token:'offline',requestTimeoutMs:30001}),/CONFIGURATION_INVALID/);
});
test('failed transport receipt retains bounded diagnostics and clears partial evidence',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dispatcher-transport-failure-'));
  try{
    const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{throw socketFailure('UND_ERR_SOCKET');}});
    await assert.rejects(recordDispatcherScan({outputDirectory:directory,repository:'owner/repo',sourceSha:sha('a'),runId:'1',scan:()=>client.request('/one')}),x=>x.code==='DISPATCH_READ_TRANSPORT_FAILED');
    const receipt=JSON.parse(fs.readFileSync(path.join(directory,'failure.json')));
    assert.equal(receipt.failure_class,'DISPATCH_READ_TRANSPORT_FAILED');
    assert.equal(receipt.transport_diagnostics.cause_code,'UND_ERR_SOCKET');assert.equal(receipt.transport_diagnostics.attempt_count,2);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'results.json'))),[]);
    assert.equal(receipt.fanout_authorized,false);assert.equal(JSON.stringify(receipt).includes('must not be recorded'),false);
    const error=Object.assign(new Error('not public'),{code:'DISPATCH_READ_TRANSPORT_FAILED',transport_diagnostics:{...receipt.transport_diagnostics,url:'sensitive'}});
    await assert.rejects(recordDispatcherScan({outputDirectory:directory,scan:async()=>{throw error;}}));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'failure.json'))).transport_diagnostics,undefined);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('immutable 404 is reused without becoming a service failure',async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>{calls++;return fakeResponse(404);}});
  assert.equal(await client.request(immutablePath),null);assert.equal(await client.request(immutablePath),null);assert.equal(calls,1);
});
test('discovery aborts globally instead of returning partial candidate results',async()=>{
  let calls=0;
  await assert.rejects(discover({repository:'owner/repo',token:'offline',policy,generationSeed:'1',
    fetchImpl:async url=>{calls++;return url.endsWith('/branches/main')?fakeResponse(403):fakeResponse();}}),
    error=>error.code==='DISPATCH_READ_ACCESS_DENIED');
  assert.equal(calls,1);
});
test('global API failure inside a candidate does not become SKIPPED or trigger later candidates',async()=>{
  const paths=[];
  await assert.rejects(discover({repository:pr.base.repo.full_name,token:'offline',policy,generationSeed:'1',
    fetchImpl:async url=>{
      const path=new URL(url).pathname;paths.push(path);
      if(path.endsWith('/branches/main'))return fakeResponse(200,{commit:{sha:sha('a')}});
      if(path.endsWith('/rulesets'))return fakeResponse(200,[{id:1,name:'KAIOS Solo Owner Preflight',enforcement:'active'}]);
      if(path.endsWith('/rulesets/1'))return fakeResponse(200,{bypass_actors:[],rules:[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:[{context:'unit',integration_id:7}]}}]});
      if(path.endsWith('/pulls'))return fakeResponse(200,[pr,{...pr,number:43}]);
      if(path.endsWith('/files'))return fakeResponse(200,[{filename:'src/a.js',status:'modified',patch:'@@ -1 +1 @@\n-old\n+new'}]);
      if(path.includes('/git/commits/'))return fakeResponse(403);
      throw new Error('unexpected follow-on request');
    }}),error=>error.code==='DISPATCH_READ_ACCESS_DENIED');
  assert.equal(paths.length,6);assert.ok(!paths.some(path=>path.includes('/pulls/43')));
});
test('a later status 503 invalidates an earlier eligible candidate and publishes no fanout',async()=>{
  const candidates=[pr,{...pr,number:43,head:{...pr.head,sha:sha('e')}},{...pr,number:44,head:{...pr.head,sha:sha('f')}}];
  let failStatus=false;const paths=[];
  const scan=()=>discover({repository:pr.base.repo.full_name,token:'offline',policy,generationSeed:'1',fetchImpl:async url=>{
    const u=new URL(url),p=u.pathname;paths.push(p);
    if(p.endsWith('/branches/main'))return fakeResponse(200,{commit:{sha:sha('a')}});
    if(p.endsWith('/rulesets'))return fakeResponse(200,[{id:1,name:'KAIOS Solo Owner Preflight',enforcement:'active'}]);
    if(p.endsWith('/rulesets/1'))return fakeResponse(200,{bypass_actors:[],rules:[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:[{context:'unit',integration_id:7}]}}]});
    if(p.endsWith('/pulls'))return fakeResponse(200,candidates);
    if(p.endsWith('/files'))return fakeResponse(200,[{filename:'src/a.js',status:'modified',patch:'@@ -1 +1 @@\n-const x=1;\n+const x=2;'}]);
    if(p.includes('/git/commits/'))return fakeResponse(200,{tree:{sha:sha('c')}});
    if(p.endsWith('/status'))return failStatus&&p.includes(sha('e'))?fakeResponse(503):fakeResponse(200,{statuses:[]});
    if(p.endsWith('/check-runs'))return fakeResponse(200,{check_runs:[{...input.checks[0],head_sha:p.split('/').at(-2)}]});
    if(p.includes('/contents/'))return fakeResponse(200,{type:'file',encoding:'base64',content:Buffer.from(u.searchParams.get('ref')===sha('a')?'const x=1;':'const x=2;').toString('base64')});
    throw Error('unexpected fixture request');
  }});
  const control=await scan();assert.ok(control.every(x=>x.state==='ELIGIBLE'),JSON.stringify(control));
  failStatus=true;paths.length=0;
  const outputDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'dispatcher-partial-503-'));
  try{
    await assert.rejects(recordDispatcherScan({scan,outputDirectory}),e=>e.code==='DISPATCH_READ_SERVICE_UNAVAILABLE');
    assert.ok(paths.some(p=>p.includes('/contents/')),'first candidate must reach immutable classification');
    assert.ok(!paths.some(p=>p.includes('/pulls/44')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDirectory,'results.json'))),[]);
    const receipt=JSON.parse(fs.readFileSync(path.join(outputDirectory,'failure.json')));
    assert.equal(receipt.failure_class,'DISPATCH_READ_SERVICE_UNAVAILABLE');assert.equal(receipt.fanout_authorized,false);
  }finally{fs.rmSync(outputDirectory,{recursive:true,force:true});}
});
test('many stale reserved candidates are denied before expensive immutable reads',async()=>{
  let calls=0,blobReads=0;
  const candidates=Array.from({length:20},(_,i)=>({...pr,number:100+i,base:{...pr.base,sha:sha('d')}}));
  const results=await discover({repository:pr.base.repo.full_name,token:'offline',policy,generationSeed:'1',maxRequests:64,
    fetchImpl:async url=>{
      calls++;const p=new URL(url).pathname;
      if(p.endsWith('/branches/main'))return fakeResponse(200,{commit:{sha:sha('a')}});
      if(p.endsWith('/rulesets'))return fakeResponse(200,[{id:1,name:'KAIOS Solo Owner Preflight',enforcement:'active'}]);
      if(p.endsWith('/rulesets/1'))return fakeResponse(200,{bypass_actors:[],rules:[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:[{context:'unit',integration_id:7}]}}]});
      if(p.endsWith('/pulls'))return fakeResponse(200,candidates);
      if(p.endsWith('/files'))return fakeResponse(200,[{filename:'secrets/private.json',status:'modified',patch:'@@ -1 +1 @@\n-old\n+new'}]);
      if(p.includes('/git/commits/'))return fakeResponse(200,{tree:{sha:sha('c')}});
      if(p.includes('/contents/'))blobReads++;
      throw new Error('unexpected immutable read');
    }});
  assert.equal(results.length,20);assert.equal(blobReads,0);assert.equal(calls,24);
  assert.ok(results.every(r=>r.state==='SKIPPED'&&r.reason==='DISPATCH_OWNER_RESERVED_ACTION'));
});
test('current reserved backlog stays bounded without reading commit status or checks',async()=>{
  let calls=0;
  const candidates=Array.from({length:104},(_,i)=>({...pr,number:200+i}));
  const results=await discover({repository:pr.base.repo.full_name,token:'offline',policy,generationSeed:'1',maxRequests:128,
    fetchImpl:async url=>{
      calls++;const u=new URL(url),p=u.pathname;
      if(p.endsWith('/branches/main'))return fakeResponse(200,{commit:{sha:sha('a')}});
      if(p.endsWith('/rulesets'))return fakeResponse(200,[{id:1,name:'KAIOS Solo Owner Preflight',enforcement:'active'}]);
      if(p.endsWith('/rulesets/1'))return fakeResponse(200,{bypass_actors:[],rules:[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:[{context:'unit',integration_id:7}]}}]});
      if(p.endsWith('/pulls'))return fakeResponse(200,candidates.slice((Number(u.searchParams.get('page')||1)-1)*100,Number(u.searchParams.get('page')||1)*100));
      if(p.endsWith('/files'))return fakeResponse(200,[{filename:'secrets/private.json',status:'modified',patch:'@@ -1 +1 @@\n-old\n+new'}]);
      throw new Error('reserved candidate must not read commit status checks or contents');
    }});
  assert.equal(results.length,104);assert.equal(calls,109);
  assert.ok(results.every(r=>r.state==='SKIPPED'&&r.reason==='DISPATCH_OWNER_RESERVED_ACTION'));
});
test('global read failure cannot be swallowed by uncertainty reclassification',async()=>{
  const approvalPolicy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json'));
  let reads=0;
  await assert.rejects(reclassifyUnknownCandidate({context:{...input,classificationMode:'CURRENT_BASE'},
    error:new DispatcherError('CAPABILITY_SOURCE_MISSING'),approvalPolicy,
    readCandidate:async()=>{reads++;throw new DispatcherError('DISPATCH_RATE_LIMITED');}}),
    error=>error.code==='DISPATCH_RATE_LIMITED');
  assert.equal(reads,1);
});


test('unverified source adapter is rejected before any external reads',async()=>{
  let reads=0;await assert.rejects(discover({repository:pr.base.repo.full_name,token:'offline',policy,generationSeed:'1',sourceReader:{commit:async()=>({})},fetchImpl:async()=>{reads++;throw Error('must not read');}}),/SOURCE_BATCH_READER_UNVERIFIED/);assert.equal(reads,0);
});


for(const code of ['SOURCE_BATCH_SOURCE_NOT_REGISTERED','SOURCE_BATCH_OBJECT_MISSING','SOURCE_BATCH_SEALED_OBJECT_MISSING'])test(`uncertainty reclassification propagates global ${code} without retry or partial results`,async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-reclassification-'));let reads=0;const failure=Object.assign(new Error(code),{code,global:true});
  try {
    fs.writeFileSync(path.join(directory,'results.json'),'[{"state":"ELIGIBLE"}]');
    await assert.rejects(recordDispatcherScan({outputDirectory:directory,scan:()=>reclassifyUnknownCandidate({context:input,error:unknown,approvalPolicy,readCandidate:async()=>{reads++;throw failure;}})}),error=>error===failure);
    assert.equal(reads,1);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'results.json'))),[]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'failure.json'))).fanout_authorized,false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});


import {packFixture,packFixtureEntry} from './bounded-git-pack-decoder-v1.test.mjs';
import {gitObjectId} from '../../../scripts/kidults/kpmo/lib/bounded-git-source-reader-v1.mjs';
import {gitPacketLine as packet} from '../../../scripts/kidults/kpmo/lib/bounded-git-public-transport-v1.mjs';
function sourceTransportScanFixture({drift=false,repositoryDrift=false,mainDrift=false,corrupt=false}={}){
 const repo=pr.base.repo.full_name,blob=Buffer.from('same bytes\n'),tree=Buffer.concat([Buffer.from('100644 file.mjs\0'),Buffer.from(gitObjectId('blob',blob),'hex')]);
 const commit=name=>Buffer.from(`tree ${gitObjectId('tree',tree)}\nauthor ${name} <${name}@example.invalid> 0 +0000\ncommitter ${name} <${name}@example.invalid> 0 +0000\n\n${name}\n`);
 const main=commit('main'),head=commit('head'),base=commit('base'),mainSha=gitObjectId('commit',main),headSha=gitObjectId('commit',head),baseSha=gitObjectId('commit',base);
 const candidates=[42,43].map(number=>({...pr,number,base:{...pr.base,sha:baseSha},head:{...pr.head,sha:headSha}}));
 const packed=packFixture([packFixtureEntry(1,main),packFixtureEntry(1,head),packFixtureEntry(1,base),packFixtureEntry(2,tree),packFixtureEntry(3,blob)]);if(corrupt)packed[15]^=1;
 const wire=Buffer.concat([packet('packfile\n'),packet(Buffer.concat([Buffer.from([1]),packed])),Buffer.from('0000')]);const trace=[];
 const fetchImpl=async(url,options)=>{trace.push({url,options});const p=new URL(url).pathname;
  if(url.includes('github.com/'+repo+'.git/'))return new Response(options.method==='GET'?Buffer.concat([packet('version 2\n'),packet('fetch=shallow\n'),Buffer.from('0000')]):wire,{headers:{'content-type':options.method==='GET'?'application/x-git-upload-pack-advertisement':'application/x-git-upload-pack-result'}});
  if(p.endsWith('/branches/main'))return fakeResponse(200,{commit:{sha:mainDrift&&trace.filter(x=>new URL(x.url).pathname.endsWith('/branches/main')).length>1?sha('f'):mainSha}});
  if(p.endsWith('/rulesets'))return fakeResponse(200,[{id:1,name:'KAIOS Solo Owner Preflight',enforcement:'active'}]);
  if(p.endsWith('/rulesets/1'))return fakeResponse(200,{bypass_actors:[],rules:[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:[{context:'unit',integration_id:7}]}}]});
  if(p.endsWith('/pulls'))return fakeResponse(200,candidates);
  if(p.endsWith('/files'))return fakeResponse(200,[{filename:'file.mjs',status:'modified',patch:'@@ -1 +1 @@\n-old\n+same bytes'}]);
  if(/\/pulls\/\d+$/.test(p)){const found=candidates.find(x=>x.number===Number(p.split('/').at(-1)));return fakeResponse(200,drift?{...found,head:{...found.head,sha:sha('f')}}:repositoryDrift?{...found,base:{...found.base,repo:{...found.base.repo,id:9}}}:found);}
  throw Error('unexpected follow-on request');
 };return{trace,args:{repository:repo,token:'offline',policy,generationSeed:'1',sourceTransport:true,fetchImpl},mainSha,headSha,baseSha};
}
test('source preparation shares the same budget and preserves full bindings in a non-authorizing receipt',async()=>{
 const f=sourceTransportScanFixture(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-proof-'));
 try{const results=await recordDispatcherScan({outputDirectory:directory,repository:f.args.repository,sourceSha:sha('d'),runId:'1',scan:()=>discover({...f.args,maxRequests:11})});
 assert.equal(results.length,2);assert.ok(results.every(x=>x.state==='STALE_REDUNDANT'));assert.equal(f.trace.length,11);
 const receipt=JSON.parse(fs.readFileSync(path.join(directory,'source-read.json')));assert.equal(receipt.authorization_created,false);assert.equal(receipt.producer.requests,2);assert.equal(receipt.shared_read_diagnostics.request_count,11);assert.equal(receipt.shared_read_diagnostics.resource_counts.other,2);assert.deepEqual(receipt.source_shas,[f.mainSha,f.headSha,f.baseSha].sort());
 assert.ok(!f.trace.some(x=>x.url.includes('/contents/')||x.url.includes('/git/commits/')));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('shared request exhaustion cannot reset the API budget for POST or leave partial results',async()=>{
 const f=sourceTransportScanFixture(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-budget-'));
 try{await assert.rejects(recordDispatcherScan({outputDirectory:directory,scan:()=>discover({...f.args,maxRequests:9})}),error=>error.code==='DISPATCH_READ_BUDGET_EXHAUSTED'&&error.read_diagnostics.request_count===9);
 assert.equal(f.trace.length,9);assert.ok(!f.trace.some(x=>x.options.method==='POST'));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'results.json'))),[]);assert.equal(fs.existsSync(path.join(directory,'source-read.json')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('file metadata head drift aborts before source transport or new source registration',async()=>{
 const f=sourceTransportScanFixture({drift:true});await assert.rejects(discover(f.args),/CANDIDATE_BINDING_CHANGED/);assert.ok(!f.trace.some(x=>x.url.includes('.git/')));
});
test('a corrupt pack invalidates the whole scan and never creates a source receipt',async()=>{
 const f=sourceTransportScanFixture({corrupt:true}),directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-pack-failure-'));
 try{await assert.rejects(recordDispatcherScan({outputDirectory:directory,scan:()=>discover(f.args)}),/PACK_DIGEST_MISMATCH/);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'results.json'))),[]);assert.equal(fs.existsSync(path.join(directory,'source-read.json')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('protected main drift after source preparation aborts without publishing a snapshot receipt',async()=>{
 const f=sourceTransportScanFixture({mainDrift:true}),directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-main-drift-'));
 try{await assert.rejects(recordDispatcherScan({outputDirectory:directory,scan:()=>discover(f.args)}),/MAIN_BINDING_CHANGED/);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'results.json'))),[]);assert.equal(fs.existsSync(path.join(directory,'source-read.json')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('source receipt write failure leaves no eligible or reusable source evidence',async()=>{
 const f=sourceTransportScanFixture(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-evidence-write-')),original=fs.writeFileSync;
 try{fs.writeFileSync=(path,...args)=>{if(String(path).endsWith('/source-read.json'))throw Error('source receipt write failure');return original(path,...args);};
 await assert.rejects(recordDispatcherScan({outputDirectory:directory,scan:()=>discover(f.args)}),/source receipt write failure/);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'results.json'))),[]);assert.equal(fs.existsSync(path.join(directory,'source-read.json')),false);
 }finally{fs.writeFileSync=original;fs.rmSync(directory,{recursive:true,force:true});}
});
test('caller cannot inject a source receipt onto a result array',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-evidence-spoof-'));
 try{await recordDispatcherScan({outputDirectory:directory,scan:async()=>Object.assign([],{source_read_receipt:{state:'fake'}})});assert.equal(fs.existsSync(path.join(directory,'source-read.json')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('same SHA with changed repository identity is rejected before source fetch',async()=>{
 const f=sourceTransportScanFixture({repositoryDrift:true});await assert.rejects(discover(f.args),/CANDIDATE_BINDING_CHANGED/);assert.ok(!f.trace.some(x=>x.url.includes('.git/')));
});

for(const scenario of ['alternate-profile-absent','missing-policy','invalid-policy','missing-approval','invalid-approval'])test(`actual CLI ${scenario} invalidates stale evidence before external reads`,()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dispatcher-cli-policy-'));
 const canonical='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json',approval='coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json',out=path.join(directory,'out/autonomous-dispatcher-v1');
 try{
  fs.mkdirSync(path.join(directory,path.dirname(canonical)),{recursive:true});fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'results.json'),'[{"state":"ELIGIBLE"}]');fs.writeFileSync(path.join(out,'source-read.json'),'{"state":"stale"}');
  if(scenario!=='missing-policy')fs.writeFileSync(path.join(directory,canonical),scenario==='invalid-policy'?'{':JSON.stringify({}));
  if(scenario!=='missing-approval')fs.writeFileSync(path.join(directory,approval),scenario==='invalid-approval'?'{':'{}');
  fs.writeFileSync(path.join(directory,'alternate.json'),'{}');
  const env={PATH:process.env.PATH,GITHUB_REPOSITORY:pr.base.repo.full_name,GITHUB_SHA:sha('a'),GITHUB_RUN_ID:'1'};
  if(scenario==='alternate-profile-absent')env.KIDULTS_AUTONOMOUS_POLICY_PATH='alternate.json';
  const result=spawnSync(process.execPath,[path.resolve('scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs')],{cwd:directory,env,encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.notEqual(result.status,0);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,'results.json'))),[]);assert.equal(fs.existsSync(path.join(out,'source-read.json')),false);
  const failure=JSON.parse(fs.readFileSync(path.join(out,'failure.json')));assert.equal(failure.fanout_authorized,false);
  if(scenario==='alternate-profile-absent')assert.match(result.stderr,/DISPATCH_SOURCE_PROFILE_POLICY_PATH_INVALID/);
  else assert.match(result.stderr,scenario.startsWith('missing')?/ENOENT/:/SyntaxError/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('empty current-base PR requires complete source trees, not a zero-file API claim',()=>{
  const pr={number:1884,state:'open',merged:false,base:{ref:'main',sha:sha('a'),repo:{full_name:'owner/repo'}},head:{sha:sha('b'),repo:{full_name:'owner/repo'}}};
  const input={pr,mainSha:sha('a'),files:[],policy,headCommit:{sha:sha('b'),tree:{sha:sha('c')}},mainCommit:{sha:sha('a'),tree:{sha:sha('c')}}};
  assert.equal(classifyEmptyTreeRedundant(input).binding.proof,'EXACT_COMPLETE_TREE_EQUALS_CURRENT_MAIN');
  for (const delta of [
    {headCommit:{sha:sha('b'),tree:{sha:sha('d')}}},
    {mainCommit:{sha:sha('a'),tree:{sha:null}}},
    {headCommit:{sha:sha('e'),tree:{sha:sha('c')}}},
    {mainCommit:{sha:sha('e'),tree:{sha:sha('c')}}},
    {files:[{filename:'pending.mjs'}]},
    {pr:{...pr,state:'closed'}},
    {pr:{...pr,merged:true}},
    {pr:{...pr,head:{...pr.head,repo:{full_name:'attacker/fork'}}}},
  ]) assert.throws(()=>classifyEmptyTreeRedundant({...input,...delta}),/DISPATCH_EMPTY_DIFF_TREE_MISMATCH/);
  assert.throws(()=>classifyEmptyTreeRedundant({...input,policy:{}}),/DISPATCH_EMPTY_DIFF_HYGIENE_DISABLED/);
});

test('Finalizer observes protected cutover before creating a durable reservation',()=>{
  const source=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
  assert.ok(source.indexOf('await acquireEventToken({observeCutover:true})')<source.indexOf("action:'CREATE_RESERVATION'"));
});
