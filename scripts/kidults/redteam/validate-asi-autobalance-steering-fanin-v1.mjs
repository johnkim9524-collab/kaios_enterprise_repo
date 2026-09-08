#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-autobalance-steering-overlay-live-v1.yml';
const text = fs.readFileSync(workflowPath, 'utf8');

const required = [
  "FRESHNESS_SLO_SECONDS=5400",
  "LATEST_EXACT_GENERATION_NON_SUCCESS",
  "STALE_EXACT_GENERATION_PEER",
  "TRIGGER_RUN_SUBSTITUTION",
  "Ensure terminal steering provenance receipt",
  "status:'FAIL_CLOSED_TERMINAL_RECEIPT'",
  "if: always()",
  "Fail closed unresolved steering fan-in",
  "INPUT_STEP_OUTCOME",
  "READY_STATE",
  "promotion_allowed:false",
  "public_release:'HOLD'",
  "production:'HOLD'"
];

for (const marker of required) {
  if (!text.includes(marker)) throw new Error(`MISSING_STEERING_FANIN_GUARD:${marker}`);
}

if (text.includes("-f branch=main -f status=success -f per_page=100")) {
  throw new Error('SUCCESS_ONLY_PEER_QUERY_REINTRODUCED');
}

const unsafeSelector = /select\([^\n]*\.status==\\?"completed\\?"[^\n]*\.conclusion==\\?"success\\?"[^\n]*\)\]\[0\]\.id/;
if (unsafeSelector.test(text)) throw new Error('HISTORICAL_SUCCESS_FALLBACK_REINTRODUCED');

const uploadBlock = text.match(/- name: Upload terminal steering artifacts[\s\S]*?if-no-files-found: error/);
if (!uploadBlock || !/if:\s*always\(\)/.test(uploadBlock[0])) {
  throw new Error('TERMINAL_ARTIFACT_UPLOAD_NOT_ALWAYS');
}

const terminalBlock = text.match(/- name: Ensure terminal steering provenance receipt[\s\S]*?- name: Upload terminal steering artifacts/);
if (!terminalBlock || !terminalBlock[0].includes('INPUT_STEP_OUTCOME') || !terminalBlock[0].includes('OVERLAY_STEP_OUTCOME')) {
  throw new Error('TERMINAL_RECEIPT_NOT_RECONCILED_WITH_STEP_OUTCOMES');
}

const failBlock = text.match(/- name: Fail closed unresolved steering fan-in[\s\S]*$/);
if (!failBlock || !failBlock[0].includes('READY_STATE') || !failBlock[0].includes('STEERING_FANIN_NOT_VERIFIED')) {
  throw new Error('UNRESOLVED_FANIN_FAILURE_GATE_MISSING');
}

console.log(JSON.stringify({
  id: 'validate-asi-autobalance-steering-fanin-v1',
  status: 'VERIFIED_FAIL_CLOSED_STEERING_FANIN',
  freshness_slo_seconds: 5400,
  historical_success_fallback_allowed: false,
  trigger_substitution_allowed: false,
  terminal_receipt_required: true,
  unresolved_fanin_success_allowed: false,
  promotion_allowed: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
