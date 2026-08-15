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

function run(coordinationRoot) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-isolation-run-'));
  const output = path.join(dir, 'report.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: SERVICE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_COORDINATION_ROOT: coordinationRoot,
      KIDULTS_INTEGRATED_PROGRAM_GATE_OUTPUT: output,
    },
  });
  const report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

function canonicalHandoff(overrides = {}) {
  return {
    handoff_id: 'fixture-handoff',
    from_track: 'A',
    to_track: 'B',
    snapshot_id: 'fixture-candidate',
    artifact_reference: 'snapshot-candidate.json',
    artifact_version: '1.0.0',
    requested_action: 'VALIDATE',
    deadline: null,
    known_limitations: [],
    acceptance_criteria: [],
    state: 'accepted',
    ...overrides,
  };
}

function materializeOfficialInputs(tempRoot) {
  fs.writeFileSync(
    path.join(tempRoot, 'snapshot-candidate.json'),
    JSON.stringify({ snapshot_id: 'fixture-candidate' }),
  );
  fs.writeFileSync(path.join(tempRoot, 'EVIDENCE_PACKAGE'), '{}');
}

function fixtureReadyForAssessment() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-isolation-fixture-'));
  fs.cpSync(LIVE_COORDINATION_ROOT, tempRoot, { recursive: true });

  const snapshotPath = path.join(tempRoot, 'registry', 'snapshot-registry.json');
  const snapshots = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  snapshots.current_candidate_snapshot_id = 'fixture-candidate';
  snapshots.entries = [{ snapshot_id: 'fixture-candidate', status: 'draft' }];
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshots, null, 2));
  materializeOfficialInputs(tempRoot);

  const handoffPath = path.join(tempRoot, 'registry', 'handoff-registry.json');
  const handoffs = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  handoffs.entries = [
    canonicalHandoff({ handoff_id: 'fixture-snapshot-handoff' }),
    canonicalHandoff({ handoff_id: 'fixture-evidence-handoff', artifact_reference: 'EVIDENCE_PACKAGE' }),
  ];
  fs.writeFileSync(handoffPath, JSON.stringify(handoffs, null, 2));

  return tempRoot;
}

function mutateTrackB(tempRoot, mutate) {
  const trackPath = path.join(tempRoot, 'registry', 'track-registry.json');
  const tracks = JSON.parse(fs.readFileSync(trackPath, 'utf8'));
  const trackB = tracks.tracks.find((row) => row.track_id === 'B');
  mutate(trackB);
  fs.writeFileSync(trackPath, JSON.stringify(tracks, null, 2));
}

test('Track B snapshot isolation tampering blocks otherwise complete official-input handoffs', () => {
  const tempRoot = fixtureReadyForAssessment();
  mutateTrackB(tempRoot, (trackB) => {
    trackB.snapshot_isolation.combined_snapshot_assessment_allowed = true;
  });

  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.ok(report.failures.includes('TRACK_B_SNAPSHOT_ISOLATION_INVALID'));
  assert.equal(report.track_b_readiness.boundary_validation_passed, false);
  assert.equal(report.track_b_readiness.assessment_permitted, false);
  assert.equal(report.track_b_readiness.waiting_state, 'WAITING_FOR_VALIDATION');
  assert.equal(report.track_b_readiness.reason, 'INTEGRATED_PROGRAM_GATE_NOT_CLEAN');
});

test('Track B reproducibility tampering blocks assessment without creating provisional output', () => {
  const tempRoot = fixtureReadyForAssessment();
  mutateTrackB(tempRoot, (trackB) => {
    trackB.assessment_policy.reproducibility.same_snapshot_and_same_evidence_must_produce_same_assessment = false;
  });

  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.ok(report.failures.includes('TRACK_B_REPRODUCIBILITY_CONTRACT_INVALID'));
  assert.equal(report.track_b_readiness.assessment_permitted, false);
  assert.equal(report.claims.track_b_assessment_started, false);
  assert.equal(report.claims.track_b_final_locked_v1_3_verified, false);
});

test('Track B traceability contract tampering blocks assessment before rankability output can be generated', () => {
  const tempRoot = fixtureReadyForAssessment();
  mutateTrackB(tempRoot, (trackB) => {
    trackB.assessment_policy.required_traceability_fields = trackB.assessment_policy.required_traceability_fields.filter((field) => field !== 'evidence_lineage_version');
  });

  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.ok(report.failures.includes('TRACK_B_TRACEABILITY_CONTRACT_INVALID'));
  assert.equal(report.track_b_readiness.assessment_permitted, false);
  assert.equal(report.track_b_readiness.waiting_state, 'WAITING_FOR_VALIDATION');
  assert.equal(report.claims.track_b_assessment_started, false);
});
