#!/usr/bin/env node
import fs from 'node:fs';
import {
  GOVERNED_LANDING_CONTEXT,
  GOVERNED_LANDING_PENDING_DESCRIPTION,
  READY_GOVERNED_REASON,
  SCOPE_AWARE_CONTEXT,
  selectAtomicLandingLifecycleAuthority,
} from './lib/atomic-landing-lifecycle-authority-v1.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const expectReject = (code, fn) => {
  let rejected = false;
  try { fn(); } catch (error) { rejected = String(error?.message || '').includes(code); }
  assert(rejected, `EXPECTED_REJECTION_MISSING:${code}`);
};

const head = '1'.repeat(40);
const base = '2'.repeat(40);
const prNumber = 1811;
const run = (
  id,
  conclusion,
  at,
  {
    status = 'completed',
    sha = head,
    associatedPr = prNumber,
    attempt = 1,
    updatedAt = at,
  } = {},
) => ({
  id,
  run_attempt: attempt,
  event: 'pull_request_target',
  head_sha: sha,
  status,
  conclusion,
  created_at: at,
  updated_at: updatedAt,
  pull_requests: associatedPr == null ? [] : [{number: associatedPr}],
});
const artifact = (
  id,
  {
    attempt = 1,
    at = '2026-09-01T13:29:05Z',
    updatedAt = at,
    artifactHead = head,
    workflowRunId = id,
    expired = false,
    size = 777,
    digest = `sha256:${'a'.repeat(64)}`,
  } = {},
) => ({
  id: id + 1000 + attempt,
  name: `kpmo-pr-lifecycle-integrity-${prNumber}-${head}-${id}-${attempt}`,
  expired,
  size_in_bytes: size,
  digest,
  created_at: at,
  updated_at: updatedAt,
  workflow_run: {
    id: workflowRunId,
    head_sha: artifactHead,
  },
});
const nativeStatuses = [
  {
    id: 10,
    context: SCOPE_AWARE_CONTEXT,
    state: 'success',
    description: '3 exact-head contexts verified',
    created_at: '2026-09-01T13:24:25Z',
    updated_at: '2026-09-01T13:24:25Z',
  },
  {
    id: 11,
    context: GOVERNED_LANDING_CONTEXT,
    state: 'pending',
    description: GOVERNED_LANDING_PENDING_DESCRIPTION,
    created_at: '2026-09-01T13:28:37Z',
    updated_at: '2026-09-01T13:28:37Z',
  },
];
const receiptEvidence = statuses => statuses.map(status => ({
  context: status.context,
  state: status.state,
  description: status.description || null,
  status_id: status.id ?? null,
  created_at: status.created_at || null,
  updated_at: status.updated_at || status.created_at || null,
}));
const receipt = (
  id,
  overrides = {},
  statuses = nativeStatuses,
  attempt = 1,
) => ({
  id: 'kpmo-pr-lifecycle-integrity-receipt-v1',
  repository: 'johnkim9524-collab/kaios_enterprise_repo',
  pull_request: prNumber,
  exact_head_sha: head,
  exact_base_sha: base,
  workflow_run_id: String(id),
  workflow_run_attempt: String(attempt),
  event_name: 'pull_request_target',
  state: 'READY_GOVERNED',
  reason: READY_GOVERNED_REASON,
  validator_authority: 'CONTROL_ONLY',
  promotion_eligible: false,
  native_status_evidence: receiptEvidence(statuses),
  final_live_reread: true,
  ...overrides,
});
const invoke = ({
  runs,
  artifactsByRunId,
  receiptsByRunId = {},
  statuses = nativeStatuses,
  lastReadyAt = '2026-09-01T13:20:00Z',
  prCreatedAt = '2026-09-01T13:00:00Z',
}) => selectAtomicLandingLifecycleAuthority({
  runs,
  artifactsByRunId,
  receiptsByRunId,
  prNumber,
  headSha: head,
  baseSha: base,
  prCreatedAt,
  nativeStatuses: statuses,
  lastReadyAt,
});

const green = run(200, 'success', '2026-09-01T13:29:00Z');
const authority = invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200)},
});
assert(authority.state === 'READY_GOVERNED_LIFECYCLE_AUTHORITY_BOUND', 'POSITIVE_STATE');
assert(authority.lifecycle_run_id === 200, 'POSITIVE_RUN_BINDING');
assert(authority.lifecycle_artifact_digest === `sha256:${'a'.repeat(64)}`, 'POSITIVE_DIGEST_BINDING');
assert(authority.exact_base_sha === base, 'POSITIVE_BASE_BINDING');
assert(authority.lifecycle_receipt_reason === READY_GOVERNED_REASON, 'POSITIVE_PENDING_SEMANTICS');
assert(authority.lifecycle_evidence_at === '2026-09-01T13:29:05Z', 'POSITIVE_ARTIFACT_TIME_BINDING');

expectReject('LIFECYCLE_NATIVE_STATUS_NOT_LANDING_READY', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200)},
  statuses: nativeStatuses.map(status => status.context === GOVERNED_LANDING_CONTEXT
    ? {...status, description: 'generic pending'}
    : status),
}));
expectReject('LIFECYCLE_NATIVE_STATUS_NOT_LANDING_READY', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200)},
  statuses: nativeStatuses.map(status => status.context === GOVERNED_LANDING_CONTEXT
    ? {...status, state: 'success'}
    : status),
}));
expectReject('LIFECYCLE_LATEST_UNSUPERSEDED_RED', () => invoke({
  runs: [green, run(201, 'failure', '2026-09-01T13:30:00Z')],
  artifactsByRunId: {'200': [artifact(200)], '201': [artifact(201, {at: '2026-09-01T13:30:05Z'})]},
  receiptsByRunId: {'200': receipt(200), '201': receipt(201, {state: 'READY_NON_PROMOTABLE'})},
}));
expectReject('LIFECYCLE_LATEST_NOT_TERMINAL', () => invoke({
  runs: [green, run(202, null, '2026-09-01T13:31:00Z', {status: 'in_progress'})],
  artifactsByRunId: {'200': [artifact(200)], '202': [artifact(202, {at: '2026-09-01T13:31:05Z'})]},
  receiptsByRunId: {'200': receipt(200), '202': receipt(202)},
}));
expectReject('LIFECYCLE_SUCCESS_PRECEDES_NATIVE_READY_SIGNAL', () => invoke({
  runs: [run(203, 'success', '2026-09-01T13:27:00Z')],
  artifactsByRunId: {'203': [artifact(203, {at: '2026-09-01T13:27:05Z'})]},
  receiptsByRunId: {'203': receipt(203)},
}));
expectReject('LIFECYCLE_SUCCESS_PRECEDES_LATEST_READY_EVENT', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200)},
  lastReadyAt: '2026-09-01T13:30:00Z',
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:0', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': []},
  receiptsByRunId: {},
}));

// A re-run keeps its original run creation time. The exact current-attempt
// artifact is the durable freshness proof and must allow the valid re-run.
const rerun = run(210, 'success', '2026-09-01T13:20:00Z', {
  associatedPr: null,
  attempt: 2,
  updatedAt: '2026-09-01T13:20:00Z',
});
const rerunAuthority = invoke({
  runs: [rerun],
  artifactsByRunId: {
    '210': [artifact(210, {
      attempt: 2,
      at: '2026-09-01T13:29:10Z',
    })],
  },
  receiptsByRunId: {'210': receipt(210, {}, nativeStatuses, 2)},
});
assert(rerunAuthority.lifecycle_run_id === 210, 'RERUN_RUN_ID_BINDING');
assert(rerunAuthority.lifecycle_run_attempt === 2, 'RERUN_ATTEMPT_BINDING');
assert(rerunAuthority.lifecycle_run_updated_at === '2026-09-01T13:20:00Z', 'RERUN_STALE_RUN_TIME_RETAINED');
assert(rerunAuthority.lifecycle_evidence_at === '2026-09-01T13:29:10Z', 'RERUN_ARTIFACT_TIME_USED');

expectReject('LIFECYCLE_SUCCESS_PRECEDES_NATIVE_READY_SIGNAL', () => invoke({
  runs: [rerun],
  artifactsByRunId: {
    '210': [artifact(210, {
      attempt: 2,
      at: '2026-09-01T13:27:10Z',
    })],
  },
  receiptsByRunId: {'210': receipt(210, {}, nativeStatuses, 2)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_RUN_ID_MISMATCH', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200, {workflowRunId: 999})]},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_HEAD_MISMATCH', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200, {artifactHead: '4'.repeat(40)})]},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_CREATED_AT_INVALID', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [{...artifact(200), created_at: null}]},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_TIME_ORDER_INVALID', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200, {
    at: '2026-09-01T13:29:05Z',
    updatedAt: '2026-09-01T13:29:04Z',
  })]},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_PRECEDES_RUN', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200, {at: '2026-09-01T13:28:59Z'})]},
  receiptsByRunId: {'200': receipt(200)},
}));

// A newer exact generation is authoritative before success filtering. An older
// green must never mask a newer pending, failed, or artifactless lifecycle run.
expectReject('LIFECYCLE_LATEST_NOT_TERMINAL', () => invoke({
  runs: [green, run(205, null, '2026-09-01T13:32:00Z', {status: 'queued'})],
  artifactsByRunId: {'200': [artifact(200)], '205': [artifact(205, {at: '2026-09-01T13:32:05Z'})]},
  receiptsByRunId: {'200': receipt(200), '205': receipt(205)},
}));
expectReject('LIFECYCLE_LATEST_UNSUPERSEDED_RED', () => invoke({
  runs: [green, run(206, 'failure', '2026-09-01T13:33:00Z')],
  artifactsByRunId: {'200': [artifact(200)], '206': [artifact(206, {at: '2026-09-01T13:33:05Z'})]},
  receiptsByRunId: {'200': receipt(200), '206': receipt(206, {state: 'READY_NON_PROMOTABLE'})},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:0', () => invoke({
  runs: [green, run(207, 'success', '2026-09-01T13:34:00Z')],
  artifactsByRunId: {'200': [artifact(200)], '207': []},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RUN_PR_ASSOCIATION_INVALID', () => invoke({
  runs: [green, run(208, 'success', '2026-09-01T13:35:00Z', {associatedPr: null})],
  artifactsByRunId: {'200': [artifact(200)], '208': []},
  receiptsByRunId: {'200': receipt(200)},
}));

const crossPrNewerRed = invoke({
  runs: [green, run(209, 'failure', '2026-09-01T13:36:00Z', {associatedPr: 9999})],
  artifactsByRunId: {'200': [artifact(200)], '209': []},
  receiptsByRunId: {'200': receipt(200)},
});
assert(crossPrNewerRed.lifecycle_run_id === 200, 'CROSS_PR_GENERATION_MUST_NOT_SUPERSEDE');

expectReject('LIFECYCLE_PRECREATION_RUN_ALIAS_REJECTED', () => invoke({
  runs: [run(204, 'success', '2026-09-01T12:59:59Z')],
  artifactsByRunId: {'204': [artifact(204, {at: '2026-09-01T13:00:01Z'})]},
  receiptsByRunId: {'204': receipt(204)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:2', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200), artifact(200)]},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_EXPIRED_OR_AMBIGUOUS', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200, {expired: true})]},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_DIGEST_INVALID', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200, {digest: null})]},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_EXACT_GENERATION_MISSING', () => invoke({
  runs: [run(200, 'success', '2026-09-01T13:29:00Z', {sha: '3'.repeat(40)})],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_BASE_MISMATCH', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200, {exact_base_sha: '4'.repeat(40)})},
}));
expectReject('LIFECYCLE_RECEIPT_NOT_READY_GOVERNED', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200, {state: 'READY_NON_PROMOTABLE'})},
}));
expectReject('LIFECYCLE_RECEIPT_REASON_INVALID', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200, {reason: 'generic'})},
}));
expectReject('LIFECYCLE_RECEIPT_NATIVE_STATUS_MISMATCH', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200, {
    native_status_evidence: receiptEvidence(nativeStatuses).map(status =>
      status.context === GOVERNED_LANDING_CONTEXT ? {...status, description: 'tampered'} : status),
  })},
}));
expectReject('LIFECYCLE_RECEIPT_FINAL_REREAD_REQUIRED', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200, {final_live_reread: false})},
}));

const workflow = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');
const order = [
  'Require latest terminal exact-head lifecycle authority',
  'Stage trusted Current-SOLD post-landing validator',
  'Initialize durable atomic landing terminal receipt',
  'Upload pre-mutation atomic landing intent',
  'Re-read live authority and execute exact-head server merge',
  'Reconcile durable atomic landing terminal receipt',
  'Upload durable atomic landing terminal receipt',
].map(value => workflow.indexOf(value));
assert(order.every(index => index >= 0), 'ATOMIC_LANDING_COMPOSED_SAFETY_SURFACE_MISSING');
assert(order.every((index, position) => position === 0 || index > order[position - 1]), 'ATOMIC_LANDING_COMPOSED_SAFETY_ORDER_INVALID');
assert(workflow.includes('if: always()'), 'ATOMIC_LANDING_TERMINAL_ALWAYS_GUARD_MISSING');
assert(workflow.includes('kidults-current-sold-postlanding-v1-'), 'ATOMIC_LANDING_CURRENT_SOLD_RECEIPT_MISSING');
assert(workflow.includes('kidults-atomic-governed-landing-terminal-'), 'ATOMIC_LANDING_TERMINAL_RECEIPT_ARTIFACT_MISSING');

console.log('Atomic landing lifecycle authority regression: PASS');
