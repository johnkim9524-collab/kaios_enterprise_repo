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
import {recordDispatcherScan,createDispatcherReadClient,discover,buildPolicyRepairRequired,buildOwnerReviewRequired,classifyCandidate,classifyStaleBaseCandidate,DispatcherError,isCandidateRejection,isUnknownClassification,reclassifyUnknownCandidate} from '../../../scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
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
assert.match(dispatcherWorkflow,/\/dev\/stderr 2>&1 >\/dev\/null/);
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
assert.doesNotMatch(dispatcherWorkflow,/contents:\s*write/);
assert.match(dispatcherWorkflow,/AUTONOMOUS_STALE_BASE_CONVERGENCE/);
assert.match(dispatcherWorkflow,/AUTONOMOUS_REDUNDANT_PR_HYGIENE/);
assert.match(dispatcherWorkflow,/permission_profile:\$profile/);
assert.match(dispatcherWorkflow,/pulls\/\$pr\/update-branch/);
assert.match(dispatcherWorkflow,/expected_head_sha:\$h/);
assert.match(dispatcherWorkflow,/LIFECYCLE_OIDC_TOKEN_REQUEST_HTTP_/);
assert.match(dispatcherWorkflow,/http_code.*422[\s\S]*QUARANTINE_NO_MUTATION_RETRY/);
assert.match(dispatcherWorkflow,/STALE_BASE_UPDATE_HTTP_/);
assert.match(dispatcherWorkflow,/github_message:/);
assert.match(dispatcherWorkflow,/http_code.*!= 202[\s\S]*for _ in \$\(seq 1 24\)/);
assert.match(dispatcherWorkflow,/new_head.*!=.*head[\s\S]*new_base.*=.*main/);
assert.match(dispatcherWorkflow,/expected_parents[\s\S]*STALE_BASE_CONVERGED/);
assert.match(dispatcherWorkflow,/fresh_ci_required:true,fresh_authorization_generation_required:true/);
assert.doesNotMatch(dispatcherWorkflow,/update-branch[\s\S]{0,1200}(?:--force(?:\s|$)|force:true|force-with-lease)/);
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
assert.match(governedWorkflow,/state:'READY_PENDING_ATOMIC_LANDING'[\s\S]*exact_base_sha:base/);
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
assert.match(finalizerSource,/const finalizerRunId=required\('GITHUB_RUN_ID'\);[\s\S]*state:'FINALIZER_ROLE_FOLLOWER'[\s\S]*const eventToken=await acquireEventToken\(\);[\s\S]*let reservation;[\s\S]*writerAttempts[\s\S]*action:'CREATE_RESERVATION'/);
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

// Execute the committed workflow function against offline shell mocks. No real
// AWS/GitHub calls or credentials are used, including on failure paths.
const lifecycleFunction=dispatcherWorkflow.match(/^          mint_lifecycle_token\(\) \{\n[\s\S]*?^          \}/m)?.[0];
assert.ok(lifecycleFunction,'lifecycle token function must remain testable');
const lifecycleBinding={pull_request:2462,old_base_sha:sha('a'),expected_head_sha:sha('b'),current_main_sha:sha('c')};
const lifecycleProfile='AUTONOMOUS_STALE_BASE_CONVERGENCE';
const validBroker={ok:true,token_type:'GITHUB_APP_INSTALLATION',repository:pr.head.repo.full_name,repository_id:'1281328888',permission_profile:lifecycleProfile,token:'ghs_OFFLINE_FIXTURE_TOKEN_NOT_A_CREDENTIAL'};
const lifecycleCases=[
  {name:'valid'},
  {name:'oidc_transport',code:'LIFECYCLE_OIDC_TOKEN_REQUEST_TRANSPORT'},
  {name:'oidc_http',http:'401',code:'LIFECYCLE_OIDC_TOKEN_REQUEST_HTTP_401'},
  {name:'oidc_bad_json',oidc:'not-json',code:'LIFECYCLE_OIDC_TOKEN_INVALID'},
  {name:'oidc_null',oidc:'{"value":null}',code:'LIFECYCLE_OIDC_TOKEN_INVALID'},
  {name:'sts_failed',code:'LIFECYCLE_STS_FAILED'},
  {name:'sts_partial',creds:'OFFLINE_KEY\tOFFLINE_SECRET',code:'LIFECYCLE_STS_RESPONSE_INVALID'},
  {name:'sts_extra',creds:'OFFLINE_KEY\tOFFLINE_SECRET\tOFFLINE_SESSION\tEXTRA',code:'LIFECYCLE_STS_RESPONSE_INVALID'},
  {name:'sts_none',creds:'None\tNone\tNone',code:'LIFECYCLE_STS_RESPONSE_INVALID'},
  {name:'invoke_failed',code:'LIFECYCLE_BROKER_INVOKE_FAILED'},
  {name:'broker_denied',body:{errorMessage:'EVENT_TOKEN_BROKER_DENIED'}},
  {name:'broker_read_scope',body:{errorMessage:'EVENT_TOKEN_BROKER_DENIED:READ_SCOPE'},code:'LIFECYCLE_BROKER_READ_SCOPE'},
  {name:'broker_write_scope',body:{errorMessage:'EVENT_TOKEN_BROKER_DENIED:WRITE_SCOPE'},code:'LIFECYCLE_BROKER_WRITE_SCOPE'},
  {name:'broker_live_tuple',body:{errorMessage:'EVENT_TOKEN_BROKER_DENIED:LIVE_TUPLE'},code:'LIFECYCLE_BROKER_LIVE_TUPLE'},
  {name:'broker_spoofed_reason',body:{errorMessage:'EVENT_TOKEN_BROKER_DENIED:ZZIAABCDEFGHIJKLMNOP'}},
  {name:'broker_unbounded_reason',body:{errorMessage:'EVENT_TOKEN_BROKER_DENIED:'+'A'.repeat(80)}},
  {name:'broker_bad_json',raw:'not-json'},
  {name:'broker_null',body:{...validBroker,token:null}},
  {name:'broker_short',body:{...validBroker,token:'null'}},
  {name:'broker_wrong_profile',body:{...validBroker,permission_profile:'OTHER'}},
  {name:'broker_wrong_repo',body:{...validBroker,repository:'other/repository'}},
  {name:'broker_wrong_id',body:{...validBroker,repository_id:'1'}},
  {name:'broker_wrong_type',body:{...validBroker,token_type:'OTHER'}},
  {name:'broker_not_ok',body:{...validBroker,ok:false}},
  {name:'broker_header_injection',body:{...validBroker,token:validBroker.token+'\nX-Other: value'}},
];
lifecycleCases.push({name:'valid_hygiene',profile:'AUTONOMOUS_REDUNDANT_PR_HYGIENE',body:{...validBroker,permission_profile:'AUTONOMOUS_REDUNDANT_PR_HYGIENE'}});
const lifecycleMocks=String.raw`set -euo pipefail
curl() {
  [[ "$MOCK_CASE" != oidc_transport ]] || return 7
  printf '%s\n%s' "$MOCK_OIDC_BODY" "$MOCK_HTTP_STATUS"
}
aws() {
  if [[ "$1" == sts ]]; then
    [[ "$MOCK_CASE" != sts_failed ]] || return 255
    printf '%s\n' "$MOCK_CREDS"
  else
    [[ "$MOCK_CASE" != invoke_failed ]] || return 255
    printf '%s' "$MOCK_BROKER_RESPONSE" >&2
    printf '{"StatusCode":200}\n'
  fi
}
`;
let lifecycleCaseCount=0;
for(const caller of ['assignment','conditional']) for(const fixture of lifecycleCases){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kidults-lifecycle-mock-'));
  fs.mkdirSync(path.join(root,'out/autonomous-dispatcher-v1/lifecycle'),{recursive:true});
  try {
    const call='token=$(mint_lifecycle_token "$MOCK_BINDING" "$MOCK_PROFILE" offline-generation-2462)';
    const tail=caller==='conditional'?`if ${call}; then printf 'MUTATION_ALLOWED'; else exit 42; fi`:`${call}\nprintf 'MUTATION_ALLOWED'`;
    const run=spawnSync(process.env.KIDULTS_TEST_BASH||'bash',['--noprofile','--norc','-s'],{
      cwd:root,encoding:'utf8',timeout:15000,
      input:`${lifecycleMocks}\n${lifecycleFunction}\n${tail}\n`,
      env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:os.tmpdir(),TMP:os.tmpdir(),
        ACTIONS_ID_TOKEN_REQUEST_TOKEN:'OFFLINE',ACTIONS_ID_TOKEN_REQUEST_URL:'https://offline.invalid',AWS_ROLE_ARN:'OFFLINE',GITHUB_RUN_ID:'1',GITHUB_REPOSITORY:pr.head.repo.full_name,GITHUB_REPOSITORY_ID:'1281328888',BROKER_FUNCTION:'OFFLINE',
        MOCK_CASE:fixture.name,MOCK_BINDING:JSON.stringify(lifecycleBinding),MOCK_PROFILE:fixture.profile||lifecycleProfile,MOCK_OIDC_BODY:fixture.oidc||'{"value":"OFFLINE_OIDC"}',MOCK_HTTP_STATUS:fixture.http||'200',MOCK_CREDS:fixture.creds||'OFFLINE_KEY\tOFFLINE_SECRET\tOFFLINE_SESSION',MOCK_BROKER_RESPONSE:fixture.raw||JSON.stringify(fixture.body||validBroker)},
    });
    assert.equal(run.error,undefined,`${caller}/${fixture.name}: local shell execution`);
    assert.equal(run.signal,null,`${caller}/${fixture.name}: local shell timeout`);
    const receiptPath=path.join(root,'out/autonomous-dispatcher-v1/lifecycle/pr-2462-token-failure.json');
    if(fixture.name.startsWith('valid')) {
      assert.equal(run.status,0,`${caller}/${fixture.name}: valid response rejected`);
      assert.equal(run.stdout,'MUTATION_ALLOWED');
      assert.equal(fs.existsSync(receiptPath),false);
    } else {
      assert.notEqual(run.status,0,`${caller}/${fixture.name}: failed mint escaped as success`);
      assert.doesNotMatch(run.stdout,/MUTATION_ALLOWED/);
      const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
      assert.equal(receipt.state,'LIFECYCLE_TOKEN_REJECTED');
      assert.equal(receipt.failure_code,fixture.code||'LIFECYCLE_BROKER_RESPONSE_DENIED_OR_INVALID');
      assert.equal(receipt.repository_mutation_attempted,false);
      assert.equal(receipt.token_accepted,false);
      assert.equal(receipt.expected_head_sha,lifecycleBinding.expected_head_sha);
      assert.equal(receipt.current_main_sha,lifecycleBinding.current_main_sha);
      assert.equal(receipt.permission_profile,lifecycleProfile);
      for(const boundary of ['production','public','g5']) assert.equal(receipt[boundary],'HOLD');
    }
    assert.ok(!run.stdout.includes(validBroker.token),'token must not escape into test output');
    lifecycleCaseCount++;
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
console.log(JSON.stringify({state:'VERIFIED_PASS',suite:'lifecycle-failure-propagation-offline',cases:lifecycleCaseCount,real_network:false,real_credentials:false}));

const mockedLifecycleShell = [
  "set -euo pipefail",
  "export TMPDIR=\"$PWD/tmp\"",
  "mkdir -p \"$TMPDIR\"",
  "export GITHUB_REPOSITORY=johnkim9524-collab/kaios_enterprise_repo GITHUB_REPOSITORY_ID=1281328888 GITHUB_RUN_ID=900001",
  "export AWS_ROLE_ARN=fixture-role BROKER_FUNCTION=fixture-broker KIDULTS_AUTONOMOUS_DISPATCH_EVENT=kidults.authorization.generation.v1",
  "export ACTIONS_ID_TOKEN_REQUEST_TOKEN=fixture-request-token ACTIONS_ID_TOKEN_REQUEST_URL=https://oidc.invalid/token?fixture=1",
  "sleep() { :; }",
  "curl() {",
  "  local out='' url='' verb=GET arg pn",
  "  while (( $# )); do",
  "    case \"$1\" in",
  "      -o) out=\"$2\"; shift 2;;",
  "      -X) verb=\"$2\"; shift 2;;",
  "      -H|-w|--data-binary) shift 2;;",
  "      *) arg=\"$1\"; if [[ \"$arg\" == https:* ]]; then url=\"$arg\"; fi; shift;;",
  "    esac",
  "  done",
  "  if [[ \"$url\" == https://oidc.invalid/* ]]; then",
  "    echo oidc >> trace",
  "    case \"$FIXTURE_CASE\" in",
  "      oidc_http) echo 401; return 22;;",
  "      oidc_network) echo 000; return 6;;",
  "      oidc_json) echo invalid >\"$out\";;",
  "      oidc_null) echo '{\"value\":null}' >\"$out\";;",
  "      *) echo '{\"value\":\"fixture_oidc_token_0123456789\"}' >\"$out\";;",
  "    esac",
  "    echo 200; return 0",
  "  fi",
  "  if [[ \"$verb\" = PUT ]]; then",
  "    [[ \"$url\" =~ /pulls/([0-9]+)/update-branch$ ]] || return 91",
  "    pn=\"${BASH_REMATCH[1]}\"",
  "    echo \"update:$pn:$out\" >> trace",
  "    case \"$FIXTURE_CASE:$pn\" in",
  "      update_422:*|response_isolation:42) echo '{\"message\":\"Validation Failed\"}' >\"$out\"; echo 422; return 22;;",
  "      update_403_workflow:*) echo '{\"message\":\"refusing to allow a GitHub App to create or update workflow `.github/workflows/ci-validation.yml` without `workflows` permission\"}' >\"$out\"; echo 403; return 22;;",
  "      update_403_unknown:*) echo '{\"message\":\"private response ghs_do_not_emit\"}' >\"$out\"; echo 403; return 22;;",
  "      update_403_malformed:*) echo invalid >\"$out\"; echo 403; return 22;;",
  "      update_403_integration:*) echo '{\"message\":\"Resource not accessible by integration\"}' >\"$out\"; echo 403; return 22;;",
  "      update_401:*) echo '{\"message\":\"Bad credentials\"}' >\"$out\"; echo 401; return 22;;",
  "      response_isolation:43) echo 000; return 6;;",
  "      *) echo '{\"message\":\"accepted\"}' >\"$out\"; echo 202; return 0;;",
  "    esac",
  "  fi",
  "  if [[ \"$url\" == */pulls/* ]]; then",
  "    [[ \"$FIXTURE_CASE\" != readback_failure ]] || return 22",
  "    if [[ \"$FIXTURE_CASE\" = convergence_timeout ]]; then",
  "      jq -n --arg h \"$OLD_HEAD\" --arg b \"$CURRENT_MAIN\" '{head:{sha:$h},base:{sha:$b}}'",
  "    else",
  "      jq -n --arg h \"$NEW_HEAD\" --arg b \"$CURRENT_MAIN\" '{head:{sha:$h},base:{sha:$b}}'",
  "    fi",
  "    return 0",
  "  fi",
  "  if [[ \"$url\" == */commits/* ]]; then",
  "    if [[ \"$FIXTURE_CASE\" = reversed_parents ]]; then",
  "      jq -n --arg h \"$OLD_HEAD\" --arg b \"$CURRENT_MAIN\" '{parents:[{sha:$b},{sha:$h}]}'",
  "    else",
  "      jq -n --arg h \"$OLD_HEAD\" --arg b \"$CURRENT_MAIN\" '{parents:[{sha:$h},{sha:$b}]}'",
  "    fi",
  "    return 0",
  "  fi",
  "  echo unexpected_curl >&2; return 90",
  "}",
  "aws() {",
  "  if [[ \"$1\" = sts ]]; then",
  "    echo sts >> trace",
  "    [[ \"$FIXTURE_CASE\" != sts_failure ]] || return 7",
  "    if [[ \"$FIXTURE_CASE\" = sts_incomplete ]]; then echo incomplete; else echo 'fixture_key fixture_secret fixture_session'; fi",
  "    return 0",
  "  fi",
  "  [[ \"$1\" = lambda ]] || return 92",
  "  echo invoke >> trace",
  "  [[ \"$FIXTURE_CASE\" != invoke_failure ]] || return 8",
  "  local out=\"${@: -1}\" payload=''",
  "  while (( $# )); do",
  "    if [[ \"$1\" = --payload ]]; then payload=\"$2\"; break; fi",
  "    shift",
  "  done",
  "  local profile",
  "  profile=$(jq -r '.permission_profile' <<<\"$payload\")",
  "  jq -n --arg repo \"$GITHUB_REPOSITORY\" --arg rid \"$GITHUB_REPOSITORY_ID\" --arg profile \"$profile\" '{ok:true,token_type:\"GITHUB_APP_INSTALLATION\",repository:$repo,repository_id:$rid,permission_profile:$profile,token:\"ghs_synthetic_fixture_0123456789\"}' >\"$out\"",
  "  case \"$FIXTURE_CASE\" in",
  "    function_error) echo '{\"errorMessage\":\"EVENT_TOKEN_BROKER_DENIED\"}' >\"$out\"; echo '{\"StatusCode\":200,\"FunctionError\":\"Unhandled\"}'; return 0;;",
  "    metadata_invalid) echo invalid; return 0;;",
  "    body_invalid) echo invalid >\"$out\";;",
  "    token_null) jq '.token=null' \"$out\" >\"$out.next\"; mv \"$out.next\" \"$out\";;",
  "    token_short) jq '.token=\"null\"' \"$out\" >\"$out.next\"; mv \"$out.next\" \"$out\";;",
  "    token_malformed) jq '.token=\"ghs_bad token_with_space_0000000\"' \"$out\" >\"$out.next\"; mv \"$out.next\" \"$out\";;",
  "    wrong_profile) jq '.permission_profile=\"UNKNOWN\"' \"$out\" >\"$out.next\"; mv \"$out.next\" \"$out\";;",
  "    wrong_repository) jq '.repository=\"other/repo\"' \"$out\" >\"$out.next\"; mv \"$out.next\" \"$out\";;",
  "    ok_false) jq '.ok=false' \"$out\" >\"$out.next\"; mv \"$out.next\" \"$out\";;",
  "  esac",
  "  echo '{\"StatusCode\":200}'",
  "}"
].join(String.fromCharCode(10));
const lifecycleShellCases = [
  ["happy", null],
  ["update_422", "STALE_BASE_UPDATE_422"],
  ["update_401", "STALE_BASE_UPDATE_HTTP_401"],
  ["update_403_workflow", "STALE_BASE_UPDATE_HTTP_403"],
  ["update_403_unknown", "STALE_BASE_UPDATE_HTTP_403"],
  ["update_403_malformed", "STALE_BASE_UPDATE_HTTP_403"],
  ["update_403_integration", "STALE_BASE_UPDATE_HTTP_403"],
  ["response_isolation", "STALE_BASE_UPDATE_HTTP_000"],
  ["readback_failure", "STALE_BASE_CONVERGENCE_READBACK_FAILED"],
  ["reversed_parents", "STALE_BASE_CONVERGENCE_PARENT_MISMATCH"],
  ["convergence_timeout", "STALE_BASE_CONVERGENCE_TIMEOUT"]
];
// Execute the actual lifecycle loops with real jq and offline network mocks.
// Mint is mocked here and tested separately by the 42-case propagation suite above.
const shellStart=dispatcherWorkflow.indexOf("          current_receipt=''");
const shellEnd=dispatcherWorkflow.indexOf('      - name: Upload bounded scan and terminal fanout evidence',shellStart);
assert.ok(shellStart>0&&shellEnd>shellStart);
let workflowShell=dispatcherWorkflow.slice(shellStart,shellEnd).split(String.fromCharCode(10)).map(line=>line.slice(10)).join(String.fromCharCode(10));
const tokenFunction=workflowShell.match(/^mint_lifecycle_token\(\) \{[\s\S]*?^\}/m)?.[0]; assert.ok(tokenFunction);
workflowShell=workflowShell.replace(tokenFunction, "mint_lifecycle_token() { printf %s ghs_synthetic_fixture_0123456789; }");
const bash=process.platform==='win32'?path.join(process.env.ProgramFiles||'C:/Program Files','Git','bin','bash.exe'):'bash';
const fixtureRoot=fs.mkdtempSync(path.join(os.tmpdir(),'kidults-lifecycle-shell-'));
let shellCasesPassed=0;
try {
  for(const [name,failureCode] of lifecycleShellCases){
    const cwd=path.join(fixtureRoot,name);fs.mkdirSync(cwd);
    fs.mkdirSync(path.join(cwd,'out/autonomous-dispatcher-v1'),{recursive:true});
    const binding=n=>({state:'STALE_RECOVERABLE',binding:{pull_request:n,old_base_sha:'a'.repeat(40),expected_head_sha:'b'.repeat(40),current_main_sha:'c'.repeat(40)}});
    fs.writeFileSync(path.join(cwd,'out/autonomous-dispatcher-v1/results.json'),JSON.stringify(name==='response_isolation'?[binding(42),binding(43)]:[binding(42)]));
    const env={PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT||'',TEMP:process.env.TEMP||os.tmpdir(),TMP:process.env.TMP||os.tmpdir(),FIXTURE_CASE:name,OLD_HEAD:'b'.repeat(40),CURRENT_MAIN:'c'.repeat(40),NEW_HEAD:'d'.repeat(40)};
    const jqMode=process.platform==='win32'?'jq() { command jq -b "$@"; }'+String.fromCharCode(10):'';
    fs.writeFileSync(path.join(cwd,'fixture.sh'),jqMode+mockedLifecycleShell+String.fromCharCode(10)+workflowShell);
    const result=spawnSync(bash,['--noprofile','--norc','fixture.sh'],{cwd,env,encoding:'utf8',timeout:30000});
    assert.ifError(result.error);
    const receiptPath=path.join(cwd,'out/autonomous-dispatcher-v1/lifecycle',`pr-${name==='response_isolation'?43:42}-convergence.json`);
    assert.ok(fs.existsSync(receiptPath),`${name}: missing terminal receipt; ${result.stderr}`);
    const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
    const trace=fs.readFileSync(path.join(cwd,'trace'),'utf8').trim().split(String.fromCharCode(10)).map(x=>x.trim());
    const mutations=trace.filter(x=>x.startsWith('update:'));
    if(failureCode){
      assert.equal(receipt.state,'QUARANTINE_NO_MUTATION_RETRY',name);
      assert.equal(receipt.failure_code,failureCode,name);
      if(name==='update_422') assert.equal(result.status,0,result.stderr); else assert.notEqual(result.status,0,`${name}: failure escaped as success`);
      if(name.startsWith('oidc_')||name.startsWith('sts_')||['invoke_failure','function_error','metadata_invalid','body_invalid','token_null','token_short','token_malformed','wrong_profile','wrong_repository','ok_false'].includes(name)){
        assert.equal(mutations.length,0,`${name}: invalid token reached mutation`);
        assert.equal(receipt.mutation_state,'NOT_ATTEMPTED',name);
      }
    }else{
      assert.equal(result.status,0,result.stderr);
      assert.equal(receipt.state,'STALE_BASE_CONVERGED');
      assert.equal(receipt.ordered_parent_set_verified,true);
      assert.equal(receipt.new_head_sha,'d'.repeat(40));
      assert.equal(mutations.length,1);
    }
    if(name.startsWith('update_403_')){
      assert.equal(receipt.github_message,name==='update_403_workflow'?'WORKFLOW_WRITE_PERMISSION_REQUIRED':name==='update_403_integration'?'Resource not accessible by integration':'UNAVAILABLE');
      assert.equal(receipt.mutation_state,'UNKNOWN');
      assert.equal(mutations.length,1,'403 must never retry');
      assert.doesNotMatch(JSON.stringify(receipt),/ghs_do_not_emit|ci-validation/);
    }
    if(name==='response_isolation'){
      assert.equal(receipt.github_message,'UNAVAILABLE');
      assert.equal(receipt.mutation_state,'UNKNOWN');
      assert.equal(mutations.length,2);
      assert.notEqual(mutations[0].split(':').slice(2).join(':'),mutations[1].split(':').slice(2).join(':'));
    }
    assert.ok(!JSON.stringify(receipt).includes('synthetic_fixture'));
    assert.deepEqual(fs.readdirSync(path.join(cwd,'tmp')),[],`${name}: token response tempfile leaked`);
    shellCasesPassed++;
  }
} finally {fs.rmSync(fixtureRoot,{recursive:true,force:true});}
console.log(JSON.stringify({state:'VERIFIED_PASS',suite:'actual-lifecycle-loop-offline',cases:shellCasesPassed,live_network_calls:0,real_credentials_used:false}));

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
test('failed immutable response is not cached and immutable 404 is reused',async()=>{
  let calls=0;const client=createDispatcherReadClient({token:'offline',fetchImpl:async()=>fakeResponse(++calls===1?500:404)});
  await assert.rejects(client.request(immutablePath),error=>error.code==='DISPATCH_GITHUB_API');
  assert.equal(await client.request(immutablePath),null);assert.equal(await client.request(immutablePath),null);assert.equal(calls,2);
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
