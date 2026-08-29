#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = process.env.SUPERSESSION_WORKFLOW || '.github/workflows/kpmo-exact-head-ci-supersession-v1.yml';
const source = fs.readFileSync(path, 'utf8');

for (const required of [
  'for phase_one_attempt in $(seq 1 8)',
  'for reconciliation_attempt in $(seq 1 12)',
  'FINAL_AUTHORITATIVE_READ',
  'final_authoritative_read:true',
  'terminalization_timeouts',
  'CANCELLATION_NOT_TERMINAL',
  'terminal_proof_required_before_cancel_count:true',
  'if: always()',
  'if-no-files-found: error',
  'same_head_runs_cancelled:0',
  'RUN_LOOKUP_CARDINALITY_MISMATCH',
  'failure_reason:(if $failure_reason=="NONE" then null else $failure_reason end)'
]) assert.equal(source.includes(required), true, `missing supersession invariant: ${required}`);

assert.match(source, /if \[\[ "\$\{terminal\}" == "true" && "\$\{latest_status\}" == "completed" \]\]; then[\s\S]*if \[\[ "\$\{latest_conclusion\}" == "cancelled" \]\]; then[\s\S]*cancelled=\$\(\(cancelled \+ 1\)\)/);
assert.match(source, /if \[\[ "\$\{head_sha\}" == "\$\{EXACT_HEAD_SHA\}" \]\]; then[\s\S]*exact_head_retained=\$\(\(exact_head_retained \+ 1\)\)[\s\S]*continue/);
assert.equal(source.includes('timeout-minutes: 5'), false, 'obsolete 5-minute job bound remains');
assert.equal(source.includes('failure_reason:($failure_reason|select'), false, 'empty-stream receipt expression remains');

console.log(JSON.stringify({
  test: 'KPMO_EXACT_HEAD_SUPERSESSION_RECONCILIATION_V1',
  state: 'VERIFIED_PASS',
  two_phase_terminalization: true,
  final_authoritative_read: true,
  terminal_proof_before_cancel_count: true,
  exact_head_retention: true,
  timeout_failure_receipt: true,
  pagination_cardinality_fail_closed: true,
  success_receipt_non_empty: true
}, null, 2));
