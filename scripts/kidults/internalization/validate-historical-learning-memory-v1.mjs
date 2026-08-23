import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync('coordination/kidults/internalization/historical-learning-memory-contract-v1.json','utf8'));
const errs=[];
for(const r of ['canonical_identity_history','methodology_version_history','confidence_change_history','contradiction_resolution_history','provider_removal_sensitivity','historical_comparable_sets','market_regime_history','decision_outcome_feedback','provider_switch_quality_cost_history']) if(!c.records?.includes(r)) errs.push(`missing ${r}`);
if(c.separation_rules?.raw_provider_payload_required_for_replay!==false) errs.push('raw payload replay dependency prohibited');
if(c.separation_rules?.delete_required_raw_data_reclassified_as_owned!==false) errs.push('raw ownership inflation prohibited');
if(c.separation_rules?.legally_retainable_derived_history_survives_provider_removal!==true) errs.push('derived history continuity required');
if(c.separation_rules?.provider_native_identity_required_for_history!==false) errs.push('provider identity dependency prohibited');
if(c.requirements?.bitemporal_or_versioned!==true) errs.push('versioning required');
if(c.requirements?.methodology_version_bound!==true) errs.push('methodology binding required');
if(c.requirements?.provenance_reference_required!==true) errs.push('provenance required');
if(c.requirements?.termination_policy_link_required!==true) errs.push('termination policy link required');
if(c.requirements?.provider_removal_simulation_required!==true) errs.push('provider removal simulation required');
if(errs.length){console.error(errs.join('\n'));process.exit(1);} 
console.log(JSON.stringify({suite:'KIDULTS_HISTORICAL_LEARNING_MEMORY_V1',result:'PASS',records:c.records.length,raw_payload_dependency:false},null,2));
