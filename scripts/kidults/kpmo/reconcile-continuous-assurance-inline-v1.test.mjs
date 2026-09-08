#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { reconcileReceipt } from './reconcile-continuous-assurance-inline-v1.mjs';
import { planSafeRemediation } from './plan-safe-remediation-v1.mjs';

const stableJson = (value) => Array.isArray(value)
  ? `[${value.map(stableJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const sign = (value) => ({ ...value, observed_at: '2026-09-08T00:00:00.000Z', receipt_digest: digest(stableJson(value)) });
const base = sign({
  schema_version: '1.0.0',
  receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
  source: { sha: 'a'.repeat(40), expected_sha: 'a'.repeat(40), actual_sha: 'a'.repeat(40), match: true },
  states: { internal_control_state: 'VERIFIED_PASS', external_empirical_state: 'HOLD', release_state: 'HOLD', overall_state: 'HOLD', promotion_eligible: false },
  checks: [{ id: 'CONTROL', required: true, state: 'VERIFIED_PASS' }],
  unresolved_gates: [{ id: 'PRODUCTION', state: 'HOLD' }],
  empirical_truth_effect: { graded_delta: 0, human_review_delta: 0, dated_sold_delta: 0, candidate_or_evidence_created: false, track_b_started: false, projection_approved: false },
  authority_boundary: { detector_authority: 'READ_ONLY', repository_mutation_performed: false, credentialed_external_mutation_performed: false, secret_material_read: false, production_or_g5_promoted: false },
});
const ids = ['EXACT_SOURCE', 'EPHEMERAL_GUARD', 'SHADOW_BINDING', 'REQUIREMENT_BINDING', 'RESERVE_BINDING', 'TRUTH_BINDING', 'MET_BINDING', 'VAM_BINDING', 'ASSURANCE_CONTRACT', 'ADAPTER_WATCH', 'WATCH_COVERAGE', 'AUDIT_RECEIPT'];
const success = ids.map((id) => ({ id, name: id, outcome: 'success', applicable: true }));
const signCausal = (value) => ({ ...value, receipt_digest: digest(stableJson(value)) });
const signGuard = (value) => ({ ...value, observed_at: '2026-09-08T00:00:00.000Z', receipt_digest: digest(stableJson(value)) });
const guard = signGuard({ id: 'kidults-continuous-assurance-ephemeral-guard-receipt-v1', state: 'EPHEMERAL_CANONICAL_LEADER_SELECTED', reason_codes: [] });
const producerHealth = signCausal({ receipt_id: 'kpmo-continuous-assurance-sentinel-health-v1', state: 'VERIFIED_FAIL', failed_producers: ['REQUIREMENT', 'CANONICAL_TRUTH'], waiting_producers: ['SHADOW', 'RESERVE'], producers: [{ id: 'REQUIREMENT', state: 'VERIFIED_FAIL', artifact_transport_verified: true, artifact_content_validated: true, failure_class: 'PRODUCER_NOT_GREEN' }] });

const green = reconcileReceipt(base, 'success', success, { guard });
if (green.states.internal_control_state !== 'VERIFIED_PASS' || green.states.overall_state !== 'HOLD') throw new Error('GREEN_STATE');
if (green.terminal_reconciliation.state !== 'VERIFIED_PASS' || green.terminal_reconciliation.failed_check_ids.length !== 0) throw new Error('GREEN_RECONCILIATION');

const expectedNonApplicableSkip = success.map((row) => ['SHADOW_BINDING', 'REQUIREMENT_BINDING', 'RESERVE_BINDING', 'TRUTH_BINDING'].includes(row.id) ? { ...row, outcome: 'skipped', applicable: false } : row);
const prGreen = reconcileReceipt(base, 'success', expectedNonApplicableSkip, { guard });
if (prGreen.terminal_reconciliation.state !== 'VERIFIED_PASS' || prGreen.terminal_reconciliation.failed_check_ids.length !== 0) throw new Error('EXPECTED_NON_APPLICABLE_SKIP');

const reserveFailure = success.map((row) => row.id === 'RESERVE_BINDING' ? { ...row, outcome: 'failure' } : row.id === 'TRUTH_BINDING' ? { ...row, outcome: 'skipped' } : row);
const red = reconcileReceipt(base, 'failure', reserveFailure, { guard });
for (const id of ['WORKFLOW_REQUIRED_STEP_RESERVE_BINDING', 'WORKFLOW_REQUIRED_STEP_TRUTH_BINDING']) {
  if (!red.terminal_reconciliation.failed_check_ids.includes(id)) throw new Error(`RED_ID:${id}`);
  if (!red.checks.some((check) => check.id === id && check.state === 'VERIFIED_FAIL')) throw new Error(`RED_CHECK:${id}`);
}
if (red.states.internal_control_state !== 'VERIFIED_FAIL' || red.states.overall_state !== 'RED') throw new Error('RED_STATE');

const guardFailure = success.map((row) => row.id === 'EPHEMERAL_GUARD' ? { ...row, outcome: 'failure' } : { ...row, outcome: 'skipped' });
const causalRed = reconcileReceipt(base, 'failure', guardFailure, { guard, producerHealth });
const causalId = 'WORKFLOW_REQUIRED_STEP_EPHEMERAL_GUARD';
if (!causalRed.terminal_reconciliation.failed_check_ids.includes(causalId)) throw new Error('EPHEMERAL_GUARD_FAILURE_LOST');
const causalCheck = causalRed.checks.find((check) => check.id === causalId);
if (causalCheck?.observed?.core_four_producer_health?.state !== 'VERIFIED_FAIL' || !causalCheck.observed.core_four_producer_health.failed_producers.includes('REQUIREMENT') || causalCheck.observed.core_four_producer_health.producers[0]?.failure_class !== 'PRODUCER_NOT_GREEN') throw new Error('CORE_FOUR_CAUSAL_DETAIL_LOST');
const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/platform-continuous-assurance-v1.json', 'utf8'));
const causalPlan = planSafeRemediation(causalRed, policy, { verifyFileEvidence: false });
if (!causalPlan.failed_check_ids.includes(causalId) || causalPlan.disposition !== 'KPMO_ISOLATED_DRAFT_FIX_REQUIRED') throw new Error('TERMINAL_FAILURE_NOT_PROPAGATED_TO_REMEDIATION');

const unattributed = reconcileReceipt(base, 'failure', success, { guard });
if (!unattributed.terminal_reconciliation.failed_check_ids.includes('WORKFLOW_JOB_FAILURE_UNATTRIBUTED')) throw new Error('UNATTRIBUTED_FAILURE');

let inconsistentRejected = false;
try { reconcileReceipt(base, 'success', reserveFailure, { guard }); } catch (error) { inconsistentRejected = String(error.message).includes('SUCCESS_JOB_WITH_NON_SUCCESS_REQUIRED_STEP'); }
if (!inconsistentRejected) throw new Error('INCONSISTENT_SUCCESS_ACCEPTED');

const tamperedGuard = { ...guard, state: 'DEDUPED_ALIAS' };
const tampered = reconcileReceipt(base, 'failure', guardFailure, { guard: tamperedGuard });
if (!tampered.terminal_reconciliation.failed_check_ids.includes('EPHEMERAL_GUARD_RECEIPT_INTEGRITY')) throw new Error('CAUSAL_RECEIPT_TAMPER_ACCEPTED');

const unsigned = structuredClone(causalRed);
delete unsigned.observed_at;
delete unsigned.receipt_digest;
if (causalRed.receipt_digest !== digest(stableJson(unsigned))) throw new Error('DIGEST_BINDING');

console.log(JSON.stringify({ suite: 'KIDULTS_CONTINUOUS_ASSURANCE_INLINE_TERMINAL_RECONCILIATION_V1', positive: 5, negative: 2, state: 'VERIFIED_PASS' }));
