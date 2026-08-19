import fs from 'node:fs/promises';

const decision=JSON.parse(await fs.readFile('coordination/kidults/poc/single-provider-concentration-decision-v1.json','utf8'));
const profile=JSON.parse(await fs.readFile(decision.claim_profile,'utf8'));
const admission=JSON.parse(await fs.readFile(decision.source_admission,'utf8'));
const strict=JSON.parse(await fs.readFile(decision.strict_market_gate,'utf8'));
const errors=[]; const req=(ok,code)=>{if(!ok)errors.push(code);};
req(decision.production==='HOLD'&&decision.publication==='HOLD','PRODUCTION_OR_PUBLICATION_NOT_HOLD');
req(decision.decision_scope==='FIRST_BOUNDED_INTERNAL_POC_ONLY','DECISION_SCOPE_TOO_BROAD');
req(decision.provider===admission.source?.provider_id,'PROVIDER_BINDING_DRIFT');
req(profile.selected_claim?.claim_type==='DATED_OBSERVED_SOLD_TRANSACTION','PROFILE_CLAIM_NOT_DATED_SOLD');
req(decision.allowed_claims.length===1&&decision.allowed_claims[0]===admission.admitted_cell?.claim_ceiling,'ALLOWED_CLAIM_NOT_EXACT_SOURCE_CEILING');
req(strict.redundancy_policy?.single_provider_allowed_only_with?.includes('EXPLICIT_CONCENTRATION_DECISION'),'STRICT_GATE_REQUIRES_CONCENTRATION_DECISION');
req(strict.redundancy_policy?.single_provider_allowed_only_with?.includes('CLAIM_CEILING'),'STRICT_GATE_REQUIRES_CLAIM_CEILING');
req(strict.redundancy_policy?.single_provider_allowed_only_with?.includes('REPLACEMENT_PLAN'),'STRICT_GATE_REQUIRES_REPLACEMENT_PLAN');
req(strict.redundancy_policy?.single_provider_allowed_only_with?.includes('NO_PROVIDER_GLOBAL_TRUTH'),'STRICT_GATE_REQUIRES_NO_GLOBAL_TRUTH');
req(decision.no_provider_global_truth===true,'PROVIDER_GLOBAL_TRUTH_MUST_BE_FALSE');
req(decision.no_automatic_scope_expansion===true&&decision.no_automatic_claim_expansion===true,'AUTO_EXPANSION_MUST_BE_BLOCKED');
req(decision.replacement_plan?.status==='ACTIVE'&&Array.isArray(decision.replacement_plan?.priority_lanes)&&decision.replacement_plan.priority_lanes.length>=2,'REPLACEMENT_PLAN_INCOMPLETE');
req(decision.replacement_plan?.provider_loss_behavior==='FAIL_CLOSED_NO_NEW_TRANSACTION_CLAIMS_FROM_MISSING_SOURCE','PROVIDER_LOSS_NOT_FAIL_CLOSED');
for(const c of ['CURRENT_PRICE','REPRESENTATIVE_PRICE','LIQUIDITY','TIME_TO_SALE','GLOBAL_DEMAND','GLOBAL_REPRESENTATIVENESS','CONDITION_ADJUSTED_VALUE']) req(decision.prohibited_claims.includes(c)&&profile.prohibited_claims.includes(c)&&admission.prohibited_claims.includes(c),`PROHIBITED_CLAIM_DRIFT:${c}`);
req(String(decision.candidate_boundary).includes('FINAL_ER_AND_IMMUTABLE_HANDOFF_GATES_REMAIN_MANDATORY'),'FINAL_GATES_NOT_PRESERVED');
if(errors.length){console.error(JSON.stringify({status:'FAIL',errors},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',decision:decision.id,provider:decision.provider,selected_claim:profile.selected_claim.claim_type,concentration_state:decision.concentration_state,replacement_plan:decision.replacement_plan.status,provider_global_truth:false,current_price:false,liquidity:false,production:'HOLD'},null,2));
