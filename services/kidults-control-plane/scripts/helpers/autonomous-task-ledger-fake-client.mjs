function clone(value) { return structuredClone(value); }

function latestRows(snapshots) {
  const latest = new Map();
  for (const row of snapshots) {
    const previous = latest.get(row.task_id);
    if (!previous || row.revision > previous.revision) latest.set(row.task_id, row);
  }
  return [...latest.values()];
}

export function fakeAutonomousTaskClient() {
  const state = {
    snapshots: [], transitions: [], admissionProofs: [], calls: [], tx: null,
    invocationRequests: [], invocationDecisions: [], invocationConsumptions: [],
    approvalConsumptions: [], containmentFenceEvents: [],
    protectedLaunchManifestConsumptions: [],
    trustRegistrySnapshots: [],
    trustCurrentHeads: [],
    forceContainmentFenceInsertFailure: false, containmentFenceSequence: 0,
    forceRevisionConflictTaskIds: new Set(),
  };
  return {
    state,
    async query(sql, params = []) {
      state.calls.push(sql.trim().split('\n')[0]);
      if (sql === 'BEGIN') {
        state.tx = clone({ snapshots: state.snapshots, transitions: state.transitions,
          admissionProofs: state.admissionProofs, invocationRequests: state.invocationRequests,
          invocationDecisions: state.invocationDecisions,
          invocationConsumptions: state.invocationConsumptions,
          approvalConsumptions: state.approvalConsumptions,
          containmentFenceEvents: state.containmentFenceEvents });
        state.tx.protectedLaunchManifestConsumptions = clone(
          state.protectedLaunchManifestConsumptions);
        state.tx.trustRegistrySnapshots = clone(state.trustRegistrySnapshots);
        state.tx.trustCurrentHeads = clone(state.trustCurrentHeads);
        return { rows: [] };
      }
      if (sql === 'COMMIT') { state.tx = null; return { rows: [] }; }
      if (sql === 'ROLLBACK') {
        if (state.tx) ({ snapshots: state.snapshots, transitions: state.transitions,
          admissionProofs: state.admissionProofs, invocationRequests: state.invocationRequests,
          invocationDecisions: state.invocationDecisions,
          invocationConsumptions: state.invocationConsumptions,
          approvalConsumptions: state.approvalConsumptions,
          containmentFenceEvents: state.containmentFenceEvents } = clone(state.tx));
        if (state.tx?.trustRegistrySnapshots) state.trustRegistrySnapshots = clone(state.tx.trustRegistrySnapshots);
        if (state.tx?.trustCurrentHeads) state.trustCurrentHeads = clone(state.tx.trustCurrentHeads);
        if (state.tx?.protectedLaunchManifestConsumptions) {
          state.protectedLaunchManifestConsumptions = clone(
            state.tx.protectedLaunchManifestConsumptions);
        }
        state.tx = null;
        return { rows: [] };
      }
      if (sql.includes('set_config') || sql.includes('assert_registered_writer')
        || sql.includes('pg_advisory_xact_lock')) return { rows: [{}] };
      if (sql.startsWith('INSERT INTO kidults_control.protected_launch_manifest_consumptions')) {
        const [manifest_digest, source_sha, request_id, consumed_at, manifest_json,
          writer_id] = params;
        if (state.protectedLaunchManifestConsumptions.some(
          row => row.manifest_digest === manifest_digest)) return { rows: [] };
        const row = { manifest_digest, source_sha, request_id, consumed_at,
          manifest_json: JSON.parse(manifest_json), writer_id };
        state.protectedLaunchManifestConsumptions.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('protected_launch_manifest_consumptions')
        && sql.includes('WHERE manifest_digest=$1')) {
        return { rows: state.protectedLaunchManifestConsumptions
          .filter(row => row.manifest_digest === params[0]).map(clone) };
      }
      if (sql.includes('AUTONOMOUS_SCHEDULER_CLAIM_CANDIDATES_V1')) {
        const [observedAt, limit] = params;
        return { rows: latestRows(state.snapshots)
          .filter(row => ['PENDING', 'RETRY_SCHEDULED'].includes(row.state))
          .filter(row => row.task_json.workflowType === 'synthetic-shadow')
          .filter(row => Date.parse(row.task_json.availableAt) <= Date.parse(observedAt))
          .filter(row => row.task_json.attempt < row.task_json.maxAttempts)
          .sort((left, right) => left.task_json.priority - right.task_json.priority
            || Date.parse(left.task_json.availableAt) - Date.parse(right.task_json.availableAt)
            || left.task_id.localeCompare(right.task_id))
          .slice(0, limit).map(clone) };
      }
      if (sql.includes('AUTONOMOUS_SCHEDULER_EXPIRED_LEASES_V1')) {
        const [observedAt, limit] = params;
        return { rows: latestRows(state.snapshots)
          .filter(row => ['LEASED', 'RUNNING'].includes(row.state))
          .filter(row => row.task_json.workflowType === 'synthetic-shadow')
          .filter(row => Date.parse(row.task_json.leaseExpiresAt) <= Date.parse(observedAt))
          .sort((left, right) => Date.parse(left.task_json.leaseExpiresAt) - Date.parse(right.task_json.leaseExpiresAt)
            || left.task_id.localeCompare(right.task_id))
          .slice(0, limit).map(clone) };
      }
      if (sql.startsWith('INSERT INTO kidults_control.autonomous_task_snapshots')) {
        const [task_id, revision, taskState, attempt, lease_owner, lease_epoch, task_json, task_digest, writer_id] = params;
        if (revision > 0 && state.forceRevisionConflictTaskIds.delete(task_id)) return { rows: [] };
        if (state.snapshots.some(row => row.task_id === task_id && row.revision === revision)) return { rows: [] };
        const row = { task_id, revision, state: taskState, attempt, lease_owner, lease_epoch,
          task_json: JSON.parse(task_json), task_digest, writer_id };
        state.snapshots.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('autonomous_task_snapshots WHERE task_id=$1 ORDER BY')) {
        return { rows: state.snapshots.filter(row => row.task_id === params[0])
          .sort((a, b) => b.revision - a.revision).slice(0, 1).map(clone) };
      }
      if (sql.includes('autonomous_task_snapshots WHERE task_id=$1 AND revision=$2')) {
        return { rows: state.snapshots.filter(row => row.task_id === params[0] && row.revision === params[1]).map(clone) };
      }
      if (sql.startsWith('INSERT INTO kidults_control.autonomous_task_transitions')) {
        const [receipt_id, task_id, from_revision, to_revision, transition, from_state, to_state,
          before_digest, after_digest, worker_id, lease_epoch, reason, observed_at,
          receipt_json, receipt_digest, writer_id] = params;
        if (state.transitions.some(row => row.receipt_id === receipt_id)) return { rows: [] };
        const row = { receipt_id, task_id, from_revision, to_revision, transition, from_state, to_state,
          before_digest, after_digest, worker_id, lease_epoch, reason, observed_at,
          receipt_json: JSON.parse(receipt_json), receipt_digest, writer_id };
        state.transitions.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('autonomous_task_transitions WHERE receipt_id=$1')) {
        return { rows: state.transitions.filter(row => row.receipt_id === params[0]).map(clone) };
      }
      if (sql.startsWith('INSERT INTO kidults_control.autonomous_admission_proofs')) {
        const [proof_id, task_id, request_digest, decision_id, decision_digest, manifest_id,
          manifest_digest, issued_at, expires_at, proof_json, proof_digest, writer_id] = params;
        if (state.admissionProofs.some(row => row.proof_id === proof_id)) return { rows: [] };
        const row = { proof_id, task_id, request_digest, decision_id, decision_digest, manifest_id,
          manifest_digest, issued_at, expires_at, proof_json: JSON.parse(proof_json), proof_digest, writer_id };
        state.admissionProofs.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('AUTONOMOUS_ADMISSION_PROOF_BY_ID_V1')) {
        return { rows: state.admissionProofs.filter(row => row.proof_id === params[0]).map(clone) };
      }
      if (sql.includes('AUTONOMOUS_ADMISSION_PROOF_RESOLVE_V1')) {
        const [taskId, requestDigest, observedAt] = params;
        return { rows: state.admissionProofs
          .filter(row => row.task_id === taskId && row.request_digest === requestDigest
            && Date.parse(row.expires_at) > Date.parse(observedAt))
          .sort((left, right) => Date.parse(right.issued_at) - Date.parse(left.issued_at)
            || left.proof_id.localeCompare(right.proof_id)).slice(0, 1).map(clone) };
      }
      if (sql.startsWith('INSERT INTO kidults_control.autonomous_supervisor_invocation_requests')) {
        const [command_id, request_id, request_digest, expires_at, request_json, writer_id] = params;
        if (state.invocationRequests.some(row => row.command_id === command_id)) return { rows: [] };
        const row = { command_id, request_id, request_digest, expires_at,
          request_json: JSON.parse(request_json), writer_id };
        state.invocationRequests.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('autonomous_supervisor_invocation_requests WHERE command_id=$1')) {
        return { rows: state.invocationRequests
          .filter(row => row.command_id === params[0]).map(clone) };
      }
      if (sql.startsWith('INSERT INTO kidults_control.autonomous_supervisor_invocation_decisions')) {
        const [command_id, request_id, request_digest, decision_id, decision,
          decision_digest, decision_json, writer_id] = params;
        if (state.invocationDecisions.some(row => row.command_id === command_id)) return { rows: [] };
        const row = { command_id, request_id, request_digest, decision_id, decision, decision_digest,
          decision_json: JSON.parse(decision_json), writer_id };
        state.invocationDecisions.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('autonomous_supervisor_invocation_decisions WHERE command_id=$1')) {
        return { rows: state.invocationDecisions
          .filter(row => row.command_id === params[0]).map(clone) };
      }
      if (sql.includes('AUTONOMOUS_SUPERVISOR_INVOCATION_ADMISSION_V1')) {
        const request = state.invocationRequests.find(row => row.command_id === params[0]);
        const decision = state.invocationDecisions.find(row => row.command_id === params[0]);
        if (!request || !decision) return { rows: [] };
        return { rows: [clone({ ...request, decision_id: decision.decision_id,
          decision: decision.decision, decision_digest: decision.decision_digest,
          request_id: decision.request_id, request_digest: decision.request_digest,
          decision_json: decision.decision_json, decision_writer_id: decision.writer_id })] };
      }
      if (sql.startsWith('INSERT INTO kidults_control.autonomous_supervisor_invocation_consumptions')) {
        const [command_id, request_id, request_digest, decision_id, decision_digest,
          control_state_digest, consumption_id, consumed_at, consumption_json,
          receipt_digest, writer_id] = params;
        if (state.invocationConsumptions.some(row => row.command_id === command_id)) return { rows: [] };
        const row = { command_id, request_id, request_digest, decision_id, decision_digest,
          control_state_digest, consumption_id, consumed_at,
          consumption_json: JSON.parse(consumption_json), receipt_digest, writer_id };
        state.invocationConsumptions.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('autonomous_supervisor_invocation_consumptions WHERE command_id=$1')) {
        return { rows: state.invocationConsumptions
          .filter(row => row.command_id === params[0]).map(clone) };
      }
      if (sql.startsWith('INSERT INTO kidults_control.cryptographic_approval_consumptions')) {
        const [envelope_id, envelope_digest, nonce_digest, matrix_contract_digest,
          trust_registry_digest, requested_capabilities_digest, authority_class, subject_type,
          subject_id, subject_digest, approval_verification_receipt_digest, consumption_id,
          consumed_at, consumption_json, receipt_digest, writer_id] = params;
        if (state.approvalConsumptions.some(row => row.envelope_id === envelope_id
          || row.envelope_digest === envelope_digest || row.nonce_digest === nonce_digest
          || row.approval_verification_receipt_digest === approval_verification_receipt_digest
          || row.consumption_id === consumption_id || row.receipt_digest === receipt_digest)) {
          return { rows: [] };
        }
        const row = { envelope_id, envelope_digest, nonce_digest, matrix_contract_digest,
          trust_registry_digest, requested_capabilities_digest, authority_class, subject_type,
          subject_id, subject_digest, approval_verification_receipt_digest, consumption_id,
          consumed_at, consumption_json: JSON.parse(consumption_json), receipt_digest, writer_id };
        state.approvalConsumptions.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('cryptographic_approval_consumptions')
        && sql.includes('WHERE envelope_id=$1 OR nonce_digest=$2')) {
        return { rows: state.approvalConsumptions.filter(row => row.envelope_id === params[0]
          || row.nonce_digest === params[1]).sort((left, right) => left.envelope_id
          .localeCompare(right.envelope_id)).map(clone) };
      }
      if (sql.startsWith('INSERT INTO kidults_control.autonomous_containment_fence_events')) {
        if (state.forceContainmentFenceInsertFailure) {
          throw new Error('FORCED_CONTAINMENT_FENCE_INSERT_FAILURE');
        }
        const [fence_digest, action, source_evidence_digest, action_package_digest,
          approval_receipt_digest, previous_fence_digest, fence_json, writer_id] = params;
        if (state.containmentFenceEvents.some(row => row.fence_digest === fence_digest)) {
          return { rows: [] };
        }
        const row = { fence_digest, action, source_evidence_digest, action_package_digest,
          approval_receipt_digest, previous_fence_digest, fence_json: JSON.parse(fence_json), writer_id,
          event_sequence: ++state.containmentFenceSequence,
          recorded_at: new Date(Date.UTC(2026, 8, 19, 0, 0, 0)).toISOString() };
        state.containmentFenceEvents.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('autonomous_containment_fence_events')
        && sql.includes('WHERE fence_digest=$1')) {
        return { rows: state.containmentFenceEvents
          .filter(row => row.fence_digest === params[0]).map(clone) };
      }
      if (sql.includes('AUTONOMOUS_CONTAINMENT_FENCE_CURRENT_V1')) {
        return { rows: [...state.containmentFenceEvents]
          .sort((left, right) => right.event_sequence - left.event_sequence)
          .slice(0, 1).map(clone) };
      }
      if (sql.startsWith('INSERT INTO kidults_control.approval_trust_registry_snapshots')) {
        const [snapshot_id, registry_id, registry_digest, handoff_id, handoff_digest,
          lifecycle_state_digest, registry_json, handoff_json, snapshot_json,
          receipt_digest, writer_id, recorded_at] = params;
        if (state.trustRegistrySnapshots.some(row => row.snapshot_id === snapshot_id
          || row.registry_id === registry_id || row.registry_digest === registry_digest
          || row.handoff_id === handoff_id || row.handoff_digest === handoff_digest
          || row.receipt_digest === receipt_digest)) return { rows: [] };
        const row = { snapshot_id, registry_id, registry_digest, handoff_id, handoff_digest,
          lifecycle_state_digest, registry_json: JSON.parse(registry_json),
          handoff_json: JSON.parse(handoff_json), snapshot_json: JSON.parse(snapshot_json),
          receipt_digest, writer_id, recorded_at };
        state.trustRegistrySnapshots.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('approval_trust_registry_snapshots')
        && sql.includes('WHERE snapshot_id=$1 OR registry_digest=$2 OR handoff_digest=$3')) {
        return { rows: state.trustRegistrySnapshots.filter(row => row.snapshot_id === params[0]
          || row.registry_digest === params[1] || row.handoff_digest === params[2])
          .sort((a, b) => a.snapshot_id.localeCompare(b.snapshot_id)).map(clone) };
      }
      if (sql.includes('approval_trust_current_heads')
        && sql.includes('ORDER BY revision DESC LIMIT 1')) {
        return { rows: [...state.trustCurrentHeads].sort((a, b) => b.revision - a.revision)
          .slice(0, 1).map(clone) };
      }
      if (sql.startsWith('INSERT INTO kidults_control.approval_trust_current_heads')) {
        const [revision, head_id, head_digest, previous_head_digest, lifecycle_state_digest,
          active_registry_id, active_registry_digest, head_json, writer_id, observed_at] = params;
        if (state.trustCurrentHeads.some(row => row.revision === revision
          || row.head_id === head_id || row.head_digest === head_digest)) return { rows: [] };
        const row = { revision, head_id, head_digest, previous_head_digest,
          lifecycle_state_digest, active_registry_id, active_registry_digest,
          head_json: JSON.parse(head_json), writer_id, observed_at };
        state.trustCurrentHeads.push(row);
        return { rows: [clone(row)] };
      }
      if (sql.includes('approval_trust_registry_snapshots')
        && sql.includes('WHERE registry_id=$1 AND registry_digest=$2')) {
        return { rows: state.trustRegistrySnapshots.filter(row => row.registry_id === params[0]
          && row.registry_digest === params[1]).map(clone) };
      }
      throw new Error(`UNHANDLED_SQL:${sql}`);
    },
  };
}
