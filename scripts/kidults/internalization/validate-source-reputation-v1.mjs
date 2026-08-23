import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('coordination/kidults/internalization/source-reputation-contract-v1.json','utf8'));
const errs=[];
for (const d of ['schema_stability','availability','latency','freshness','contradiction_rate','provenance_completeness','rights_change_frequency','empirical_claim_contribution','source_owner_concentration']) if(!c.dimensions?.includes(d)) errs.push(`missing ${d}`);
if(c.unknown_policy!=='UNKNOWN_NOT_MEASURED') errs.push('unknown policy drift');
if(c.requirements?.time_versioned!==true) errs.push('time versioning required');
if(c.requirements?.evidence_reference_required!==true) errs.push('evidence reference required');
if(c.requirements?.marketing_claim_auto_promotion!==false) errs.push('marketing auto-promotion prohibited');
if(c.requirements?.provider_removal_deletes_history!==false) errs.push('history must survive provider removal');
if(errs.length){console.error(errs.join('\n'));process.exit(1);} 
console.log(JSON.stringify({suite:'KIDULTS_SOURCE_REPUTATION_V1',result:'PASS',dimensions:c.dimensions.length,unknown:c.unknown_policy},null,2));
