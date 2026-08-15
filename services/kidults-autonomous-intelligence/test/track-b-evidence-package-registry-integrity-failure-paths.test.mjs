import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const SCRIPT = path.join(SERVICE_ROOT, 'scripts', 'track-b-evidence-package-registry-integrity.mjs');
const LIVE_COORDINATION_ROOT = path.join(REPO_ROOT, 'coordination', 'kidults');

function run(coordinationRoot) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-evidence-failure-output-'));
  const output = path.join(outputRoot, 'report.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: SERVICE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_COORDINATION_ROOT: coordinationRoot,
      KIDULTS_TRACK_B_EVIDENCE_INTEGRITY_OUTPUT: output,
    },
  });
  const report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  fs.rmSync(outputRoot, { recursive: true, force: true });
  return { result, report };
}

function fixture({ includeHandoff = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-evidence-failure-'));
  fs.cpSync(LIVE_COORDINATION_ROOT, root, { recursive: true });

  const snapshotRegistryPath = path.join(root, 'registry', 'snapshot-registry.json');
  const snapshots = JSON.parse(fs.readFileSync(snapshotRegistryPath, 'utf8'));
  snapshots.current_candidate_snapshot_id = 'fixture-candidate';
  snapshots.entries = [{ snapshot_id: 'fixture-candidate', status: 'draft' }];
  fs.writeFileSync(snapshotRegistryPath, JSON.stringify(snapshots, null, 2));

  if (includeHandoff) {
    const evidenceArtifact = path.join(root, 'evidence', 'fixture-candidate', 'EVIDENCE_PACKAGE');
    fs.mkdirSync(path.dirname(evidenceArtifact), { recursive: true });
    fs.writeFileSync(evidenceArtifact, '{}');

    const handoffPath = path.join(root, 'registry', 'handoff-registry.json');
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
    handoffs.entries = [{
      handoff_id: 'fixture-evidence-handoff',
      from_track: 'A',
      to_track: 'B',
      snapshot_id: 'fixture-candidate',
      artifact_reference: 'evidence/fixture-candidate/EVIDENCE_PACKAGE',
      artifact_version: '1.0.0',
      requested_action: 'VALIDATE',
      deadline: null,
      known_limitations: [],
      acceptance_criteria: [],
      state: 'accepted',
    }];
    fs.writeFileSync(handoffPath, JSON.stringify(handoffs, null, 2));
  }

  return root;
}

function writeEvidenceIndex(root, currentId, records = [currentId]) {
  const indexPath = path.join(root, 'registry', 'evidence', 'index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  index.status = 'ACTIVE';
  index.current_evidence_package_id = currentId;
  index.record_count = records.length;
  index.records = records;
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

function writeEvidenceRecord(root, id, body) {
  const recordPath = path.join(root, 'registry', 'evidence', 'records', `${id}.json`);
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, body);
  return recordPath;
}

test('registered snapshot without a canonical materialized Evidence Package handoff remains waiting', () => {
  const root = fixture({ includeHandoff: false });
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 0);
  assert.equal(report.status, 'WAITING');
  assert.equal(report.reason, 'MATERIALIZED_CANONICAL_EVIDENCE_HANDOFF_NOT_AVAILABLE');
  assert.equal(report.current_snapshot_id, 'fixture-candidate');
});

test('Evidence Package immutable record identity mismatch fails closed', () => {
  const root = fixture();
  writeEvidenceIndex(root, 'fixture-evidence-package');
  writeEvidenceRecord(root, 'fixture-evidence-package', JSON.stringify({
    id: 'different-evidence-package',
    snapshot_id: 'fixture-candidate',
  }));

  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'EVIDENCE_PACKAGE_RECORD_ID_MISMATCH');
});

test('Evidence Package immutable record without snapshot identity fails closed', () => {
  const root = fixture();
  writeEvidenceIndex(root, 'fixture-evidence-package');
  writeEvidenceRecord(root, 'fixture-evidence-package', JSON.stringify({
    id: 'fixture-evidence-package',
  }));

  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'EVIDENCE_PACKAGE_SNAPSHOT_ID_MISSING');
});

test('malformed immutable Evidence Package registry record fails closed', () => {
  const root = fixture();
  writeEvidenceIndex(root, 'fixture-evidence-package');
  writeEvidenceRecord(root, 'fixture-evidence-package', '{not-json');

  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'EVIDENCE_PACKAGE_REGISTRY_RECORD_JSON_INVALID');
});

test('missing immutable Evidence Package registry record fails closed with the missing-file reason', () => {
  const root = fixture();
  writeEvidenceIndex(root, 'fixture-evidence-package');

  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.match(report.reason, /^MISSING_FILE:/);
});

test('malformed Evidence Registry index fails closed before any Track B readiness claim', () => {
  const root = fixture();
  const indexPath = path.join(root, 'registry', 'evidence', 'index.json');
  fs.writeFileSync(indexPath, '{not-json');

  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'EVIDENCE_PACKAGE_REGISTRY_INDEX_JSON_INVALID');
  assert.equal(report.claims.assessment_generated, false);
});

test('missing Evidence Registry index fails closed before any Track B readiness claim', () => {
  const root = fixture();
  const indexPath = path.join(root, 'registry', 'evidence', 'index.json');
  fs.rmSync(indexPath, { force: true });

  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.match(report.reason, /^MISSING_FILE:/);
  assert.equal(report.claims.creates_or_modifies_evidence, false);
});
