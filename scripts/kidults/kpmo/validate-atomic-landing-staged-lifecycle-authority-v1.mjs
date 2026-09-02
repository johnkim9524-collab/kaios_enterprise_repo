#!/usr/bin/env node
import fs from 'node:fs';
import {
  assertAtomicLandingStagedLifecycleAuthority,
} from './lib/atomic-landing-staged-lifecycle-authority-v1.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const expectReject = (code, fn) => {
  let rejected = false;
  try { fn(); } catch (error) { rejected = String(error?.code || error?.message || '').includes(code); }
  assert(rejected, `EXPECTED_REJECTION_MISSING:${code}`);
};

const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const prNumber = 1853;
const headSha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const readyEvent = {
  id: 9001,
  event: 'ready_for_review',
  created_at: '2026-09-02T04:20:00Z',
  actor: 'johnkim9524-collab',
  performed_via_github_app: null,
  direct_repository_owner: true,
};
const receipt = overrides => ({
  id: 'kidults-atomic-landing-lifecycle-authority-receipt-v1',
  version: '1.1.0',
  repository,
  checked_at: '2026-09-02T04:30:00Z',
  state: 'READY_GOVERNED_LIFECYCLE_AUTHORITY_BOUND',
  pull_request: prNumber,
  exact_head_sha: headSha,
  exact_base_sha: baseSha,
  pull_request_created_at: '2026-09-02T04:00:00Z',
  lifecycle_run_id: 33590000000,
  lifecycle_run_attempt: 1,
  lifecycle_conclusion: 'success',
  lifecycle_updated_at: '2026-09-02T04:29:00Z',
  lifecycle_evaluated_at: '2026-09-02T04:29:30Z',
  latest_ready_event_id: readyEvent.id,
  latest_ready_event_at: readyEvent.created_at,
  latest_ready_event_actor: readyEvent.actor,
  lifecycle_artifact_id: 9831000000,
  lifecycle_artifact_name: `kpmo-pr-lifecycle-integrity-${prNumber}-${headSha}-33590000000-1`,
  lifecycle_artifact_digest: `sha256:${'c'.repeat(64)}`,
  lifecycle_receipt_state: 'READY_GOVERNED',
  lifecycle_receipt_reason: 'NATIVE_SCOPE_SUCCESS_AND_OPERATION_SPECIFIC_ATOMIC_LANDING_PENDING',
  native_status_evidence: [
    {
      context: 'KIDULTS Scope-Aware Authoritative Status V1',
      state: 'success',
      description: 'exact-head contexts verified',
      status_id: 10,
      created_at: '2026-09-02T04:25:00Z',
      updated_at: '2026-09-02T04:25:00Z',
    },
    {
      context: 'KIDULTS Governed Landing Authorization V1',
      state: 'pending',
      description: 'Ready; operation-specific atomic landing is required',
      status_id: 11,
      created_at: '2026-09-02T04:26:00Z',
      updated_at: '2026-09-02T04:26:00Z',
    },
  ],
  latest_ready_event_direct_repository_owner: true,
  latest_ready_event_performed_via_github_app: null,
  final_live_reread: true,
  manual_merge_authority: false,
  atomic_landing_only: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  mutation_authority_created: false,
  ...overrides,
});
const invoke = (value = receipt(), event = readyEvent, options = {}) =>
  assertAtomicLandingStagedLifecycleAuthority(value, {
    repository,
    prNumber,
    headSha,
    baseSha,
    readyEvent: event,
    ...options,
  });

const positive = invoke();
assert(positive.state === 'READY_GOVERNED_LIFECYCLE_AUTHORITY_BOUND', 'POSITIVE_STATE_INVALID');
assert(positive.lifecycle_run_id === 33590000000, 'POSITIVE_RUN_BINDING_INVALID');
assert(positive.latest_ready_event_id === 9001, 'POSITIVE_READY_BINDING_INVALID');
assert(positive.direct_repository_owner_ready === true, 'POSITIVE_DIRECT_OWNER_INVALID');
assert(positive.app_mediated_ready === false, 'POSITIVE_APP_BOUNDARY_INVALID');

expectReject('ATOMIC_STAGED_LIFECYCLE_RECEIPT_ID_INVALID', () => invoke(receipt({id: 'wrong'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_RECEIPT_VERSION_INVALID', () => invoke(receipt({version: '1.0.0'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_REPOSITORY_MISMATCH', () => invoke(receipt({repository: 'other/repo'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_PR_MISMATCH', () => invoke(receipt({pull_request: 1854})));
expectReject('ATOMIC_STAGED_LIFECYCLE_HEAD_MISMATCH', () => invoke(receipt({exact_head_sha: 'd'.repeat(40)})));
expectReject('ATOMIC_STAGED_LIFECYCLE_BASE_MISMATCH', () => invoke(receipt({exact_base_sha: 'e'.repeat(40)})));
expectReject('ATOMIC_STAGED_LIFECYCLE_STATE_INVALID', () => invoke(receipt({state: 'READY_NON_PROMOTABLE'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_EVALUATION_PRECEDES_READY', () =>
  invoke(receipt({lifecycle_evaluated_at: '2026-09-02T04:19:59Z'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_CHECK_PRECEDES_EVALUATION', () =>
  invoke(receipt({checked_at: '2026-09-02T04:29:29Z'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_ARTIFACT_NAME_MISMATCH', () =>
  invoke(receipt({lifecycle_artifact_name: 'substituted'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_ARTIFACT_DIGEST_INVALID', () =>
  invoke(receipt({lifecycle_artifact_digest: 'sha256:bad'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_READY_TUPLE_MISMATCH', () =>
  invoke(receipt({latest_ready_event_id: 9002})));
expectReject('ATOMIC_STAGED_LIFECYCLE_READY_TUPLE_MISMATCH', () =>
  invoke(receipt({latest_ready_event_at: '2026-09-02T04:20:01Z'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_READY_TUPLE_MISMATCH', () =>
  invoke(receipt({latest_ready_event_actor: 'automation-bot'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_READY_EVENT_APP_MEDIATED', () =>
  invoke(receipt(), {...readyEvent, performed_via_github_app: {slug: 'automation'}}));
expectReject('ATOMIC_STAGED_LIFECYCLE_RECEIPT_READY_APP_MEDIATED', () =>
  invoke(receipt({latest_ready_event_performed_via_github_app: {slug: 'automation'}})));
expectReject('ATOMIC_STAGED_LIFECYCLE_RECEIPT_READY_NOT_DIRECT_OWNER', () =>
  invoke(receipt({latest_ready_event_direct_repository_owner: false})));
expectReject('ATOMIC_STAGED_LIFECYCLE_NATIVE_CONTEXT_INVALID', () => invoke(receipt({
  native_status_evidence: [
    receipt().native_status_evidence[0],
    receipt().native_status_evidence[0],
  ],
})));
expectReject('ATOMIC_STAGED_LIFECYCLE_FINAL_REREAD_REQUIRED', () =>
  invoke(receipt({final_live_reread: false})));
expectReject('ATOMIC_STAGED_LIFECYCLE_MANUAL_MERGE_FORBIDDEN', () =>
  invoke(receipt({manual_merge_authority: true})));
expectReject('ATOMIC_STAGED_LIFECYCLE_RELEASE_BOUNDARY_INVALID', () =>
  invoke(receipt({production: 'GO'})));
expectReject('ATOMIC_STAGED_LIFECYCLE_MUTATION_AUTHORITY_FORBIDDEN', () =>
  invoke(receipt({mutation_authority_created: true})));

const workflow = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs', 'utf8');
const mergeStep = workflow.slice(workflow.indexOf('Re-read live authority and execute exact-head server merge'));
assert(mergeStep.includes('LIFECYCLE_AUTHORITY_PATH: ${{ runner.temp }}/kpmo-atomic-landing/lifecycle-authority.json'),
  'ATOMIC_MERGE_STEP_LIFECYCLE_PATH_MISSING');
assert(runner.includes("selectLatestDirectOwnerReadyEvent"), 'ATOMIC_RUNNER_DIRECT_READY_HELPER_MISSING');
assert(!runner.includes('selectLatestProgramOwnerReadyEvent'), 'ATOMIC_RUNNER_LEGACY_READY_HELPER_PRESENT');
assert(runner.includes('assertAtomicLandingStagedLifecycleAuthority'), 'ATOMIC_RUNNER_STAGED_AUTHORITY_ASSERTION_MISSING');
assert(runner.includes('readStagedLifecycleAuthorityReceipt'), 'ATOMIC_RUNNER_STAGED_AUTHORITY_READER_MISSING');
assert(runner.includes('IMMEDIATE_PREMERGE_LIFECYCLE_AUTHORITY_DRIFT'),
  'ATOMIC_RUNNER_IMMEDIATE_LIFECYCLE_DRIFT_GUARD_MISSING');
assert(runner.includes('FINAL_PREMERGE_LIFECYCLE_AUTHORITY_DRIFT'),
  'ATOMIC_RUNNER_FINAL_LIFECYCLE_DRIFT_GUARD_MISSING');
const authorityChecks = runner.match(/assertLifecycleAuthorityAgainstReady\(/g) || [];
assert(authorityChecks.length === 3, 'ATOMIC_RUNNER_LIFECYCLE_RECHECK_CARDINALITY_INVALID');

console.log('Atomic staged lifecycle authority regression: PASS');
