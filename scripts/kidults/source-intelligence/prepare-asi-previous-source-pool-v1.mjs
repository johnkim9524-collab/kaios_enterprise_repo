#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const filePath = process.argv[2] || '/tmp/previous-source-pool/asi-proactive-source-pool-v1.json';
if (!fs.existsSync(filePath)) {
  console.log(JSON.stringify({ status: 'NO_PREVIOUS_POOL', cycle_index: 0, previous_pool_valid: false, migration_required: false }));
  process.exit(0);
}

let value;
try {
  value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (error) {
  fs.rmSync(filePath, { force: true });
  console.log(JSON.stringify({ status: 'PREVIOUS_POOL_PARSE_FAILED_FRESH_RESTART', cycle_index: 0, previous_pool_valid: false, migration_required: false, error: String(error.message || error).slice(0, 300) }));
  process.exit(0);
}

const cycle = Number(value.cycle_count || 0) % 10;
const validCycle = Number.isInteger(cycle) && cycle >= 0 && cycle <= 9;
const safeLegacyV1 = () => {
  if (value.id !== 'kidults-asi-proactive-source-pool-v1' || value.version !== '1.0.0' || value.status !== 'ROLLING_DISCOVERY_CANDIDATE_POOL') return false;
  if (value.production !== 'HOLD' || value.public_release !== 'HOLD' || value.acquisition_authorized !== false) return false;
  if (value.rights_promoted_automatically !== false || value.admission_promoted_automatically !== false || value.content_acquired !== false) return false;
  if (!Array.isArray(value.candidates) || Number(value.candidate_count) !== value.candidates.length) return false;
  for (const candidate of value.candidates) {
    if (!candidate.source_candidate_key || !candidate.canonical_locator || !Array.isArray(candidate.discovery_providers)) return false;
    if (candidate.rights_state !== 'UNASSESSED' || candidate.admission_state !== 'NOT_ADMITTED' || candidate.source_pool_state !== 'CANDIDATE_ONLY' || candidate.evidence_state !== 'DISCOVERY_METADATA_ONLY') return false;
    if (candidate.acquisition_authorized !== false || candidate.target_site_traversal_authorized !== false || candidate.market_claim_authorized !== false || candidate.public_projection !== false || candidate.production !== 'HOLD') return false;
  }
  return true;
};

const validation = spawnSync(process.execPath, ['scripts/kidults/source-intelligence/validate-asi-proactive-source-pool-v1.mjs', filePath], { encoding: 'utf8' });
if (validation.status === 0 && validCycle) {
  console.log(JSON.stringify({
    status: 'PREVIOUS_POOL_VALID',
    cycle_index: cycle,
    previous_pool_valid: true,
    migration_required: false,
    previous_candidate_count: Number(value.candidate_count || 0),
    previous_cycle_count: Number(value.cycle_count || 0),
    previous_version: value.version || null
  }));
  process.exit(0);
}

if (safeLegacyV1() && validCycle) {
  console.log(JSON.stringify({
    status: 'PREVIOUS_POOL_ACCEPTED_FOR_V1_1_LOCATOR_MIGRATION',
    cycle_index: cycle,
    previous_pool_valid: true,
    migration_required: true,
    previous_candidate_count: Number(value.candidate_count || 0),
    previous_cycle_count: Number(value.cycle_count || 0),
    previous_version: value.version,
    target_version: '1.1.0'
  }));
  process.exit(0);
}

fs.rmSync(filePath, { force: true });
console.log(JSON.stringify({
  status: validCycle ? 'PREVIOUS_POOL_REJECTED_FRESH_RESTART' : 'PREVIOUS_POOL_CYCLE_INVALID_FRESH_RESTART',
  cycle_index: 0,
  previous_pool_valid: false,
  migration_required: false,
  validator_exit: validation.status,
  validator_error: (validation.stderr || '').slice(0, 500),
  previous_version: value.version || null
}));
