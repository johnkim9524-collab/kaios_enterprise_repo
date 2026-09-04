#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';

const SHA = /^[0-9a-f]{40}$/;
const TERMINAL = new Set(['success', 'failure', 'cancelled', 'skipped']);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value) { return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`; }
function required(value, code) { const text = String(value || '').trim(); if (!text) throw new Error(code); return text; }
function normalizeOutcome(value, code) { const text = required(value, code).toLowerCase(); if (!TERMINAL.has(text)) throw new Error(`${code}:${text}`); return text; }

export function buildReceipt(input, initialize = false) {
  const sourceSha = required(input.source_sha, 'SOURCE_SHA_REQUIRED');
  if (!SHA.test(sourceSha)) throw new Error('SOURCE_SHA_INVALID');
  const runId = required(input.run_id, 'RUN_ID_REQUIRED');
  const runAttempt = required(input.run_attempt, 'RUN_ATTEMPT_REQUIRED');
  const repository = required(input.repository, 'REPOSITORY_REQUIRED');
  const base = {
    id: 'kidults-full-value-chain-redteam-terminal-v1',
    version: '1.0.0',
    repository,
    source_sha: sourceSha,
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    trigger_event: input.trigger_event || 'UNKNOWN',
    observed_at: input.observed_at || new Date().toISOString(),
    live_authority: {
      canonical_latest: 'NOT_EVALUATED',
      material_severity_parity: 'NOT_EVALUATED',
    },
    aggregate_suite: 'NOT_EVALUATED',
    failed_check_ids: ['TERMINAL_NOT_RECONCILED'],
    first_failed_stage: 'TERMINAL_NOT_RECONCILED',
    state: 'VERIFIED_FAIL',
    overall_state: 'RED',
    promotion_eligible: false,
    empirical_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
    release_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
    empirical_delta: 0,
    provider_authority: false,
    database_authority: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
  if (initialize) return { ...base, receipt_digest: digest(stable(base)) };

  const guard = normalizeOutcome(input.binding_guard_outcome, 'BINDING_GUARD_OUTCOME');
  const canonical = normalizeOutcome(input.canonical_outcome, 'CANONICAL_OUTCOME');
  const severity = normalizeOutcome(input.severity_outcome, 'SEVERITY_OUTCOME');
  const aggregate = normalizeOutcome(input.aggregate_outcome, 'AGGREGATE_OUTCOME');
  const checks = [
    ['LIVE_AUTHORITY_BINDING_GUARD', guard],
    ['CANONICAL_LATEST_LIVE_AUTHORITY', canonical],
    ['MATERIAL_SEVERITY_PARITY_LIVE_AUTHORITY', severity],
    ['FULL_VALUE_CHAIN_AGGREGATE', aggregate],
  ];
  const failed = checks.filter(([, outcome]) => outcome !== 'success').map(([id]) => id);
  const pass = failed.length === 0;
  const receipt = {
    ...base,
    live_authority: {
      canonical_latest: canonical === 'success' ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
      material_severity_parity: severity === 'success' ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    },
    binding_guard: guard === 'success' ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    aggregate_suite: aggregate === 'success' ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    step_outcomes: Object.fromEntries(checks),
    failed_check_ids: failed,
    first_failed_stage: failed[0] || null,
    state: pass ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    overall_state: pass ? 'HOLD' : 'RED',
  };
  return { ...receipt, receipt_digest: digest(stable(receipt)) };
}

function write(path, value) {
  fs.mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function selfTest() {
  const base = { repository: 'owner/repo', source_sha: 'a'.repeat(40), run_id: '123', run_attempt: '1', trigger_event: 'pull_request', observed_at: '2026-09-04T00:00:00Z' };
  const init = buildReceipt(base, true);
  if (init.state !== 'VERIFIED_FAIL' || init.first_failed_stage !== 'TERMINAL_NOT_RECONCILED' || init.promotion_eligible !== false) throw new Error('SELFTEST_INIT_FAILCLOSED');
  const green = buildReceipt({ ...base, binding_guard_outcome: 'success', canonical_outcome: 'success', severity_outcome: 'success', aggregate_outcome: 'success' });
  if (green.state !== 'VERIFIED_PASS' || green.overall_state !== 'HOLD' || green.failed_check_ids.length !== 0 || green.production !== 'HOLD') throw new Error('SELFTEST_GREEN_BOUNDARY');
  const canonicalRed = buildReceipt({ ...base, binding_guard_outcome: 'success', canonical_outcome: 'failure', severity_outcome: 'success', aggregate_outcome: 'success' });
  if (canonicalRed.state !== 'VERIFIED_FAIL' || canonicalRed.first_failed_stage !== 'CANONICAL_LATEST_LIVE_AUTHORITY' || canonicalRed.overall_state !== 'RED') throw new Error('SELFTEST_CANONICAL_RED');
  const severityRed = buildReceipt({ ...base, binding_guard_outcome: 'success', canonical_outcome: 'success', severity_outcome: 'failure', aggregate_outcome: 'success' });
  if (severityRed.first_failed_stage !== 'MATERIAL_SEVERITY_PARITY_LIVE_AUTHORITY') throw new Error('SELFTEST_SEVERITY_RED');
  const aggregateRed = buildReceipt({ ...base, binding_guard_outcome: 'success', canonical_outcome: 'success', severity_outcome: 'success', aggregate_outcome: 'failure' });
  if (aggregateRed.first_failed_stage !== 'FULL_VALUE_CHAIN_AGGREGATE') throw new Error('SELFTEST_AGGREGATE_RED');
  let malformedRejected = false;
  try { buildReceipt({ ...base, binding_guard_outcome: 'success', canonical_outcome: 'unknown', severity_outcome: 'success', aggregate_outcome: 'success' }); } catch { malformedRejected = true; }
  if (!malformedRejected) throw new Error('SELFTEST_MALFORMED_OUTCOME');
  console.log(JSON.stringify({ id: 'kidults-full-value-chain-redteam-terminal-v1-selftest', state: 'VERIFIED_PASS', cases: 6, promotion_eligible: false, production: 'HOLD', public: 'HOLD', g5: 'HOLD' }));
}

const args = new Set(process.argv.slice(2));
if (args.has('--self-test')) {
  selfTest();
} else {
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : '';
  if (!output) throw new Error('OUTPUT_REQUIRED');
  const initialize = args.has('--initialize');
  const receipt = buildReceipt({
    repository: process.env.GITHUB_REPOSITORY,
    source_sha: process.env.KPMO_SOURCE_SHA,
    run_id: process.env.GITHUB_RUN_ID,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT,
    trigger_event: process.env.GITHUB_EVENT_NAME,
    observed_at: new Date().toISOString(),
    binding_guard_outcome: process.env.KPMO_BINDING_GUARD_OUTCOME,
    canonical_outcome: process.env.KPMO_CANONICAL_OUTCOME,
    severity_outcome: process.env.KPMO_SEVERITY_OUTCOME,
    aggregate_outcome: process.env.KPMO_AGGREGATE_OUTCOME,
  }, initialize);
  write(output, receipt);
  console.log(JSON.stringify(receipt, null, 2));
}
