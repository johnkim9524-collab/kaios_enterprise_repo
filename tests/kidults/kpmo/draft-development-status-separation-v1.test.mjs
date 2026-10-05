import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const scopeWorkflow = fs.readFileSync('.github/workflows/kidults-scope-aware-authoritative-status-v1.yml', 'utf8');
const landingWorkflow = fs.readFileSync('.github/workflows/kidults-governed-landing-authorization-v1.yml', 'utf8');
const dispatcherWorkflow = fs.readFileSync('.github/workflows/kidults-autonomous-dispatcher-v1.yml', 'utf8');
const scopeRunner = fs.readFileSync('scripts/kidults/kpmo/run-scope-aware-authoritative-status-v1.mjs', 'utf8');
const atomicPreflight = fs.readFileSync('scripts/kidults/kpmo/run-atomic-event-emitting-transport-preflight-v1.mjs', 'utf8');
const lifecycleRunner = fs.readFileSync('scripts/kidults/kpmo/validate-pr-lifecycle-integrity-v1.mjs', 'utf8');
const landingPolicy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json', 'utf8'));
const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));

test('Draft technical validation has a separate non-authority status', () => {
  assert.equal(policy.draft_development_status_context, 'KIDULTS Draft Development Validation V1');
  assert.equal(policy.authority_boundary.draft_development_status_is_merge_authority, false);
  assert.equal(policy.authority_boundary.draft_must_remain_non_promotable, true);
  assert.match(scopeRunner, /validation_lane: draftDevelopment \? 'DRAFT_DEVELOPMENT' : 'READY_PROMOTION'/);
  assert.match(scopeRunner, /landing_authorization_created: false/);
  assert.match(scopeRunner, /draft_non_promotable: draftDevelopment/);
  assert.match(scopeWorkflow, /Publish exact-head aggregate status/);
});

test('eligible Draft is evaluated without a pre-Ready mutation and finalizer owns atomic Ready transition', () => {
  assert.match(landingWorkflow, /DRAFT_DEVELOPMENT_VALIDATED_NON_PROMOTABLE/);
  assert.match(landingWorkflow, /landing_authorization_created:false/);
  assert.doesNotMatch(landingWorkflow, /id-token: write|markPullRequestReadyForReview|DRAFT_READY_TOKEN_UNAVAILABLE/);
  assert.match(landingWorkflow, /exact_base_sha:base/);
  assert.doesNotMatch(dispatcherWorkflow, /markPullRequestReadyForReview|validateDraftReadyBrokerResponse|DRAFT_READY_TRANSITION|transition_draft/);
  const finalizer=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
  assert.match(finalizer, /action:'CREATE_RESERVATION'[\s\S]*await rebindDraftReady\(candidate\.pr,eventToken\)[\s\S]*await publishLandingStatus\('success'/);
  assert.match(finalizer, /waitForGovernedLandingMergeReadiness[\s\S]*mergeable_state/);
  assert.match(finalizer, /await waitForGovernedLandingMergeReadiness\(\)[\s\S]*\/pulls\/\$\{envelope\.pull_request\}\/merge/);
  assert.match(finalizer, /allowDraft:true,includeLandingStatus:false/);
  assert.match(landingWorkflow, /ready_state_grants_authorization:false/);
});

test('Atomic landing continues to reject Draft PRs', () => {
  assert.match(atomicPreflight, /snapshot\.pr\?\.draft === false/);
  assert.match(atomicPreflight, /ATOMIC_EVENT_TRANSPORT_PR_NOT_OPEN_READY/);
});

test('Draft-to-Ready mutation cannot reuse the development lane', () => {
  assert.match(scopeRunner, /final\.draft !== true/);
  assert.match(scopeRunner, /DRAFT_DEVELOPMENT_STATE_DRIFT/);
  assert.match(scopeRunner, /activeStatusContext = draftDevelopmentContext/);
  assert.notEqual(policy.draft_development_status_context, policy.required_status_context);
});

test('Ready is autonomous lifecycle state and never approval authority', () => {
  assert.equal(landingPolicy.review_policy.ready_state_by_owner_is_authorization, false);
  assert.equal(landingPolicy.review_policy.ready_state_is_lifecycle_only, true);
  assert.match(lifecycleRunner, /selectLatestLifecycleReadyEvent/);
  assert.doesNotMatch(lifecycleRunner, /selectLatestDirectOwnerReadyEvent/);
  assert.match(lifecycleRunner, /readiness_authority: 'LIFECYCLE_ONLY'/);
  assert.match(lifecycleRunner, /ready_state_grants_authorization: false/);
  assert.match(landingWorkflow, /LIFECYCLE_READY_SOLO_OWNER_SCOPE_VERIFIED/);
  assert.match(landingWorkflow, /landing_authorization_created:false/);
});
