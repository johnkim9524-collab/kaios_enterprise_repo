import fs from 'node:fs/promises';

const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const identity=await read('coordination/kidults/source-intelligence/rights-admitted-pilot-source-pool-r1.json');
const historical=await read('coordination/kidults/source-intelligence/rights-admitted-transaction-source-pool-r1.json');
const declarations=await read('coordination/kidults/source-intelligence/global-rights-source-pool-expansion-r2.json');
const policy=await read('coordination/kidults/source-intelligence/asi-global-regional-market-balance-policy-v1.json');
const contract=await read('coordination/kidults/source-intelligence/empirical-regional-baseline-wave1-contract-r1.json');
const out=process.argv[2]||'/tmp/empirical-regional-baseline-wave1-r1.json';

const sources=[];
for(const s of identity.sources||[]) if(s.admission_state==='ADMITTED') sources.push({...s,pool:'identity'});
for(const s of historical.sources||[]) if(s.admission_state==='ADMITTED') sources.push({...s,pool:'historical'});
for(const s of declarations.sources||[]) sources.push({...s,pool:'declaration'});

const dims=contract.required_source_dimensions;
const dimensionCoverage={};
for(const d of dims) dimensionCoverage[d]={present:0,total:sources.length};
for(const s of sources){
  for(const d of dims){
    const v=s[d];
    if(v!==undefined&&v!==null&&v!=='') dimensionCoverage[d].present++;
  }
}

const macroregions=(policy.canonical_macroregions||[]).map(r=>({
  macroregion_id:r.id,
  structural_bootstrap_target:r.bootstrap_collection_share,
  bootstrap_is_market_share:false,
  region_bound_admitted_source_count:sources.filter(s=>s.macroregion_id===r.id&&s.admission_state==='ADMITTED').length,
  market_scale:'UNKNOWN',
  market_maturity:'UNKNOWN',
  observed_transaction_activity:'UNKNOWN',
  factor_state:'NOT_VERIFIED',
  coverage_debt_numeric:null,
  coverage_debt_state:'UNCOMPUTABLE_UNTIL_REGION_BOUND_EFFECTIVE_COVERAGE_EXISTS'
}));

const report={
  id:'empirical-regional-baseline-wave1-r1',
  status:'GAP_MAP_ONLY_NOT_EMPIRICAL_BASELINE',
  generated_at:new Date().toISOString(),
  production:'HOLD',
  source_asset_count:sources.length,
  source_dimension_coverage:dimensionCoverage,
  region_bound_source_assets:sources.filter(s=>s.macroregion_id&&s.country_code).length,
  macroregions,
  blocker:
    macroregions.every(r=>r.region_bound_admitted_source_count===0)
      ? 'CURRENT_ADMITTED_SOURCE_PORTFOLIO_LACKS_CANONICAL_REGION_BINDING'
      : 'PARTIAL_REGION_BINDING_REQUIRES_FACTOR_EVIDENCE',
  next_action:'Add evidence-backed region/country/venue/currency/language bindings at source-observation level, then populate factor assertions; do not infer region from provider headquarters.',
  truth_boundary:[
    'NO_REGION_INFERENCE_FROM_PROVIDER_HOME_COUNTRY',
    'NO_RECORD_COUNT_AS_MARKET_SCALE',
    'UNKNOWN_IS_NOT_ZERO',
    'BOOTSTRAP_SHARE_IS_NOT_MARKET_SHARE',
    'THIS_REPORT_DOES_NOT_AUTHORIZE_GLOBAL_CLAIMS'
  ]
};
await fs.writeFile(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,source_asset_count:report.source_asset_count,region_bound_source_assets:report.region_bound_source_assets,blocker:report.blocker}));
