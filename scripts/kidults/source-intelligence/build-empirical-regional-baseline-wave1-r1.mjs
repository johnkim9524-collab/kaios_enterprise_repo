import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const identity=await read('coordination/kidults/source-intelligence/rights-admitted-pilot-source-pool-r1.json');
const historical=await read('coordination/kidults/source-intelligence/rights-admitted-transaction-source-pool-r1.json');
const declarations=await read('coordination/kidults/source-intelligence/global-rights-source-pool-expansion-r2.json');
const policy=await read('coordination/kidults/source-intelligence/asi-global-regional-market-balance-policy-v1.json');
const contract=await read('coordination/kidults/source-intelligence/empirical-regional-baseline-wave1-contract-r1.json');
const out=process.argv[2]||'/tmp/empirical-regional-baseline-wave1-r1.json';
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const sources=[];
for(const s of identity.sources||[]) if(s.admission_state==='ADMITTED') sources.push({...s,pool:'identity'});
for(const s of historical.sources||[]) if(s.admission_state==='ADMITTED') sources.push({...s,pool:'historical'});
for(const s of declarations.sources||[]) if(s.admission_state==='ADMITTED') sources.push({...s,pool:'declaration'});
const dims=contract.required_source_dimensions;
const dimensionCoverage={};
for(const d of dims) dimensionCoverage[d]={present:0,total:sources.length,missing:[]};
for(const s of sources){
  for(const d of dims){
    const v=s[d];
    if(v!==undefined&&v!==null&&v!=='') dimensionCoverage[d].present++;
    else dimensionCoverage[d].missing.push(s.source_id||s.id||'UNKNOWN_SOURCE');
  }
}
const factors=contract.required_factor_outputs;
const sourceSnapshotIds=[identity.id,historical.id,declarations.id];
const sourceDigest=sha({sourceSnapshotIds,sources});
const regionBound=sources.filter(s=>s.macroregion_id&&s.country_code);
const cells=(policy.canonical_macroregions||[]).map(r=>({
  category_scope:'PORTFOLIO_DIAGNOSTIC_ONLY',
  macroregion_id:r.id,
  country_scope:[],
  factors:Object.fromEntries(factors.map(f=>[f,{state:'UNKNOWN',confidence:null,evidence_refs:[],rights_state:'NOT_VERIFIED',provenance_refs:[],reason:'NO_REGION_BOUND_ADMITTED_FACTOR_EVIDENCE'}])),
  collection_quota:null,
  analytical_weight:null,
  coverage_debt:null,
  eligibility:'NOT_VERIFIED',
  structural_bootstrap_target:r.bootstrap_collection_share,
  bootstrap_is_market_share:false,
  region_bound_admitted_source_count:regionBound.filter(s=>s.macroregion_id===r.id).length
}));
const priorityMissingDimensions=dims.filter(d=>dimensionCoverage[d].present<sources.length);
const report={
  snapshot_id:`regional-market-baseline-wave1-gap-${sourceDigest.slice(7,19)}`,
  methodology_version:contract.version,
  generated_at:'EVIDENCE_SNAPSHOT_DETERMINISTIC_FROM_COMMITTED_INPUTS',
  status:'DRAFT',
  source_snapshot_ids:sourceSnapshotIds,
  source_snapshot_digest:sourceDigest,
  cells,
  coverage_debt_report:{
    status:'EMPIRICAL_SOURCE_DIMENSION_GAP_MAP',
    source_asset_count:sources.length,
    region_bound_source_assets:regionBound.length,
    source_dimension_coverage:dimensionCoverage,
    priority_missing_dimensions:priorityMissingDimensions,
    factor_assertions_verified:0,
    factor_assertions_unknown:cells.length*factors.length,
    blocker:regionBound.length===0?'CURRENT_ADMITTED_SOURCE_PORTFOLIO_LACKS_CANONICAL_REGION_BINDING':'PARTIAL_REGION_BINDING_REQUIRES_FACTOR_EVIDENCE',
    next_acquisition_requirements:['OBSERVATION_LEVEL_MACROREGION','COUNTRY_CODE','LOCAL_MARKET_OR_VENUE','LANGUAGE','CURRENCY','OBSERVED_AT','EVIDENCE_BACKED_FACTOR_ASSERTIONS']
  },
  shadow_delta:{
    status:'NO_MUTATION_FAIL_CLOSED',
    collection_quota_plan:'NOT_COMPUTABLE',
    analytical_weight_plan:'NOT_COMPUTABLE',
    collection_quota_deltas:[],
    analytical_weight_deltas:[],
    reason:'NO_REGION_BOUND_EFFECTIVE_COVERAGE_AND_NO_VERIFIED_MARKET_FACTORS',
    raw_record_count_used_as_market_scale:false,
    production_mutation:false
  },
  truth_boundary:{
    unknown_is_not_zero:true,
    collection_share_is_not_analytical_weight:true,
    raw_records_do_not_directly_mutate_weights:true,
    bootstrap_is_not_market_share:true,
    provider_home_country_is_not_observation_region:true,
    global_claim_authorized:false
  },
  production:'HOLD',
  public_release:'HOLD'
};
await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({snapshot_id:report.snapshot_id,status:report.status,source_asset_count:sources.length,region_bound_source_assets:regionBound.length,factor_assertions_unknown:report.coverage_debt_report.factor_assertions_unknown,shadow_delta:report.shadow_delta.status,blocker:report.coverage_debt_report.blocker,production:'HOLD'}));
