import assert from 'node:assert/strict';
import {buildHardeningReceiptV22,strictBacktestV22,strictCalibrationV22,strictLiquidityBacktestV22,reconcileGovernedV22} from './owned-intelligence-redteam-v2.2.mjs';
import {factorIneligibility} from '../source-intelligence/factor-eligibility-v1-lib.mjs';

const rows=Array.from({length:40},(_,i)=>({case_id:`b${i}`,source_owner:i%2?'A':'B',predicted:100+i,actual:101+i,trained_through:'2026-01-01T00:00:00Z',target_at:'2026-07-01T00:00:00Z'}));
assert.equal(strictBacktestV22(rows).state,'BACKTEST_PASS');
assert.equal(strictBacktestV22([...rows,{case_id:'bad',source_owner:'A',predicted:'x',actual:1,trained_through:'2026-01-01T00:00:00Z',target_at:'2026-07-01T00:00:00Z'}]).state,'HOLD_INVALID_BACKTEST_ROW');
assert.equal(strictBacktestV22([...rows,{...rows[0],predicted:999}]).state,'HOLD_DUPLICATE_BACKTEST_CASE_CONFLICT');

const cal=[];for(const s of ['A','B'])for(let i=0;i<40;i++)cal.push({case_id:`${s}-${i}`,source_owner:s,predicted_score:i%2?.95:.05,observed_correct:i%2?1:0});
assert.ok(strictCalibrationV22(cal).every(x=>x.state==='CALIBRATED_BOUNDED'));
assert.equal(strictCalibrationV22([...cal,{case_id:'bad',source_owner:'A',predicted_score:1.5,observed_correct:1}])[0].state,'HOLD_INVALID_CALIBRATION_ROW');
assert.equal(strictCalibrationV22([...cal,{...cal[0],observed_correct:1}])[0].state,'HOLD_DUPLICATE_CALIBRATION_CASE_CONFLICT');

const liq=Array.from({length:40},(_,i)=>({case_id:`l${i}`,source_owner:i%2?'A':'B',actual:i<20?'LIQUID':'ILLIQUID',predicted:i<20?'LIQUID':'ILLIQUID'}));
assert.equal(strictLiquidityBacktestV22(liq).state,'BACKTEST_PASS');
assert.equal(strictLiquidityBacktestV22(liq.filter(x=>x.actual==='LIQUID')).state,'NOT_COMPUTABLE_INSUFFICIENT_STRATIFIED_HOLDOUT');
assert.equal(strictLiquidityBacktestV22([...liq,{...liq[0],predicted:'ILLIQUID'}]).state,'HOLD_DUPLICATE_LIQUIDITY_CASE_CONFLICT');

const ev=(source,id,venue='RM Sothebys',date='2026-08-20T10:00:00Z',state='SOLD',amount=100000,type='HAMMER')=>({physical_object_id:id,venue_id:venue,event_at:date,event_state:state,price:{amount,currency:'USD',price_type:type},lineage:{source_family_id:source}});
assert.equal(reconcileGovernedV22([ev('A','VIN1'),ev('B','VIN1')])[0].observations,2);
assert.equal(reconcileGovernedV22([ev('A','VIN1','RM Sothebys'),ev('B','VIN1','RM')],{venueAliases:{'RM Sothebys':'RM'}})[0].state,'HOLD_UNGOVERNED_VENUE_ALIAS_MAP');
const aliased=reconcileGovernedV22([ev('A','VIN1','RM Sothebys'),ev('B','VIN1','RM')],{venueAliases:{'RM Sothebys':'RM'},venue_alias_registry_ref:'registry://venues/v1'});assert.equal(aliased[0].observations,2);
assert.equal(reconcileGovernedV22([ev('A','VIN-ABC-1'),ev('B','VIN-ABC-2')]).length,2);
assert.equal(reconcileGovernedV22([ev('A','VIN-ABC-1'),ev('B','VIN-ABC-2')],{identityLinks:{'VIN-ABC-2':'VIN-ABC-1'}})[0].state,'HOLD_UNGOVERNED_IDENTITY_LINK_MAP');
const linked=reconcileGovernedV22([ev('A','VIN-ABC-1'),ev('B','VIN-ABC-2')],{identityLinks:{'VIN-ABC-2':'VIN-ABC-1'},identity_link_registry_ref:'registry://identity-links/v1'});assert.equal(linked[0].observations,2);
assert.equal(reconcileGovernedV22([ev('A','VIN1'),ev('B','VIN1','RM Sothebys','2026-08-20T11:00:00Z','SOLD',130000)])[0].state,'CONFLICT_QUARANTINE');
assert.equal(reconcileGovernedV22([ev('A','A'),ev('B','B')],{identityLinks:{A:'B',B:'A'},identity_link_registry_ref:'registry://identity-links/v1'})[0].state,'HOLD_IDENTITY_LINK_CYCLE');

const factor={state:'VERIFIED',value:.7,evidence_refs:['E1'],provenance_refs:['P1'],rights_state:'ALLOW_INTERNAL',confidence:'HIGH',methodology_ref:'M1',origin:'OWNED_INTELLIGENCE'};
const proof=buildHardeningReceiptV22({checks:['reconciliation:PASS','valuation:PASS','liquidity:PASS','calibration:PASS','drift:PASS']});
assert.deepEqual(factorIneligibility({...factor,hardening_proof:proof}),[]);
let reasons=factorIneligibility({...factor,hardening_proof:{...proof,gate_state:'HOLD'}});assert.ok(reasons.includes('OWNED_INTELLIGENCE_HARDENING_GATE_NOT_ALLOW'));assert.ok(reasons.includes('OWNED_INTELLIGENCE_PROOF_DIGEST_INVALID'));
reasons=factorIneligibility({...factor,hardening_proof:{...proof,registry_ref:'fake-registry'}});assert.ok(reasons.includes('OWNED_INTELLIGENCE_PROOF_REGISTRY_BINDING_INVALID'));assert.ok(reasons.includes('OWNED_INTELLIGENCE_PROOF_DIGEST_INVALID'));
reasons=factorIneligibility({...factor,hardening_proof:buildHardeningReceiptV22({checks:['reconciliation:PASS','valuation:PASS','liquidity:PASS','calibration:PASS','fake:PASS']})});assert.ok(reasons.includes('OWNED_INTELLIGENCE_PROOF_CHECKS_INVALID'));

console.log(JSON.stringify({status:'PASS',controls:{invalid_backtest_row_fail_closed:'PASS',invalid_calibration_row_fail_closed:'PASS',duplicate_case_conflicts:'PASS',liquidity_stratified_holdout:'PASS',fuzzy_identity_default_off:'PASS',governed_venue_alias_required:'PASS',governed_identity_link_required:'PASS',identity_link_cycle_fail_closed:'PASS',semantic_conflict_quarantine:'PASS',structured_proof_digest:'PASS',canonical_registry_pinning:'PASS',exact_required_checks:'PASS'}},null,2));
