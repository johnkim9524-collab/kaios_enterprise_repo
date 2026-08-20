import fs from 'node:fs';
const x=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/global-data-acquisition-master-matrix-feedback-v1.json','utf8'));const fail=m=>{throw new Error(m)};
if(x.production!=='HOLD'||x.public_release!=='HOLD'||x.evidence_bindings?.length!==4352)fail('BOUNDARY_OR_COUNT');
if(x.factor_eligibility_contract!=='scripts/kidults/source-intelligence/factor-eligibility-v1-lib.mjs')fail('ELIGIBILITY_CONTRACT');
const s=x.market_structure_feedback_summary||{};if(s.record_count_weight!==0||s.bootstrap_collection_share_weight!==0||s.unknown_or_unverified_does_not_modify_priority!==true||s.verified_but_ineligible_does_not_modify_priority!==true)fail('TRUTH_BOUNDARY');
for(const r of x.evidence_bindings){
  const f=r.market_structure_feedback;if(!f)fail('MISSING_FEEDBACK');
  if(f.eligibility_contract!==x.factor_eligibility_contract)fail('ROW_ELIGIBILITY_CONTRACT');
  if(!f.ineligible_factors||typeof f.ineligible_factors!=='object'||Array.isArray(f.ineligible_factors))fail('INELIGIBLE_FACTOR_MAP_REQUIRED');
  for(const [factor,reasons] of Object.entries(f.ineligible_factors))if(!Array.isArray(reasons)||reasons.length<1||reasons.some(reason=>typeof reason!=='string'||!reason))fail(`INELIGIBLE_REASON:${factor}`);
  if(!Number.isFinite(r.effective_priority_score)||!Number.isFinite(f.modifier)||f.modifier<0||f.modifier>25)fail('SCORE');
  if(f.state==='NO_VERIFIED_CATEGORY_REGION_FACTOR'&&f.modifier!==0)fail('UNVERIFIED_MUTATION');
  if(f.diagnostic_only===true&&f.modifier!==0)fail('DIAGNOSTIC_MUTATION');
  if(Object.keys(f.ineligible_factors).length>0&&f.modifier>0){
    const appliedFactors=new Set((f.factor_evidence_refs||[]).filter(Boolean));
    if(appliedFactors.size===0)fail('TAINTED_FACTOR_MUTATION_WITHOUT_ELIGIBLE_EVIDENCE');
  }
  if(r.effective_priority_score!==Number((Number(r.priority_score||0)+f.modifier).toFixed(6)))fail('EFFECTIVE_SCORE');
}
console.log(JSON.stringify({status:'PASS',rows:x.evidence_bindings.length,modified_rows:s.modified_rows,verified_factor_applications:s.verified_factor_applications,ineligible_factor_applications:s.ineligible_factor_applications,diagnostic_debt_rows:s.diagnostic_debt_rows,production:x.production}));
