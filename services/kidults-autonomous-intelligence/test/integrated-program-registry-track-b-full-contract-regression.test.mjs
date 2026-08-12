import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const SCRIPT = path.join(SERVICE_ROOT, 'scripts', 'kidults-integrated-program-registry-gate.mjs');
const LIVE_COORDINATION_ROOT = path.join(REPO_ROOT, 'coordination', 'kidults');

function fixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-full-contract-'));
  fs.cpSync(LIVE_COORDINATION_ROOT, tempRoot, { recursive: true });
  return tempRoot;
}

function mutateTrackB(tempRoot, mutate) {
  const trackPath = path.join(tempRoot, 'registry', 'track-registry.json');
  const tracks = JSON.parse(fs.readFileSync(trackPath, 'utf8'));
  const trackB = tracks.tracks.find((row) => row.track_id === 'B');
  mutate(trackB);
  fs.writeFileSync(trackPath, JSON.stringify(tracks, null, 2));
}

function run(tempRoot) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-full-contract-output-'));
  const output = path.join(outputDir, 'report.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: SERVICE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_COORDINATION_ROOT: tempRoot,
      KIDULTS_INTEGRATED_PROGRAM_GATE_OUTPUT: output,
    },
  });
  const report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  fs.rmSync(outputDir, { recursive: true, force: true });
  return { result, report };
}

function assertBlocked(result, report, expectedFailures) {
  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  for (const code of expectedFailures) assert.ok(report.failures.includes(code), `missing ${code}`);
  assert.equal(report.track_b_readiness.boundary_validation_passed, false);
  assert.equal(report.track_b_readiness.assessment_permitted, false);
  assert.equal(report.claims.track_b_final_locked_v1_3_verified, false);
  assert.equal(report.claims.track_b_assessment_started, false);
}

test('Track B official input and output policies are fail-closed against boundary drift', () => {
  const tempRoot = fixture();
  mutateTrackB(tempRoot, (trackB) => {
    trackB.input_boundary.non_official_inputs = trackB.input_boundary.non_official_inputs.filter((value) => value !== 'BUSINESS_REQUEST');
    trackB.output_boundary.must_not_generate = trackB.output_boundary.must_not_generate.filter((value) => value !== 'FINAL_RANKING');
  });
  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  assertBlocked(result, report, ['TRACK_B_INPUT_POLICY_INVALID', 'TRACK_B_OUTPUT_POLICY_INVALID']);
});

test('Track B cannot regain mutation authority or soften insufficient-evidence dispositions', () => {
  const tempRoot = fixture();
  mutateTrackB(tempRoot, (trackB) => {
    trackB.assessment_policy.creates_registry = true;
    trackB.assessment_policy.insufficient_evidence_dispositions = ['CONDITIONAL'];
  });
  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  assertBlocked(result, report, ['TRACK_B_MUTATION_AND_EVIDENCE_BOUNDARY_INVALID', 'TRACK_B_INSUFFICIENT_EVIDENCE_POLICY_INVALID']);
});

test('Track B recommendation contract cannot become opinion-only or lose evidence-linked justification', () => {
  const tempRoot = fixture();
  mutateTrackB(tempRoot, (trackB) => {
    trackB.recommendation_policy.opinion_only_recommendation_allowed = true;
    trackB.recommendation_policy.quantitative_justification_fields = ['metric'];
  });
  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  assertBlocked(result, report, ['TRACK_B_RECOMMENDATION_CONTRACT_INVALID']);
});

test('Track B independence and assessment trigger contracts remain isolated from schedule pressure', () => {
  const tempRoot = fixture();
  mutateTrackB(tempRoot, (trackB) => {
    trackB.independence_preservation.must_ignore = trackB.independence_preservation.must_ignore.filter((value) => value !== 'BUSINESS_PRIORITY');
    trackB.assessment_trigger.required_conditions = trackB.assessment_trigger.required_conditions.filter((value) => value !== 'REGISTRY_VALIDATION_PASSED');
  });
  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  assertBlocked(result, report, ['TRACK_B_INDEPENDENCE_CONTRACT_INVALID', 'TRACK_B_ASSESSMENT_TRIGGER_CONTRACT_INVALID']);
});

test('Track B issued-assessment archive immutability and KPMO registry ownership remain locked', () => {
  const tempRoot = fixture();
  mutateTrackB(tempRoot, (trackB) => {
    trackB.archive_policy.modify_issued_assessment_allowed = true;
    trackB.registry_access.governance_owner = 'TRACK_B';
  });
  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  assertBlocked(result, report, ['TRACK_B_ARCHIVE_CONTRACT_INVALID', 'TRACK_B_REGISTRY_ACCESS_INVALID']);
});

test('Track B FINAL LOCKED v1.3 directive and canonical waiting states cannot be expanded in place', () => {
  const tempRoot = fixture();
  mutateTrackB(tempRoot, (trackB) => {
    trackB.directive.future_operating_rule_expansion_allowed = true;
    trackB.official_waiting_states.push('WAITING_FOR_BUSINESS_APPROVAL');
  });
  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  assertBlocked(result, report, ['TRACK_B_DIRECTIVE_CONTRACT_INVALID', 'TRACK_B_WAITING_STATE_CONTRACT_INVALID']);
});
