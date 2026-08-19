import fs from 'node:fs';

const admission = JSON.parse(fs.readFileSync('coordination/kidults/source-intelligence/collectaio-shadow-sold-admission-r1.json','utf8'));
const fixture = JSON.parse(fs.readFileSync('coordination/kidults/engine-v2/fixtures/foundation-preflight-input-v1.json','utf8'));

const errors = [];
const req = (ok, code) => { if (!ok) errors.push(code); };
req(admission.status === 'ADMITTED_SHADOW_INTERNAL_ONLY','STATUS_NOT_SHADOW_ONLY');
req(admission.execution_mode === 'DEV_SHADOW_ONLY','EXECUTION_MODE_NOT_DEV_SHADOW');
req(admission.freshness_policy.max_observation_age_days === fixture.freshness_max_age_days,'FRESHNESS_POLICY_DRIFT');
req(admission.admitted_cell.latest_event_age_days_at_probe <= admission.freshness_policy.max_observation_age_days,'STALE_FOR_SHADOW_CEILING');
req(admission.admitted_cell.identity_state === 'EXACT_MATCH','IDENTITY_NOT_EXACT');
req(admission.admitted_cell.provider_market_state === 'sold','NOT_PROVIDER_MARKED_SOLD');
req(admission.admitted_cell.admitted_evidence_class === 'DATED_OBSERVED_SOLD_TRANSACTION','EVIDENCE_CLASS_TOO_STRONG');
req(admission.purpose_specific_rights.display_public.startsWith('BLOCKED'),'PUBLIC_DISPLAY_NOT_BLOCKED');
req(admission.purpose_specific_rights.raw_redistribution === 'BLOCKED','RAW_REDISTRIBUTION_NOT_BLOCKED');
req(admission.prohibited_claims.includes('CURRENT_PRICE'),'CURRENT_PRICE_NOT_BLOCKED');
req(admission.prohibited_claims.includes('LIQUIDITY'),'LIQUIDITY_NOT_BLOCKED');
req(admission.prohibited_claims.includes('TIME_TO_SALE'),'TIME_TO_SALE_NOT_BLOCKED');
req(admission.admission_decision.public_or_commercial_projection === 'HOLD','PUBLIC_PROJECTION_NOT_HOLD');
req(admission.admission_decision.production === 'HOLD','PRODUCTION_NOT_HOLD');

if (errors.length) {
  console.error(JSON.stringify({status:'FAIL', errors}, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  status:'PASS',
  source:admission.source.provider_id,
  cell:admission.admitted_cell.anchor,
  evidence_class:admission.admitted_cell.admitted_evidence_class,
  shadow_freshness_age_days:admission.admitted_cell.latest_event_age_days_at_probe,
  shadow_freshness_ceiling_days:admission.freshness_policy.max_observation_age_days,
  current_price:false,
  public_projection:false,
  production:'HOLD'
}, null, 2));
