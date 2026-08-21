import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync('coordination/kidults/audit/unified-audit-control-plane-v1.json', 'utf8'));

const expected = {
  RIGHTS_PURPOSE_SEGREGATION: [
    'field_by_purpose_binding',
    'source_specific_rights_matrix',
    'prohibited_purpose_fail_closed',
    'retention_deletion_termination',
    'raw_redistribution_publication_control',
    'attribution_provenance'
  ],
  IMMUTABLE_QUARANTINED_LANDING_ZONE: [
    'immutable_raw_landing',
    'source_namespace_isolation',
    'quarantine_by_default',
    'checksum_digest',
    'receipt_timestamp',
    'schema_version_capture',
    'no_auto_promotion'
  ],
  SCHEMA_SEMANTIC_INTEGRITY: [
    'schema_validation',
    'currency_unit_fee_normalization',
    'unknown_semantics',
    'sale_status_semantics',
    'timezone_as_of_integrity',
    'source_revision_handling'
  ],
  IDENTITY_ENTITY_RESOLUTION: [
    'stable_source_identifier',
    'source_owner_preserved',
    'uncertain_match_fail_closed',
    'authoritative_identifier_precedence',
    'collision_alias_detection'
  ],
  PROVENANCE_EVIDENCE_LINEAGE: [
    'raw_to_claim_traceability',
    'immutable_lineage_reference',
    'methodology_lineage_version_binding',
    'confidence_limitation_propagation'
  ],
  QUALITY_POISONING_ANOMALY_DEFENSE: [
    'malformed_adversarial_handling',
    'duplicate_contamination_control',
    'impossible_outlier_quarantine',
    'source_drift_detection',
    'batch_completeness_truncation',
    'independent_source_reconciliation'
  ],
  PRIVACY_SECURITY_SECRETS: [
    'pii_classification_minimization',
    'secret_manager_only',
    'no_secrets_in_logs_registry_artifacts',
    'least_privilege',
    'ingest_reject_quarantine_replay_audit'
  ],
  REPLAY_RECOVERY_ROLLBACK: [
    'deterministic_replay',
    'idempotent_ingestion',
    'partial_batch_recovery',
    'lineage_safe_rollback',
    'withdrawal_deletion_propagation'
  ],
  PROVIDER_INDEPENDENCE_CONCENTRATION: [
    'source_owner_independence_metric',
    'no_provider_equals_truth',
    'provider_specific_adapter',
    'exit_replaceability_plan',
    'critical_evidence_redundancy_target'
  ],
  COST_RATE_CAPACITY_PROTECTION: [
    'bounded_batch_rate',
    'backpressure_retry_dlq',
    'quota_exhaustion_fail_safe',
    'cost_guardrail_before_credentials',
    'burst_malformed_volume_test'
  ],
  DOWNSTREAM_GATE_ISOLATION: [
    'raw_cannot_create_claim',
    'evidence_before_metrics',
    'candidate_requires_empirical_and_rights_gates',
    'track_b_input_boundary',
    'portal_eos_production_fail_closed'
  ],
  ADVERSARIAL_REDTEAM_FIXTURES: [
    'schema_drift',
    'wrong_currency_unit',
    'duplicate_relisted',
    'contradictory_sources',
    'missing_rights',
    'expired_rights',
    'deletion_request',
    'poisoned_outlier',
    'partial_truncated_batch',
    'source_outage_rate_limit',
    'replay_recovery',
    'provider_substitution'
  ]
};

function coverageErrors(candidate) {
  const errors = [];
  const families = candidate.pre_partner_control_families || [];
  if (families.length !== Object.keys(expected).length) {
    errors.push(`family count ${families.length} != ${Object.keys(expected).length}`);
  }

  const ids = families.map(f => f.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate family id');
  const map = new Map(families.map(f => [f.id, f]));

  for (const [familyId, requiredControls] of Object.entries(expected)) {
    const family = map.get(familyId);
    if (!family) {
      errors.push(`missing family ${familyId}`);
      continue;
    }
    const controls = Array.isArray(family.required_controls) ? family.required_controls : [];
    if (new Set(controls).size !== controls.length) errors.push(`duplicate control id in ${familyId}`);
    for (const controlId of requiredControls) {
      if (!controls.includes(controlId)) errors.push(`missing ${familyId}.${controlId}`);
    }
  }
  return errors;
}

const baselineErrors = coverageErrors(contract);
if (baselineErrors.length) throw new Error(`baseline family coverage failed:\n${baselineErrors.join('\n')}`);

let mutationCases = 0;
for (const [familyId, requiredControls] of Object.entries(expected)) {
  for (const controlId of requiredControls) {
    const mutated = structuredClone(contract);
    const family = mutated.pre_partner_control_families.find(f => f.id === familyId);
    family.required_controls = family.required_controls.filter(c => c !== controlId);
    const errors = coverageErrors(mutated);
    if (!errors.some(e => e === `missing ${familyId}.${controlId}`)) {
      throw new Error(`mutation self-test failed to detect removal: ${familyId}.${controlId}`);
    }
    mutationCases += 1;
  }
}

if (contract.governing_issue !== 881) throw new Error('control-family coverage must remain bound to #881');
if (contract.truth_boundary?.readiness_axis !== 'INTERNAL_CONTROL_READINESS') throw new Error('coverage proof is control-readiness only');
if (contract.truth_boundary?.empirical_gate_effect !== 'NONE') throw new Error('coverage proof cannot promote empirical gates');
if (contract.truth_boundary?.external_partner_data_ingestion !== 'HOLD') throw new Error('external partner ingestion must remain HOLD');
if (contract.truth_boundary?.production !== 'HOLD' || contract.truth_boundary?.public !== 'HOLD') throw new Error('release boundary drift');
if (contract.truth_boundary?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') throw new Error('G5 boundary drift');

console.log(JSON.stringify({
  suite: 'KIDULTS_PRE_PARTNER_CONTROL_FAMILY_COVERAGE_V1',
  result: 'PASS',
  governing_issue: 881,
  families_exactly_bound: Object.keys(expected).length,
  required_controls_machine_bound: mutationCases,
  removal_mutation_cases_detected: mutationCases,
  false_green_on_nonempty_family_only: 'CLOSED',
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
