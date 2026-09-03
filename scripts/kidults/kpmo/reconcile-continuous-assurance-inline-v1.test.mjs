#!/usr/bin/env node
import crypto from 'node:crypto';
import { reconcileReceipt } from './reconcile-continuous-assurance-inline-v1.mjs';

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

const green = reconcileReceipt(base, 'success', success);
if (green.states.internal_control_state !== 'VERIFIED_PASS' || green.states.overall_state !== 'HOLD') throw new Error('GREEN_STATE');
if (green.terminal_reconciliation.state !== 'VERIFIED_PASS' || green.terminal_reconciliation.failed_check_ids.length !== 0) throw new Error('GREEN_RECONCILIATION');

const expectedNonApplicableSkip = success.map((row) => ['SHADOW_BINDING', 'REQUIREMENT_BINDING', 'RESERVE_BINDING', 'TRUTH_BINDING'].includes(row.id) ? { ...row, outcome: 'skipped', applicable: false } : row);
const prGreen = reconcileReceipt(base, 'success', expectedNonApplicableSkip);
if (prGreen.terminal_reconciliation.state !== 'VERIFIED_PASS' || prGreen.terminal_reconciliation.failed_check_ids.length !== 0) throw new Error('EXPECTED_NON_APPLICABLE_SKIP');

const scheduledUnsigned = structuredClone(base);
delete scheduledUnsigned.observed_at;
delete scheduledUnsigned.receipt_digest;
scheduledUnsigned.execution = { trigger: 'schedule' };
const scheduledBase = sign(scheduledUnsigned);
const scheduledRed = reconcileReceipt(scheduledBase, 'success', expectedNonApplicableSkip);
if (scheduledRed.states.internal_control_state !== 'VERIFIED_FAIL' || scheduledRed.states.overall_state !== 'RED') throw new Error('SCHEDULE_SENTINEL_FALSE_GREEN');
if (scheduledRed.terminal_reconciliation.state !== 'VERIFIED_FAIL' || scheduledRed.terminal_reconciliation.scheduled_sentinel_runtime_bindings_required !== true) throw new Error('SCHEDULE_SENTINEL_POLICY');
for (const id of ['SHADOW_BINDING', 'REQUIREMENT_BINDING', 'RESERVE_BINDING', 'TRUTH_BINDING']) {
  const checkId = `WORKFLOW_REQUIRED_STEP_${id}`;
  if (!scheduledRed.terminal_reconciliation.failed_check_ids.includes(checkId)) throw new Error(`SCHEDULE_SENTINEL_ID:${id}`);
  const row = scheduledRed.terminal_reconciliation.required_step_outcomes.find((entry) => entry.id === id);
  if (!row || row.applicable !== true || row.outcome !== 'skipped') throw new Error(`SCHEDULE_SENTINEL_EFFECTIVE_APPLICABILITY:${id}`);
}

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

console.log(JSON.stringify({ suite: 'KIDULTS_CONTINUOUS_ASSURANCE_INLINE_TERMINAL_RECONCILIATION_V1', positive: 5, negative: 2, state: 'VERIFIED_PASS' }));