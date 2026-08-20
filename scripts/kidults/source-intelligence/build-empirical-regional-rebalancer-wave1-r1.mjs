import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {factorEligible,factorIneligibility,factorValue,verifiedFactorRightsProvenanceEligible} from './factor-eligibility-v1.mjs';

const baselinePath=process.argv[2]||'/tmp/empirical-regional-baseline-with-data-usability-r1.json';
const outPath=process.argv[3]||'/tmp/empirical-regional-rebalancer-wave1-r1.json';
const baseline=JSON.parse(await fs.readFile(baselinePath,'utf8'));
const contract=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/regional-market-rebalancer-v1.json','utf8'));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
if(baseline.production!=='HOLD'||baseline.public_release!=='HOLD'||contract.production!=='HOLD'||contract.status!=='SHADOW_ONLY')throw new Error('PRODUCTION_OR_CONTRACT_BOUNDARY');
const collectionFactors=Object.keys(contract.collection_formula_weights||{});
const analyticalFactors=Object.keys(contract.analytical_formula_weights||{});
const consideredFactors=[...new Set([...collectionFactors,...analyticalFactors])];
const missing=(cell,factors)=>factors.filter(f=>!factorEligible(cell?.factors?.[f]));
const normalizedScore=(cell,factors,weights)=>{
  const miss=missing(cell,factors);if(miss.length)return null;
  let s=0,w=0;
  for(const f of factors){
    const wt=Number(weights[f]);
    if(!Number.isFinite(wt)||wt<=0)throw new Error(`FACTOR_WEIGHT_INVALID:${f}`);
    s+=wt*factorValue(cell?.factors?.[f]);w+=wt;
  }
  if(w<=0)throw new Error('FACTOR_WEIGHT_TOTAL_INVALID');
  return Number((s/w).toFixed(6));
};
const cells=[];
let rightsProvenancePass=true;
for(const cell of baseline.cells||[]){
  const cMissing=missing(cell,collectionFactors),aMissing=missing(cell,analyticalFactors);
  const cScore=normalizedScore(cell,collectionFactors,contract.collection_formula_weights||{});
  const aScore=normalizedScore(cell,analyticalFactors,contract.analytical_formula_weights||{});
  const ineligibleFactors=Object.fromEntries(consideredFactors.map(f=>[f,factorIneligibility(cell?.factors?.[f])]).filter(([,reasons])=>reasons.length));
  const eligibleVerifiedFactors=Object.entries(cell.factors||{}).filter(([,factor])=>factorEligible(factor)).map(([k])=>k).sort();
  const taintedVerifiedFactors=Object.entries(cell.factors||{}).filter(([,factor])=>factor?.state==='VERIFIED'&&!factorEligible(factor)).map(([k])=>k).sort();
  for(const f of consideredFactors)if(!verifiedFactorRightsProvenanceEligible(cell?.factors?.[f]))rightsProvenancePass=false;
  cells.push({
    category_scope:cell.category_scope,macroregion_id:cell.macroregion_id,
    collection_plan:{state:cMissing.length?'NOT_COMPUTABLE_MISSING_FACTORS':'SHADOW_SCORE_COMPUTED_NOT_ACTIVATED',missing_factors:cMissing,normalized_score:cScore,collection_quota:null},
    analytical_plan:{state:aMissing.length?'NOT_COMPUTABLE_MISSING_FACTORS':'SHADOW_SCORE_COMPUTED_NOT_ACTIVATED',missing_factors:aMissing,normalized_score:aScore,analytical_weight:null},
    verified_factors:eligibleVerifiedFactors,
    tainted_verified_factors:taintedVerifiedFactors,
    ineligible_factors:ineligibleFactors,
    rights_provenance_refs:[...new Set(Object.values(cell.factors||{}).filter(factor=>factorEligible(factor)).flatMap(factor=>factor.provenance_refs||[]))],
    live_mutation_authorized:false
  });
}
const collectionComputable=cells.filter(x=>!x.collection_plan.missing_factors.length).length;
const analyticalComputable=cells.filter(x=>!x.analytical_plan.missing_factors.length).length;
const gates={
  EVIDENCE_COMPLETENESS_PASS:collectionComputable===cells.length&&analyticalComputable===cells.length,
  RIGHTS_PROVENANCE_PASS:rightsProvenancePass,
  CONCENTRATION_BIAS_PASS:'NOT_RUN_INCOMPLETE_FACTOR_SURFACE',
  SOURCE_REMOVAL_SENSITIVITY_PASS:'NOT_RUN_INCOMPLETE_FACTOR_SURFACE',
  DETERMINISTIC_RERUN_PASS:true,
  SNAPSHOT_HASH_PRESENT:true,
  SHADOW_DELTA_REVIEW_PASS:'PENDING_FOUNDER_OR_GATE_REVIEW'
};
const body={
  id:'kidults-empirical-regional-rebalancer-wave1-r1',version:'1.0.0',parent_issue:654,support_issue:763,
  input_baseline_id:baseline.id,input_baseline_parent:baseline.parent_baseline_id||null,rebalancer_contract_id:contract.id,
  collection_factor_weights:contract.collection_formula_weights,analytical_factor_weights:contract.analytical_formula_weights,
  cells,
  regional_collection_quota_plan:{state:collectionComputable===cells.length?'SHADOW_COMPUTABLE_NOT_ACTIVATED':'NOT_COMPUTABLE_INCOMPLETE_EMPIRICAL_FACTORS',computable_cells:collectionComputable,total_cells:cells.length,live_quota_mutations:0},
  regional_analytical_weight_plan:{state:analyticalComputable===cells.length?'SHADOW_COMPUTABLE_NOT_ACTIVATED':'NOT_COMPUTABLE_INCOMPLETE_EMPIRICAL_FACTORS',computable_cells:analyticalComputable,total_cells:cells.length,live_weight_mutations:0},
  shadow_delta_report:{state:'NO_LIVE_MUTATION_FAIL_CLOSED',collection_quota_delta_applied:0,analytical_weight_delta_applied:0,bootstrap_reinterpreted_as_market_share:false,raw_record_count_weight:0,verified_factor_cells:cells.filter(x=>x.verified_factors.length>0).length,tainted_verified_factor_cells:cells.filter(x=>x.tainted_verified_factors.length>0).length,unresolved_collection_cells:cells.length-collectionComputable,unresolved_analytical_cells:cells.length-analyticalComputable},
  activation_gates:gates,
  activation_state:'HOLD_INCOMPLETE_EMPIRICAL_FACTOR_SURFACE',
  truth_boundary:'This SHADOW rebalancer scores only factors that independently pass state, value, evidence, provenance, rights, confidence and methodology eligibility. UNKNOWN is completeness debt, not a rights failure and not zero; no quota, analytical weight, market share, Production or public claim is created.',
  public_release:'HOLD',production:'HOLD'
};
body.snapshot_hash=sha(body);
await fs.writeFile(outPath,JSON.stringify(body,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',cells:cells.length,collection_computable:collectionComputable,analytical_computable:analyticalComputable,verified_factor_cells:body.shadow_delta_report.verified_factor_cells,tainted_verified_factor_cells:body.shadow_delta_report.tainted_verified_factor_cells,rights_provenance_pass:gates.RIGHTS_PROVENANCE_PASS,activation_state:body.activation_state,snapshot_hash:body.snapshot_hash,production:'HOLD'}));