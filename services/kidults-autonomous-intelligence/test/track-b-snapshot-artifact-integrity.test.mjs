import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SERVICE_ROOT = process.cwd();
const SCRIPT = path.join(SERVICE_ROOT, 'scripts', 'track-b-snapshot-artifact-integrity.mjs');

function fixture({ currentSnapshotId = 'fixture-candidate', artifactText = '{"snapshot_id":"fixture-candidate"}', duplicate = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-snapshot-integrity-'));
  const registryDir = path.join(root, 'registry');
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(path.join(registryDir, 'snapshot-registry.json'), JSON.stringify({
    current_candidate_snapshot_id: currentSnapshotId,
    current_published_snapshot_id: null,
  }, null, 2));

  if (currentSnapshotId) fs.writeFileSync(path.join(root, 'snapshot-candidate.json'), artifactText);
  const baseHandoff = {
    handoff_id: 'snapshot-handoff',
    from_track: 'A',
    to_track: 'B',
    snapshot_id: currentSnapshotId,
    artifact_reference: 'snapshot-candidate.json',
    state: 'accepted',
  };
  fs.writeFileSync(path.join(registryDir, 'handoff-registry.json'), JSON.stringify({
    entries: currentSnapshotId ? [baseHandoff, ...(duplicate ? [{ ...baseHandoff, handoff_id: 'snapshot-handoff-2' }] : [])] : [],
  }, null, 2));
  return root;
}

function run(root) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-snapshot-integrity-output-'));
  const outputPath = path.join(outputDir, 'report.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: SERVICE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_COORDINATION_ROOT: root,
      KIDULTS_TRACK_B_SNAPSHOT_INTEGRITY_OUTPUT: outputPath,
    },
  });
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  fs.rmSync(outputDir, { recursive: true, force: true });
  return { result, report };
}

test('Track B snapshot integrity guard remains waiting when no current snapshot is registered', () => {
  const root = fixture({ currentSnapshotId: null });
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 0);
  assert.equal(report.status, 'WAITING');
  assert.equal(report.reason, 'CURRENT_SNAPSHOT_NOT_REGISTERED');
  assert.equal(report.claims.assessment_generated, false);
});

test('Track B snapshot integrity guard accepts only exact internal snapshot identity', () => {
  const root = fixture();
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 0);
  assert.equal(report.status, 'PASS');
  assert.equal(report.reason, 'SNAPSHOT_ARTIFACT_ID_EXACT_MATCH');
  assert.equal(report.current_snapshot_id, 'fixture-candidate');
  assert.equal(report.artifact_snapshot_id, 'fixture-candidate');
  assert.equal(report.claims.internal_snapshot_id_exact_match_required, true);
});

test('Track B snapshot integrity guard stays waiting when canonical handoff artifact is not materialized', () => {
  const root = fixture();
  fs.rmSync(path.join(root, 'snapshot-candidate.json'));
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 0);
  assert.equal(report.status, 'WAITING');
  assert.equal(report.reason, 'MATERIALIZED_CANONICAL_SNAPSHOT_HANDOFF_NOT_AVAILABLE');
  assert.equal(report.claims.registry_reference_alone_sufficient, false);
});

test('Track B snapshot integrity guard fails closed when materialized snapshot omits internal snapshot id', () => {
  const root = fixture({ artifactText: '{}' });
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'SNAPSHOT_ARTIFACT_ID_MISSING');
  assert.equal(report.artifact_snapshot_id, null);
});

test('Track B snapshot integrity guard fails closed on internal snapshot id mismatch', () => {
  const root = fixture({ artifactText: '{"snapshot_id":"different-candidate"}' });
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'SNAPSHOT_ARTIFACT_ID_MISMATCH');
  assert.equal(report.claims.creates_or_modifies_evidence, false);
  assert.equal(report.claims.production_gate_weakened, false);
});

test('Track B snapshot integrity guard fails closed on invalid JSON', () => {
  const root = fixture({ artifactText: '{invalid-json' });
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'SNAPSHOT_ARTIFACT_JSON_INVALID');
});

test('Track B snapshot integrity guard fails closed on ambiguous accepted snapshot handoffs', () => {
  const root = fixture({ duplicate: true });
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'AMBIGUOUS_CANONICAL_SNAPSHOT_HANDOFF');
});

test('Track B snapshot integrity guard fails closed when canonical registry input disappears', () => {
  const root = fixture();
  fs.rmSync(path.join(root, 'registry', 'snapshot-registry.json'));
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.match(report.reason, /^MISSING_FILE:/);
  assert.equal(report.claims.assessment_generated, false);
});
