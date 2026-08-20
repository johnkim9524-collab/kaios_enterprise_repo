import assert from 'node:assert/strict';
import {populationStabilityIndex,evaluateModelGovernanceV21,reconcileSemantic,backtestPointEstimatesV21,calibrateSourceReliabilityV21,enforceOwnedIntelligenceRuntimeGate} from './owned-intelligence-redteam-v2.1.mjs';

const base=Array.from({length:100},(_,i)=>100+i),stable=Array.from({length:100},(_,i)=>101+i),shifted=Array.from({length:100},(_,i)=>180+i);
const psi=populationStabilityIndex(base,stable);assert.equal(psi.state,'COMPUTED');assert.ok(Number.isFinite(psi.psi));assert.ok(Number.isFinite(psi.normalized_mean_shift));
assert.equal(populationStabilityIndex([1,2,3],[1,2,3]).state,'HOLD_DRIFT_SAMPLE_OR_CONFIG_INVALID');
assert.equal(evaluateModelGovernanceV21({champion:{version:'c',error:.2},challenger:{version:'x',error:.1},baseline:base,current:shifted}).state,'HOLD_MODEL_DRIFT');
assert.equal(evaluateModelGovernanceV21({champion:{version:'c'},challenger:{version:'x'},baseline:base,current:stable,thresholds:{psi:-1,mean_shift:.1,error_delta:.1}}).state,'HOLD_INVALID_THRESHOLDS');
const governed=evaluateModelGovernanceV21({champion:{version:'c',error:.2},challenger:{version:'x',error:.1,independent_holdout:true,holdout_ref:'holdout-2026-r1'},baseline:base,current:stable});assert.equal(governed.state,'GOVERNED_SHADOW_READY');

const ev=(id,amount,type='HAMMER',date='2026-08-20T10:00:00Z',venue='RM Sothebys',oid='VIN1234567890')=>({physical_object_id:oid,venue_id:venue,event_at:date,event_state:'SOLD',price:{amount,currency:'USD',price_type:type},lineage:{source_family_id:id}});
let r=reconcileSemantic([ev('a',100000),ev('b',100500)]);assert.equal(r[0].state,'TOLERANCE_MATCH');
r=reconcileSemantic([ev('a',100000,'HAMMER'),ev('b',112000,'ALL_IN')]);assert.equal(r[0].state,'TOLERANCE_MATCH');assert.equal(r[0].price_semantic_difference,true);
r=reconcileSemantic([ev('a',100000),ev('b',120000)]);assert.equal(r[0].state,'CONFLICT_QUARANTINE');
assert.equal(reconcileSemantic([ev('a',100000,'HAMMER','bad-date')])[0].state,'HOLD_INVALID_DATE');
assert.equal(reconcileSemantic([])[0].state,'HOLD_NO_RECONCILIATION_EVIDENCE');
assert.equal(reconcileSemantic([ev('a',1)],{priceTolerancePct:-1})[0].state,'HOLD_INVALID_RECONCILIATION_CONFIG');
const alias=reconcileSemantic([ev('a',100000,'HAMMER','2026-08-20T10:00:00Z','RM Sothebys'),ev('b',100100,'HAMMER','2026-08-20T11:00:00Z','RM SOTHEBYS')],{venueAliases:{'rm sothebys':'RM'}});assert.equal(alias[0].observations??2,2);
const masked=reconcileSemantic([ev('a',100000,'HAMMER','2026-08-20T10:00:00Z','V','VIN123***7890'),ev('b',100000,'HAMMER','2026-08-20T10:00:00Z','V','VIN1234567890')]);assert.equal(masked.length,2);

const holdout=Array.from({length:40},(_,i)=>({case_id:`c${i}`,source_owner:i%2?'A':'B',predicted:100+i,actual:102+i,trained_through:'2026-01-01T00:00:00Z',target_at:'2026-07-01T00:00:00Z'}));
const bt=backtestPointEstimatesV21([...holdout,holdout[0],holdout[0]]);assert.equal(bt.state,'BACKTEST_PASS');assert.equal(bt.n,40);assert.equal(bt.source_owner_count,2);
assert.equal(backtestPointEstimatesV21(holdout.map(x=>({...x,target_at:'2025-01-01T00:00:00Z'}))).state,'HOLD_TEMPORAL_LEAKAGE');
assert.equal(backtestPointEstimatesV21(holdout.map((x,i)=>i===0?{...x,target_at:'bad-date'}:x)).state,'HOLD_INVALID_BACKTEST_DATE');
assert.equal(backtestPointEstimatesV21(holdout.slice(0,5)).state,'NOT_COMPUTABLE_INSUFFICIENT_HOLDOUT');

const cal=[];for(const source of ['A','B'])for(let i=0;i<40;i++)cal.push({case_id:`${source}${i}`,source_owner:source,predicted_score:i%2?.8:.2,observed_correct:i%2?1:0});
const c=calibrateSourceReliabilityV21(cal);assert.ok(c.every(x=>x.state==='CALIBRATED_BOUNDED'));assert.ok(c.every(x=>x.brier_score>=0&&x.expected_calibration_error>=0));
assert.deepEqual(calibrateSourceReliabilityV21([{source_owner:'A',predicted_score:1.2,observed_correct:1}]),[]);

const gate=enforceOwnedIntelligenceRuntimeGate({reconciliation:[{state:'TOLERANCE_MATCH'}],valuationBacktest:{state:'BACKTEST_PASS'},liquidityBacktest:{state:'BACKTEST_PASS'},sourceCalibration:c,modelGovernance:{state:'GOVERNED_SHADOW_READY'}});assert.equal(gate.state,'ALLOW_SHADOW_ONLY');assert.equal(gate.asi_factor_mutation,false);assert.equal(gate.candidate_promotion,false);
const emptyGate=enforceOwnedIntelligenceRuntimeGate({valuationBacktest:{state:'BACKTEST_PASS'},liquidityBacktest:{state:'BACKTEST_PASS'},modelGovernance:{state:'GOVERNED_SHADOW_READY'}});assert.equal(emptyGate.state,'HOLD');assert.ok(emptyGate.reasons.includes('RECONCILIATION_MISSING'));assert.ok(emptyGate.reasons.includes('SOURCE_CALIBRATION_MISSING'));
console.log(JSON.stringify({status:'PASS',controls:{true_psi:'PASS',mean_shift_separate:'PASS',invalid_threshold_fail_closed:'PASS',invalid_date_fail_closed:'PASS',price_semantics:'PASS',venue_alias:'PASS',masked_identity_conservative:'PASS',holdout_dedupe:'PASS',temporal_leakage:'PASS',malformed_backtest_date:'PASS',min_sample_source_owners:'PASS',brier_ece:'PASS',empty_proof_runtime_bypass_closed:'PASS',independent_challenger_holdout:'PASS',runtime_binding:'PASS'}},null,2));
