#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}
function assert(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

export function validateCurrentSoldValueChainReadiness(record) {
  assert(record?.id === 'kidults-current-sold-value-chain-readiness-v1',
    'CURRENT_SOLD_READINESS_ID_INVALID');
  assert(record.primary_track === 'TRACK_A', 'CURRENT_SOLD_READINESS_TRACK_INVALID');
  assert(record.overall_state ===
      'CORE_ENGINE_COMPLETE_EMPIRICAL_RUNTIME_AND_PRODUCT_CHAIN_NOT_COMPLETE',
    'CURRENT_SOLD_READINESS_OVERALL_STATE_INVALID');
  assert(record.core_regression?.tests_passed === 56 &&
      record.core_regression?.tests_failed === 0 &&
      record.core_regression?.post_landing_status === 'VERIFIED_PASS',
    'CURRENT_SOLD_READINESS_CORE_PROOF_INVALID');
  assert(Array.isArray(record.stages) && record.stages.length === 8,
    'CURRENT_SOLD_READINESS_STAGE_COUNT_INVALID');

  const stages = new Map(record.stages.map(stage => [stage.stage, stage]));
  const expected = {
    TRACK_Z_SOURCE_RIGHTS_AND_ACQUISITION: 'BLOCKED_EXTERNAL_AUTHORITY',
    KPMO_GOVERNED_RECEIPT_REGISTRY_AUTHORITY:
      'CONTROL_IMPLEMENTATION_ADDED_PENDING_PROTECTED_MAIN_AND_EXTERNAL_TRUST_ROOT',
    TRACK_A_ATOMIC_CURRENT_SOLD_ADMISSION: 'CORE_COMPLETE_CONTROL_VALIDATED',
    TRACK_A_CURRENT_SOLD_EVENT_AND_EVIDENCE: 'CORE_COMPLETE_CONTROL_VALIDATED',
    TRACK_D_APPEND_ONLY_LEDGER: 'CODE_COMPLETE_NOT_ACTIVATED',
    TRACK_A_CANDIDATE_EVIDENCE_PAIR: 'BLOCKED_NO_LAWFUL_LEDGER_ROWS',
    TRACK_B_INDEPENDENT_ASSESSMENT: 'NOT_STARTED_EXACT_PAIR_ABSENT',
    PROJECTION_AND_PORTAL: 'HOLD_NO_APPROVED_PROJECTION',
  };
  for (const [stageId, state] of Object.entries(expected)) {
    assert(stages.get(stageId)?.state === state, 'CURRENT_SOLD_READINESS_STAGE_STATE_INVALID', stageId);
  }
  assert(stages.get('TRACK_A_ATOMIC_CURRENT_SOLD_ADMISSION')?.owner === 'TRACK_A',
    'CURRENT_SOLD_READINESS_TRACK_A_ENGINE_OWNER_INVALID');
  assert(stages.get('TRACK_A_CURRENT_SOLD_EVENT_AND_EVIDENCE')?.runtime_owner === 'ASI',
    'CURRENT_SOLD_READINESS_ASI_RUNTIME_OWNER_INVALID');
  assert(stages.get('TRACK_D_APPEND_ONLY_LEDGER')?.postgres_rows_written === 0,
    'CURRENT_SOLD_READINESS_FALSE_LEDGER_WRITE');
  assert(stages.get('TRACK_A_CANDIDATE_EVIDENCE_PAIR')?.candidate === 'NONE' &&
      stages.get('TRACK_A_CANDIDATE_EVIDENCE_PAIR')?.evidence_package === 'NONE',
    'CURRENT_SOLD_READINESS_FALSE_PAIR');
  assert(record.truth_boundary?.lawful_empirical_current_sold_admitted === 0,
    'CURRENT_SOLD_READINESS_FALSE_EMPIRICAL');
  assert(record.truth_boundary?.provider_calls_by_this_change === 0 &&
      record.truth_boundary?.postgres_rows_written_by_this_change === 0 &&
      record.truth_boundary?.deployment_by_this_change === false,
    'CURRENT_SOLD_READINESS_MUTATION_BOUNDARY_INVALID');
  assert(record.truth_boundary?.public === 'HOLD' &&
      record.truth_boundary?.production === 'HOLD' &&
      record.truth_boundary?.g5 === 'HOLD',
    'CURRENT_SOLD_READINESS_RELEASE_BOUNDARY_INVALID');

  const corrections = new Set(record.immediate_implementations || []);
  for (const required of [
    'TRACK_A_CURRENT_SOLD_JOB_DESCRIPTION',
    'GOVERNED_RECEIPT_REGISTRY_AUTHORITY_VERIFICATION_ADAPTER',
    'CANONICAL_ADMISSION_ENTRYPOINT_STATIC_GUARD',
    'DEDICATED_CONTROL_ONLY_GITHUB_WORKFLOW',
  ]) {
    assert(corrections.has(required), 'CURRENT_SOLD_READINESS_IMPLEMENTATION_MISSING', required);
  }

  return {
    state: 'PASS',
    stages: record.stages.length,
    primary_track: 'TRACK_A',
    empirical_count: 0,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

export function validateCurrentSoldValueChainReadinessFile(
  filePath = 'coordination/kidults/market/current-sold-value-chain-readiness-v1.json'
) {
  return validateCurrentSoldValueChainReadiness(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const filePath = process.argv[2] || 'coordination/kidults/market/current-sold-value-chain-readiness-v1.json';
  console.log(JSON.stringify(validateCurrentSoldValueChainReadinessFile(filePath), null, 2));
}
