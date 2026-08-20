import fs from 'node:fs/promises';
import {factorIneligibility} from './factor-eligibility-v1-lib.mjs';
const contract=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/asi-market-structure-acquisition-feedback-v1.json','utf8'));
const policy=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/asi-global-regional-market-balance-policy-v1.json','utf8'));
const matrix=JSON.parse(await fs.readFile(process.argv[2]||'/tmp/global-data-acquisition-master-matrix-v1.json','utf8'));
const baseline=JSON.parse(await fs.readFile(process.argv[3]||'/tmp/empirical-regional-baseline-wave1-r1.json','utf8'));
const out=process.argv[4]||'/tmp/global-data-acquisition-master-matrix-feedback-v1.json';
if(matrix.production!=='HOLD'||baseline.production!=='HOLD')throw new Error('PRODUCTION_BOUNDARY');
const weights=policy.collection_priority_model?.factor_weights||{};
const factorDemand=contract.factor_to_acquisition_demand||{};
const byCell=new Map();
for(const c of baseline.cells||[])byCell.set(`${c.category_scope}::${c.macroregion_id}`,c);
let verifiedFactors=0, modifiedRows=0, diagnosticDebtRows=0, ineligibleFactorApplications=0;
const rows=(matrix.evidence_bindings||[]).map(r=>{
  const exact=byCell.get(`${r.category_scope}::${r.macroregion_id}`);
  const diagnostic=byCell.get(`PORTFOLIO_DIAGNOSTIC_ONLY::${r.macroregion_id}`);
  const cell=exact||diagnostic||null;
  let modifier=0;const refs=[];const gaps=[];const ineligible={};
  if(cell){
    for(const [factor,demands] of Object.entries(factorDemand)){
      if(!demands.includes(r.evidence_class))continue;
      const f=cell.factors?.[factor];
      if(!f){gaps.push(factor);if(diagnostic)diagnosticDebtRows++;continue;}
      const reasons=factorIneligibility(f);
      if(reasons.length){
        gaps.push(factor);ineligible[factor]=reasons;ineligibleFactorApplications++;
        if(diagnostic)diagnosticDebtRows++;
        continue;
      }
      if(!exact){
        gaps.push(factor);if(diagnostic)diagnosticDebtRows++;
        continue;
      }
      const weight=Number(weights[factor]||0);
      if(!Number.isFinite(weight)||weight<0)throw new Error(`FACTOR_WEIGHT_INVALID:${factor}`);
      modifier+=weight*Number(f.value)*25;
      verifiedFactors++;
      refs.push(...f.evidence_refs);
    }
  }
  modifier=Math.min(25,Math.max(0,modifier));
  if(modifier>0)modifiedRows++;
  return {...r,market_structure_feedback:{
    state:modifier>0?'APPLIED_VERIFIED_CATEGORY_REGION_FACTOR':'NO_VERIFIED_CATEGORY_REGION_FACTOR',
    modifier:Number(modifier.toFixed(6)),
    factor_evidence_refs:[...new Set(refs)],
    missing_or_unverified_factors:[...new Set(gaps)],
    ineligible_factors:ineligible,
    eligibility_contract:'scripts/kidults/source-intelligence/factor-eligibility-v1-lib.mjs',
    diagnostic_only:!exact&&!!diagnostic
  },effective_priority_score:Number((Number(r.priority_score||0)+modifier).toFixed(6))};
});
const artifact={...matrix,id:'kidults-global-data-acquisition-master-matrix-feedback-v1',feedback_contract_id:contract.id,factor_eligibility_contract:'scripts/kidults/source-intelligence/factor-eligibility-v1-lib.mjs',market_structure_feedback_summary:{verified_factor_applications:verifiedFactors,ineligible_factor_applications:ineligibleFactorApplications,modified_rows:modifiedRows,diagnostic_debt_rows:diagnosticDebtRows,unknown_or_unverified_does_not_modify_priority:true,verified_but_ineligible_does_not_modify_priority:true,record_count_weight:0,bootstrap_collection_share_weight:0},evidence_bindings:rows,truth_boundary:`${matrix.truth_boundary} Market-structure feedback mutates acquisition priority only from exact category-region factors that pass the canonical state/value/evidence/provenance/rights/confidence/methodology eligibility law. UNKNOWN is completeness debt, not zero; NOT_VERIFIED, missing, diagnostic-only and VERIFIED-but-tainted factors cannot mutate priority.`,production:'HOLD',public_release:'HOLD'};
await fs.writeFile(out,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',rows:rows.length,modified_rows:modifiedRows,verified_factor_applications:verifiedFactors,ineligible_factor_applications:ineligibleFactorApplications,diagnostic_debt_rows:diagnosticDebtRows,production:'HOLD'}));
