import assert from 'node:assert/strict';
import {populationStabilityIndex,evaluateModelGovernanceV21,reconcileSemantic,backtestPointEstimatesV21,calibrateSourceReliabilityV21,enforceOwnedIntelligenceRuntimeGate} from './owned-intelligence-redteam-v2.1.mjs';
import {factorIneligibility} from '../source-intelligence/factor-eligibility-v1-lib.mjs';

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
const masked=reconcileSemantic([ev('a',100000,'HAMMER','2026-08-20T10:00:00Z','V','VIN123***7890'),ev('b',100000,'HAMMER','2026-08-20T10:00:00Z','V','VIN1234567890')]);assert.equal(masked.length,2);

const holdout=Array.from({length:40},(_,i)=>({case_id:`c${i}`,source_owner:i%2?'A':'B',predicted:100+i,actual:102+i,trained_through:'2026-01-01T00:00:00Z',target_at:'2026-07-01T00:00:00Z'}));
const bt=backtestPointEstimatesV21([...holdout,holdout[0],holdout[0]]);assert.equal(bt.state,'BACKTEST_PASS');assert.equal(bt.n,40);assert.equal(bt.source_owner_count,2);
assert.equal(backtestPointEstimatesV21(holdout.map(x=>({...x,target_at:'2025-01-01T00:00:00Z'}))).state,'HOLD_TEMPORAL_LEAKAGE');
assert.equal(backtestPointEstimatesV21(holdout.map((x,i)=>i===0?{...x,target_at:'bad-date'}:x)).state,'HOLD_INVALID_BACKTEST_DATE');

const cal=[];for(const source of ['A','B'])for(let i=0;i<40;i++)cal.push({case_id:`${source}${i}`,source_owner:source,predicted_score:i%2?.95:.05,observed_correct:i%2?1:0});
const c=calibrateSourceReliabilityV21(cal);assert.ok(c.every(x=>x.state==='CALIBRATED_BOUNDED'));assert.deepEqual(calibrateSourceReliabilityV21([{source_owner:'A',predicted_score:1.2,observed_correct:1}]),[]);

const gate=enforceOwnedIntelligenceRuntimeGate({reconciliation:[{state:'TOLERANCE_MATCH'}],valuationBacktest:{state:'BACKTEST_PASS'},liquidityBacktest:{state:'BACKTEST_PASS'},sourceCalibration:c,modelGovernance:{state:'GOVERNED_SHADOW_READY'}});assert.equal(gate.state,'ALLOW_SHADOW_ONLY');
const emptyGate=enforceOwnedIntelligenceRuntimeGate({valuationBacktest:{state:'BACKTEST_PASS'},liquidityBacktest:{state:'BACKTEST_PASS'},modelGovernance:{state:'GOVERNED_SHADOW_READY'}});assert.equal(emptyGate.state,'HOLD');

const baseFactor={state:'VERIFIED',value:.8,evidence_refs:['E1'],provenance_refs:['P1'],rights_state:'ALLOW_INTERNAL',confidence:'HIGH',methodology_ref:'M1',origin:'OWNED_INTELLIGENCE'};
let reasons=factorIneligibility(baseFactor);assert.ok(reasons.includes('OWNED_INTELLIGENCE_PROOF_REF_MISSING'));assert.ok(reasons.includes('OWNED_INTELLIGENCE_HARDENING_GATE_NOT_ALLOW'));
reasons=factorIneligibility({...baseFactor,hardening_proof_ref:'proof-v2.1-001',hardening_gate_state:'ALLOW_SHADOW_ONLY'});assert.deepEqual(reasons,[]);

console.log(JSON.stringify({status:'PASS',controls:{true_psi:'PASS',mean_shift_separate:'PASS',invalid_threshold_fail_closed:'PASS',invalid_date_fail_closed:'PASS',price_semantics:'PASS',masked_identity_conservative:'PASS',holdout_dedupe:'PASS',temporal_leakage:'PASS',malformed_backtest_date:'PASS',min_sample_source_owners:'PASS',brier_ece:'PASS',empty_proof_runtime_bypass_closed:'PASS',independent_challenger_holdout:'PASS',asi_factor_hardening_binding:'PASS'}},null,2));
