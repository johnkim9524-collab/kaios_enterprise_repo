#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveInlineSentinelHealth, failureReceipt } from './resolve-continuous-assurance-sentinel-inline-health-v1.mjs';

const OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);
const SENTINEL_TRIGGERS = new Set(['schedule', 'workflow_dispatch']);

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
    receipt_digest: digest(stableJson(payload))
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

function applySentinelPolicy(receipt, stepOutcomes, sentinelHealth) {
  const trigger = String(receipt?.execution?.trigger || '');
  if (!SENTINEL_TRIGGERS.has(trigger)) return { steps: stepOutcomes, healthRequired: false, healthState: 'NOT_APPLICABLE' };
  const state = String(sentinelHealth?.state || 'UNAVAILABLE');
  const healthStep = {
    id: 'SENTINEL_UPSTREAM_HEALTH',
    name: 'Resolve complete exact-SHA authoritative sentinel producer health',
    outcome: state === 'VERIFIED_PASS' ? 'success' : 'failure',
    applicable: true
  };
  return { steps: [...stepOutcomes, healthStep], healthRequired: true, healthState: state };
}

export function reconcileReceipt(receipt, jobStatus, stepOutcomes, options = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('AUDIT_RECEIPT_INVALID');
  if (!['success', 'failure', 'cancelled'].includes(jobStatus)) throw new Error(`JOB_STATUS_INVALID:${jobStatus}`);
  const policy = applySentinelPolicy(receipt, normalizeSteps(stepOutcomes), options.sentinelHealth || null);
  const normalized = policy.steps;
  const nonSuccess = normalized.filter((row) => row.applicable && row.outcome !== 'success');

  const checks = Array.isArray(receipt.checks) ? structuredClone(receipt.checks) : [];
  const failedIds = [];
  for (const row of nonSuccess) {
    const checkId = `WORKFLOW_REQUIRED_STEP_${row.id}`;
    failedIds.push(checkId);
    const next = {
      id: checkId,
      required: true,
      state: 'VERIFIED_FAIL',
      failure_class: row.outcome === 'skipped' ? 'REQUIRED_WORKFLOW_STEP_SKIPPED' : 'REQUIRED_WORKFLOW_STEP_FAILURE',
      observed: { step_name: row.name, outcome: row.outcome }
    };
    const index = checks.findIndex((check) => check?.id === checkId);
    if (index >= 0) checks[index] = next;
    else checks.push(next);
  }
  if (jobStatus !== 'success' && nonSuccess.length === 0) {
    const checkId = 'WORKFLOW_JOB_FAILURE_UNATTRIBUTED';
    failedIds.push(checkId);
    checks.push({
      id: checkId,
      required: true,
      state: 'VERIFIED_FAIL',
      failure_class: 'WORKFLOW_JOB_FAILURE_WITHOUT_BOUND_STEP',
      observed: { job_status: jobStatus }
    });
  }

  const failClosed = jobStatus !== 'success' || failedIds.length > 0;
  const states = { ...(receipt.states || {}) };
  states.promotion_eligible = false;
  states.release_state = 'HOLD';
  if (failClosed) {
    states.internal_control_state = 'VERIFIED_FAIL';
    states.external_empirical_state = 'HOLD';
    states.overall_state = 'RED';
  }
  const next = {
    ...receipt,
    checks,
    states,
    sentinel_upstream_health: policy.healthRequired ? options.sentinelHealth || null : null,
    terminal_reconciliation: {
      id: 'KIDULTS_CONTINUOUS_ASSURANCE_INLINE_TERMINAL_RECONCILIATION_V1',
      state: failClosed ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
      job_status: jobStatus,
      required_step_outcomes: normalized,
      failed_check_ids: [...new Set(failedIds)].sort(),
      sentinel_exact_sha_health_required: policy.healthRequired,
      sentinel_exact_sha_health_state: policy.healthState,
      sentinel_exact_sha_health_receipt_digest: options.sentinelHealth?.receipt_digest || null,
      source_failure_dominates_generic_audit_pass: failClosed,
      whole_platform_authority: false,
      promotion_eligible: false
    }
  };
  return signed(next);
}

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`ARG_MISSING:${name}`);
  return process.argv[index + 1];
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
      promotion_eligible: false
    },
    terminal_reconciliation: {
      id: 'KIDULTS_CONTINUOUS_ASSURANCE_INLINE_TERMINAL_RECONCILIATION_V1',
      state: 'VERIFIED_FAIL',
      failed_check_ids: ['WORKFLOW_TERMINAL_RECONCILIATION_FATAL'],
      sentinel_exact_sha_health_required: SENTINEL_TRIGGERS.has(String(receipt?.execution?.trigger || '')),
      sentinel_exact_sha_health_state: 'VERIFIED_FAIL',
      source_failure_dominates_generic_audit_pass: true,
      whole_platform_authority: false,
      promotion_eligible: false
    }
  });
}

async function main() {
  const receiptPath = arg('--receipt');
  let receipt = null;
  let sentinelHealth = null;
  try {
    const stat = fs.lstatSync(receiptPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('AUDIT_RECEIPT_NOT_REGULAR_FILE');
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const trigger = String(receipt?.execution?.trigger || '');
    if (SENTINEL_TRIGGERS.has(trigger)) {
      const repository = String(process.env.GITHUB_REPOSITORY || '');
      const sha = String(receipt?.source?.expected_sha || receipt?.source?.sha || process.env.KPMO_SOURCE_SHA || '');
      try {
        sentinelHealth = await resolveInlineSentinelHealth({ repository, sha });
      } catch (error) {
        sentinelHealth = failureReceipt(repository, sha, String(error?.message || error));
      }
      atomicWrite(path.join(path.dirname(path.resolve(receiptPath)), 'sentinel-upstream-health.json'), sentinelHealth);
    }
    const result = reconcileReceipt(receipt, arg('--job-status'), JSON.parse(arg('--step-outcomes-json')), { sentinelHealth });
    atomicWrite(receiptPath, result);
    console.log(JSON.stringify({
      state: result.terminal_reconciliation.state,
      sentinel_exact_sha_health_state: result.terminal_reconciliation.sentinel_exact_sha_health_state,
      failed_check_ids: result.terminal_reconciliation.failed_check_ids
    }));
    if (result.terminal_reconciliation.state !== 'VERIFIED_PASS') process.exitCode = 1;
  } catch (error) {
    if (receipt) atomicWrite(receiptPath, redFallback(receipt, String(error?.message || error)));
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
