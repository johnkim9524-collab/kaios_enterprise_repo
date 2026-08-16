import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeTrackBAssessmentReadiness } from '../scripts/lib/track-b-assessment-readiness.mjs';

function integrated({ snapshotId = null, permitted = false, status = 'PASS_BOOTSTRAPPING', waitingState = 'WAITING_FOR_SNAPSHOT', reason = 'OFFICIAL_SNAPSHOT_CANDIDATE_NOT_REGISTERED' } = {}) {
  return {
    status,
    current_snapshot_id: snapshotId,
    track_b_readiness: {
      assessment_permitted: permitted,
      waiting_state: waitingState,
      reason,
    },
  };
}

function guard(status = 'WAITING', snapshotId = null) {
  return { status, current_snapshot_id: snapshotId };
}

test('keeps Track B waiting when no current snapshot is registered', () => {
  assert.deepEqual(
    synthesizeTrackBAssessmentReadiness({ integrated: integrated(), snapshot: guard(), evidence: guard() }),
    {
      status: 'WAITING',
      waiting_state: 'WAITING_FOR_SNAPSHOT',
      reason: 'CURRENT_SNAPSHOT_NOT_REGISTERED',
      current_snapshot_id: null,
      assessment_permitted: false,
    },
  );
});

test('permits assessment only when integrated, snapshot and evidence proofs all agree', () => {
  const result = synthesizeTrackBAssessmentReadiness({
    integrated: integrated({ snapshotId: 'snapshot-001', permitted: true, waitingState: 'READY_FOR_ASSESSMENT', reason: 'BOTH_OFFICIAL_INPUTS_ACCEPTED_FOR_EXACT_SNAPSHOT' }),
    snapshot: guard('PASS', 'snapshot-001'),
    evidence: guard('PASS', 'snapshot-001'),
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.assessment_permitted, true);
  assert.equal(result.reason, 'ALL_TRACK_B_OFFICIAL_INPUT_PROOFS_EXACT_MATCH');
});

test('fails closed when integrated gate grants permission without a current snapshot', () => {
  const result = synthesizeTrackBAssessmentReadiness({ integrated: integrated({ permitted: true }), snapshot: guard(), evidence: guard() });
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.reason, 'ASSESSMENT_PERMISSION_WITHOUT_CURRENT_SNAPSHOT');
});

test('fails closed when a guard carries a snapshot while integrated registry has none', () => {
  const result = synthesizeTrackBAssessmentReadiness({ integrated: integrated(), snapshot: guard('WAITING', 'ghost'), evidence: guard() });
  assert.equal(result.reason, 'GUARD_SNAPSHOT_ID_PRESENT_WITHOUT_CURRENT_SNAPSHOT');
});

test('fails closed when guard state is not waiting without a current snapshot', () => {
  const result = synthesizeTrackBAssessmentReadiness({ integrated: integrated(), snapshot: guard('PASS'), evidence: guard() });
  assert.equal(result.reason, 'GUARD_STATE_NOT_WAITING_WITHOUT_CURRENT_SNAPSHOT');
});

test('fails closed on any upstream integrity failure', () => {
  const result = synthesizeTrackBAssessmentReadiness({
    integrated: integrated({ snapshotId: 'snapshot-001', permitted: true }),
    snapshot: guard('FAIL_CLOSED', 'snapshot-001'),
    evidence: guard('PASS', 'snapshot-001'),
  });
  assert.equal(result.reason, 'UPSTREAM_TRACK_B_READINESS_PROOF_FAILED');
});

test('fails closed on invalid integrated or guard statuses', () => {
  assert.equal(
    synthesizeTrackBAssessmentReadiness({ integrated: integrated({ status: 'UNKNOWN' }), snapshot: guard(), evidence: guard() }).reason,
    'INTEGRATED_PROGRAM_GATE_STATUS_INVALID',
  );
  assert.equal(
    synthesizeTrackBAssessmentReadiness({ integrated: integrated(), snapshot: guard('UNKNOWN'), evidence: guard() }).reason,
    'SNAPSHOT_INTEGRITY_STATUS_INVALID',
  );
  assert.equal(
    synthesizeTrackBAssessmentReadiness({ integrated: integrated(), snapshot: guard(), evidence: guard('UNKNOWN') }).reason,
    'EVIDENCE_INTEGRITY_STATUS_INVALID',
  );
});

test('fails closed when proof snapshot identities do not match', () => {
  const result = synthesizeTrackBAssessmentReadiness({
    integrated: integrated({ snapshotId: 'snapshot-001', permitted: true }),
    snapshot: guard('PASS', 'snapshot-001'),
    evidence: guard('PASS', 'snapshot-002'),
  });
  assert.equal(result.reason, 'TRACK_B_READINESS_SNAPSHOT_ID_MISMATCH');
});

test('preserves integrated waiting state when official input handoff is incomplete', () => {
  const result = synthesizeTrackBAssessmentReadiness({
    integrated: integrated({ snapshotId: 'snapshot-001', permitted: false, waitingState: 'WAITING_FOR_EVIDENCE', reason: 'EVIDENCE_PACKAGE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF' }),
    snapshot: guard('PASS', 'snapshot-001'),
    evidence: guard('WAITING', 'snapshot-001'),
  });
  assert.equal(result.status, 'WAITING');
  assert.equal(result.waiting_state, 'WAITING_FOR_EVIDENCE');
  assert.equal(result.assessment_permitted, false);
});

test('fails closed when integrated permission is not backed by complete identity proofs', () => {
  const result = synthesizeTrackBAssessmentReadiness({
    integrated: integrated({ snapshotId: 'snapshot-001', permitted: true }),
    snapshot: guard('PASS', 'snapshot-001'),
    evidence: guard('WAITING', 'snapshot-001'),
  });
  assert.equal(result.reason, 'INTEGRATED_PERMISSION_WITHOUT_COMPLETE_IDENTITY_PROOFS');
});

test('fails closed when required diagnostic objects are missing', () => {
  assert.equal(synthesizeTrackBAssessmentReadiness({ integrated: null, snapshot: guard(), evidence: guard() }).reason, 'INTEGRATED_PROGRAM_GATE_DIAGNOSTIC_MISSING');
  assert.equal(synthesizeTrackBAssessmentReadiness({ integrated: integrated({ snapshotId: 'snapshot-001' }), snapshot: null, evidence: guard() }).reason, 'SNAPSHOT_INTEGRITY_DIAGNOSTIC_MISSING');
  assert.equal(synthesizeTrackBAssessmentReadiness({ integrated: integrated({ snapshotId: 'snapshot-001' }), snapshot: guard(), evidence: null }).reason, 'EVIDENCE_INTEGRITY_DIAGNOSTIC_MISSING');
});
