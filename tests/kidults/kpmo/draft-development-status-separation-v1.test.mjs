import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const scopeWorkflow = fs.readFileSync('.github/workflows/kidults-scope-aware-authoritative-status-v1.yml', 'utf8');
const landingWorkflow = fs.readFileSync('.github/workflows/kidults-governed-landing-authorization-v1.yml', 'utf8');
const scopeRunner = fs.readFileSync('scripts/kidults/kpmo/run-scope-aware-authoritative-status-v1.mjs', 'utf8');
const atomicPreflight = fs.readFileSync('scripts/kidults/kpmo/run-atomic-event-emitting-transport-preflight-v1.mjs', 'utf8');
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

test('Draft itself is not a technical failure but landing stays pending', () => {
  assert.match(landingWorkflow, /DRAFT_DEVELOPMENT_VALIDATED_NON_PROMOTABLE/);
  assert.match(landingWorkflow, /DRAFT_DEVELOPMENT_VERIFIED_NON_PROMOTABLE/);
  assert.match(landingWorkflow, /await status\('pending','Draft is non-promotable; Ready authorization required'\)/);
  assert.match(landingWorkflow, /landing_authorization_created:false/);
  assert.doesNotMatch(landingWorkflow, /if \(pr\.draft\) fail\('governed PR is Draft'\)/);
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
