import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyCandidate,classifyStaleBaseCandidate,DispatcherError,isCandidateRejection} from '../../../scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
import {CapabilityDeltaError} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {buildDispatchRequest,transitionDispatchReceipt,validateDispatchEvent,DISPATCH_ROLES} from '../../../scripts/kidults/kpmo/lib/autonomous-dispatch-fanout-v1.mjs';
const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json'));
const sha=c=>c.repeat(40);
const pr={number:42,state:'open',merged:false,draft:false,base:{ref:'main',sha:sha('a'),repo:{id:1281328888,full_name:'johnkim9524-collab/kaios_enterprise_repo'}},head:{sha:sha('b'),repo:{full_name:'johnkim9524-collab/kaios_enterprise_repo'}}};
const input={pr,mainSha:sha('a'),treeSha:sha('c'),files:[{filename:'src/a.js'}],statuses:[{context:'required',state:'success'}],checks:[{id:101,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success',external_id:'unit-101'}],requiredChecks:[{context:'unit',integration_id:7}],policy,generationSeed:'987654321',now:new Date('2026-09-24T12:00:00Z')};
const governedFile=(filename,base_content,head_content,patch)=>({filename,base_content,head_content,...(patch?{patch}:{})});
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
assert.doesNotMatch(deployWorkflow,/\n  push:/);
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
assert.match(dispatcherWorkflow,/converge-stale-internal-prs:[\s\S]*environment: KIDULTS-AUTONOMOUS-FINALIZER/);
assert.match(dispatcherWorkflow,/converge-stale-internal-prs:[\s\S]*contents: write[\s\S]*pull-requests: write/);
assert.match(dispatcherWorkflow,/pulls\/\$pr\/update-branch[\s\S]*expected_head_sha="\$expected_head"/);
assert.match(dispatcherWorkflow,/test "\$\(jq 'length' <<<"\$STALE_RECOVERABLE"\)" -le 4/);
assert.doesNotMatch(dispatcherWorkflow,/update-branch[\s\S]{0,500}force/);
assert.equal(policy.merge.manual_update_branch_forbidden,true);
assert.equal(policy.merge.autonomous_stale_base_convergence.executor,'FINALIZER_ONLY');
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
assert.match(dispatcherWorkflow,/--data-binary "@\$request_path"/);
assert.match(dispatcherWorkflow,/manage-autonomous-dispatch-fanout-v1\.mjs --phase accepted/);
assert.match(dispatcherWorkflow,/if: \$\{\{ always\(\) \}\}[\s\S]*Upload bounded scan and terminal fanout evidence|Upload bounded scan and terminal fanout evidence[\s\S]*if: \$\{\{ always\(\) \}\}/);
const finalizerSource=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
assert.match(finalizerSource,/const eventToken=await acquireEventToken\(\);\s*await validateLiveCandidate\([^;]+;\s*invokeFinalizerWriter\(\{\s*action:'CREATE_RESERVATION'/);
for(const marker of ['main_sha:','stack_name:','change_set_name:','authorization_id:','create-change-set','execute-change-set']) assert.match(deployWorkflow,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

assert.match(deployWorkflow,/expected_authorization_id="DEPLOY-STAGING-BROKER-\$\{GITHUB_SHA:0:12\}-\$\{\{ inputs\.change_set_name \}\}"/);
assert.doesNotMatch(deployWorkflow,/expected_authorization_id=[^\n]*GITHUB_RUN_ID/);

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
  const oidcTokens=(workflow.match(/OIDC_TOKEN=\$\(jq -r/g)||[]).length;
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
