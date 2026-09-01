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
const prBinding = [{number: prNumber, head: {sha: head}, base: {sha: base}}];
const run = (id, conclusion, at, status = 'completed') => ({
  id,
  run_attempt: 1,
  status,
  conclusion,
  created_at: at,
  updated_at: at,
  pull_requests: prBinding,
});
const artifact = id => ({
  id: id + 1000,
  name: `kpmo-pr-lifecycle-integrity-${prNumber}-${head}-${id}-1`,
  expired: false,
  size_in_bytes: 777,
  digest: `sha256:${'a'.repeat(64)}`,
});
const nativeStatuses = [
  {id: 10, context: 'KIDULTS Scope-Aware Authoritative Status V1', state: 'success', created_at: '2026-09-01T13:24:25Z', updated_at: '2026-09-01T13:24:25Z'},
  {id: 11, context: 'KIDULTS Governed Landing Authorization V1', state: 'success', created_at: '2026-09-01T13:28:37Z', updated_at: '2026-09-01T13:28:37Z'},
];
const invoke = ({runs, artifactsByRunId, statuses = nativeStatuses, lastReadyAt = '2026-09-01T13:20:00Z'}) => selectAtomicLandingLifecycleAuthority({
  runs,
  artifactsByRunId,
  prNumber,
  headSha: head,
  baseSha: base,
  nativeStatuses: statuses,
  lastReadyAt,
});

const green = run(200, 'success', '2026-09-01T13:29:00Z');
const authority = invoke({runs: [green], artifactsByRunId: {'200': [artifact(200)]}});
assert(authority.state === 'READY_GOVERNED_LIFECYCLE_AUTHORITY_BOUND', 'POSITIVE_STATE');
assert(authority.lifecycle_run_id === 200, 'POSITIVE_RUN_BINDING');
assert(authority.lifecycle_artifact_digest === `sha256:${'a'.repeat(64)}`, 'POSITIVE_DIGEST_BINDING');

expectReject('LIFECYCLE_LATEST_UNSUPERSEDED_RED', () => invoke({
  runs: [green, run(201, 'failure', '2026-09-01T13:30:00Z')],
  artifactsByRunId: {'200': [artifact(200)], '201': [artifact(201)]},
}));
expectReject('LIFECYCLE_LATEST_NOT_TERMINAL', () => invoke({
  runs: [green, run(202, null, '2026-09-01T13:31:00Z', 'in_progress')],
  artifactsByRunId: {'200': [artifact(200)], '202': []},
}));
expectReject('LIFECYCLE_SUCCESS_PRECEDES_NATIVE_SUCCESS', () => invoke({
  runs: [run(203, 'success', '2026-09-01T13:27:00Z')],
  artifactsByRunId: {'203': [artifact(203)]},
}));
expectReject('LIFECYCLE_SUCCESS_PRECEDES_LATEST_READY_EVENT', () => invoke({
  runs: [green], artifactsByRunId: {'200': [artifact(200)]}, lastReadyAt: '2026-09-01T13:30:00Z',
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:0', () => invoke({
  runs: [green], artifactsByRunId: {'200': []},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:2', () => invoke({
  runs: [green], artifactsByRunId: {'200': [artifact(200), artifact(200)]},
}));
expectReject('LIFECYCLE_RECEIPT_ARTIFACT_EXPIRED_OR_AMBIGUOUS', () => invoke({
  runs: [green], artifactsByRunId: {'200': [{...artifact(200), expired: true}]},
}));
expectReject('LIFECYCLE_RECEIPT_DIGEST_INVALID', () => invoke({
  runs: [green], artifactsByRunId: {'200': [{...artifact(200), digest: null}]},
}));
expectReject('LIFECYCLE_EXACT_GENERATION_MISSING', () => invoke({
  runs: [{...green, pull_requests: [{number: prNumber, head: {sha: '3'.repeat(40)}, base: {sha: base}}]}],
  artifactsByRunId: {'200': [artifact(200)]},
}));

console.log('Atomic landing lifecycle authority regression: PASS');
