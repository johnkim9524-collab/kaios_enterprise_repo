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
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-evidence-integrity-output-'));
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

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-track-b-evidence-integrity-'));
  fs.cpSync(LIVE_COORDINATION_ROOT, root, { recursive: true });

  const snapshotRegistryPath = path.join(root, 'registry', 'snapshot-registry.json');
  const snapshots = JSON.parse(fs.readFileSync(snapshotRegistryPath, 'utf8'));
  snapshots.current_candidate_snapshot_id = 'fixture-candidate';
  snapshots.entries = [{ snapshot_id: 'fixture-candidate', status: 'draft' }];
  fs.writeFileSync(snapshotRegistryPath, JSON.stringify(snapshots, null, 2));

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

  return root;
}

function registerEvidence(root, { snapshotId = 'fixture-candidate', recordId = 'fixture-evidence-package' } = {}) {
  const indexPath = path.join(root, 'registry', 'evidence', 'index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  index.status = 'ACTIVE';
  index.current_evidence_package_id = recordId;
  index.record_count = 1;
  index.records = [recordId];
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  const recordPath = path.join(root, 'registry', 'evidence', 'records', `${recordId}.json`);
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, JSON.stringify({
    id: recordId,
    evidence_package_id: recordId,
    snapshot_id: snapshotId,
    record_type: 'evidence_package',
  }, null, 2));
}

test('live Track B evidence integrity remains waiting without inventing an Evidence Package', () => {
  const { result, report } = run(LIVE_COORDINATION_ROOT);
  assert.equal(result.status, 0);
  assert.equal(report.status, 'WAITING');
  assert.equal(report.reason, 'CURRENT_SNAPSHOT_NOT_REGISTERED');
  assert.equal(report.current_snapshot_id, null);
  assert.equal(report.claims.creates_or_modifies_evidence, false);
  assert.equal(report.claims.evidence_registry_registration_required, true);
});

test('materialized Evidence Package handoff cannot unlock registry traceability without a canonical evidence pointer', () => {
  const root = fixture();
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'EVIDENCE_PACKAGE_REGISTRY_POINTER_MISSING');
  assert.equal(report.canonical_evidence_handoff_id, 'fixture-evidence-handoff');
  assert.equal(report.claims.registry_reference_alone_sufficient, false);
});

test('Evidence Package passes only when canonical registry record binds to the exact snapshot', () => {
  const root = fixture();
  registerEvidence(root);
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 0);
  assert.equal(report.status, 'PASS');
  assert.equal(report.reason, 'EVIDENCE_PACKAGE_REGISTRY_TRACEABILITY_EXACT_MATCH');
  assert.equal(report.current_evidence_package_id, 'fixture-evidence-package');
  assert.equal(report.evidence_record_snapshot_id, 'fixture-candidate');
});

test('Evidence Package registry record for a different snapshot fails closed', () => {
  const root = fixture();
  registerEvidence(root, { snapshotId: 'different-candidate' });
  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'EVIDENCE_PACKAGE_SNAPSHOT_ID_MISMATCH');
  assert.equal(report.evidence_record_snapshot_id, 'different-candidate');
});

test('Evidence Package pointer without an indexed immutable record fails closed', () => {
  const root = fixture();
  const indexPath = path.join(root, 'registry', 'evidence', 'index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  index.current_evidence_package_id = 'unindexed-package';
  index.records = [];
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'EVIDENCE_PACKAGE_NOT_INDEXED');
});

test('duplicate accepted Evidence Package handoffs fail closed as ambiguous', () => {
  const root = fixture();
  registerEvidence(root);
  const handoffPath = path.join(root, 'registry', 'handoff-registry.json');
  const handoffs = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  handoffs.entries.push({ ...handoffs.entries[0], handoff_id: 'fixture-evidence-handoff-2' });
  fs.writeFileSync(handoffPath, JSON.stringify(handoffs, null, 2));

  const { result, report } = run(root);
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.reason, 'AMBIGUOUS_CANONICAL_EVIDENCE_HANDOFF');
});
