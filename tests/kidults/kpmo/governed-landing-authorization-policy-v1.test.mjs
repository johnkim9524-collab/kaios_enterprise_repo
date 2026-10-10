import {validateReadinessConsumption} from '../../../scripts/kidults/kpmo/validate-governed-readiness-consumption-v1.mjs';
import {selectLatestLifecycleReadyEvent} from '../../../scripts/kidults/kpmo/lib/direct-owner-ready-event-v1.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {classifyLifecycle} from '../../../scripts/kidults/kpmo/validate-pr-lifecycle-integrity-v1.mjs';
import {nativeGovernanceConverged} from '../../../scripts/kidults/kpmo/run-pr-lifecycle-with-native-convergence-v1.mjs';
import {isAtomicLandingNativeStatusReady,isLandingReadinessCurrent} from '../../../scripts/kidults/kpmo/lib/atomic-landing-lifecycle-authority-v1.mjs';

import {
  GovernedLandingAuthorizationPolicyFailure,
  assertGovernedLandingAuthorizationPolicyV160,
} from '../../../scripts/kidults/kpmo/lib/governed-landing-authorization-policy-v1.mjs';

const policyPath = 'coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json';
const sourcePolicy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

const readinessContext = 'KIDULTS Landing Readiness V1';
const landingContext = 'KIDULTS Governed Landing Authorization V1';
const scopeContext = 'KIDULTS Scope-Aware Authoritative Status V1';
const readiness = {context:readinessContext,state:'success',
  description:'Ready lifecycle verified; operation-specific landing authority required',
  creator:{login:'github-actions[bot]'},created_at:'2026-10-10T11:31:35Z'};
const scope = {context:scopeContext,state:'success',created_at:'2026-10-10T11:31:30Z'};
const readinessPolicy = {native_readiness_status_contexts:[scopeContext,readinessContext]};
const pr = {number:2642,state:'open',merged:false,draft:false,head:{sha:'a'.repeat(40)},base:{ref:'main',sha:'b'.repeat(40)}};
const classify = statuses => classifyLifecycle({pr,liveMainSha:pr.base.sha,statuses,policy:readinessPolicy,
  expectedHeadSha:pr.head.sha,expectedBaseSha:pr.base.sha});

test('readiness consumes isolated observer evidence while finalizer owns landing success',()=>{
  const statuses=[readiness,scope,{context:landingContext,state:'success',description:'AI-020 exact-head internal reversible landing authorized'}];
  assert.equal(classify(statuses).state,'READY_VERIFIED_NON_PROMOTABLE');
  assert.equal(classify(statuses).manual_merge_authority,false);
  assert.equal(nativeGovernanceConverged(statuses,readinessPolicy.native_readiness_status_contexts),true);
  assert.equal(isAtomicLandingNativeStatusReady({...readiness,creator:undefined,avatar_url:'https://avatars.githubusercontent.com/in/15368?v=4'}),true);
});
for(const [name,value] of [['missing',null],['failed',{...readiness,state:'failure'}],
  ['pending',{...readiness,state:'pending'}],['untrusted',{...readiness,creator:{login:'forged'}}],
  ['generic success',{...readiness,description:'success'}]]) {
  test(`landing success cannot mask ${name} readiness`,()=>{
    const statuses=[...(value?[value]:[]),scope,{context:landingContext,state:'success'}];
    assert.equal(classify(statuses).state,'READY_NON_PROMOTABLE');
    assert.equal(nativeGovernanceConverged(statuses,readinessPolicy.native_readiness_status_contexts),false);
  });
}
test('older readiness cannot satisfy a newer lifecycle generation',()=>{
  assert.equal(nativeGovernanceConverged([scope,readiness],readinessPolicy.native_readiness_status_contexts,
    Date.parse('2026-10-10T11:32:00Z')),false);
});

// Execute the actual trusted-base workflow publisher with a seeded finalizer
// success. A delayed observer must never POST to that required context.
for(const [name,draft,outcome,governed] of [['late ready',false,'success',true],
  ['late draft',true,'success',true],['late failure',false,'failure',true],
  ['non-governed',false,'success',false]]) {
  test(`${name} observer cannot overwrite an operation-controller grant`,()=>{
    const workflow=fs.readFileSync('.github/workflows/kidults-governed-landing-authorization-v1.yml','utf8');
    const blocks=[...workflow.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/g)];
    assert.equal(blocks.length,2);
    const block=blocks[1][1].replace(/^          /gm,'');
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'readiness-owner-'));
    try {
      const mock=`const writes=[];const grants=new Map([[${JSON.stringify(landingContext)},'success']]);
        process.on('exit',()=>console.log('STATUS_PROBE='+JSON.stringify({writes,landing:grants.get(${JSON.stringify(landingContext)})})));
        globalThis.fetch=async(url,options={})=>{let value;
          if(options.method==='POST'){value=JSON.parse(options.body);writes.push(value);grants.set(value.context,value.state);}
          else if(url.includes('/files?'))value=[{filename:${JSON.stringify(governed?'infrastructure/aws/staging/test.json':'app/test.py')}}];
          else value={number:2642,state:'open',merged:false,draft:${draft},labels:[],title:'test',
            head:{sha:'a'.repeat(40),repo:{full_name:'johnkim9524-collab/kaios_enterprise_repo'}},base:{ref:'main',sha:'b'.repeat(40)}};
          return {ok:true,status:200,json:async()=>value};};`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',mock+'\n'+block],{encoding:'utf8',env:{...process.env,
        GH_TOKEN:'fixture',GH_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',PR_NUMBER:'2642',
        EXPECTED_HEAD_SHA:'a'.repeat(40),EXPECTED_BASE_SHA:'b'.repeat(40),AUTHORIZATION_OUTCOME:outcome,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
        READINESS_RECEIPT_PATH:path.join(directory,'receipt.json'),PRODUCTION_STATE:'HOLD',PUBLIC_STATE:'HOLD',G5_STATE:'HOLD'}});
      assert.equal(child.status,outcome==='failure'?1:0,child.stderr);
      const probe=JSON.parse(child.stdout.split('\n').find(x=>x.startsWith('STATUS_PROBE=')).slice('STATUS_PROBE='.length));
      assert.equal(probe.landing,'success');
      assert.equal(probe.writes.length,1);
      assert.equal(probe.writes[0].context,readinessContext);
      const receipt=JSON.parse(fs.readFileSync(path.join(directory,'receipt.json'),'utf8'));
      assert.equal(receipt.production,'HOLD');assert.equal(receipt.g5,'HOLD');
      if(!draft&&outcome!=='failure') {
        const consumed=validateReadinessConsumption(receipt,{repository:'johnkim9524-collab/kaios_enterprise_repo',runId:123,runAttempt:1,
          prNumber:2642,headSha:'a'.repeat(40),baseSha:'b'.repeat(40)});
        assert.equal(consumed.landing_authorization_created,false);
      }
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
  });
}

test('readiness policy cannot route observer writes back to required landing authority',()=>{
  for(const mutate of [p=>p.readiness_status_context=landingContext,p=>p.status_ownership.readiness_may_write_required_landing=true]) {
    const policy=structuredClone(sourcePolicy);mutate(policy);
    assert.throws(()=>assertGovernedLandingAuthorizationPolicyV160(policy),/POLICY_READINESS_STATUS_OWNERSHIP/);
  }
});

function clonePolicy() {
  return structuredClone(sourcePolicy);
}

function expectRejected(policy, code) {
  assert.throws(
    () => assertGovernedLandingAuthorizationPolicyV160(policy),
    error => error instanceof GovernedLandingAuthorizationPolicyFailure && error.code === code,
  );
}

test('committed authorization policy is the exact supported 1.10.0 contract', () => {
  const result = assertGovernedLandingAuthorizationPolicyV160(clonePolicy());
  assert.deepEqual(result, {
    policy_version: '1.10.0',
    generation_mode: 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY',
    generation_enforcement_points: sourcePolicy.approval_generation_policy.enforcement_points,
    replay_defense_exact: true,
  });
});

for (const version of ['1.4.0', '1.6.0', '2.0.0']) {
  test(`unsupported authorization policy version ${version} fails closed`, () => {
    const policy = clonePolicy();
    policy.version = version;
    expectRejected(policy, 'POLICY_VERSION_UNSUPPORTED');
  });
}

for (const field of [
  'mode',
  'active_record_exact_main_equality_required',
  'issuance_main_must_equal_pr_base_sha',
  'issuance_main_must_equal_live_main_sha',
  'survives_main_drift',
  'ancestor_reuse_allowed',
  'same_candidate_blob_different_main_allowed',
  'stale_canonical_comment_allowed',
  'terminal_records_are_non_authority',
  'final_lifecycle_boundary_required',
  'approval_strictly_after_final_lifecycle_boundary',
  'later_lifecycle_mutation_invalidates_approval',
  'approval_must_precede_landing_attempt',
  'single_governed_consumption_required',
  'pre_ready_approval_allowed',
  'multiple_current_generation_approvals_allowed',
  'closed_or_merged_prereadiness_authority_forbidden',
  'lifecycle_root_issue',
  'root_issue',
]) {
  test(`missing approval-generation field ${field} fails closed`, () => {
    const policy = clonePolicy();
    delete policy.approval_generation_policy[field];
    expectRejected(policy, `APPROVAL_GENERATION_FIELD_MISSING:${field}`);
  });

  test(`tampered approval-generation field ${field} fails closed`, () => {
    const policy = clonePolicy();
    const value = policy.approval_generation_policy[field];
    policy.approval_generation_policy[field] = typeof value === 'boolean' ? !value : 'TAMPERED';
    expectRejected(policy, `APPROVAL_GENERATION_FIELD_INVALID:${field}`);
  });
}

test('missing, reordered, and extended generation enforcement points fail closed', () => {
  for (const mutate of [
    values => values.slice(1),
    values => [values[1], values[0], ...values.slice(2)],
    values => [...values, 'UNSUPPORTED_POINT'],
  ]) {
    const policy = clonePolicy();
    policy.approval_generation_policy.enforcement_points = mutate(
      policy.approval_generation_policy.enforcement_points,
    );
    assert.throws(() => assertGovernedLandingAuthorizationPolicyV160(policy),
      GovernedLandingAuthorizationPolicyFailure);
  }
});
test('missing or tampered negative-case contract fails closed', () => {
  for (const mutate of [
    values => values.slice(1),
    values => values.map(value => value === 'STALE_CANONICAL_COMMENT' ? 'ALLOW_STALE_COMMENT' : value),
  ]) {
    const policy = clonePolicy();
    policy.approval_generation_policy.negative_cases_required = mutate(
      policy.approval_generation_policy.negative_cases_required,
    );
    assert.throws(() => assertGovernedLandingAuthorizationPolicyV160(policy),
      GovernedLandingAuthorizationPolicyFailure);
  }
});

for (const field of [
  'operation_specific_dispatch_required',
  'event_emitting_transport_availability_before_consumption',
  'expected_base_sha_required',
  'expected_head_sha_required',
  'expected_head_tree_sha_required',
  'postmerge_exact_main_tree_and_parent_binding_required',
  'postmerge_exact_merge_sha_push_suite_required',
  'terminal_pass_requires_postmerge_success',
  'terminal_closed_state',
  'terminal_merged_state',
  'failure_revokes_exact_head_status',
  'immediate_post_status_premerge_reread_required',
  'external_transport_race_detected_postmerge_fail_closed',
]) {
  test(`missing replay-defense field ${field} fails closed`, () => {
    const policy = clonePolicy();
    delete policy.atomic_landing_policy[field];
    expectRejected(policy, `ATOMIC_REPLAY_FIELD_MISSING:${field}`);
  });

  test(`disabled replay-defense field ${field} fails closed`, () => {
    const policy = clonePolicy();
    policy.atomic_landing_policy[field] = false;
    expectRejected(policy, `ATOMIC_REPLAY_FIELD_INVALID:${field}`);
  });
}

test('transport, secret boundary, and atomicity claims cannot be weakened or generalized', () => {
  for (const [field, value] of [
    ['event_emitting_transport', 'ANY_AVAILABLE_TRANSPORT'],
    ['repository_github_token_merge_forbidden', false],
    ['new_secret_or_permission_expansion_forbidden', false],
    ['expected_head_compare_is_atomic_for_sha_only', true],
    ['no_merge_label_atomicity_claimed', true],
  ]) {
    const policy = clonePolicy();
    policy.atomic_landing_policy[field] = value;
    assert.throws(() => assertGovernedLandingAuthorizationPolicyV160(policy),
      GovernedLandingAuthorizationPolicyFailure);
  }
});

test('finalizer readiness must belong to latest Ready cycle and have timed positive identity',()=>{
  const current={...readiness,id:42};
  const readyAt='2026-10-10T11:31:00Z', now='2026-10-10T11:32:00Z';
  assert.equal(isLandingReadinessCurrent(current,readyAt,now),true);
  for(const change of [{created_at:readyAt}, {created_at:'2026-10-10T11:30:59Z'}, {created_at:undefined},
    {created_at:'2026-10-10T11:32:01Z'}, {id:undefined}, {state:'pending'}, {creator:{login:'untrusted'}}]) {
    assert.equal(isLandingReadinessCurrent({...current,...change},readyAt,now),false);
  }
  assert.equal(isLandingReadinessCurrent(current,'2026-10-10T11:31:36Z',now),false);
  const finalizer=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
  assert.match(finalizer,/endpoint:`\/issues\/\$\{envelope.pull_request\}\/timeline`/);
  assert.match(finalizer,/isLandingReadinessCurrent\(readiness\[0\],latestReady.created_at/);
});
test('partial readiness policy returns controlled nonpromotable state',()=>{
  assert.equal(classifyLifecycle({pr,liveMainSha:pr.base.sha,statuses:[],policy:{native_readiness_status_contexts:[scopeContext]},
    expectedHeadSha:pr.head.sha,expectedBaseSha:pr.base.sha}).state,'READY_NON_PROMOTABLE');
});

test('same-head latest Draft closed or reopened invalidates landing readiness generation',()=>{
  const ready={id:10,event:'ready_for_review',created_at:'2026-10-10T11:31:00Z',actor:{login:'github-actions[bot]'}};
  for(const event of ['convert_to_draft','closed','reopened']) {
    assert.throws(()=>selectLatestLifecycleReadyEvent({timeline:[ready,{...ready,id:11,event,created_at:'2026-10-10T11:32:00Z'}],
      repositoryOwner:'johnkim9524-collab',pullRequest:pr}),/LIFECYCLE_(LATEST_READY_EVENT_REQUIRED|READY_GENERATION_INVALIDATED)/);
  }
  const second={...ready,id:12,created_at:'2026-10-10T11:33:00Z'};
  const boundary=selectLatestLifecycleReadyEvent({timeline:[ready,{...ready,id:11,event:'convert_to_draft',created_at:'2026-10-10T11:32:00Z'},second],repositoryOwner:'johnkim9524-collab',pullRequest:pr});
  assert.equal(boundary.id,12);
  assert.equal(isLandingReadinessCurrent({...readiness,id:42},boundary.created_at,'2026-10-10T11:34:00Z'),false);
});
test('trusted-base rollout never converts legacy landing success into isolated readiness',()=>{
  assert.equal(classify([{context:landingContext,state:'success',creator:{login:'github-actions[bot]'}},scope]).state,'READY_NON_PROMOTABLE');
  assert.equal(classifyLifecycle({pr,liveMainSha:'c'.repeat(40),statuses:[readiness,scope],policy:readinessPolicy,
    expectedHeadSha:pr.head.sha,expectedBaseSha:pr.base.sha}).reason,'BASE_NOT_CURRENT_PROTECTED_MAIN');
  assert.equal(classify([readiness,scope]).state,'READY_VERIFIED_NON_PROMOTABLE');
});

test('same-second Ready boundary cannot reuse an indistinguishable prior status',()=>{
  assert.equal(nativeGovernanceConverged([scope,readiness],readinessPolicy.native_readiness_status_contexts,
    Date.parse(readiness.created_at)),false);
});

test('actual finalizer live reread rejects stale and changed same-head Ready cycles',async()=>{
  const source=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
  const block=source.slice(source.indexOf('let boundReadyEvent=null;'),source.indexOf('const waitForReadyCandidate ='));
  const event={id:10,event:'ready_for_review',created_at:'2026-10-10T11:31:00Z',actor:{login:'github-actions[bot]'}};
  const fixture={statuses:[{...readiness,id:42}],timeline:[event],pr};
  class GateError extends Error {constructor(code,detail){super(`${code}:${detail||''}`);this.code=code;}}
  const api=async endpoint=>endpoint.startsWith('/pulls/')?fixture.pr:
    endpoint.startsWith('/git/commits/')?{tree:{sha:'d'.repeat(40)}}:{statuses:fixture.statuses};
  const collect=async({endpoint})=>endpoint.includes('/timeline')?fixture.timeline:[];
  const create=new Function('api','collectPaginatedApiValues','envelope','repository','policy',
    'attachImmutableContents','validateLiveChangedPaths','collectCheckRuns','liveRequiredChecks',
    'bindRequiredGateEvidence','validateRequiredGateSemanticEvidence','sameRequiredGateEvidenceAuthority',
    'AutonomousLandingError','selectLatestLifecycleReadyEvent','LANDING_READINESS_CONTEXT','isLandingReadinessCurrent','canonicalJson',
    block+';return validateLiveCandidate;');
  const candidate=create(api,collect,{pull_request:2642,base_sha:pr.base.sha,head_sha:pr.head.sha,head_tree_sha:'d'.repeat(40),test_evidence:{}},
    'johnkim9524-collab/kaios_enterprise_repo',{},async x=>x,()=>{},async()=>[],async()=>[],()=>[],()=>{},()=>true,
    GateError,selectLatestLifecycleReadyEvent,readinessContext,isLandingReadinessCurrent,JSON.stringify);
  const options={allowDraft:false,includeLandingStatus:true,requireEnvelopeBinding:false};
  for(const change of [{created_at:event.created_at},{created_at:'2026-10-10T11:30:00Z'},
    {created_at:undefined},{creator:{login:'forged'}},{state:'failure'}]) {
    fixture.statuses=[{...readiness,id:42,...change}];
    await assert.rejects(candidate(options),/AUTONOMOUS_REQUIRED_STATUS_NOT_GREEN/);
  }
  fixture.statuses=[{...readiness,id:42}];
  await candidate(options);
  fixture.timeline=[event,{...event,id:11,created_at:'2026-10-10T11:31:20Z'}];
  await assert.rejects(candidate(options),/AUTONOMOUS_READY_GENERATION_DRIFT/);
  for(const eventName of ['convert_to_draft','closed','reopened']) {
    fixture.timeline=[event,{...event,id:12,event:eventName,created_at:'2026-10-10T11:31:20Z'}];
    await assert.rejects(candidate(options),/LIFECYCLE_(LATEST_READY_EVENT_REQUIRED|READY_GENERATION_INVALIDATED)/);
  }
  fixture.pr={...pr,draft:true};
  await assert.rejects(candidate(options),/AUTONOMOUS_PR_DRIFT/);
});
