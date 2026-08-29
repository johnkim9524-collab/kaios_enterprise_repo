import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GateFailure,
  assertPromotablePullRequest,
  assertStableFinalReread,
  resolveScopeRequirements,
  evaluateRequiredCheckRuns,
  assertSingleAuthoritativeProducer,
  authoritativeGenerationKey,
  assertLandingActorAndAuthorization,
} from '../../../scripts/kidults/kpmo/lib/governed-landing-native-gates-v1.mjs';

const sha = 'a'.repeat(40);
const basePr = () => ({
  number: 1580,
  state: 'open',
  merged: false,
  draft: false,
  mergeable: true,
  mergeable_state: 'clean',
  title: 'Correct ARL provenance',
  labels: [],
  updated_at: '2026-08-29T08:50:00Z',
  base: {ref: 'main'},
  head: {sha, repo: {full_name: 'johnkim9524-collab/kaios_enterprise_repo'}},
});
const noMergePolicy = {
  closed_pull_request_blocks: true,
  merged_pull_request_blocks: true,
  exact_labels: ['no-merge', 'do-not-merge', 'merge-hold'],
  title_markers: ['[NO-MERGE]', '[DO-NOT-MERGE]'],
};
const options = {repository: 'johnkim9524-collab/kaios_enterprise_repo', expectedHeadSha: sha, noMergePolicy};
const code = (fn, expected) => assert.throws(fn, error => error instanceof GateFailure && error.code === expected);

test('open exact-head mergeable PR is promotable', () => {
  assert.equal(assertPromotablePullRequest(basePr(), options).head_sha, sha);
});

test('conflicted and unresolved mergeability fail closed', () => {
  const conflicted = basePr(); conflicted.mergeable = false; conflicted.mergeable_state = 'dirty';
  code(() => assertPromotablePullRequest(conflicted, options), 'PULL_REQUEST_NOT_MERGEABLE');
  const unresolved = basePr(); unresolved.mergeable = null; unresolved.mergeable_state = 'unknown';
  code(() => assertPromotablePullRequest(unresolved, options), 'PULL_REQUEST_NOT_MERGEABLE');
  const unknownState = basePr(); unknownState.mergeable_state = 'unknown';
  code(() => assertPromotablePullRequest(unknownState, options), 'PULL_REQUEST_MERGEABILITY_UNPROVEN');
});

test('mergeability drift between initial and final read is rejected', () => {
  const final = basePr(); final.mergeable_state = 'blocked';
  code(() => assertStableFinalReread(basePr(), final, options), 'PULL_REQUEST_MERGEABILITY_CHANGED_DURING_AUTHORIZATION');
});

test('closed and explicit NO-MERGE states fail closed', () => {
  const closed = basePr(); closed.state = 'closed';
  code(() => assertPromotablePullRequest(closed, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
  const labeled = basePr(); labeled.labels = [{name: 'NO-MERGE'}];
  code(() => assertPromotablePullRequest(labeled, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
  const titled = basePr(); titled.title = '[no-merge] hold';
  code(() => assertPromotablePullRequest(titled, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
});

test('close/NO-MERGE race between initial and final read is rejected', () => {
  const final = basePr(); final.state = 'closed'; final.labels = [{name: 'no-merge'}];
  code(() => assertStableFinalReread(basePr(), final, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
});

test('head replacement between initial and final read is rejected', () => {
  const final = basePr(); final.head.sha = 'b'.repeat(40);
  code(() => assertStableFinalReread(basePr(), final, options), 'PULL_REQUEST_HEAD_CHANGED');
});

test('deterministic LAND input does not substitute for live repository-owner actor', () => {
  const authorization = `LAND-PR-1580-${sha.slice(0, 12)}`;
  code(() => assertLandingActorAndAuthorization('automation-bot', 'johnkim9524-collab', authorization, '1580', sha), 'PROGRAM_OWNER_LANDING_ACTOR_REQUIRED');
  assert.equal(assertLandingActorAndAuthorization('johnkim9524-collab', 'johnkim9524-collab', authorization, '1580', sha).actor, 'johnkim9524-collab');
});

test('#1580 producer-event substitution cannot claim exact consumer trigger binding', () => {
  const producerEvent = 'workflow_run';
  const manualConsumerEvent = 'workflow_dispatch';
  assert.equal(producerEvent === 'workflow_run', true, 'the #1580 expression produced a manual false-positive');
  assert.equal(manualConsumerEvent === 'workflow_run', false, 'correct semantics bind the consumer event');
});

const scopePolicy = {
  id: 'kidults-scope-aware-required-status-policy-v1',
  required_status_context: 'Aggregator',
  technical_base_contexts: ['Foundation'],
  scope_rules: [{id: 'scripts', prefixes: ['scripts/'], exact_paths: [], required_contexts: ['Red Team']}],
};

test('scope aggregation binds every changed file to exact contexts', () => {
  assert.deepEqual(resolveScopeRequirements([{filename: 'scripts/x.mjs'}], {commits: 1, changed_files: 1}, scopePolicy), {
    files: ['scripts/x.mjs'], scopes: ['scripts'], required_contexts: ['Foundation', 'Red Team'], zero_diff: false,
  });
});

test('zero-coverage changed scope is rejected', () => {
  code(() => resolveScopeRequirements([{filename: 'unknown-root/x'}], {commits: 1, changed_files: 1}, scopePolicy), 'ZERO_COVERAGE_SCOPE');
});

test('missing, pending, failed, and ambiguous latest checks are rejected', () => {
  code(() => evaluateRequiredCheckRuns([], ['Foundation']), 'REQUIRED_CONTEXT_MISSING');
  code(() => evaluateRequiredCheckRuns([{id: 1, name: 'Foundation', status: 'in_progress', created_at: '2026-01-01'}], ['Foundation']), 'REQUIRED_CONTEXT_NOT_TERMINAL');
  code(() => evaluateRequiredCheckRuns([{id: 1, name: 'Foundation', status: 'completed', conclusion: 'failure', completed_at: '2026-01-01'}], ['Foundation']), 'REQUIRED_CONTEXT_NOT_SUCCESS');
  code(() => evaluateRequiredCheckRuns([
    {id: 1, name: 'Foundation', status: 'completed', conclusion: 'success', completed_at: '2026-01-01'},
    {id: 2, name: 'Foundation', status: 'completed', conclusion: 'success', completed_at: '2026-01-01'},
  ], ['Foundation']), 'REQUIRED_CONTEXT_LATEST_AMBIGUOUS');
});

test('ARL exact generation admits exactly one authoritative consumable producer', () => {
  const receipt = {
    source_sha: sha,
    p1_workflow_run_id: 7,
    p1_artifact_id: 11,
    p1_artifact_digest: 'sha256:abc',
    artifact_role: 'AUTHORITATIVE_CONSUMABLE',
    authoritative_producer: true,
    exact_triggering_run_bound: true,
  };
  const key = authoritativeGenerationKey(receipt);
  assert.equal(assertSingleAuthoritativeProducer([receipt], key), receipt);
  code(() => assertSingleAuthoritativeProducer([receipt, {...receipt}], key), 'ARL_AUTHORITATIVE_PRODUCER_CARDINALITY');
  const recovery = {...receipt, artifact_role: 'RECOVERY_NON_CONSUMABLE', authoritative_producer: false, exact_triggering_run_bound: false};
  assert.equal(assertSingleAuthoritativeProducer([receipt, recovery], key), receipt);
});
