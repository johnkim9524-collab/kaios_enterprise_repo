#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const contractPath = 'coordination/kidults/source-intelligence/asi-mission-directed-discovery-contract-v1.json';
const validatorPath = 'scripts/kidults/source-intelligence/validate-asi-mission-directed-discovery-v1.mjs';
const strictGatePath = 'coordination/kidults/source-intelligence/strict-current-market-admission-gate-v1.json';
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-zero-candidate-'));
const now = '2026-08-29T00:00:00.000Z';
const receipts = Array.from({ length: 8 }, (_, index) => ({
  receipt_id: `zero-receipt-${index}`,
  cycle_number: 1,
  cursor_index: index,
  mission_discovery_intent_id: `intent-${index}`,
  mission_id: `mission-${index}`,
  market_cell_id: `cell-${index}`,
  lane_slot: 'PRIMARY_CANDIDATE_LANE',
  scope_id: `scope-${index}`,
  region: 'GLOBAL',
  evidence_class: 'CURRENT_SOLD_TRANSACTION',
  provider_lane: 'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA',
  started_at: now,
  completed_at: now,
  state: 'SUCCESS_ZERO_RESULTS',
  candidate_count: 0,
  error: null,
  fallback_used: true,
  fallback_reason: 'PRIMARY_DISCOVERY_EXIT_1',
  target_site_body_traversed: false,
  source_content_collected: false,
  collection_right_created: false,
  admission_effect: 'NONE',
  public_release: 'HOLD',
  production: 'HOLD'
}));
const laneHealth = contract.provider_lanes.map((lane) => lane.lane_id === 'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA'
  ? { lane_id: lane.lane_id, attempted_intents: 8, successful_intents: 8, failed_intents: 0, observed_candidates: 0, errors: [], status: 'SUCCESS_ZERO_RESULTS' }
  : { lane_id: lane.lane_id, attempted_intents: 0, successful_intents: 0, failed_intents: 0, observed_candidates: 0, errors: [], status: 'NOT_SCHEDULED_THIS_CYCLE' });
const discovery = {
  id: 'kidults-asi-mission-directed-public-metadata-discovery-v1', version: '1.0.0',
  status: contract.cycle_policy.zero_candidate_terminal_status,
  contract_id: contract.id, contract_version: contract.version,
  cycle_number: 1, input_intent_id: 'kidults-asi-mission-discovery-intent-v1', input_intent_digest: `sha256:${'0'.repeat(64)}`,
  total_intent_count: 426, batch_size: 8, cursor_start: 0, cursor_next: 8, wrapped_this_cycle: false, full_rotation_count: 0,
  attempted_intent_count: 8, successful_intent_count: 8, failed_intent_count: 0, partial_failure_state: 'NONE',
  primary_discovery_fallback_used: true, primary_discovery_failure: 'PRIMARY_DISCOVERY_EXIT_1',
  zero_candidate_terminal: true, zero_candidate_reason: 'ALL_BOUNDED_PROVIDER_LANES_RETURNED_ZERO',
  candidate_count: 0, unique_endpoint_count: 0, missions_with_candidates: 0,
  healthy_provider_lanes: 1, failed_provider_lanes: 0, lane_health: laneHealth, intent_receipts: receipts, candidates: [],
  target_site_body_crawled: false, content_acquired: false, acquisition_authorized: false, account_created: false,
  eula_accepted: false, spend_authorized: false, collection_right_created: false, evidence_admitted: false,
  market_claim_authorized: false, public_release: 'HOLD', production: 'HOLD'
};
const state = {
  id: 'kidults-asi-mission-directed-discovery-cycle-state-v1', version: '1.0.0', status: 'ACTIVE_ROLLING_CURSOR',
  input_intent_digest: discovery.input_intent_digest, total_intent_count: 426, cycle_number: 1, cursor_start: 0,
  batch_size: 8, next_cursor: 8, wrapped_this_cycle: false, full_rotation_count: 0,
  attempted_intents_cumulative: 8, successful_intents_cumulative: 8, failed_intents_cumulative: 0,
  candidates_observed_cumulative_not_deduplicated: 0, last_cycle_candidate_count: 0, last_cycle_healthy_provider_lanes: 1,
  manual_orchestration_required: false, target_site_body_crawled: false, content_acquired: false,
  public_release: 'HOLD', production: 'HOLD'
};
const discoveryPath = path.join(output, 'mission-directed-discovery-v1.json');
fs.writeFileSync(discoveryPath, JSON.stringify(discovery, null, 2));
fs.writeFileSync(path.join(output, 'mission-directed-discovery-cycle-state-v1.json'), JSON.stringify(state, null, 2));
const valid = spawnSync(process.execPath, [validatorPath, output, contractPath], { encoding: 'utf8' });
assert.equal(valid.status, 0, valid.stderr);
const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${script}:${result.stderr}`);
};
const gate1 = path.join(output, 'asi-gate1-safe-candidate-pool-v1.json');
const gate2 = path.join(output, 'asi-gate2-independent-reverification-v1.json');
const gate3 = path.join(output, 'asi-gate3-admission-runtime-v1.json');
run('scripts/kidults/source-intelligence/build-asi-gate1-safe-candidate-pool-v1.mjs', [discoveryPath, gate1]);
run('scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs', [gate1]);
run('scripts/kidults/source-intelligence/build-asi-gate2-independent-reverification-v1.mjs', [gate1, gate2]);
run('scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs', [gate2]);
run('scripts/kidults/source-intelligence/build-asi-gate3-admission-runtime-v1.mjs', [gate2, gate3]);
run('scripts/kidults/source-intelligence/validate-asi-gate3-admission-runtime-v1.mjs', [gate3]);
run('scripts/kidults/source-intelligence/build-asi-mission-claim-admission-readiness-v1.mjs', [discoveryPath, gate1, gate2, gate3, strictGatePath, contractPath, output]);
run('scripts/kidults/source-intelligence/validate-asi-mission-claim-admission-readiness-v1.mjs', [output, discoveryPath, gate1, gate2, gate3, strictGatePath, contractPath]);
discovery.status = 'SHADOW_MISSION_DIRECTED_PUBLIC_METADATA_DISCOVERY_COMPLETE';
discovery.zero_candidate_terminal = false;
discovery.zero_candidate_reason = null;
fs.writeFileSync(discoveryPath, JSON.stringify(discovery, null, 2));
const invalid = spawnSync(process.execPath, [validatorPath, output, contractPath], { encoding: 'utf8' });
assert.notEqual(invalid.status, 0, 'ZERO_CANDIDATE_TRUTH_MUTATION_ACCEPTED');
console.log(JSON.stringify({ id: 'kidults-asi-mission-directed-zero-candidate-test-v1', state: 'VERIFIED_PASS', zero_candidate_terminal_accepted: true, empty_gate1_gate2_gate3_chain_verified: true, empty_claim_and_adapter_outputs_verified: true, hidden_zero_candidate_mutation_rejected: true, public_release: 'HOLD', production: 'HOLD' }, null, 2));
