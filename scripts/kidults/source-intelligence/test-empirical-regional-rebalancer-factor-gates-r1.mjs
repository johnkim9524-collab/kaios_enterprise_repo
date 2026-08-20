import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const input=process.argv[2]||'/tmp/empirical-regional-baseline-with-data-usability-r1.json';
const baseline=JSON.parse(fs.readFileSync(input,'utf8'));
const contract=JSON.parse(fs.readFileSync('coordination/kidults/source-intelligence/regional-market-rebalancer-v1.json','utf8'));
const formulaFactors=new Set([
  ...Object.keys(contract.collection_formula_weights||{}),
  ...Object.keys(contract.analytical_formula_weights||{}),
]);
const sourceCell=(baseline.cells||[]).find(cell=>
  Object.entries(cell.factors||{}).some(([factor,value])=>formulaFactors.has(factor)&&value?.state==='VERIFIED')
);
assert.ok(sourceCell,'VERIFIED_FORMULA_FACTOR_REQUIRED_FOR_NEGATIVE_CONTROLS');
const factorId=Object.entries(sourceCell.factors).find(([factor,value])=>formulaFactors.has(factor)&&value?.state==='VERIFIED')[0];
const cases=[
  ['EVIDENCE_REFS_MISSING',factor=>{factor.evidence_refs=[];}],
  ['PROVENANCE_REFS_MISSING',factor=>{factor.provenance_refs=[];}],
  ['RIGHTS_NOT_ALLOW',factor=>{factor.rights_state='DENY';}],
  ['CONFIDENCE_NOT_COMPUTABLE',factor=>{factor.confidence='NOT_VERIFIED';}],
  ['METHODOLOGY_REF_MISSING',factor=>{factor.methodology_ref='';}],
  ['VALUE_OUT_OF_RANGE',factor=>{factor.value=1.01;}],
];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kidults-rebalancer-factor-gates-'));
for(const [expectedReason,mutate] of cases){
  const candidate=structuredClone(baseline);
  const cell=candidate.cells.find(item=>item.category_scope===sourceCell.category_scope&&item.macroregion_id===sourceCell.macroregion_id);
  mutate(cell.factors[factorId]);
  const inputPath=path.join(temp,`${expectedReason}.input.json`);
  const outputPath=path.join(temp,`${expectedReason}.output.json`);
  fs.writeFileSync(inputPath,JSON.stringify(candidate));
  execFileSync(process.execPath,[
    'scripts/kidults/source-intelligence/build-empirical-regional-rebalancer-wave1-r1.mjs',
    inputPath,outputPath,
  ],{stdio:'pipe'});
  const output=JSON.parse(fs.readFileSync(outputPath,'utf8'));
  const result=output.cells.find(item=>item.category_scope===sourceCell.category_scope&&item.macroregion_id===sourceCell.macroregion_id);
  assert.ok(result.ineligible_factors[factorId]?.includes(expectedReason),`${expectedReason}:REASON_NOT_RECORDED`);
  for(const planName of ['collection_plan','analytical_plan']){
    const formula=planName==='collection_plan'?contract.collection_formula_weights:contract.analytical_formula_weights;
    if(Object.hasOwn(formula,factorId)){
      assert.ok(result[planName].missing_factors.includes(factorId),`${expectedReason}:${planName}:FACTOR_NOT_MISSING`);
      assert.equal(result[planName].state,'NOT_COMPUTABLE_MISSING_FACTORS');
      assert.equal(result[planName].normalized_score,null);
    }
  }
}
console.log(JSON.stringify({status:'PASS',factor_id:factorId,negative_controls:cases.length,production:'HOLD'}));
