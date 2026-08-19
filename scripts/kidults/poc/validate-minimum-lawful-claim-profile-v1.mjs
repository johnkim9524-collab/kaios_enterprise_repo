import fs from 'node:fs/promises';

const profile=JSON.parse(await fs.readFile('coordination/kidults/poc/minimum-lawful-claim-profile-v1.json','utf8'));
const admission=JSON.parse(await fs.readFile(profile.evidence_binding.source_admission_artifact,'utf8'));
const strict=JSON.parse(await fs.readFile(profile.evidence_binding.strict_market_gate,'utf8'));
const errors=[]; const req=(ok,code)=>{if(!ok)errors.push(code);};
req(profile.production==='HOLD','PRODUCTION_NOT_HOLD');
req(profile.publication==='HOLD','PUBLICATION_NOT_HOLD');
req(profile.candidate_creation==='BLOCKED_UNTIL_FINAL_ER_AND_IMMUTABLE_ARTIFACTS','CANDIDATE_BOUNDARY_INVALID');
req(profile.selected_claim.claim_type==='DATED_OBSERVED_SOLD_TRANSACTION','CLAIM_TYPE_TOO_STRONG');
req(profile.selected_claim.temporality==='DATED_TRANSACTION_HISTORY'&&profile.selected_claim.evidence_temporality==='DATED_TRANSACTION_HISTORY','TEMPORALITY_MISMATCH');
req(Number(profile.selected_claim.claim_strength)<=Number(profile.selected_claim.maximum_evidence_strength),'CLAIM_STRENGTH_EXCEEDS_EVIDENCE');
for(const f of ['requires_current_price','requires_liquidity','requires_time_to_sale','requires_global_representativeness','requires_condition_adjustment']) req(profile.selected_claim[f]===false,`CLAIM_REQUIREMENT_MUST_BE_FALSE:${f}`);
req(admission.status==='ADMITTED_SHADOW_INTERNAL_ONLY','SOURCE_NOT_ADMITTED_SHADOW');
req(admission.admitted_cell?.anchor===profile.selected_scope.anchor,'ANCHOR_DRIFT');
req(admission.admitted_cell?.canonical_item_slug===profile.selected_scope.canonical_item_slug,'ITEM_SLUG_DRIFT');
req(admission.admitted_cell?.admitted_evidence_class===profile.evidence_binding.required_evidence_class,'EVIDENCE_CLASS_DRIFT');
req(admission.admitted_cell?.identity_state===profile.evidence_binding.required_identity_state,'IDENTITY_STATE_DRIFT');
req(admission.admitted_cell?.provider_market_state===profile.evidence_binding.required_market_state,'MARKET_STATE_DRIFT');
req(Number(admission.admitted_cell?.observed_sold_event_count)>=Number(profile.evidence_binding.minimum_observed_event_count),'EVENT_COUNT_INSUFFICIENT');
req(strict.principle==='DATED_OBSERVED_SOLD_TRANSACTION_IS_NOT_CURRENT_PRICE_OR_LIQUIDITY','STRICT_MARKET_PRINCIPLE_MISSING');
req(strict.current_empirical_binding?.strict_current_price_eligible===false&&strict.current_empirical_binding?.liquidity_eligible===false,'STRICT_MARKET_GATE_WEAKENED');
for(const c of ['CURRENT_PRICE','REPRESENTATIVE_PRICE','LIQUIDITY','TIME_TO_SALE','GLOBAL_DEMAND','GLOBAL_REPRESENTATIVENESS','CONDITION_ADJUSTED_VALUE']) req(profile.prohibited_claims.includes(c)&&admission.prohibited_claims.includes(c),`PROHIBITED_CLAIM_DRIFT:${c}`);
req(Array.isArray(profile.candidate_prerequisites)&&profile.candidate_prerequisites.includes('FINAL_ER_7_OF_7')&&profile.candidate_prerequisites.includes('CANDIDATE_EVIDENCE_HANDOFF_R2_PASS'),'FINAL_HANDOFF_PREREQUISITES_MISSING');
if(errors.length){console.error(JSON.stringify({status:'FAIL',errors},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',claim_profile:profile.id,claim_type:profile.selected_claim.claim_type,anchor:profile.selected_scope.anchor,observed_event_count:admission.admitted_cell.observed_sold_event_count,latest_event_date:admission.admitted_cell.latest_event_date,current_price:false,liquidity:false,candidate_created:false,production:'HOLD'},null,2));
