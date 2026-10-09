#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SHA = /^[0-9a-f]{40}$/;
const REQUIRED_STAGES = [
  'INITIALIZE',
  'CHECKOUT',
  'SOURCE',
  'SETUP_NODE',
  'SCHEMAS',
  'SYNTAX',
  'TESTS',
  'LEGACY',
  'SMOKE',
  'MIGRATION',
];

const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

export function buildCurrentSoldTerminalReceipt(input) {
  const expectedHead = SHA.test(input.expectedHeadSha || '') ? input.expectedHeadSha : null;
  const sourceSha = SHA.test(input.sourceSha || '') ? input.sourceSha : null;
  const runId = Number(input.runId);
  const runAttempt = Number(input.runAttempt);
  const outcomes = Object.fromEntries(REQUIRED_STAGES.map(stage => [stage, String(input.stageOutcomes?.[stage] || '')]));
  const failed = REQUIRED_STAGES.filter(stage => outcomes[stage] !== 'success');
  if (!expectedHead) failed.unshift('EXPECTED_HEAD_INVALID');
  if (!sourceSha || sourceSha !== expectedHead) failed.push('EXACT_HEAD_BINDING');
  const expectedTests = Number(input.expectedTests);
  if (!Number.isSafeInteger(expectedTests) || expectedTests <= 0) failed.push('TEST_COUNT_INVALID');
  if (!Number.isSafeInteger(runId) || runId <= 0) failed.push('RUN_ID_INVALID');
  if (!Number.isSafeInteger(runAttempt) || runAttempt <= 0) failed.push('RUN_ATTEMPT_INVALID');
  const failedCheckIds = [...new Set(failed)];
  const pass = failedCheckIds.length === 0;
  const receipt = {
    control: 'KIDULTS_CURRENT_SOLD_ENGINE_V1_3',
    receipt_class: 'WORKFLOW_TERMINAL_RECEIPT',
    state: pass ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    overall_state: pass ? 'GREEN' : 'RED',
    repository: input.repository || null,
    source_sha: sourceSha,
    expected_head_sha: expectedHead,
    run_id: Number.isSafeInteger(runId) && runId > 0 ? runId : null,
    run_attempt: Number.isSafeInteger(runAttempt) && runAttempt > 0 ? runAttempt : null,
    trigger_event: input.triggerEvent || null,
    stage_outcomes: outcomes,
    failed_check_ids: failedCheckIds,
    first_failed_stage: failedCheckIds[0] || null,
    expected_tests: Number.isSafeInteger(expectedTests) && expectedTests > 0 ? expectedTests : 0,
    whole_batch_atomic: pass,
    strict_current_max_age_days: 7,
    max_clock_skew_seconds: 300,
    lawful_empirical_current_sold_count: 0,
    private_candidate_current_sold_count: 0,
    postgres_migration_applied: false,
    postgres_rows_written: 0,
    provider_calls: 0,
    deployment: false,
    empirical_authority: false,
    database_authority: false,
    provider_authority: false,
    producer_health_authority: pass,
    promotion_eligible: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
  return {...receipt, receipt_digest: sha256(JSON.stringify(receipt))};
}

function inputFromEnvironment() {
  const outcomes = Object.fromEntries(REQUIRED_STAGES.map(stage => [stage, process.env[`${stage}_OUTCOME`] || '']));
  return {
    expectedHeadSha: process.env.CURRENT_SOLD_EXPECTED_HEAD_SHA,
    sourceSha: process.env.CURRENT_SOLD_EXACT_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    triggerEvent: process.env.GITHUB_EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    expectedTests: process.env.CURRENT_SOLD_EXPECTED_TESTS,
    stageOutcomes: outcomes,
  };
}

function writeReceipt(file, receipt) {
  if (!file) throw new Error('CURRENT_SOLD_TERMINAL_RECEIPT_PATH_REQUIRED');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, {mode: 0o600});
  fs.chmodSync(file, 0o600);
}

function selfTest() {
  const base = {
    expectedHeadSha: 'a'.repeat(40),
    sourceSha: 'a'.repeat(40),
    runId: '10',
    runAttempt: '1',
    triggerEvent: 'pull_request',
    repository: 'o/r',
    expectedTests: '57',
    stageOutcomes: Object.fromEntries(REQUIRED_STAGES.map(stage => [stage, 'success'])),
  };
  const pass = buildCurrentSoldTerminalReceipt(base);
  if (pass.state !== 'VERIFIED_PASS' || pass.expected_tests !== 57 || !pass.producer_health_authority) throw new Error('SELF_PASS');
  const failed = buildCurrentSoldTerminalReceipt({...base, stageOutcomes: {...base.stageOutcomes, TESTS: 'failure'}});
  if (failed.state !== 'VERIFIED_FAIL' || !failed.failed_check_ids.includes('TESTS') || failed.producer_health_authority) throw new Error('SELF_FAILURE');
  const drift = buildCurrentSoldTerminalReceipt({...base, sourceSha: 'b'.repeat(40)});
  if (drift.state !== 'VERIFIED_FAIL' || !drift.failed_check_ids.includes('EXACT_HEAD_BINDING')) throw new Error('SELF_HEAD_DRIFT');
  const missing = buildCurrentSoldTerminalReceipt({...base, expectedTests: ''});
  if (missing.state !== 'VERIFIED_FAIL' || missing.expected_tests !== 0) throw new Error('SELF_TEST_COUNT');
  console.log(JSON.stringify({suite:'CURRENT_SOLD_TERMINAL_RECEIPT_V1',state:'VERIFIED_PASS',positive:1,negative:3}));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--self-test')) selfTest();
  else {
    const receipt = buildCurrentSoldTerminalReceipt(inputFromEnvironment());
    writeReceipt(process.env.CURRENT_SOLD_RECEIPT_PATH, receipt);
    console.log(JSON.stringify({state: receipt.state, failed_check_ids: receipt.failed_check_ids}));
    if (receipt.state !== 'VERIFIED_PASS') process.exitCode = 1;
  }
}
