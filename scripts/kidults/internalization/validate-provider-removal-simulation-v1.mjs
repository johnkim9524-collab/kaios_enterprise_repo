import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-removal-simulation-contract-v1.json','utf8'));
const errs = [];

if (c.contract_id !== 'KIDULTS_PROVIDER_REMOVAL_SIMULATION_V1') errs.push('invalid contract id');

for (const p of [
  'canonical_identity_continuity',
  'normalization_continuity',
  'methodology_continuity',
  'confidence_provenance_continuity',
  'historical_learning_continuity',
  'downstream_contract_continuity',
  'provider_adapter_replaceability'
]) {
  if (!c.required_continuity_invariants?.includes(p)) errs.push(`missing continuity invariant ${p}`);
}

for (const p of [
  'provider_native_id_as_canonical',
  'provider_taxonomy_as_canonical_ontology',
  'provider_score_as_kidults_score',
  'provider_direct_to_portal',
  'provider_direct_to_index',
  'single_provider_global_truth'
]) {
  if (!c.prohibited_dependencies?.includes(p)) errs.push(`missing prohibited dependency ${p}`);
}

for (const p of [
  'canonical_id_changes_when_provider_removed',
  'downstream_schema_requires_provider_native_fields',
  'methodology_cannot_replay_without_provider_payload',
  'legally_retainable_history_is_lost_on_provider_exit',
  'replacement_requires_product_rewrite'
]) {
  if (!c.fail_conditions?.includes(p)) errs.push(`missing fail condition ${p}`);
}

if (!c.decision_states?.includes('NO_GO_DEPENDENCY')) errs.push('NO_GO dependency state missing');
if (c.non_bypass?.production !== 'HOLD') errs.push('production boundary drift');
if (c.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('g5 boundary drift');
if (c.non_bypass?.external_spend !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('spend boundary drift');
if (c.non_bypass?.contract_acceptance !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('contract boundary drift');
if (c.non_bypass?.credential_activation !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('credential boundary drift');

if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_PROVIDER_REMOVAL_SIMULATION_V1',
  result: 'PASS',
  continuity_invariants: c.required_continuity_invariants.length,
  prohibited_dependencies: c.prohibited_dependencies.length,
  fail_conditions: c.fail_conditions.length,
  production: c.non_bypass.production,
  g5: c.non_bypass.g5
}, null, 2));
