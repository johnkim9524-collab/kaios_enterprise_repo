#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function signed(receipt) {
  const { observed_at: observedAt, receipt_digest: _receiptDigest, ...payload } = receipt;
  return {
    ...payload,
    observed_at: observedAt || new Date().toISOString(),
    receipt_digest: digest(stableJson(payload)),
  };
}

function normalizeSteps(stepOutcomes) {
  if (!Array.isArray(stepOutcomes) || stepOutcomes.length === 0) throw new Error('REQUIRED_STEP_OUTCOMES_EMPTY');
  const seen = new Set();
  return stepOutcomes.map((row) => {
    const id = String(row?.id || '');
    const name = String(row?.name || '');
    const outcome = String(row?.outcome || '');
    const applicable = row?.applicable;
    if (!/^[A-Z][A-Z0-9_]*$/.test(id)) throw new Error(`REQUIRED_STEP_ID_INVALID:${id}`);
    if (!name || name.length > 160) throw new Error(`REQUIRED_STEP_NAME_INVALID:${id}`);
    if (!OUTCOMES.has(outcome)) throw new Error(`REQUIRED_STEP_OUTCOME_INVALID:${id}:${outcome}`);
    if (typeof applicable !== 'boolean') throw new Error(`REQUIRED_STEP_APPLICABILITY_INVALID:${id}`);
    if (seen.has(id)) throw new Error(`REQUIRED_STEP_ID_DUPLICATE:${id}`);
    seen.add(id);
    return { id, name, outcome, applicable };
  });
}

function receiptSummary(value, expectedIds = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const unsigned = structuredClone(value);
  delete unsigned.receipt_digest;
  const suppliedDigest = String(value.receipt_digest || '');
  const identity = String(value.receipt_id || value.id || 'UNKNOWN');
  if (identity === 'kidults-continuous-assurance-ephemeral-guard-receipt-v1') delete unsigned.observed_at;
  const computedDigest = digest(stableJson(unsigned));
  const identityAccepted = expectedIds.length === 0 || expectedIds.includes(identity);
  const reasonCodes = Array.isArray(value.reason_codes)
    ? value.reason_codes.filter((code) => typeof code === 'string').slice(0, 32)
    : [];
  const producers = Array.isArray(value.producers)
    ? value.producers.slice(0, 16).map((producer) => ({
        id: String(producer?.id || 'UNKNOWN'),
        state: String(producer?.state || 'UNKNOWN'),
        artifact_transport_verified: producer?.artifact_transport_verified === true,
        artifact_content_validated: producer?.artifact_content_validated === true,
        failure_class: producer?.failure_class ? String(producer.failure_class) : null,
      }))
    : [];
  return {
    identity,
    identity_accepted: identityAccepted,
    state: String(value.state || 'UNKNOWN'),
    reason_codes: reasonCodes,
    failed_producers: Array.isArray(value.failed_producers) ? value.failed_producers.filter((id) => typeof id === 'string').slice(0, 16) : [],
    waiting_producers: Array.isArray(value.waiting_producers) ? value.waiting_producers.filter((id) => typeof id === 'string').slice(0, 16) : [],
    producers,
    receipt_digest: suppliedDigest || 'UNAVAILABLE',
    digest_verified: suppliedDigest === computedDigest,
  };
}

export function reconcileReceipt(receipt, jobStatus, stepOutcomes, causalReceipts = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('AUDIT_RECEIPT_INVALID');
  if (!['success', 'failure', 'cancelled'].includes(jobStatus)) throw new Error(`JOB_STATUS_INVALID:${jobStatus}`);
  const normalized = normalizeSteps(stepOutcomes);
  const nonSuccess = normalized.filter((row) => row.applicable && row.outcome !== 'success');
  if (jobStatus === 'success' && nonSuccess.length) throw new Error('SUCCESS_JOB_WITH_NON_SUCCESS_REQUIRED_STEP');

  const guardSummary = receiptSummary(causalReceipts.guard, [
    'kidults-continuous-assurance-ephemeral-guard-receipt-v1',
  ]);
  const producerHealthSummary = receiptSummary(causalReceipts.producerHealth, [
    'kpmo-continuous-assurance-sentinel-health-v1',
  ]);
  const causalFailures = [];
  for (const [id, summary] of [
    ['EPHEMERAL_GUARD_RECEIPT_INTEGRITY', guardSummary],
    ['CORE_FOUR_PRODUCER_HEALTH_RECEIPT_INTEGRITY', producerHealthSummary],
  ]) {
    if (summary && (!summary.digest_verified || !summary.identity_accepted)) causalFailures.push(id);
  }

  const checks = Array.isArray(receipt.checks) ? structuredClone(receipt.checks) : [];
  const failedIds = [];
  for (const row of nonSuccess) {
    const checkId = `WORKFLOW_REQUIRED_STEP_${row.id}`;
    failedIds.push(checkId);
    const observed = { step_name: row.name, outcome: row.outcome };
    if (row.id === 'EPHEMERAL_GUARD') {
      observed.guard_receipt = guardSummary;
      observed.core_four_producer_health = producerHealthSummary;
    }
    const next = {
      id: checkId,
      required: true,
      state: 'VERIFIED_FAIL',
      failure_class: row.outcome === 'skipped' ? 'REQUIRED_WORKFLOW_STEP_SKIPPED' : 'REQUIRED_WORKFLOW_STEP_FAILURE',
      observed,
    };
    const index = checks.findIndex((check) => check?.id === checkId);
    if (index >= 0) checks[index] = next;
    else checks.push(next);
  }
  for (const checkId of causalFailures) {
    failedIds.push(checkId);
    const summary = checkId.startsWith('EPHEMERAL') ? guardSummary : producerHealthSummary;
    checks.push({
      id: checkId,
      required: true,
      state: 'VERIFIED_FAIL',
      failure_class: 'CAUSAL_RECEIPT_IDENTITY_OR_DIGEST_INVALID',
      observed: summary,
    });
  }
  if (jobStatus !== 'success' && nonSuccess.length === 0) {
    const checkId = 'WORKFLOW_JOB_FAILURE_UNATTRIBUTED';
    failedIds.push(checkId);
    checks.push({
      id: checkId,
      required: true,
      state: 'VERIFIED_FAIL',
      failure_class: 'WORKFLOW_JOB_FAILURE_WITHOUT_BOUND_STEP',
      observed: { job_status: jobStatus },
    });
  }

  const uniqueFailedIds = [...new Set(failedIds)].sort();
  const failClosed = jobStatus !== 'success' || uniqueFailedIds.length > 0;
  const states = { ...(receipt.states || {}) };
  states.promotion_eligible = false;
  states.release_state = 'HOLD';
  if (failClosed) {
    states.internal_control_state = 'VERIFIED_FAIL';
    states.external_empirical_state = 'HOLD';
    states.overall_state = 'RED';
  }
  return signed({
    ...receipt,
    checks,
    states,
    terminal_reconciliation: {
      id: 'KIDULTS_CONTINUOUS_ASSURANCE_INLINE_TERMINAL_RECONCILIATION_V1',
      state: failClosed ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
      job_status: jobStatus,
      required_step_outcomes: normalized,
      causal_receipts: {
        ephemeral_guard: guardSummary,
        core_four_producer_health: producerHealthSummary,
      },
      failed_check_ids: uniqueFailedIds,
      source_failure_dominates_generic_audit_pass: failClosed,
      whole_platform_authority: false,
      promotion_eligible: false,
    },
  });
}

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`ARG_MISSING:${name}`);
  return process.argv[index + 1];
}

function optionalArg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] || null;
}

function readOptionalReceipt(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('CAUSAL_RECEIPT_NOT_REGULAR_FILE');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function atomicWrite(filePath, value) {
  const directory = path.dirname(path.resolve(filePath));
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function redFallback(receipt, code) {
  const checks = Array.isArray(receipt?.checks) ? structuredClone(receipt.checks) : [];
  checks.push({ id: 'WORKFLOW_TERMINAL_RECONCILIATION_FATAL', required: true, state: 'VERIFIED_FAIL', failure_class: code });
  return signed({
    ...(receipt || {}),
    checks,
    states: {
      ...(receipt?.states || {}),
      internal_control_state: 'VERIFIED_FAIL',
      external_empirical_state: 'HOLD',
      release_state: 'HOLD',
      overall_state: 'RED',
      promotion_eligible: false,
    },
    terminal_reconciliation: {
      id: 'KIDULTS_CONTINUOUS_ASSURANCE_INLINE_TERMINAL_RECONCILIATION_V1',
      state: 'VERIFIED_FAIL',
      failed_check_ids: ['WORKFLOW_TERMINAL_RECONCILIATION_FATAL'],
      source_failure_dominates_generic_audit_pass: true,
      whole_platform_authority: false,
      promotion_eligible: false,
    },
  });
}

function main() {
  const receiptPath = arg('--receipt');
  let receipt = null;
  try {
    const stat = fs.lstatSync(receiptPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('AUDIT_RECEIPT_NOT_REGULAR_FILE');
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const result = reconcileReceipt(receipt, arg('--job-status'), JSON.parse(arg('--step-outcomes-json')), {
      guard: readOptionalReceipt(optionalArg('--guard-receipt')),
      producerHealth: readOptionalReceipt(optionalArg('--producer-health-receipt')),
    });
    atomicWrite(receiptPath, result);
    console.log(JSON.stringify({ state: result.terminal_reconciliation.state, failed_check_ids: result.terminal_reconciliation.failed_check_ids }));
  } catch (error) {
    if (receipt) atomicWrite(receiptPath, redFallback(receipt, String(error?.message || error)));
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
