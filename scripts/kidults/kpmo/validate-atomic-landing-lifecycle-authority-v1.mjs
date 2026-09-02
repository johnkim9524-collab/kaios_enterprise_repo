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
const run = (id, conclusion, at, status = 'completed', sha = head, associatedPr = prNumber) => ({
  id,
  run_attempt: 1,
  event: 'pull_request_target',
  head_sha: sha,
  status,
  conclusion,
  created_at: at,
  updated_at: at,
  pull_requests: associatedPr == null ? [] : [{number: associatedPr}],
});
const artifact = id => ({
  id: id + 1000,
  name: `kpmo-pr-lifecycle-integrity-${prNumber}-${head}-${id}-1`,
  expired: false,
  size_in_bytes: 777,
  digest: `sha256:${'a'.repeat(64)}`,
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
const receipt = (id, overrides = {}, statuses = nativeStatuses) => ({
  id: 'kpmo-pr-lifecycle-integrity-receipt-v1',
  repository: 'johnkim9524-collab/kaios_enterprise_repo',
  pull_request: prNumber,
  exact_head_sha: head,
  exact_base_sha: base,
  workflow_run_id: String(id),
  workflow_run_attempt: '1',
  event_name: 'pull_request_target',
  lifecycle_evaluated_at: '2026-09-01T13:29:00Z',
  latest_ready_event_id: 9001,
  latest_ready_event_at: '2026-09-01T13:20:00Z',
  latest_ready_event_actor: 'repository-owner',
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

const rerunWithStaleMutableRunTimestamp = invoke({
  runs: [run(210, 'success', '2026-09-01T13:23:00Z')],
  artifactsByRunId: {'210': [artifact(210)]},
  receiptsByRunId: {'210': receipt(210)},
});
assert(rerunWithStaleMutableRunTimestamp.lifecycle_run_id === 210, 'RERUN_RECEIPT_TIME_MUST_BE_AUTHORITATIVE');
assert(rerunWithStaleMutableRunTimestamp.lifecycle_evaluated_at === '2026-09-01T13:29:00Z', 'RERUN_EVALUATED_AT_BINDING');

expectReject('LIFECYCLE_RECEIPT_EVALUATED_AT_INVALID', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200, {lifecycle_evaluated_at: null})},
}));
expectReject('LIFECYCLE_RECEIPT_READY_EVENT_MISMATCH', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200, {latest_ready_event_at: '2026-09-01T13:19:59Z'})},
}));
expectReject('LIFECYCLE_RECEIPT_READY_EVENT_ID_INVALID', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200, {latest_ready_event_id: null})},
}));

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
  artifactsByRunId: {'200': [artifact(200)], '201': [artifact(201)]},
  receiptsByRunId: {'200': receipt(200), '201': receipt(201, {state: 'READY_NON_PROMOTABLE'})},
}));
expectReject('LIFECYCLE_LATEST_NOT_TERMINAL', () => invoke({
  runs: [green, run(202, null, '2026-09-01T13:31:00Z', 'in_progress')],
  artifactsByRunId: {'200': [artifact(200)], '202': [artifact(202)]},
  receiptsByRunId: {'200': receipt(200), '202': receipt(202)},
}));
expectReject('LIFECYCLE_SUCCESS_PRECEDES_NATIVE_READY_SIGNAL', () => invoke({
  runs: [run(203, 'success', '2026-09-01T13:27:00Z')],
  artifactsByRunId: {'203': [artifact(203)]},
  receiptsByRunId: {'203': receipt(203, {lifecycle_evaluated_at: '2026-09-01T13:27:00Z'})},
}));
expectReject('LIFECYCLE_SUCCESS_PRECEDES_LATEST_READY_EVENT', () => invoke({
  runs: [green],
  artifactsByRunId: {'200': [artifact(200)]},
  receiptsByRunId: {'200': receipt(200, {
    lifecycle_evaluated_at: '2026-09-01T13:29:00Z',
    latest_ready_event_at: '2026-09-01T13:30:00Z',
  })},
  lastReadyAt: '2026-09-01T13:30:00Z',
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:0', () => invoke({
  runs: [green], artifactsByRunId: {'200': []}, receiptsByRunId: {},
}));

// A newer exact generation is authoritative before artifact filtering. An older
// green must never mask a newer pending, failed, or artifactless lifecycle run.
expectReject('LIFECYCLE_LATEST_NOT_TERMINAL', () => invoke({
  runs: [green, run(205, null, '2026-09-01T13:32:00Z', 'queued')],
  artifactsByRunId: {'200': [artifact(200)], '205': []},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_LATEST_UNSUPERSEDED_RED', () => invoke({
  runs: [green, run(206, 'failure', '2026-09-01T13:33:00Z')],
  artifactsByRunId: {'200': [artifact(200)], '206': []},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:0', () => invoke({
  runs: [green, run(207, 'success', '2026-09-01T13:34:00Z')],
  artifactsByRunId: {'200': [artifact(200)], '207': []},
  receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RUN_PR_ASSOCIATION_INVALID', () => invoke({
  runs: [green, run(208, 'success', '2026-09-01T13:35:00Z', 'completed', head, null)],
  artifactsByRunId: {'200': [artifact(200)], '208': []},
  receiptsByRunId: {'200': receipt(200)},
}));

const crossPrNewerRed = invoke({
  runs: [green, run(209, 'failure', '2026-09-01T13:36:00Z', 'completed', head, 9999)],
  artifactsByRunId: {'200': [artifact(200)], '209': []},
  receiptsByRunId: {'200': receipt(200)},
});
assert(crossPrNewerRed.lifecycle_run_id === 200, 'CROSS_PR_GENERATION_MUST_NOT_SUPERSEDE');

expectReject('LIFECYCLE_PRECREATION_RUN_ALIAS_REJECTED', () => invoke({
  runs: [run(204, 'success', '2026-09-01T12:59:59Z')],
  artifactsByRunId: {'204': [artifact(204)]},
  receiptsByRunId: {'204': receipt(204)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:2', () => invoke({
  runs: [green], artifactsByRunId: {'200': [artifact(200), artifact(200)]}, receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_EXPIRED_OR_AMBIGUOUS', () => invoke({
  runs: [green], artifactsByRunId: {'200': [{...artifact(200), expired: true}]}, receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_DIGEST_INVALID', () => invoke({
  runs: [green], artifactsByRunId: {'200': [{...artifact(200), digest: null}]}, receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_EXACT_GENERATION_MISSING', () => invoke({
  runs: [run(200, 'success', '2026-09-01T13:29:00Z', 'completed', '3'.repeat(40))],
  artifactsByRunId: {'200': [artifact(200)]}, receiptsByRunId: {'200': receipt(200)},
}));
expectReject('LIFECYCLE_RECEIPT_BASE_MISMATCH', () => invoke({
  runs: [green], artifactsByRunId: {'200': [artifact(200)]}, receiptsByRunId: {'200': receipt(200, {exact_base_sha: '4'.repeat(40)})},
}));
expectReject('LIFECYCLE_RECEIPT_NOT_READY_GOVERNED', () => invoke({
  runs: [green], artifactsByRunId: {'200': [artifact(200)]}, receiptsByRunId: {'200': receipt(200, {state: 'READY_NON_PROMOTABLE'})},
}));
expectReject('LIFECYCLE_RECEIPT_REASON_INVALID', () => invoke({
  runs: [green], artifactsByRunId: {'200': [artifact(200)]}, receiptsByRunId: {'200': receipt(200, {reason: 'generic'})},
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
  runs: [green], artifactsByRunId: {'200': [artifact(200)]}, receiptsByRunId: {'200': receipt(200, {final_live_reread: false})},
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
