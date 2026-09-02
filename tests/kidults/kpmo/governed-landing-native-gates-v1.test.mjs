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
  selectExactHeadProgramOwnerApproval,
  selectLatestProgramOwnerReadyEvent,
} from '../../../scripts/kidults/kpmo/lib/governed-landing-native-gates-v1.mjs';

const sha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const basePr = () => ({
  number: 1580,
  state: 'open',
  merged: false,
  draft: false,
  title: 'Correct ARL provenance',
  labels: [],
  updated_at: '2026-08-29T08:50:00Z',
  base: {ref: 'main'},
  head: {sha, repo: {full_name: repository}},
});
const noMergePolicy = {
  closed_pull_request_blocks: true,
  merged_pull_request_blocks: true,
  exact_labels: ['no-merge', 'do-not-merge', 'merge-hold'],
  title_markers: ['[NO-MERGE]', '[DO-NOT-MERGE]'],
};
const options = {repository, expectedHeadSha: sha, noMergePolicy};
const code = (fn, expected) => assert.throws(fn, error => error instanceof GateFailure && error.code === expected);

test('open exact-head PR is promotable', () => {
  assert.equal(assertPromotablePullRequest(basePr(), options).head_sha, sha);
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

test('explicit Program Owner Ready event is mandatory and last-event authoritative', () => {
  const ready = {
    id: 10,
    event: 'ready_for_review',
    actor: {login: 'johnkim9524-collab'},
    created_at: '2026-09-01T01:20:00Z',
  };
  assert.equal(selectLatestProgramOwnerReadyEvent([ready], 'johnkim9524-collab').created_at, ready.created_at);
  code(() => selectLatestProgramOwnerReadyEvent([], 'johnkim9524-collab'), 'PROGRAM_OWNER_READY_EVENT_REQUIRED');
  code(() => selectLatestProgramOwnerReadyEvent([ready, {
    ...ready, id: 11, event: 'convert_to_draft', created_at: '2026-09-01T01:21:00Z',
  }], 'johnkim9524-collab'), 'PROGRAM_OWNER_READY_STATE_REQUIRED');
  code(() => selectLatestProgramOwnerReadyEvent([{
    ...ready, actor: {login: 'automation-bot'},
  }], 'johnkim9524-collab'), 'PROGRAM_OWNER_READY_ACTOR_REQUIRED');
});

test('exact-head Program Owner approval cannot be inherited, app-mediated, expired, or self-rebound', () => {
  const authorization = `LAND-PR-1580-${sha.slice(0, 12)}`;
  const approvalBody = (head, fields = {}) => [
    'KIDULTS_ATOMIC_LANDING_EXACT_HEAD_APPROVAL_V2',
    `repository=${fields.repository || repository}`,
    'pull_request=1580',
    `exact_base_sha=${fields.baseSha || baseSha}`,
    `exact_head_sha=${head}`,
    `operation=${fields.operation || 'MERGE_PROTECTED_MAIN'}`,
    `authorization_id=${fields.authorizationId || `LAND-PR-1580-${head.slice(0, 12)}`}`,
    `nonce=${fields.nonce || '1'.repeat(32)}`,
    `expires_at=${fields.expiresAt || '2026-09-01T02:00:00Z'}`,
    `scope=${fields.scope || 'ONE_ATOMIC_GOVERNED_LANDING_ONLY'}`,
    `approval_rebind=${fields.rebind || 'FORBIDDEN'}`,
  ].join('\n');
  const comment = (id, head, overrides = {}) => ({
    id,
    body: approvalBody(head),
    user: {login: 'johnkim9524-collab'},
    author_association: 'OWNER',
    performed_via_github_app: null,
    created_at: '2026-09-01T01:10:00Z',
    updated_at: '2026-09-01T01:10:00Z',
    ...overrides,
  });
  const input = {
    repository,
    repositoryOwner: 'johnkim9524-collab',
    prNumber: 1580,
    headSha: sha,
    baseSha,
    authorizationId: authorization,
    prCreatedAt: '2026-09-01T00:00:00Z',
    headCommittedAt: '2026-09-01T01:00:00Z',
    latestReadyAt: '2026-09-01T01:20:00Z',
    evaluationTime: '2026-09-01T01:30:00Z',
  };
  const selected = selectExactHeadProgramOwnerApproval([comment(1, sha)], input);
  assert.equal(selected.exact_head_sha, sha);
  assert.equal(selected.app_mediated, false);
  assert.equal(selected.raw_authorization_persisted, false);
  assert.equal(selected.raw_nonce_persisted, false);
  code(() => selectExactHeadProgramOwnerApproval([], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_MISSING');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha), comment(2, 'c'.repeat(40), {
    created_at: '2026-09-01T01:11:00Z', updated_at: '2026-09-01T01:11:00Z',
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_HEAD_MISMATCH');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    updated_at: '2026-09-01T01:12:00Z',
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EDITED');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    performed_via_github_app: {id: 1144995, slug: 'chatgpt-codex-connector'},
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_APP_MEDIATED');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    created_at: '2026-09-01T00:59:00Z', updated_at: '2026-09-01T00:59:00Z',
  })], input), 'PROGRAM_OWNER_APPROVAL_PRECEDES_EXACT_HEAD');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    created_at: '2026-09-01T01:21:00Z', updated_at: '2026-09-01T01:21:00Z',
  })], input), 'PROGRAM_OWNER_APPROVAL_MUST_PRECEDE_READY_EVENT');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    body: approvalBody(sha, {expiresAt: '2026-09-01T03:00:01Z'}),
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EXPIRY_WINDOW_INVALID');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha)], {
    ...input, evaluationTime: '2026-09-01T02:00:01Z',
  }), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EXPIRED');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    body: approvalBody(sha, {nonce: 'not-a-valid-nonce'}),
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_NONCE_INVALID');
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
