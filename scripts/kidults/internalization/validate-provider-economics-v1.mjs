import fs from 'node:fs';

const path = 'coordination/kidults/internalization/provider-economics-contract-v1.json';
const contract = JSON.parse(fs.readFileSync(path, 'utf8'));
const errs = [];

const requiredMetrics = [
  'cost_per_admitted_record','cost_per_validated_object','cost_per_useful_market_event',
  'incremental_coverage_value','freshness_value','historical_depth_value',
  'duplicate_overlap_cost','internal_engineering_cost_avoided','concentration_penalty',
  'switching_cost','annualized_scale_cost'
];
for (const m of requiredMetrics) if (!contract.unit_metrics?.includes(m)) errs.push(`missing metric ${m}`);
if (contract.unknown_policy !== 'UNKNOWN_NOT_ZERO') errs.push('unknown must not be zero');
if (contract.priority_rules?.list_price_alone_may_rank_provider !== false) errs.push('list price alone must not rank provider');
if (contract.priority_rules?.unknown_cost_may_be_treated_as_zero !== false) errs.push('unknown cost cannot be zero');
if (contract.priority_rules?.provider_marketing_may_define_roi !== false) errs.push('marketing cannot define ROI');
if (contract.priority_rules?.authoritative_external_fact_bonus !== true) errs.push('authoritative fact priority missing');
if (contract.priority_rules?.internalizable_feature_penalty !== true) errs.push('internalizable feature penalty missing');
if (contract.priority_rules?.single_provider_concentration_penalty !== true) errs.push('concentration penalty missing');
for (const d of ['MAKE','BUY','PARTNER','FALLBACK','DOWNGRADE','REPLACE','HOLD']) {
  if (!contract.decision_outputs?.includes(d)) errs.push(`missing decision ${d}`);
}
if (contract.non_bypass?.spend !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('spend boundary drift');
if (contract.non_bypass?.contract !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('contract boundary drift');
if (contract.non_bypass?.production !== 'HOLD') errs.push('production boundary drift');
if (contract.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('g5 boundary drift');

const fixtures = [
  {provider:'AUTHORITATIVE_FACT_SOURCE', unique:1.0, internalizable:0.0, concentration:0.2, expected:'PARTNER'},
  {provider:'INTERNALIZABLE_DASHBOARD', unique:0.1, internalizable:0.9, concentration:0.4, expected:'MAKE'},
  {provider:'UNKNOWN_RIGHTS_OR_COST', unique:null, internalizable:null, concentration:null, expected:'HOLD'}
];

function recommend(f) {
  if ([f.unique, f.internalizable, f.concentration].some(v => v === null)) return 'HOLD';
  if (f.internalizable >= 0.7 && f.unique < 0.5) return 'MAKE';
  if (f.unique >= 0.7) return 'PARTNER';
  return 'FALLBACK';
}
for (const f of fixtures) {
  const got = recommend(f);
  if (got !== f.expected) errs.push(`${f.provider}: expected ${f.expected}, got ${got}`);
}

if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  suite:'KIDULTS_PROVIDER_ECONOMICS_V1',
  result:'PASS',
  metrics:contract.unit_metrics.length,
  fixtures:fixtures.length,
  policy:contract.unknown_policy,
  production:contract.non_bypass.production,
  g5:contract.non_bypass.g5
}, null, 2));
