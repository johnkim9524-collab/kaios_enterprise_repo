import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '../../..');
const DIRECTIVE_PATH = path.join(
  REPO_ROOT,
  'coordination/kidults/governance/track-b-additional-operating-directive-v1.3.md',
);
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  'coordination/kidults/contracts/rankability-assessment-contract-v1.0.json',
);

function readDirective() {
  return fs.readFileSync(DIRECTIVE_PATH, 'utf8');
}

function readContract() {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}

test('Track B v1.3 remains FINAL LOCKED with exactly two official inputs and one official output', () => {
  const directive = readDirective();
  const contract = readContract();

  assert.match(directive, /Rule Status: FINAL LOCKED/);
  assert.match(directive, /Track B access to Registry: READ ONLY/);
  assert.match(directive, /Assessment does not begin until both are available and valid\./);
  assert.match(directive, /No further operating-rule expansion is authorized under this locked baseline\./);

  assert.equal(contract.rule_status, 'FINAL_LOCKED_V1_3');
  assert.equal(contract.producer, 'TRACK_B');
  assert.equal(contract.registry_owner, 'ATLAS_KPMO');
  assert.deepEqual(
    contract.official_inputs.map(({ artifact, required }) => ({ artifact, required })),
    [
      { artifact: 'snapshot-candidate.json', required: true },
      { artifact: 'EVIDENCE_PACKAGE', required: true },
    ],
  );
  assert.equal(contract.output_boundary.only_official_output, 'rankability-assessment.json');
});

test('Track B remains fail-closed and cannot fabricate provisional assessment state', () => {
  const contract = readContract();

  assert.equal(contract.fail_closed.temporary_assessment_allowed, false);
  assert.equal(contract.fail_closed.estimated_assessment_allowed, false);
  assert.equal(contract.fail_closed.opinion_only_recommendation_allowed, false);
  assert.equal(contract.fail_closed.incomplete_completion_conditions, 'INCOMPLETE');
  assert.deepEqual(contract.fail_closed.insufficient_evidence, ['NOT_RANKABLE', 'BLOCKED']);
  assert.deepEqual(contract.assessment_status_values, ['INCOMPLETE', 'COMPLETE']);
  assert.deepEqual(contract.official_waiting_states, [
    'WAITING_FOR_SNAPSHOT',
    'WAITING_FOR_EVIDENCE',
    'WAITING_FOR_REGISTRY',
    'WAITING_FOR_VALIDATION',
  ]);
});

test('Track B cannot mutate upstream, registry, production, business, or final-ranking artifacts', () => {
  const contract = readContract();
  const forbidden = new Set(contract.output_boundary.must_not_generate);

  for (const artifact of [
    'snapshot-candidate.json',
    'PORTAL_RELEASE',
    'REGISTRY_CHANGE',
    'PRODUCTION_DECISION',
    'BUSINESS_RECOMMENDATION',
    'FINAL_RANKING',
  ]) {
    assert.equal(forbidden.has(artifact), true, `missing forbidden Track B output: ${artifact}`);
  }

  assert.deepEqual(contract.complete_requires_all, [
    'SNAPSHOT_ID_VERIFIED',
    'EVIDENCE_PACKAGE_VERIFIED',
    'ASSESSMENT_CONTRACT_VALIDATION_PASSED',
    'REGISTRY_TRACEABILITY_COMPLETED',
  ]);
});
