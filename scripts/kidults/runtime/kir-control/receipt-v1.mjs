export function buildControlReceipt({ identity, runtime, bundle, registryDigest, digests }) {
  const pass = bundle.admission.status === 'PASS';
  return {
    id: 'kidults-kir-current-sold-control-bridge-v1', version: '1.0.0',
    state: pass ? 'CONTROL_CHAIN_VALIDATED_EMPIRICAL_BLOCKED' : 'CONTROL_INPUT_REJECTED',
    scope: 'SYNTHETIC_KIR_ATOMIC_EVIDENCE_INTEGRATION_ONLY',
    repository: identity.repository, source_sha: identity.source_sha,
    run_id: identity.run_id, run_attempt: identity.run_attempt, trigger_event: identity.trigger_event,
    synthetic_test_clock: digests.syntheticTestClock,
    kir_receipt_sha256: digests.kirReceipt,
    input_registry_sha256: registryDigest,
    control_bundle_receipt_sha256: digests.bundleReceipt,
    control_evidence_sha256: bundle.receipt.evidence_digest,
    engine_control_status: bundle.admission.status,
    control_counts: { ...bundle.receipt.counts },
    blockers: [...runtime.blockers],
    empirical_current_sold_delta: 0, postgres_rows_written: 0,
    raw_rows_emitted: false, raw_evidence_emitted: false, bundle_emitted: false,
    ledger_write_eligible: false, runtime_activation_authorized: false,
    provider_authority: false, database_authority: false, empirical_authority: false,
    producer_health_authority: false, promotion_eligible: false,
    track_b_started: false, projection_approved: false,
    public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
  };
}
