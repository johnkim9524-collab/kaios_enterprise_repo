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

function readyFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-fs-failure-'));
  fs.cpSync(LIVE_COORDINATION_ROOT, root, { recursive: true });

  const snapshotRegistryPath = path.join(root, 'registry', 'snapshot-registry.json');
  const snapshots = JSON.parse(fs.readFileSync(snapshotRegistryPath, 'utf8'));
  snapshots.current_candidate_snapshot_id = 'fixture-candidate';
  snapshots.entries = [{ snapshot_id: 'fixture-candidate', status: 'draft' }];
  fs.writeFileSync(snapshotRegistryPath, JSON.stringify(snapshots, null, 2));

  fs.writeFileSync(path.join(root, 'snapshot-candidate.json'), JSON.stringify({ snapshot_id: 'fixture-candidate' }));
  fs.writeFileSync(path.join(root, 'EVIDENCE_PACKAGE'), '{}');

  const handoffPath = path.join(root, 'registry', 'handoff-registry.json');
  const handoffs = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  handoffs.entries = [
    canonicalHandoff({ handoff_id: 'snapshot-handoff' }),
    canonicalHandoff({ handoff_id: 'evidence-handoff', artifact_reference: 'EVIDENCE_PACKAGE' }),
  ];
  fs.writeFileSync(handoffPath, JSON.stringify(handoffs, null, 2));
  return root;
}

test('Track B fails closed when official-input realpath resolution fails after the reference is materialized', () => {
  const coordinationRoot = readyFixture();
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-fs-preload-'));
  const preloadPath = path.join(runtimeDir, 'preload.cjs');
  const outputPath = path.join(runtimeDir, 'report.json');

  fs.writeFileSync(preloadPath, `
const fs = require('node:fs');
const originalRealpathSync = fs.realpathSync;
fs.realpathSync = function patchedRealpathSync(value, ...rest) {
  const match = process.env.KIDULTS_TEST_REALPATH_THROW_MATCH;
  if (match && String(value).endsWith(match)) {
    const error = new Error('forced-realpath-failure');
    error.code = 'EACCES';
    throw error;
  }
  return originalRealpathSync.call(this, value, ...rest);
};
`);

  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: SERVICE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${preloadPath}`.trim(),
      KIDULTS_TEST_REALPATH_THROW_MATCH: 'snapshot-candidate.json',
      KIDULTS_COORDINATION_ROOT: coordinationRoot,
      KIDULTS_INTEGRATED_PROGRAM_GATE_OUTPUT: outputPath,
    },
  });
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  fs.rmSync(coordinationRoot, { recursive: true, force: true });
  fs.rmSync(runtimeDir, { recursive: true, force: true });

  assert.equal(result.status, 0);
  assert.equal(report.status, 'PASS_BOOTSTRAPPING');
  assert.equal(report.track_b_readiness.assessment_permitted, false);
  assert.equal(report.track_b_readiness.waiting_state, 'WAITING_FOR_SNAPSHOT');
  assert.equal(report.track_b_readiness.reason, 'SNAPSHOT_CANDIDATE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF');
  assert.equal(report.track_b_readiness.canonical_handoff_proof.snapshot_candidate_handoff_id, null);
  assert.equal(report.track_b_readiness.canonical_handoff_proof.evidence_package_handoff_id, 'evidence-handoff');
  assert.equal(report.track_b_readiness.canonical_handoff_proof.materialized_official_inputs_required, true);
  assert.equal(report.claims.track_b_assessment_started, false);
});
