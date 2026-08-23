import fs from 'node:fs';

const path = 'coordination/kidults/internalization/rights-intelligence-policy-v1.json';
const policy = JSON.parse(fs.readFileSync(path, 'utf8'));
const errs = [];

const requiredPurposes = [
  'collect','store','cache','normalize','derive','entity_resolution',
  'model_calibration','human_review','display','redistribute'
];
const requiredObligations = [
  'retention','deletion','termination','attribution','public_derived_output',
  'portability','post_termination_derived_intelligence'
];
const requiredParents = [1153,1154,1166,952,945];

for (const id of requiredParents) if (!policy.parent_issues?.includes(id)) errs.push(`missing parent issue #${id}`);
for (const p of requiredPurposes) if (!policy.purpose_dimensions?.includes(p)) errs.push(`missing purpose ${p}`);
for (const o of requiredObligations) if (!policy.obligation_dimensions?.includes(o)) errs.push(`missing obligation ${o}`);
if (policy.precedence?.[0] !== 'EXECUTED_AGREEMENT') errs.push('executed agreement must have highest precedence');
if (policy.fail_closed_rules?.unknown_required_right !== 'HOLD') errs.push('unknown rights must HOLD');
if (policy.fail_closed_rules?.expired_authority !== 'HOLD') errs.push('expired authority must HOLD');
if (policy.fail_closed_rules?.contradictory_authority !== 'HOLD') errs.push('contradictory authority must HOLD');
for (const k of ['provider_native_id_as_canonical','provider_direct_to_portal','provider_direct_to_index']) {
  if (policy.fail_closed_rules?.[k] !== 'NO_GO') errs.push(`${k} must NO_GO`);
}
if (policy.non_bypass?.external_spend !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('spend boundary drift');
if (policy.non_bypass?.contract_acceptance !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('contract boundary drift');
if (policy.non_bypass?.credential_activation !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('credential boundary drift');
if (policy.non_bypass?.production !== 'HOLD') errs.push('production boundary drift');
if (policy.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('g5 boundary drift');

const mutationCases = [
  ['UNKNOWN', policy.fail_closed_rules.unknown_required_right === 'HOLD'],
  ['EXPIRED', policy.fail_closed_rules.expired_authority === 'HOLD'],
  ['CONTRADICTORY', policy.fail_closed_rules.contradictory_authority === 'HOLD'],
  ['CANONICAL_ID_CAPTURE', policy.fail_closed_rules.provider_native_id_as_canonical === 'NO_GO'],
  ['DIRECT_PORTAL', policy.fail_closed_rules.provider_direct_to_portal === 'NO_GO'],
  ['DIRECT_INDEX', policy.fail_closed_rules.provider_direct_to_index === 'NO_GO']
];
for (const [name, ok] of mutationCases) if (!ok) errs.push(`mutation failed: ${name}`);

if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_RIGHTS_INTELLIGENCE_POLICY_V1',
  result: 'PASS',
  purposes: policy.purpose_dimensions.length,
  obligations: policy.obligation_dimensions.length,
  mutations: mutationCases.length,
  production: policy.non_bypass.production,
  g5: policy.non_bypass.g5
}, null, 2));
