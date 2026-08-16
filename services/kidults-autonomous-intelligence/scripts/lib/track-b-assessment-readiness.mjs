const VALID_GUARD_STATES = new Set(['PASS', 'WAITING', 'FAIL_CLOSED']);

function fail(reason, currentSnapshotId = null) {
  return {
    status: 'FAIL_CLOSED',
    waiting_state: 'WAITING_FOR_VALIDATION',
    reason,
    current_snapshot_id: currentSnapshotId,
    assessment_permitted: false,
  };
}

export function synthesizeTrackBAssessmentReadiness({ integrated, snapshot, evidence }) {
  if (!integrated || typeof integrated !== 'object') return fail('INTEGRATED_PROGRAM_GATE_DIAGNOSTIC_MISSING');
  if (!snapshot || typeof snapshot !== 'object') return fail('SNAPSHOT_INTEGRITY_DIAGNOSTIC_MISSING', integrated.current_snapshot_id ?? null);
  if (!evidence || typeof evidence !== 'object') return fail('EVIDENCE_INTEGRITY_DIAGNOSTIC_MISSING', integrated.current_snapshot_id ?? null);

  const currentSnapshotId = integrated.current_snapshot_id ?? null;
  const snapshotStatus = snapshot.status;
  const evidenceStatus = evidence.status;

  if (!VALID_GUARD_STATES.has(snapshotStatus)) return fail('SNAPSHOT_INTEGRITY_STATUS_INVALID', currentSnapshotId);
  if (!VALID_GUARD_STATES.has(evidenceStatus)) return fail('EVIDENCE_INTEGRITY_STATUS_INVALID', currentSnapshotId);

  if (integrated.status === 'FAIL_CLOSED' || snapshotStatus === 'FAIL_CLOSED' || evidenceStatus === 'FAIL_CLOSED') {
    return fail('UPSTREAM_TRACK_B_READINESS_PROOF_FAILED', currentSnapshotId);
  }
  if (integrated.status !== 'PASS_BOOTSTRAPPING') return fail('INTEGRATED_PROGRAM_GATE_STATUS_INVALID', currentSnapshotId);

  const integratedPermitted = integrated.track_b_readiness?.assessment_permitted === true;

  if (currentSnapshotId == null) {
    if (integratedPermitted) return fail('ASSESSMENT_PERMISSION_WITHOUT_CURRENT_SNAPSHOT');
    if ((snapshot.current_snapshot_id ?? null) !== null || (evidence.current_snapshot_id ?? null) !== null) {
      return fail('GUARD_SNAPSHOT_ID_PRESENT_WITHOUT_CURRENT_SNAPSHOT');
    }
    if (snapshotStatus !== 'WAITING' || evidenceStatus !== 'WAITING') {
      return fail('GUARD_STATE_NOT_WAITING_WITHOUT_CURRENT_SNAPSHOT');
    }
    return {
      status: 'WAITING',
      waiting_state: 'WAITING_FOR_SNAPSHOT',
      reason: 'CURRENT_SNAPSHOT_NOT_REGISTERED',
      current_snapshot_id: null,
      assessment_permitted: false,
    };
  }

  if (snapshot.current_snapshot_id !== currentSnapshotId || evidence.current_snapshot_id !== currentSnapshotId) {
    return fail('TRACK_B_READINESS_SNAPSHOT_ID_MISMATCH', currentSnapshotId);
  }

  if (!integratedPermitted) {
    return {
      status: 'WAITING',
      waiting_state: integrated.track_b_readiness?.waiting_state ?? 'WAITING_FOR_VALIDATION',
      reason: integrated.track_b_readiness?.reason ?? 'INTEGRATED_PROGRAM_GATE_NOT_READY',
      current_snapshot_id: currentSnapshotId,
      assessment_permitted: false,
    };
  }

  if (snapshotStatus !== 'PASS' || evidenceStatus !== 'PASS') {
    return fail('INTEGRATED_PERMISSION_WITHOUT_COMPLETE_IDENTITY_PROOFS', currentSnapshotId);
  }

  return {
    status: 'READY',
    waiting_state: null,
    reason: 'ALL_TRACK_B_OFFICIAL_INPUT_PROOFS_EXACT_MATCH',
    current_snapshot_id: currentSnapshotId,
    assessment_permitted: true,
  };
}
