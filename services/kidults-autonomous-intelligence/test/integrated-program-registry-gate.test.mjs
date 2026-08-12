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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-program-gate-'));
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

test('current integrated program registry bootstraps safely without inventing snapshot or production readiness', () => {
  const { result, report } = run(LIVE_COORDINATION_ROOT);
  assert.equal(result.status, 0);
  assert.equal(report.status, 'PASS_BOOTSTRAPPING');
  assert.equal(report.required_registry_count, 14);
  assert.equal(report.loaded_registry_count, 14);
  assert.equal(report.current_snapshot_id, null);
  assert.equal(report.claims.production_ready, false);
  assert.equal(report.claims.snapshot_id_inferred_or_synthesized, false);
  assert.equal(report.claims.provider_procured, false);
});

test('Track B remains waiting for both official inputs and never starts an assessment from registry state alone', () => {
  const { result, report } = run(LIVE_COORDINATION_ROOT);
  assert.equal(result.status, 0);
  assert.equal(report.track_b_readiness.operating_rules_status, 'FINAL_LOCKED_V1_3');
  assert.deepEqual(report.track_b_readiness.official_inputs, ['snapshot-candidate.json', 'EVIDENCE_PACKAGE']);
  assert.equal(report.track_b_readiness.official_output, 'rankability-assessment.json');
  assert.equal(report.track_b_readiness.boundary_validation_passed, true);
  assert.equal(report.track_b_readiness.assessment_permitted, false);
  assert.equal(report.track_b_readiness.waiting_state, 'WAITING_FOR_SNAPSHOT');
  assert.equal(report.track_b_readiness.reason, 'OFFICIAL_SNAPSHOT_CANDIDATE_NOT_REGISTERED');
  assert.equal(report.track_b_readiness.creates_or_modifies_evidence, false);
  assert.equal(report.track_b_readiness.registry_access_mode, 'READ_ONLY');
  assert.equal(report.claims.track_b_assessment_started, false);
});

test('missing registry root fails closed and still emits a diagnostic report', () => {
  const missingRoot = path.join(os.tmpdir(), `kidults-missing-${process.pid}-${Date.now()}`);
  const { result, report } = run(missingRoot);
  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.loaded_registry_count, 0);
  assert.match(report.failures[0], /^MISSING_FILE:/);
  assert.equal(report.track_b_readiness.assessment_permitted, false);
});

test('registered snapshot without proven Evidence Package keeps Track B in WAITING_FOR_EVIDENCE', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-readiness-'));
  fs.cpSync(LIVE_COORDINATION_ROOT, tempRoot, { recursive: true });

  const snapshotPath = path.join(tempRoot, 'registry', 'snapshot-registry.json');
  const snapshots = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  snapshots.current_candidate_snapshot_id = 'fixture-candidate';
  snapshots.entries = [{ snapshot_id: 'fixture-candidate', status: 'draft' }];
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshots, null, 2));

  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  assert.equal(result.status, 0);
  assert.equal(report.status, 'PASS_BOOTSTRAPPING');
  assert.equal(report.current_snapshot_id, 'fixture-candidate');
  assert.equal(report.track_b_readiness.assessment_permitted, false);
  assert.equal(report.track_b_readiness.waiting_state, 'WAITING_FOR_EVIDENCE');
  assert.equal(report.track_b_readiness.reason, 'EVIDENCE_PACKAGE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF');
  assert.equal(report.claims.track_b_assessment_started, false);
});

test('registered snapshot iteration is accepted while an unapproved production release still fails closed', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-program-copy-'));
  fs.cpSync(LIVE_COORDINATION_ROOT, tempRoot, { recursive: true });

  const snapshotPath = path.join(tempRoot, 'registry', 'snapshot-registry.json');
  const snapshots = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  snapshots.current_candidate_snapshot_id = 'fixture-candidate';
  snapshots.entries = [{ snapshot_id: 'fixture-candidate', status: 'draft' }];
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshots, null, 2));

  const releasePath = path.join(tempRoot, 'registry', 'release-registry.json');
  const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
  release.current_production_release_id = 'unsafe-unapproved-release';
  fs.writeFileSync(releasePath, JSON.stringify(release, null, 2));

  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.current_snapshot_id, 'fixture-candidate');
  assert.ok(report.failures.includes('UNAPPROVED_PRODUCTION_RELEASE_PRESENT'));
  assert.equal(report.failures.includes('CURRENT_SNAPSHOT_NOT_REGISTERED'), false);
  assert.equal(report.track_b_readiness.assessment_permitted, false);
  assert.equal(report.claims.production_ready, false);
});
