import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCurrentSoldValueChainReadiness,
} from '../../../scripts/kidults/market/validate-current-sold-value-chain-readiness-v1.mjs';
import fs from 'node:fs';

function fixture() {
  return JSON.parse(fs.readFileSync(
    'coordination/kidults/market/current-sold-value-chain-readiness-v1.json',
    'utf8'
  ));
}

test('holistic Current-SOLD readiness record preserves exact stage truth', () => {
  const value = fixture();
  const result = validateCurrentSoldValueChainReadiness(value);
  assert.equal(result.state, 'PASS');
  assert.equal(value.core_regression.protected_main_baseline.tests_passed, 56);
  assert.equal(value.core_regression.protected_main_baseline.status, 'VERIFIED_PASS');
  assert.equal(value.core_regression.candidate_control_generation.expected_tests, 57);
  assert.equal(value.core_regression.candidate_control_generation.tests_passed_claimed_in_repository, 0);
  assert.equal(value.core_regression.candidate_control_generation.status, 'PENDING_EXACT_HEAD_WORKFLOW_PROOF');
});

test('Track A engine ownership cannot drift to another track', () => {
  const value = fixture();
  value.stages.find(row => row.stage === 'TRACK_A_ATOMIC_CURRENT_SOLD_ADMISSION').owner = 'TRACK_Z';
  assert.throws(() => validateCurrentSoldValueChainReadiness(value),
    /CURRENT_SOLD_READINESS_TRACK_A_ENGINE_OWNER_INVALID/);
});

test('zero lawful rows cannot be converted into a Candidate/Evidence pair', () => {
  const value = fixture();
  value.stages.find(row => row.stage === 'TRACK_A_CANDIDATE_EVIDENCE_PAIR').candidate = 'candidate-1';
  assert.throws(() => validateCurrentSoldValueChainReadiness(value),
    /CURRENT_SOLD_READINESS_FALSE_PAIR/);
});

test('database, provider and release mutations remain zero or HOLD', () => {
  const value = fixture();
  value.truth_boundary.postgres_rows_written_by_this_change = 1;
  assert.throws(() => validateCurrentSoldValueChainReadiness(value),
    /CURRENT_SOLD_READINESS_MUTATION_BOUNDARY_INVALID/);

  const overclaim = fixture();
  overclaim.core_regression.candidate_control_generation.tests_passed_claimed_in_repository = 57;
  overclaim.core_regression.candidate_control_generation.status = 'VERIFIED_PASS';
  assert.throws(() => validateCurrentSoldValueChainReadiness(overclaim),
    /CURRENT_SOLD_READINESS_CANDIDATE_PROOF_OVERCLAIM/);
});
