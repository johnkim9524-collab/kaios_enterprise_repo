import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const registry=read('coordination/kidults/source-intelligence/regional-market-factor-registry-v1.json');
const rebalancer=read('coordination/kidults/source-intelligence/regional-market-rebalancer-v1.json');
const policy=read('coordination/kidults/source-intelligence/asi-global-regional-market-balance-policy-v1.json');
const fail=m=>{throw new Error(m)};
if(registry.unknown_policy?.missing_to_zero!==false) fail('UNKNOWN must never map to zero');
if(!registry.truth_boundary?.includes('RAW_RECORD_COUNT_IS_NOT_MARKET_SCALE')) fail('record-count truth boundary missing');
if(rebalancer.raw_record_count_weight!==0) fail('raw record count must have zero analytical weight');
if(rebalancer.production!=='HOLD') fail('production must remain HOLD');
if(rebalancer.global_claim_failure_state!=='NOT_VERIFIED_GLOBAL') fail('GLOBAL fail-closed state drift');
if(rebalancer.stability_controls?.max_cycle_weight_delta_absolute>0.05) fail('max-cycle delta exceeds canonical guard');
if(rebalancer.portfolio_caps?.max_macroregion_collection_share_without_exception!==policy.collection_priority_model?.portfolio_constraints?.maximum_macroregion_share_without_explicit_exception) fail('macroregion collection cap drift');
if(rebalancer.portfolio_caps?.max_country_collection_share_without_exception!==policy.collection_priority_model?.portfolio_constraints?.maximum_single_country_share_without_explicit_exception) fail('country collection cap drift');
if(policy.analytical_weight_model?.record_count_weight!==0) fail('policy record-count weight drift');
for(const factor of registry.required_factors||[]){
  if(!registry.factor_assertion_required_fields?.includes('evidence_refs')) fail(`evidence refs missing for ${factor}`);
  if(!registry.factor_assertion_required_fields?.includes('rights_state')) fail(`rights state missing for ${factor}`);
  if(!registry.factor_assertion_required_fields?.includes('provenance_refs')) fail(`provenance refs missing for ${factor}`);
}
console.log('PASS live regional market baseline contract validator');
