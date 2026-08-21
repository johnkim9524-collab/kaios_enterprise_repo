import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contractPath = path.join(root, 'coordination/kidults/audit/unified-audit-control-plane-v1.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

const requiredTop = [
  'version','status','governing_issue','rule','truth_boundary','principles','audit_event_envelope',
  'partner_data_state_machine','control_layers','pre_partner_control_families','adversarial_fixtures',
  'immutability','provider_independence','cost_capacity','downstream_isolation','exit_criteria'
];
for (const key of requiredTop) if (!(key in contract)) throw new Error(`missing top-level key: ${key}`);
if (contract.governing_issue !== 881) throw new Error('governing_issue must be #881');
if (contract.rule !== 'NO_PARTNER_DATA_INGESTION_BEFORE_PRE_INTAKE_GATE_PASS') throw new Error('pre-intake rule mismatch');

const truth = contract.truth_boundary || {};
if (truth.readiness_axis !== 'INTERNAL_CONTROL_READINESS') throw new Error('audit gate must remain control-readiness only');
if (truth.empirical_gate_effect !== 'NONE') throw new Error('audit gate must not promote empirical readiness');
if (truth.synthetic_fixture_effect !== 'CONTROL_VALIDATION_ONLY') throw new Error('synthetic fixtures must be control-only');
for (const hold of ['external_partner_data_ingestion','production','public']) {
  if (truth[hold] !== 'HOLD') throw new Error(`${hold} must remain HOLD`);
}
if (truth.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') throw new Error('G5 must require explicit approval');

const mustPrinciples = ['APPEND_ONLY','FAIL_CLOSED','EVIDENCE_BEFORE_METRICS','RIGHTS_BEFORE_USE','QUARANTINE_BEFORE_PROMOTION','NO_PROVIDER_EQUALS_TRUTH','ONLY_EVIDENCED_PASS_COUNTS_AS_COMPLETE'];
for (const p of mustPrinciples) if (!contract.principles.includes(p)) throw new Error(`missing principle: ${p}`);

const requiredEvent = ['audit_event_id','event_time','sequence_number','previous_event_digest','actor_type','actor_id','action','object_type','object_id','source_id','source_owner_id','source_namespace','data_classification','decision','reason','result','correlation_id','event_digest'];
for (const f of requiredEvent) if (!contract.audit_event_envelope.required.includes(f)) throw new Error(`missing audit event field: ${f}`);
for (const forbidden of ['secret','credential','api_key','raw_token','access_token','refresh_token','password','authorization_header']) {
  if (!contract.audit_event_envelope.forbidden.includes(forbidden)) throw new Error(`missing forbidden secret field: ${forbidden}`);
}

const sm = contract.partner_data_state_machine;
if (sm.initial_state !== 'RECEIVED' || sm.default_after_receipt !== 'QUARANTINED') throw new Error('partner data must default to quarantine');
const requiredStates = ['RECEIVED','QUARANTINED','RIGHTS_CHECKED','SCHEMA_CHECKED','SEMANTICS_CHECKED','IDENTITY_CHECKED','LINEAGE_CHECKED','QUALITY_CHECKED','NORMALIZED','EVIDENCE_ELIGIBLE','PROMOTED','REJECTED','SUPERSEDED','WITHDRAWN','DELETED'];
for (const state of requiredStates) if (!sm.states.includes(state)) throw new Error(`missing lifecycle state: ${state}`);
if (JSON.stringify(sm.allowed_transitions.RECEIVED) !== JSON.stringify(['QUARANTINED'])) throw new Error('receipt may only transition to quarantine');
if (!sm.allowed_transitions.EVIDENCE_ELIGIBLE.includes('PROMOTED') || !sm.allowed_transitions.EVIDENCE_ELIGIBLE.includes('REJECTED')) throw new Error('evidence eligible must resolve to promoted or rejected');
if (sm.allowed_transitions.REJECTED.length !== 0 || sm.allowed_transitions.DELETED.length !== 0) throw new Error('rejected/deleted must be terminal');
const guard = sm.promotion_guard || {};
for (const k of ['rights_status','schema_status','semantic_status','identity_status','lineage_status','quality_status','raw_direct_metric_or_claim']) if (!(k in guard)) throw new Error(`missing promotion guard: ${k}`);
if (guard.rights_status !== 'PASS_AND_NOT_EXPIRED') throw new Error('promotion must require active rights');
if (guard.raw_direct_metric_or_claim !== 'PROHIBITED') throw new Error('raw data cannot directly promote to metric/claim');

const requiredFamilyIds = [
  'RIGHTS_PURPOSE_SEGREGATION','IMMUTABLE_QUARANTINED_LANDING_ZONE','SCHEMA_SEMANTIC_INTEGRITY',
  'IDENTITY_ENTITY_RESOLUTION','PROVENANCE_EVIDENCE_LINEAGE','QUALITY_POISONING_ANOMALY_DEFENSE',
  'PRIVACY_SECURITY_SECRETS','REPLAY_RECOVERY_ROLLBACK','PROVIDER_INDEPENDENCE_CONCENTRATION',
  'COST_RATE_CAPACITY_PROTECTION','DOWNSTREAM_GATE_ISOLATION','ADVERSARIAL_REDTEAM_FIXTURES'
];
if (contract.pre_partner_control_families.length !== requiredFamilyIds.length) throw new Error('exactly 12 #881 control families required');
const familyMap = new Map(contract.pre_partner_control_families.map(f => [f.id, f]));
for (const id of requiredFamilyIds) {
  const family = familyMap.get(id);
  if (!family) throw new Error(`missing #881 control family: ${id}`);
  if (!Array.isArray(family.required_controls) || family.required_controls.length === 0) throw new Error(`family has no controls: ${id}`);
}

const requiredFixtures = ['schema_drift','wrong_currency_unit','duplicate_relisted','contradictory_sources','missing_rights','expired_rights','deletion_request','poisoned_outlier','partial_truncated_batch','source_outage_rate_limit','replay_recovery','provider_substitution'];
const fixtureMap = new Map(contract.adversarial_fixtures.map(f => [f.id, f]));
for (const id of requiredFixtures) {
  const fixture = fixtureMap.get(id);
  if (!fixture) throw new Error(`missing adversarial fixture: ${id}`);
  if (!fixture.expected_disposition) throw new Error(`fixture missing expected disposition: ${id}`);
}

if (contract.immutability.ledger_mode !== 'APPEND_ONLY') throw new Error('ledger must be APPEND_ONLY');
if (contract.immutability.mutation_policy !== 'NO_IN_PLACE_UPDATE_OR_DELETE') throw new Error('in-place mutation prohibited');
if (contract.immutability.correction_policy !== 'SUPERSEDING_EVENT_ONLY') throw new Error('corrections must be superseding events');
if (contract.immutability.previous_digest_chain_required !== true) throw new Error('previous digest chain required');
if (contract.provider_independence.truth_policy !== 'NO_PROVIDER_EQUALS_TRUTH') throw new Error('provider must not equal truth');
if (contract.provider_independence.concentration_measure_required !== true) throw new Error('provider concentration measure required');
if (contract.cost_capacity.credentials_activation_before_guardrail !== 'PROHIBITED') throw new Error('cost guardrail required before credentials');
if (contract.cost_capacity.quota_exhaustion_behavior !== 'FAIL_CLOSED_NO_PROMOTION') throw new Error('quota exhaustion must fail closed');
if (contract.downstream_isolation.raw_partner_data_to_market_claim !== 'PROHIBITED') throw new Error('raw partner data must not create market claims');
if (contract.downstream_isolation.raw_partner_data_to_metric !== 'PROHIBITED') throw new Error('raw partner data must not create metrics');
if (contract.downstream_isolation.candidate_requires_empirical_and_rights_gates !== true) throw new Error('candidate must require empirical + rights gates');
if (contract.downstream_isolation.portal_eos_production_bypass !== 'PROHIBITED') throw new Error('downstream bypass must be prohibited');

console.log('PASS unified-audit-control-plane-v1');
console.log(`families=${contract.pre_partner_control_families.length} event_required=${contract.audit_event_envelope.required.length} lifecycle_states=${sm.states.length} fixtures=${contract.adversarial_fixtures.length}`);
console.log('truth=CONTROL_ONLY partner_ingestion=HOLD production=HOLD public=HOLD g5=EXPLICIT_APPROVAL_REQUIRED');
