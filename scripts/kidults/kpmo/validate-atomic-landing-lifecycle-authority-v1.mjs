#!/usr/bin/env node
import {selectAtomicLandingLifecycleAuthority} from './lib/atomic-landing-lifecycle-authority-v1.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const expectReject = (code, fn) => {
  let rejected = false;
  try { fn(); } catch (error) { rejected = String(error?.message || '').includes(code); }
  assert(rejected, `EXPECTED_REJECTION_MISSING:${code}`);
};

const head = '1'.repeat(40);
const base = '2'.repeat(40);
const prNumber = 1811;
const run = (id, conclusion, at, status = 'completed', sha = head) => ({
  id,
  run_attempt: 1,
  event: 'pull_request_target',
  head_sha: sha,
  status,
  conclusion,
  created_at: at,
  updated_at: at,
  pull_requests: [],
});
const artifact = id => ({
  id: id + 1000,
  name: `kpmo-pr-lifecycle-integrity-${prNumber}-${head}-${id}-1`,
  expired: false,
  size_in_bytes: 777,
  digest: `sha256:${'a'.repeat(64)}`,
});
const receipt = (id, overrides = {}) => ({
  id: 'kpmo-pr-lifecycle-integrity-receipt-v1',
  repository: 'johnkim9524-collab/kaios_enterprise_repo',
  pull_request: prNumber,
  exact_head_sha: head,
  exact_base_sha: base,
  workflow_run_id: String(id),
  workflow_run_attempt: '1',
  event_name: 'pull_request_target',
  state: 'READY_GOVERNED',
  final_live_reread: true,
  ...overrides,
});
const nativeStatuses = [
  {id: 10, context: 'KIDULTS Scope-Aware Authoritative Status V1', state: 'success', created_at: '2026-09-01T13:24:25Z', updated_at: '2026-09-01T13:24:25Z'},
  {id: 11, context: 'KIDULTS Governed Landing Authorization V1', state: 'success', created_at: '2026-09-01T13:28:37Z', updated_at: '2026-09-01T13:28:37Z'},
];
const invoke = ({runs, artifactsByRunId, receiptsByRunId = {}, statuses = nativeStatuses, lastReadyAt = '2026-09-01T13:20:00Z'}) => selectAtomicLandingLifecycleAuthority({
  runs,
  artifactsByRunId,
  receiptsByRunId,
  prNumber,
  headSha: head,
  baseSha: base,
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
expectReject('LIFECYCLE_SUCCESS_PRECEDES_NATIVE_SUCCESS', () => invoke({
  runs: [run(203, 'success', '2026-09-01T13:27:00Z')],
  artifactsByRunId: {'203': [artifact(203)]},
  receiptsByRunId: {'203': receipt(203)},
}));
expectReject('LIFECYCLE_SUCCESS_PRECEDES_LATEST_READY_EVENT', () => invoke({
  runs: [green], artifactsByRunId: {'200': [artifact(200)]}, receiptsByRunId: {'200': receipt(200)}, lastReadyAt: '2026-09-01T13:30:00Z',
}));
expectReject('LIFECYCLE_EXACT_GENERATION_MISSING', () => invoke({
  runs: [green], artifactsByRunId: {'200': []}, receiptsByRunId: {},
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
expectReject('LIFECYCLE_RECEIPT_FINAL_REREAD_REQUIRED', () => invoke({
  runs: [green], artifactsByRunId: {'200': [artifact(200)]}, receiptsByRunId: {'200': receipt(200, {final_live_reread: false})},
}));

console.log('Atomic landing lifecycle authority regression: PASS');
