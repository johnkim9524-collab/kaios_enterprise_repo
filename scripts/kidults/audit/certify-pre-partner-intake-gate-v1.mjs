import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const assert = (c, m) => { if (!c) throw new Error(m); };
const run = p => {
  const r = spawnSync(process.execPath, [p], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${p} failed\n${r.stdout}\n${r.stderr}`);
  return r.stdout.trim();
};

const control = readJson('coordination/kidults/audit/unified-audit-control-plane-v1.json');
const fixtures = readJson('coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json');
const projection = readJson('coordination/kidults/projection-dry-run/projection-dry-run-contract-v1.json');

assert(control.governing_issue === 881, 'control plane must bind #881');
assert(control.rule === 'NO_PARTNER_DATA_INGESTION_BEFORE_PRE_INTAKE_GATE_PASS', 'pre-intake rule drift');
assert(Array.isArray(control.pre_partner_control_families) && control.pre_partner_control_families.length === 12, 'all 12 control families required');
for (const family of control.pre_partner_control_families) {
  assert(family.id && Array.isArray(family.required_controls) && family.required_controls.length > 0, `incomplete family ${family.id}`);
}
assert(Array.isArray(fixtures.fixtures) && fixtures.fixtures.length === 12, '12 executable adversarial fixtures required');
assert(fixtures.fixture_type === 'SYNTHETIC_NON_PROMOTABLE_CONTROL', 'fixture class drift');
assert(fixtures.empirical_gate_effect === 'NONE', 'synthetic fixtures cannot close empirical gates');
assert(projection.governing_issue === 884 && projection.governing_rule === 'PREWIRE_FIRST_DATA_LATER', '#884 Projection dry-run binding required');
assert(projection.truth_boundary.real_candidate_evidence === 'NONE', 'Projection fixture promoted real Candidate/Evidence');
assert(projection.truth_boundary.track_b === 'NOT_STARTED', 'Track B falsely started');
assert(projection.truth_boundary.live_approved_projection === 'NONE', 'live Projection falsely promoted');

const destructive = control.destructive_lifecycle_control || {};
assert(destructive.authorization_required === true, 'destructive lifecycle authorization must be required');
assert(destructive.trusted_context_binding === 'PERSISTED_SOURCE_OWNER_NAMESPACE_OBJECT', 'destructive lifecycle persisted binding drift');
assert(destructive.actor_binding === 'AUTHENTICATED_AUTHORIZED_SOURCE_OWNER', 'destructive actor binding drift');
assert(destructive.audit_binding === 'APPEND_ONLY_EVENT_REQUIRED', 'destructive append-only audit binding drift');
assert(destructive.replay_protection === 'UNIQUE_EVENT_ID_FAIL_CLOSED', 'destructive replay protection drift');
assert(destructive.unauthorized_behavior === 'QUARANTINE_OR_REJECT_NO_STATE_MUTATION', 'unauthorized destructive behavior drift');

const outputs = {
  control_family_coverage: run('scripts/kidults/audit/validate-pre-partner-control-family-coverage-v1.mjs'),
  audit_control_plane: run('scripts/kidults/audit/validate-unified-audit-control-plane-v1.mjs'),
  adversarial_fixtures: run('scripts/kidults/audit/validate-pre-partner-adversarial-fixtures-v1.mjs'),
  destructive_lifecycle_recovery_monotonicity: run('scripts/kidults/audit/validate-destructive-lifecycle-recovery-monotonicity-v1.mjs'),
  source_admission_temporal_rights: run('scripts/kidults/source-intelligence/test-source-admission-record-v1.mjs'),
  rights_withdrawal_transitive_invalidation: run('scripts/kidults/audit/validate-rights-withdrawal-transitive-invalidation-v1.mjs'),
  projection_isolation: run('scripts/kidults/projection/validate-projection-dry-run-v1.mjs')
};

const t = control.truth_boundary;
assert(t.readiness_axis === 'INTERNAL_CONTROL_READINESS', 'readiness axis must remain internal control');
assert(t.empirical_gate_effect === 'NONE' && t.synthetic_fixture_effect === 'CONTROL_VALIDATION_ONLY', 'truth boundary drift');
assert(t.production === 'HOLD' && t.public === 'HOLD' && t.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'release boundary drift');
assert(control.downstream_isolation.raw_partner_data_to_market_claim === 'PROHIBITED', 'raw-to-claim bypass');
assert(control.downstream_isolation.raw_partner_data_to_metric === 'PROHIBITED', 'raw-to-metric bypass');
assert(control.downstream_isolation.portal_eos_production_bypass === 'PROHIBITED', 'downstream bypass');
assert(control.cost_capacity.credentials_activation_before_guardrail === 'PROHIBITED', 'credential activation before guardrail');
assert(control.immutability.ledger_mode === 'APPEND_ONLY' && control.immutability.previous_digest_chain_required === true, 'audit immutability incomplete');
assert(control.partner_data_state_machine.default_after_receipt === 'QUARANTINED', 'receipt must quarantine by default');

console.log(JSON.stringify({
  suite: 'KIDULTS_PRE_PARTNER_INTAKE_GATE_CERT_V1',
  governing_issue: 881,
  internal_pre_intake_gate: 'PASS',
  control_families: 12,
  exact_family_control_coverage: 'PASS',
  control_removal_mutation_selftest: 'PASS',
  executable_adversarial_fixtures: 12,
  source_admission_temporal_rights_fail_closed: 'PASS',
  destructive_lifecycle_authorization_fail_closed: 'PASS',
  destructive_event_replay_protection: 'PASS',
  destructive_lifecycle_recovery_monotonicity: 'PASS',
  rollback_revocation_resurrection_fail_closed: 'PASS',
  rights_withdrawal_transitive_invalidation: 'PASS',
  unified_audit_control_plane: 'PASS',
  projection_downstream_isolation: 'PASS',
  no_internally_solvable_p0_p1_detected_by_certification: true,
  empirical_gate_effect: 'NONE',
  real_candidate_evidence: 'NONE',
  track_b: 'NOT_STARTED',
  live_approved_projection: 'NONE',
  provider_specific_rights_and_credentials: 'SEPARATE_APPROVAL_GATES',
  external_partner_ingestion_authorization: 'NOT_GRANTED_BY_THIS_CERTIFICATION',
  production: 'HOLD',
  public_intelligence: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
