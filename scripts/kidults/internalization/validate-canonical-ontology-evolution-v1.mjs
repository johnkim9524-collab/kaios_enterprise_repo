import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync('coordination/kidults/internalization/canonical-ontology-evolution-contract-v1.json','utf8'));
const errs=[];
if(c.provider_independence?.provider_taxonomy_is_canonical!==false) errs.push('provider taxonomy cannot be canonical');
if(c.provider_independence?.provider_id_is_canonical!==false) errs.push('provider id cannot be canonical');
if(c.provider_independence?.adapter_boundary_required!==true) errs.push('adapter boundary required');
for(const x of ['ontology_versioning','alias_synonym_translation','product_family_edition_variant_lifecycle','grader_scale_mapping','condition_scale_mapping','market_event_semantics','merge_split_deprecate','provider_taxonomy_drift_detection','historical_version_replay']) if(!c.capabilities?.includes(x)) errs.push(`missing ${x}`);
if(c.requirements?.version_required!==true) errs.push('version required');
if(c.requirements?.migration_record_required!==true) errs.push('migration record required');
if(c.requirements?.deterministic_replay_required!==true) errs.push('deterministic replay required');
if(c.requirements?.downstream_contract_stable_on_provider_removal!==true) errs.push('provider removal continuity required');
if(errs.length){console.error(errs.join('\n'));process.exit(1);} 
console.log(JSON.stringify({suite:'KIDULTS_CANONICAL_ONTOLOGY_EVOLUTION_V1',result:'PASS',capabilities:c.capabilities.length,provider_independent:true},null,2));
