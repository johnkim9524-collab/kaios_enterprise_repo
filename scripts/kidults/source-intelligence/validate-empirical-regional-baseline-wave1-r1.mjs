import fs from 'node:fs';
const path=process.argv[2]||'/tmp/empirical-regional-baseline-wave1-r1.json';
const x=JSON.parse(fs.readFileSync(path,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.status!=='DRAFT') fail('snapshot must remain DRAFT until verified regional factors exist');
if(x.production!=='HOLD'||x.public_release!=='HOLD') fail('release boundary drift');
if(!Array.isArray(x.cells)||x.cells.length===0) fail('cells required');
if(!x.coverage_debt_report||!x.shadow_delta) fail('gap report and shadow delta required');
if(x.shadow_delta.status!=='NO_MUTATION_FAIL_CLOSED') fail('shadow must fail closed');
if(x.shadow_delta.production_mutation!==false) fail('production mutation forbidden');
if(x.shadow_delta.collection_quota_plan!=='NOT_COMPUTABLE'||x.shadow_delta.analytical_weight_plan!=='NOT_COMPUTABLE') fail('unverified weights must not be computed');
if(x.shadow_delta.raw_record_count_used_as_market_scale!==false) fail('record count cannot become market scale');
if(x.truth_boundary?.unknown_is_not_zero!==true||x.truth_boundary?.bootstrap_is_not_market_share!==true||x.truth_boundary?.provider_home_country_is_not_observation_region!==true||x.truth_boundary?.global_claim_authorized!==false) fail('truth boundary drift');
let verified=0,unknown=0;
for(const cell of x.cells){
  if(cell.collection_quota!==null||cell.analytical_weight!==null||cell.eligibility!=='NOT_VERIFIED') fail(`premature regional activation:${cell.macroregion_id}`);
  for(const [name,v] of Object.entries(cell.factors||{})){
    if(v?.state==='UNKNOWN') unknown++; else verified++;
    if(v?.state==='UNKNOWN'&&(v?.evidence_refs?.length||v?.provenance_refs?.length)) fail(`unknown factor has fabricated evidence:${cell.macroregion_id}:${name}`);
  }
}
if(verified!==0) fail(`unexpected verified market factor count:${verified}`);
if(unknown!==x.coverage_debt_report.factor_assertions_unknown) fail('unknown factor count mismatch');
if(x.coverage_debt_report.region_bound_source_assets===0&&x.coverage_debt_report.blocker!=='CURRENT_ADMITTED_SOURCE_PORTFOLIO_LACKS_CANONICAL_REGION_BINDING') fail('zero-binding blocker mismatch');
console.log(JSON.stringify({status:'PASS',snapshot_id:x.snapshot_id,region_bound_source_assets:x.coverage_debt_report.region_bound_source_assets,unknown_factor_assertions:unknown,shadow_delta:x.shadow_delta.status,production:x.production},null,2));
