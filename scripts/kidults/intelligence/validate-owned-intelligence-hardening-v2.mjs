import assert from 'node:assert/strict';
import {
  reconcileAdversarial,
  backtestPointEstimates,
  backtestLiquidity,
  calibrateSourceReliability,
  validateVerticalCompatibility,
  evaluateModelGovernance
} from './owned-intelligence-hardening-v2.mjs';

const baseEvent = (source, id, amount, eventAt='2026-08-20T12:00:00Z', state='SOLD') => ({
  market_event_id:id,
  physical_object_id:'VIN-TEST-001',
  canonical_entity_id:'vehicle:test:1',
  venue_id:'RM-SOTHEBYS',
  event_at:eventAt,
  event_state:state,
  price:{amount,currency:'USD'},
  lineage:{source_family_id:source}
});

const nearA=baseEvent('SOURCE_A','a',100000,'2026-08-20T12:00:00Z');
const nearB=baseEvent('SOURCE_B','b',100500,'2026-08-21T08:00:00Z');
const matched=reconcileAdversarial([nearA,nearB]);
assert.equal(matched.length,1);
assert.equal(matched[0].state,'TOLERANCE_MATCH');
assert.equal(matched[0].source_owner_count,2);

const badPrice=baseEvent('SOURCE_B','c',120000,'2026-08-20T13:00:00Z');
const conflict=reconcileAdversarial([nearA,badPrice]);
assert.equal(conflict[0].state,'CONFLICT_QUARANTINE');
assert.ok(conflict[0].reasons.includes('PRICE_CONFLICT'));

const badState=baseEvent('SOURCE_B','d',100000,'2026-08-20T13:00:00Z','WITHDRAWN');
const stateConflict=reconcileAdversarial([nearA,badState]);
assert.equal(stateConflict[0].state,'CONFLICT_QUARANTINE');
assert.ok(stateConflict[0].reasons.includes('STATE_CONFLICT'));

const valuationPass=backtestPointEstimates([
  {predicted:100,actual:105},{predicted:200,actual:190},{predicted:300,actual:310},{predicted:400,actual:390}
]);
assert.equal(valuationPass.state,'BACKTEST_PASS');
assert.equal(valuationPass.claim_ceiling,'INTERNAL_BACKTEST_ONLY_NOT_LIVE_MARKET_FACT');
const valuationFail=backtestPointEstimates([{predicted:100,actual:200},{predicted:100,actual:200},{predicted:100,actual:200}]);
assert.equal(valuationFail.state,'BACKTEST_FAIL');

const liquidityPass=backtestLiquidity([
  {predicted:'LIQUID',actual:'LIQUID'},{predicted:'LIQUID',actual:'LIQUID'},
  {predicted:'ILLIQUID',actual:'ILLIQUID'},{predicted:'ILLIQUID',actual:'ILLIQUID'},
  {predicted:'LIQUID',actual:'ILLIQUID'}
]);
assert.equal(liquidityPass.state,'BACKTEST_PASS');

const calibration=calibrateSourceReliability([
  ...Array.from({length:5},()=>({source_owner:'A',predicted_score:0.9,observed_correct:1})),
  ...Array.from({length:2},()=>({source_owner:'B',predicted_score:0.9,observed_correct:1}))
]);
assert.equal(calibration.find(x=>x.source_owner==='A').state,'CALIBRATED_BOUNDED');
assert.equal(calibration.find(x=>x.source_owner==='A').live_weight_mutation,false);
assert.equal(calibration.find(x=>x.source_owner==='B').state,'INSUFFICIENT_SAMPLE');

const verticalFixtures={
  TRADING_CARD:{canonical_entity_id:'card:1',grade_or_condition:'9',source_owner:'G'},
  COLLECTOR_CAR:{canonical_entity_id:'car:1',event_at:'2026-01-01',venue_id:'V',price:1,source_owner:'S'},
  WATCH:{canonical_entity_id:'watch:1',reference_or_serial:'REF',condition:'GOOD',source_owner:'S'},
  SNEAKER:{canonical_entity_id:'shoe:1',size_or_variant:'US9',condition:'NEW',source_owner:'S'},
  ART_TOY:{canonical_entity_id:'toy:1',edition_or_variant:'100/500',condition:'GOOD',source_owner:'S'},
  WINE:{canonical_entity_id:'wine:1',vintage:'2010',bottle_or_lot_condition:'GOOD',source_owner:'S'},
  DESIGN_OBJECT:{canonical_entity_id:'design:1',maker_or_designer:'D',edition_or_provenance:'E',source_owner:'S'},
  VINYL:{canonical_entity_id:'vinyl:1',pressing_or_matrix:'MATRIX',condition:'NM',source_owner:'S'}
};
for (const [vertical,fixture] of Object.entries(verticalFixtures)) {
  assert.equal(validateVerticalCompatibility(vertical,fixture).state,'COMPATIBLE_CONTRACT');
}
assert.equal(validateVerticalCompatibility('WATCH',{canonical_entity_id:'x'}).state,'HOLD_MISSING_VERTICAL_DIMENSIONS');

const governed=evaluateModelGovernance({
  champion:{version:'v1',error:0.12},challenger:{version:'v2',error:0.05},
  baseline:[100,101,99,100],current:[102,101,100,103],thresholds:{psi:0.2,error_delta:0.05}
});
assert.equal(governed.state,'GOVERNED_SHADOW_READY');
assert.equal(governed.challenger_promotable,true);
assert.equal(governed.live_auto_promotion,false);
const drift=evaluateModelGovernance({
  champion:{version:'v1',error:0.1},challenger:{version:'v2',error:0.05},
  baseline:[100,100,100],current:[150,150,150]
});
assert.equal(drift.state,'HOLD_MODEL_DRIFT');

console.log(JSON.stringify({
  status:'PASS',
  hardening:{
    adversarial_reconciliation:'PASS',
    valuation_backtest_framework:'PASS',
    liquidity_backtest_framework:'PASS',
    source_reliability_calibration:'PASS',
    cross_vertical_compatibility_8_verticals:'PASS',
    model_governance_and_drift:'PASS'
  },
  safeguards:{
    tolerance_does_not_hide_true_conflict:'PASS',
    backtest_not_live_fact:'PASS',
    uncalibrated_source_cannot_mutate_live_weights:'PASS',
    model_drift_holds:'PASS',
    auto_model_promotion:false,
    production:'HOLD'
  }
},null,2));
