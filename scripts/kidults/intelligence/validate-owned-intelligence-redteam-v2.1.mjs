import assert from 'node:assert/strict';
import {populationStabilityIndex,evaluateModelGovernanceV21,reconcileSemantic,backtestPointEstimatesV21,calibrateSourceReliabilityV21,enforceOwnedIntelligenceRuntimeGate} from './owned-intelligence-redteam-v2.1.mjs';

const base=Array.from({length:100},(_,i)=>100+i); const stable=Array.from({length:100},(_,i)=>101+i); const shifted=Array.from({length:100},(_,i)=>180+i);
const psi=populationStabilityIndex(base,stable); assert.equal(psi.state,'COMPUTED'); assert.ok(Number.isFinite(psi.psi));
assert.equal(populationStabilityIndex([1,2,3],[1,2,3]).state,'HOLD_DRIFT_SAMPLE_OR_CONFIG_INVALID');
assert.equal(evaluateModelGovernanceV21({champion:{version:'c',error:.2},challenger:{version:'x',error:.1},baseline:base,current:shifted}).state,'HOLD_MODEL_DRIFT');
assert.equal(evaluateModelGovernanceV21({champion:{version:'c'},challenger:{version:'x'},baseline:base,current:stable,thresholds:{psi:-1,mean_shift:.1,error_delta:.1}}).state,'HOLD_INVALID_THRESHOLDS');

const ev=(id,amount,type='HAMMER',date='2026-08-20T10:00:00Z',venue='RM Sothebys')=>({physical_object_id:'VIN1234567890',venue_id:venue,event_at:date,event_state:'SOLD',price:{amount,currency:'USD',price_type:type},lineage:{source_family_id:id}});
let r=reconcileSemantic([ev('a',100000),ev('b',100500)]); assert.equal(r[0].state,'TOLERANCE_MATCH');
r=reconcileSemantic([ev('a',100000,'HAMMER'),ev('b',112000,'ALL_IN')]); assert.equal(r[0].state,'TOLERANCE_MATCH'); assert.equal(r[0].price_semantic_difference,true);
r=reconcileSemantic([ev('a',100000),ev('b',120000)]); assert.equal(r[0].state,'CONFLICT_QUARANTINE');
assert.equal(reconcileSemantic([ev('a',100000,'HAMMER','bad-date')])[0].state,'HOLD_INVALID_DATE');
assert.equal(reconcileSemantic([ev('a',1)],{priceTolerancePct:-1})[0].state,'HOLD_INVALID_RECONCILIATION_CONFIG');

const holdout=Array.from({length:40},(_,i)=>({case_id:`c${i}`,source_owner:i%2?'A':'B',predicted:100+i,actual:102+i,trained_through:'2026-01-01T00:00:00Z',target_at:'2026-07-01T00:00:00Z'}));
const bt=backtestPointEstimatesV21([...holdout,holdout[0],holdout[0]]); assert.equal(bt.state,'BACKTEST_PASS'); assert.equal(bt.n,40); assert.equal(bt.source_owner_count,2);
assert.equal(backtestPointEstimatesV21(holdout.map(x=>({...x,target_at:'2025-01-01T00:00:00Z'}))).state,'HOLD_TEMPORAL_LEAKAGE');
assert.equal(backtestPointEstimatesV21(holdout.slice(0,5)).state,'NOT_COMPUTABLE_INSUFFICIENT_HOLDOUT');

const cal=[]; for(const source of ['A','B']) for(let i=0;i<40;i++) cal.push({case_id:`${source}${i}`,source_owner:source,predicted_score:i%2?.8:.2,observed_correct:i%2?1:0});
const c=calibrateSourceReliabilityV21(cal); assert.ok(c.every(x=>x.state==='CALIBRATED_BOUNDED')); assert.ok(c.every(x=>x.brier_score>=0&&x.expected_calibration_error>=0));
const badCal=calibrateSourceReliabilityV21([{source_owner:'A',predicted_score:1.2,observed_correct:1}]); assert.deepEqual(badCal,[]);

const gate=enforceOwnedIntelligenceRuntimeGate({reconciliation:[{state:'TOLERANCE_MATCH'}],valuationBacktest:{state:'BACKTEST_PASS'},liquidityBacktest:{state:'BACKTEST_PASS'},sourceCalibration:c,modelGovernance:{state:'GOVERNED_SHADOW_READY'}}); assert.equal(gate.state,'ALLOW_SHADOW_ONLY'); assert.equal(gate.asi_factor_mutation,false); assert.equal(gate.candidate_promotion,false);
const held=enforceOwnedIntelligenceRuntimeGate({reconciliation:[{state:'CONFLICT_QUARANTINE'}],valuationBacktest:{state:'BACKTEST_FAIL'},liquidityBacktest:{state:'BACKTEST_PASS'},sourceCalibration:c,modelGovernance:{state:'GOVERNED_SHADOW_READY'}}); assert.equal(held.state,'HOLD'); assert.ok(held.reasons.includes('RECONCILIATION_NOT_CLEAR'));
console.log(JSON.stringify({status:'PASS',controls:{true_psi:'PASS',invalid_threshold_fail_closed:'PASS',invalid_date_fail_closed:'PASS',price_semantics:'PASS',holdout_dedupe:'PASS',temporal_leakage:'PASS',min_sample_source_owners:'PASS',brier_ece:'PASS',runtime_binding:'PASS'}},null,2));
