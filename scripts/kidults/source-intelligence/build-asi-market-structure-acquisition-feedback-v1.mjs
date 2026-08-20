import fs from 'node:fs/promises';
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
let verifiedFactors=0, modifiedRows=0, diagnosticDebtRows=0;
const rows=(matrix.evidence_bindings||[]).map(r=>{
  const exact=byCell.get(`${r.category_scope}::${r.macroregion_id}`);
  const diagnostic=byCell.get(`PORTFOLIO_DIAGNOSTIC_ONLY::${r.macroregion_id}`);
  const cell=exact||diagnostic||null;
  let modifier=0;const refs=[];const gaps=[];
  if(cell){
    for(const [factor,demands] of Object.entries(factorDemand)){
      const f=cell.factors?.[factor];
      if(!f||!demands.includes(r.evidence_class))continue;
      if(f.state==='VERIFIED'&&exact){
        const value=Number(f.value);
        if(Number.isFinite(value)&&value>=0&&value<=1){modifier+=Number(weights[factor]||0)*value*25;verifiedFactors++;refs.push(...(f.evidence_refs||[]));}
      }else if(f.state!=='VERIFIED'){gaps.push(factor);if(diagnostic)diagnosticDebtRows++;}
    }
  }
  modifier=Math.min(25,Math.max(0,modifier));
  if(modifier>0)modifiedRows++;
  return {...r,market_structure_feedback:{state:modifier>0?'APPLIED_VERIFIED_CATEGORY_REGION_FACTOR':'NO_VERIFIED_CATEGORY_REGION_FACTOR',modifier:Number(modifier.toFixed(6)),factor_evidence_refs:[...new Set(refs)],missing_or_unverified_factors:[...new Set(gaps)],diagnostic_only:!exact&&!!diagnostic},effective_priority_score:Number((Number(r.priority_score||0)+modifier).toFixed(6))};
});
const artifact={...matrix,id:'kidults-global-data-acquisition-master-matrix-feedback-v1',feedback_contract_id:contract.id,market_structure_feedback_summary:{verified_factor_applications:verifiedFactors,modified_rows:modifiedRows,diagnostic_debt_rows:diagnosticDebtRows,unknown_or_unverified_does_not_modify_priority:true,record_count_weight:0,bootstrap_collection_share_weight:0},evidence_bindings:rows,truth_boundary:`${matrix.truth_boundary} Market-structure feedback applies only from VERIFIED category-specific factors; UNKNOWN/NOT_VERIFIED and portfolio diagnostics cannot mutate acquisition priority.`,production:'HOLD',public_release:'HOLD'};
await fs.writeFile(out,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',rows:rows.length,modified_rows:modifiedRows,verified_factor_applications:verifiedFactors,diagnostic_debt_rows:diagnosticDebtRows,production:'HOLD'}));
