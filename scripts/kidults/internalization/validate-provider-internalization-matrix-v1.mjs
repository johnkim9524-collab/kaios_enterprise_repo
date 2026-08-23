import fs from 'node:fs';

const m = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-internalization-matrix-v1.json','utf8'));
const errs = [];

if (m.matrix_id !== 'KIDULTS_PROVIDER_INTERNALIZATION_MATRIX_V1') errs.push('invalid matrix id');
if (!Array.isArray(m.providers) || m.providers.length < 7) errs.push('expected at least 7 provider records');

for (const p of m.providers || []) {
  if (!p.provider_id) errs.push('provider_id required');
  if (!p.portfolio_priority) errs.push(`${p.provider_id}: portfolio_priority required`);
  if (!p.role) errs.push(`${p.provider_id}: role required`);
  if (!p.rights_state) errs.push(`${p.provider_id}: rights_state required`);
  if (!Array.isArray(p.external_fact)) errs.push(`${p.provider_id}: external_fact array required`);
  if (!Array.isArray(p.internalize_now)) errs.push(`${p.provider_id}: internalize_now array required`);
  if (!Array.isArray(p.prohibited_dependency) || p.prohibited_dependency.length === 0) errs.push(`${p.provider_id}: prohibited_dependency required`);
}

const rules = m.global_rules || {};
if (rules.provider_direct_to_portal !== false) errs.push('provider direct to portal must be false');
if (rules.provider_direct_to_index !== false) errs.push('provider direct to index must be false');
if (rules.provider_id_may_be_canonical !== false) errs.push('provider id canonical promotion must be false');
if (rules.provider_score_may_be_kidults_score !== false) errs.push('provider score promotion must be false');
if (rules.unknown_rights_may_activate !== false) errs.push('unknown rights activation must be false');
if (rules.external_fact_priority_over_internalizable_convenience !== true) errs.push('external fact priority rule missing');

if (m.non_bypass?.spend !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('spend boundary drift');
if (m.non_bypass?.contract !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('contract boundary drift');
if (m.non_bypass?.credential_activation !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('credential boundary drift');
if (m.non_bypass?.production !== 'HOLD') errs.push('production boundary drift');
if (m.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('g5 boundary drift');

if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_PROVIDER_INTERNALIZATION_MATRIX_V1',
  result: 'PASS',
  providers: m.providers.length,
  tier1_or_candidate_count: m.providers.filter(p => String(p.portfolio_priority).includes('TIER_1')).length,
  unknown_rights_activation: false,
  production: m.non_bypass.production,
  g5: m.non_bypass.g5
}, null, 2));
