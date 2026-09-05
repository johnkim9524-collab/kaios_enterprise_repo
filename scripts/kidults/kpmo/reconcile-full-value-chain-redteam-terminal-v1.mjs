#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];
const receiptPath = process.env.FULL_CHAIN_TERMINAL_RECEIPT_PATH
  || path.join(process.env.RUNNER_TEMP || '/tmp', 'kidults-full-chain-terminal', 'receipt.json');
const sha40 = /^[0-9a-f]{40}$/;
const positiveInteger = value => /^\d+$/.test(String(value || '')) && Number(value) > 0;
const fail = code => { throw new Error(code); };
const assert = (condition, code) => { if (!condition) fail(code); };

const repository = process.env.GITHUB_REPOSITORY;
const sourceSha = process.env.SOURCE_SHA;
const eventSha = process.env.GITHUB_SHA;
const runId = process.env.GITHUB_RUN_ID;
const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
const eventName = process.env.GITHUB_EVENT_NAME;

function baseReceipt() {
  assert(repository && /^[^/]+\/[^/]+$/.test(repository), 'FULL_CHAIN_TERMINAL_REPOSITORY_INVALID');
  assert(sha40.test(sourceSha || ''), 'FULL_CHAIN_TERMINAL_SOURCE_SHA_INVALID');
  assert(sha40.test(eventSha || ''), 'FULL_CHAIN_TERMINAL_EVENT_SHA_INVALID');
  assert(positiveInteger(runId), 'FULL_CHAIN_TERMINAL_RUN_ID_INVALID');
  assert(positiveInteger(runAttempt), 'FULL_CHAIN_TERMINAL_RUN_ATTEMPT_INVALID');
  assert(eventName, 'FULL_CHAIN_TERMINAL_EVENT_NAME_MISSING');
  return {
    id: 'kidults-full-value-chain-redteam-terminal-v1',
    version: '1.0.0',
    repository,
    source_sha: sourceSha,
    event_sha: eventSha,
    event_name: eventName,
    workflow_run_id: Number(runId),
    workflow_run_attempt: Number(runAttempt),
    state: 'INITIALIZED_FAIL_CLOSED',
    terminal: false,
    promotion_eligible: false,
    authority: 'CONTROL_ONLY',
    empirical_gate_effect: 'NONE',
    provider_requests: 0,
    credential_resolution: 0,
    remote_mutations: 0,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
    initialized_at: new Date().toISOString(),
  };
}

function writeReceipt(receipt) {
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true, mode: 0o700});
  const temporary = `${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
  fs.renameSync(temporary, receiptPath);
  fs.chmodSync(receiptPath, 0o600);
}

if (mode === '--initialize') {
  writeReceipt(baseReceipt());
  console.log(JSON.stringify({state: 'INITIALIZED_FAIL_CLOSED', receipt_path: receiptPath}));
} else if (mode === '--finalize') {
  assert(fs.existsSync(receiptPath), 'FULL_CHAIN_TERMINAL_INITIAL_RECEIPT_MISSING');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const expected = baseReceipt();
  for (const key of ['id', 'version', 'repository', 'source_sha', 'event_sha', 'event_name', 'workflow_run_id', 'workflow_run_attempt']) {
    assert(receipt?.[key] === expected[key], `FULL_CHAIN_TERMINAL_BINDING_MISMATCH:${key}`);
  }
  const stages = [
    ['live_authority_binding', process.env.LIVE_AUTHORITY_BINDING_OUTCOME],
    ['canonical_authority', process.env.CANONICAL_AUTHORITY_OUTCOME],
    ['severity_parity', process.env.SEVERITY_PARITY_OUTCOME],
    ['aggregate_suite', process.env.AGGREGATE_SUITE_OUTCOME],
  ].map(([stage, outcome]) => ({stage, outcome: String(outcome || 'missing')}));
  const firstNonSuccess = stages.find(item => item.outcome !== 'success') || null;
  const terminal = {
    ...receipt,
    state: firstNonSuccess ? 'VERIFIED_FAIL' : 'VERIFIED_PASS_CONTROL_ONLY',
    terminal: true,
    terminal_class: firstNonSuccess ? 'FAIL_CLOSED_WITH_DURABLE_RECEIPT' : 'CONTROL_VALIDATION_PASS',
    first_non_success_stage: firstNonSuccess?.stage || null,
    stage_outcomes: stages,
    promotion_eligible: false,
    authority: 'CONTROL_ONLY',
    empirical_gate_effect: 'NONE',
    provider_requests: 0,
    credential_resolution: 0,
    remote_mutations: 0,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
    finalized_at: new Date().toISOString(),
  };
  writeReceipt(terminal);
  console.log(JSON.stringify(terminal));
} else {
  fail('FULL_CHAIN_TERMINAL_MODE_INVALID');
}
