// A control-suite success is never an empirical operating certificate.
export function inventoryWholePlatform(contract,scorecard,sourceSha) {
  if(!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('WHOLE_PLATFORM_SOURCE_SHA');
  const dimensions=scorecard.dimensions;
  if(!Array.isArray(dimensions)) throw new Error('WHOLE_PLATFORM_DIMENSIONS');
  const ids=dimensions.map(d=>d.id);
  if(new Set(ids).size!==ids.length || JSON.stringify([...ids].sort())!==JSON.stringify([...contract.value_chain_dimensions].sort())) throw new Error('WHOLE_PLATFORM_COVERAGE_DRIFT');
  return {id:contract.id,source_sha:sourceSha,state:'VERIFIED_INCOMPLETE',
    coverage_scope:contract.scope,whole_platform_runtime_proven:false,
    scorecard_observation:{
      source_sha:scorecard.protected_main_truth_at_update??null,
      source_matches_observation:scorecard.protected_main_truth_at_update===sourceSha,
      evidence_class:'HISTORICAL_STATIC_DECLARATION_NOT_AUTHENTICATED_RUNTIME',
      historical_pass_weight:scorecard.evidenced_pass_weight??null,
      current_runtime_completion_weight:null,
      static_pass_is_current_runtime_completion:false},
    operating_checks:contract.required_operating_checks.map(id=>({id,state:'UNVERIFIED',
      reason:'AUTHENTICATED_EXACT_MAIN_RUNTIME_RECEIPT_REQUIRED',
      recovery:'RECONCILE_EXISTING_RECEIPTS_BEFORE_REGISTERED_PRODUCER_RESUME',retry_authorized:false})),
    value_chain:dimensions.map(d=>({id:d.id,declared_state:d.state,
      runtime_state:'UNVERIFIED',evidence_refs:d.evidence_refs,
      reason:'STATIC_SCORECARD_IS_NOT_LIVE_RUNTIME_PROOF'})),
    production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
}
