#!/usr/bin/env node
import crypto from 'node:crypto';
import { reconcileReceipt } from './reconcile-continuous-assurance-inline-v1.mjs';
import { evaluateProducer, SPECS } from './resolve-continuous-assurance-sentinel-health-v1.mjs';
import { normalizeSentinelRuns } from './resolve-continuous-assurance-sentinel-inline-health-v1.mjs';

const stableJson = (value) => Array.isArray(value)
  ? `[${value.map(stableJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const sign = (value) => ({ ...value, observed_at: '2026-09-02T00:00:00.000Z', receipt_digest: digest(stableJson(value)) });
const base = sign({
  schema_version: '1.0.0',
  receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
  execution: { trigger: 'pull_request' },
  states: { internal_control_state: 'VERIFIED_PASS', external_empirical_state: 'HOLD', release_state: 'HOLD', overall_state: 'HOLD', promotion_eligible: false },
  checks: [{ id: 'CONTROL', required: true, state: 'VERIFIED_PASS' }],
  empirical_truth_effect: { graded_delta: 0, human_review_delta: 0, dated_sold_delta: 0, candidate_or_evidence_created: false, track_b_started: false, projection_approved: false },
  authority_boundary: { detector_authority: 'READ_ONLY', repository_mutation_performed: false, credentialed_external_mutation_performed: false, secret_material_read: false, production_or_g5_promoted: false }
});
const ids = ['EXACT_SOURCE', 'EPHEMERAL_GUARD', 'SHADOW_BINDING', 'REQUIREMENT_BINDING', 'RESERVE_BINDING', 'TRUTH_BINDING', 'MET_BINDING', 'VAM_BINDING', 'ASSURANCE_CONTRACT', 'ADAPTER_WATCH', 'WATCH_COVERAGE', 'AUDIT_RECEIPT'];
const success = ids.map((id) => ({ id, name: id, outcome: 'success', applicable: true }));
const skippedBindings = success.map((row) => ['SHADOW_BINDING', 'REQUIREMENT_BINDING', 'RESERVE_BINDING', 'TRUTH_BINDING'].includes(row.id) ? { ...row, outcome: 'skipped', applicable: false } : row);
const sentinelPass = sign({
  receipt_id: 'kpmo-continuous-assurance-sentinel-health-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  coverage_scope: 'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',
  repository: 'johnkim9524-collab/kaios_enterprise_repo',
  source_sha: 'a'.repeat(40),
  producers: [],
  failed_producers: [],
  waiting_producers: [],
  whole_platform_authority: false,
  promotion_eligible: false,
  empirical_delta: 0,
  provider_authority: false,
  database_authority: false,
  public: 'HOLD', production: 'HOLD', g5: 'HOLD'
});
const sentinelFail = sign({ ...sentinelPass, state: 'VERIFIED_FAIL', failure_class: 'EXACT_SHA_PRODUCER_SET_RED' });

const sentinelSha = 'a'.repeat(40);
const sentinelObservedAt = '2026-09-04T15:30:00.000Z';
const sentinelArtifact = (run, name, id = 100) => ({
  id,
  name,
  digest: `sha256:${'b'.repeat(64)}`,
  expired: false,
  expires_at: '2026-12-01T00:00:00Z',
  workflow_run: { id: run.id, head_sha: sentinelSha },
});
const sentinelRun = (id, workflowPath, event, conclusion, createdAt) => ({
  id,
  run_attempt: 1,
  path: workflowPath,
  head_sha: sentinelSha,
  head_branch: 'main',
  event,
  status: 'completed',
  conclusion,
  created_at: createdAt,
  updated_at: createdAt,
});
const sentinelConfig = Object.fromEntries(SPECS.map((row) => [row.id, row]));

{
  const c = sentinelConfig.SHADOW;
  const oldPass = sentinelRun(10, c.path, 'schedule', 'success', '2026-09-04T10:00:00Z');
  const newFail = sentinelRun(11, c.path, 'schedule', 'failure', '2026-09-04T11:00:00Z');
  const result = evaluateProducer(c, [oldPass, newFail], { 10: [sentinelArtifact(oldPass, 'kidults-asi-shadow-operating-evidence-v1')] }, sentinelSha, sentinelObservedAt);
  if (result.state !== 'VERIFIED_FAIL' || result.selected_run_id !== 11) throw new Error('SENTINEL_NEWER_RED_MUST_DOMINATE');
}
{
  const c = sentinelConfig.SHADOW;
  const oldFail = sentinelRun(20, c.path, 'schedule', 'failure', '2026-09-04T10:00:00Z');
  const newPass = sentinelRun(21, c.path, 'schedule', 'success', '2026-09-04T11:00:00Z');
  const result = evaluateProducer(c, [oldFail, newPass], { 21: [sentinelArtifact(newPass, 'kidults-asi-shadow-operating-evidence-v1')] }, sentinelSha, sentinelObservedAt);
  if (result.state !== 'VERIFIED_PASS' || !result.superseded_red_run_ids.includes(20)) throw new Error('SENTINEL_NEWER_PASS_MUST_BIND_SUPERSESSION');
}
{
  const c = sentinelConfig.REQUIREMENT;
  const pass = sentinelRun(30, c.path, 'workflow_run', 'success', '2026-09-04T10:00:00Z');
  const expectedSkip = sentinelRun(31, c.path, 'workflow_run', 'skipped', '2026-09-04T11:00:00Z');
  const result = evaluateProducer(c, normalizeSentinelRuns(c, [pass, expectedSkip]), { 30: [sentinelArtifact(pass, 'kidults-asi-requirement-adapter-coverage-v1')] }, sentinelSha, sentinelObservedAt);
  if (result.state !== 'VERIFIED_PASS' || result.selected_run_id !== 30) throw new Error('SENTINEL_EXPECTED_SKIP_CLASSIFICATION');
}
{
  const c = sentinelConfig.RESERVE;
  const waiting = sentinelRun(40, c.path, 'schedule', 'success', '2026-09-04T11:00:00Z');
  const result = evaluateProducer(c, [waiting], { 40: [sentinelArtifact(waiting, 'kidults-asi-sharded-source-reserve-waiting-v1')] }, sentinelSha, sentinelObservedAt);
  if (result.state !== 'VERIFIED_HOLD') throw new Error('SENTINEL_RESERVE_WAITING_MUST_HOLD');
}
{
  const c = sentinelConfig.CANONICAL_TRUTH;
  const pass = sentinelRun(50, c.path, 'push', 'success', '2026-09-04T11:00:00Z');
  const bad = sentinelArtifact(pass, `kpmo-live-canonical-issue-truth-v1-${pass.id}`);
  bad.expired = true;
  const result = evaluateProducer(c, [pass], { 50: [bad] }, sentinelSha, sentinelObservedAt);
  if (result.state !== 'VERIFIED_FAIL') throw new Error('SENTINEL_EXPIRED_ARTIFACT_MUST_FAIL');
}
{
  const c = sentinelConfig.SHADOW;
  const pending = sentinelRun(60, c.path, 'schedule', null, '2026-09-04T11:00:00Z');
  pending.status = 'in_progress';
  const result = evaluateProducer(c, [pending], {}, sentinelSha, sentinelObservedAt);
  if (result.state !== 'VERIFIED_HOLD') throw new Error('SENTINEL_PENDING_LATEST_MUST_HOLD');
}

const green = reconcileReceipt(base, 'success', success);
if (green.states.internal_control_state !== 'VERIFIED_PASS' || green.states.overall_state !== 'HOLD') throw new Error('GREEN_STATE');
if (green.terminal_reconciliation.state !== 'VERIFIED_PASS' || green.terminal_reconciliation.failed_check_ids.length !== 0) throw new Error('GREEN_RECONCILIATION');

const prGreen = reconcileReceipt(base, 'success', skippedBindings);
if (prGreen.terminal_reconciliation.state !== 'VERIFIED_PASS' || prGreen.terminal_reconciliation.failed_check_ids.length !== 0) throw new Error('EXPECTED_NON_APPLICABLE_SKIP');

const scheduledUnsigned = structuredClone(base);
delete scheduledUnsigned.observed_at;
delete scheduledUnsigned.receipt_digest;
scheduledUnsigned.execution = { trigger: 'schedule' };
const scheduledBase = sign(scheduledUnsigned);
const scheduledWithoutHealth = reconcileReceipt(scheduledBase, 'success', skippedBindings);
if (scheduledWithoutHealth.states.internal_control_state !== 'VERIFIED_FAIL' || scheduledWithoutHealth.states.overall_state !== 'RED') throw new Error('SCHEDULE_SENTINEL_NO_HEALTH_FALSE_GREEN');
if (!scheduledWithoutHealth.terminal_reconciliation.failed_check_ids.includes('WORKFLOW_REQUIRED_STEP_SENTINEL_UPSTREAM_HEALTH')) throw new Error('SCHEDULE_SENTINEL_HEALTH_REQUIRED');

const scheduledGreen = reconcileReceipt(scheduledBase, 'success', skippedBindings, { sentinelHealth: sentinelPass });
if (scheduledGreen.terminal_reconciliation.state !== 'VERIFIED_PASS' || scheduledGreen.states.internal_control_state !== 'VERIFIED_PASS') throw new Error('SCHEDULE_SENTINEL_HEALTH_PASS_NOT_ACCEPTED');
if (scheduledGreen.terminal_reconciliation.sentinel_exact_sha_health_state !== 'VERIFIED_PASS') throw new Error('SCHEDULE_SENTINEL_HEALTH_STATE_MISSING');
for (const id of ['SHADOW_BINDING', 'REQUIREMENT_BINDING', 'RESERVE_BINDING', 'TRUTH_BINDING']) {
  const row = scheduledGreen.terminal_reconciliation.required_step_outcomes.find((entry) => entry.id === id);
  if (!row || row.applicable !== false || row.outcome !== 'skipped') throw new Error(`SCHEDULE_SENTINEL_BOUNDING_SKIP:${id}`);
}

const scheduledRed = reconcileReceipt(scheduledBase, 'success', skippedBindings, { sentinelHealth: sentinelFail });
if (scheduledRed.terminal_reconciliation.state !== 'VERIFIED_FAIL' || !scheduledRed.terminal_reconciliation.failed_check_ids.includes('WORKFLOW_REQUIRED_STEP_SENTINEL_UPSTREAM_HEALTH')) throw new Error('SCHEDULE_SENTINEL_RED_NOT_DOMINANT');

const manualUnsigned = structuredClone(base);
delete manualUnsigned.observed_at;
delete manualUnsigned.receipt_digest;
manualUnsigned.execution = { trigger: 'workflow_dispatch' };
const manualBase = sign(manualUnsigned);
const manualGreen = reconcileReceipt(manualBase, 'success', skippedBindings, { sentinelHealth: sentinelPass });
if (manualGreen.terminal_reconciliation.state !== 'VERIFIED_PASS' || manualGreen.terminal_reconciliation.sentinel_exact_sha_health_required !== true) throw new Error('MANUAL_SENTINEL_HEALTH_NOT_BOUND');

const reserveFailure = success.map((row) => row.id === 'RESERVE_BINDING' ? { ...row, outcome: 'failure' } : row.id === 'TRUTH_BINDING' ? { ...row, outcome: 'skipped' } : row);
const red = reconcileReceipt(base, 'failure', reserveFailure);
if (red.states.internal_control_state !== 'VERIFIED_FAIL' || red.states.overall_state !== 'RED') throw new Error('RED_STATE');
for (const id of ['WORKFLOW_REQUIRED_STEP_RESERVE_BINDING', 'WORKFLOW_REQUIRED_STEP_TRUTH_BINDING']) {
  if (!red.terminal_reconciliation.failed_check_ids.includes(id)) throw new Error(`RED_ID:${id}`);
  if (!red.checks.some((check) => check.id === id && check.state === 'VERIFIED_FAIL')) throw new Error(`RED_CHECK:${id}`);
}
if (!red.terminal_reconciliation.source_failure_dominates_generic_audit_pass || red.states.promotion_eligible !== false) throw new Error('RED_BOUNDARY');

const unattributed = reconcileReceipt(base, 'failure', success);
if (!unattributed.terminal_reconciliation.failed_check_ids.includes('WORKFLOW_JOB_FAILURE_UNATTRIBUTED')) throw new Error('UNATTRIBUTED_FAILURE');

const inconsistent = reconcileReceipt(base, 'success', reserveFailure);
if (inconsistent.terminal_reconciliation.state !== 'VERIFIED_FAIL') throw new Error('INCONSISTENT_SUCCESS_ACCEPTED');
for (const id of ['WORKFLOW_REQUIRED_STEP_RESERVE_BINDING', 'WORKFLOW_REQUIRED_STEP_TRUTH_BINDING']) {
  if (!inconsistent.terminal_reconciliation.failed_check_ids.includes(id)) throw new Error(`INCONSISTENT_SUCCESS_ID:${id}`);
}

const unsigned = structuredClone(red);
delete unsigned.observed_at;
delete unsigned.receipt_digest;
if (red.receipt_digest !== digest(stableJson(unsigned))) throw new Error('DIGEST_BINDING');

console.log(JSON.stringify({ suite: 'KIDULTS_CONTINUOUS_ASSURANCE_INLINE_TERMINAL_RECONCILIATION_V1', positive: 10, negative: 7, state: 'VERIFIED_PASS' }));
