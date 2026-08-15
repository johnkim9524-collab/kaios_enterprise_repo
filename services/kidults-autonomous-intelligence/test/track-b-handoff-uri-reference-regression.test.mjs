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

function runWithReferences(snapshotReference, evidenceReference) {
  const coordinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-handoff-uri-'));
  fs.cpSync(LIVE_COORDINATION_ROOT, coordinationRoot, { recursive: true });

  const snapshotPath = path.join(coordinationRoot, 'registry', 'snapshot-registry.json');
  const snapshots = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  snapshots.current_candidate_snapshot_id = 'fixture-candidate';
  snapshots.entries = [{ snapshot_id: 'fixture-candidate', status: 'draft' }];
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshots, null, 2));

  const handoffPath = path.join(coordinationRoot, 'registry', 'handoff-registry.json');
  const handoffs = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  handoffs.entries = [
    canonicalHandoff({
      handoff_id: 'fixture-snapshot-handoff',
      artifact_reference: snapshotReference,
    }),
    canonicalHandoff({
      handoff_id: 'fixture-evidence-handoff',
      artifact_reference: evidenceReference,
    }),
  ];
  fs.writeFileSync(handoffPath, JSON.stringify(handoffs, null, 2));

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-handoff-uri-report-'));
  const outputPath = path.join(outputDir, 'report.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: SERVICE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_COORDINATION_ROOT: coordinationRoot,
      KIDULTS_INTEGRATED_PROGRAM_GATE_OUTPUT: outputPath,
    },
  });
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  fs.rmSync(coordinationRoot, { recursive: true, force: true });
  fs.rmSync(outputDir, { recursive: true, force: true });
  return { result, report };
}

const CANONICAL_SNAPSHOT = 'snapshots/fixture-candidate/snapshot-candidate.json';
const CANONICAL_EVIDENCE = 'evidence/fixture-candidate/EVIDENCE_PACKAGE';

test('Track B rejects URL-shaped official-input references fail closed', () => {
  const cases = [
    {
      snapshot: 'https://example.invalid/snapshot-candidate.json',
      evidence: CANONICAL_EVIDENCE,
      waitingState: 'WAITING_FOR_SNAPSHOT',
      reason: 'SNAPSHOT_CANDIDATE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
    {
      snapshot: CANONICAL_SNAPSHOT,
      evidence: 'https://example.invalid/EVIDENCE_PACKAGE',
      waitingState: 'WAITING_FOR_EVIDENCE',
      reason: 'EVIDENCE_PACKAGE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
  ];

  for (const entry of cases) {
    const { result, report } = runWithReferences(entry.snapshot, entry.evidence);
    assert.equal(result.status, 0, `${entry.snapshot} :: ${entry.evidence}`);
    assert.equal(report.status, 'PASS_BOOTSTRAPPING');
    assert.equal(report.track_b_readiness.assessment_permitted, false);
    assert.equal(report.track_b_readiness.waiting_state, entry.waitingState);
    assert.equal(report.track_b_readiness.reason, entry.reason);
    assert.equal(report.claims.track_b_assessment_started, false);
  }
});

test('Track B rejects query and fragment decorated official-input references fail closed', () => {
  const cases = [
    {
      snapshot: `${CANONICAL_SNAPSHOT}?download=1`,
      evidence: CANONICAL_EVIDENCE,
      waitingState: 'WAITING_FOR_SNAPSHOT',
      reason: 'SNAPSHOT_CANDIDATE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
    {
      snapshot: CANONICAL_SNAPSHOT,
      evidence: `${CANONICAL_EVIDENCE}#manifest`,
      waitingState: 'WAITING_FOR_EVIDENCE',
      reason: 'EVIDENCE_PACKAGE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
  ];

  for (const entry of cases) {
    const { result, report } = runWithReferences(entry.snapshot, entry.evidence);
    assert.equal(result.status, 0, `${entry.snapshot} :: ${entry.evidence}`);
    assert.equal(report.status, 'PASS_BOOTSTRAPPING');
    assert.equal(report.track_b_readiness.assessment_permitted, false);
    assert.equal(report.track_b_readiness.waiting_state, entry.waitingState);
    assert.equal(report.track_b_readiness.reason, entry.reason);
    assert.equal(report.claims.track_b_assessment_started, false);
  }
});

test('Track B rejects percent-encoded official-input leaf aliases fail closed', () => {
  const cases = [
    {
      snapshot: 'snapshots/fixture-candidate/%73napshot-candidate.json',
      evidence: CANONICAL_EVIDENCE,
      waitingState: 'WAITING_FOR_SNAPSHOT',
      reason: 'SNAPSHOT_CANDIDATE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
    {
      snapshot: CANONICAL_SNAPSHOT,
      evidence: 'evidence/fixture-candidate/EVIDENCE%5FPACKAGE',
      waitingState: 'WAITING_FOR_EVIDENCE',
      reason: 'EVIDENCE_PACKAGE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
  ];

  for (const entry of cases) {
    const { result, report } = runWithReferences(entry.snapshot, entry.evidence);
    assert.equal(result.status, 0, `${entry.snapshot} :: ${entry.evidence}`);
    assert.equal(report.status, 'PASS_BOOTSTRAPPING');
    assert.equal(report.track_b_readiness.assessment_permitted, false);
    assert.equal(report.track_b_readiness.waiting_state, entry.waitingState);
    assert.equal(report.track_b_readiness.reason, entry.reason);
    assert.equal(report.claims.track_b_assessment_started, false);
  }
});

test('Track B accepts only plain repository-relative official-input references', () => {
  const cases = [
    {
      snapshot: 'snapshots\\fixture-candidate\\snapshot-candidate.json',
      evidence: CANONICAL_EVIDENCE,
      waitingState: 'WAITING_FOR_SNAPSHOT',
      reason: 'SNAPSHOT_CANDIDATE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
    {
      snapshot: 'file:/snapshots/fixture-candidate/snapshot-candidate.json',
      evidence: CANONICAL_EVIDENCE,
      waitingState: 'WAITING_FOR_SNAPSHOT',
      reason: 'SNAPSHOT_CANDIDATE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
    {
      snapshot: 'C:/snapshots/fixture-candidate/snapshot-candidate.json',
      evidence: CANONICAL_EVIDENCE,
      waitingState: 'WAITING_FOR_SNAPSHOT',
      reason: 'SNAPSHOT_CANDIDATE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
    {
      snapshot: 'snapshots/%2e%2e/fixture-candidate/snapshot-candidate.json',
      evidence: CANONICAL_EVIDENCE,
      waitingState: 'WAITING_FOR_SNAPSHOT',
      reason: 'SNAPSHOT_CANDIDATE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
    {
      snapshot: CANONICAL_SNAPSHOT,
      evidence: ' evidence/fixture-candidate/EVIDENCE_PACKAGE',
      waitingState: 'WAITING_FOR_EVIDENCE',
      reason: 'EVIDENCE_PACKAGE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF',
    },
  ];

  for (const entry of cases) {
    const { result, report } = runWithReferences(entry.snapshot, entry.evidence);
    assert.equal(result.status, 0, `${entry.snapshot} :: ${entry.evidence}`);
    assert.equal(report.status, 'PASS_BOOTSTRAPPING');
    assert.equal(report.track_b_readiness.assessment_permitted, false);
    assert.equal(report.track_b_readiness.waiting_state, entry.waitingState);
    assert.equal(report.track_b_readiness.reason, entry.reason);
    assert.equal(report.track_b_readiness.canonical_handoff_proof.plain_repository_relative_artifact_references_required, true);
    assert.equal(report.claims.track_b_assessment_started, false);
  }
});

test('canonical repository-relative Track B references remain assessment-eligible', () => {
  const { result, report } = runWithReferences(CANONICAL_SNAPSHOT, CANONICAL_EVIDENCE);

  assert.equal(result.status, 0);
  assert.equal(report.status, 'PASS_BOOTSTRAPPING');
  assert.equal(report.track_b_readiness.assessment_permitted, true);
  assert.equal(report.track_b_readiness.waiting_state, 'READY_FOR_ASSESSMENT');
  assert.equal(report.track_b_readiness.reason, 'BOTH_OFFICIAL_INPUTS_ACCEPTED_FOR_EXACT_SNAPSHOT');
  assert.equal(report.track_b_readiness.canonical_handoff_proof.plain_repository_relative_artifact_references_required, true);
  assert.equal(report.claims.track_b_assessment_started, false);
  assert.equal(report.claims.operational_runtime_evidence_used_as_track_b_official_input, false);
});
