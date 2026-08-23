import fs from 'node:fs';

const path = 'coordination/kidults/internalization/track-z-provider-intake-routing-contract-v1.json';
const c = JSON.parse(fs.readFileSync(path, 'utf8'));
const errors = [];
const requiredSequence = [
  'TRACK_Z_INTAKE',
  'TRACK_Z_STRATEGIC_AND_INTERNALIZATION_REVIEW',
  'TRACK_Z_RIGHTS_REVIEW',
  'TRACK_Z_ECONOMICS_REVIEW',
  'TRACK_Z_PROVIDER_REMOVAL_REVIEW',
  'TRACK_Z_VERDICT',
  'KPMO_INTEGRATED_REPORT',
  'FOUNDER_REPORT',
  'ACTION_ONLY_IF_GATE_ALLOWS'
];
const requiredCore = [
  'provider_id_is_not_kidults_canonical_id',
  'provider_taxonomy_is_not_kidults_ontology',
  'provider_score_is_not_kidults_score',
  'provider_does_not_connect_directly_to_portal',
  'provider_does_not_connect_directly_to_index',
  'external_scope_is_minimized_to_irreducible_facts_and_rights'
];

if (c.contract_id !== 'KIDULTS_TRACK_Z_PROVIDER_INTAKE_ROUTING_V1') errors.push('contract id drift');
if (c.owner !== 'TRACK_Z') errors.push('owner must be TRACK_Z');
if (JSON.stringify(c.reporting_chain) !== JSON.stringify(['TRACK_Z','KPMO','FOUNDER'])) errors.push('reporting chain drift');
for (const step of requiredSequence) if (!c.mandatory_sequence?.includes(step)) errors.push(`missing mandatory step: ${step}`);
for (const invariant of requiredCore) if (!c.core_invariants?.includes(invariant)) errors.push(`missing core invariant: ${invariant}`);
if (c.non_bypass?.tracks_a_to_e_may_bypass_track_z !== false) errors.push('A-E bypass must be false');
if (c.non_bypass?.asi_may_bypass_track_z !== false) errors.push('ASI bypass must be false');
if (c.non_bypass?.kpmo_report_may_be_skipped !== false) errors.push('KPMO report bypass must be false');
if (c.non_bypass?.founder_report_may_be_skipped !== false) errors.push('Founder report bypass must be false');
for (const key of ['missing_company_product_analysis','missing_latest_thread_when_replying','unknown_or_conflicting_rights','unapproved_contract_eula_spend_or_credential','production_or_g5_without_explicit_approval']) {
  if (!c.fail_closed_rules?.[key]) errors.push(`missing fail-closed rule: ${key}`);
}

if (errors.length) {
  console.error(JSON.stringify({ suite: 'TRACK_Z_PROVIDER_INTAKE_ROUTING_V1', result: 'FAIL', errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  suite: 'TRACK_Z_PROVIDER_INTAKE_ROUTING_V1',
  result: 'PASS',
  owner: c.owner,
  reporting_chain: c.reporting_chain,
  mandatory_steps: c.mandatory_sequence.length,
  bypass_paths: 0
}, null, 2));
