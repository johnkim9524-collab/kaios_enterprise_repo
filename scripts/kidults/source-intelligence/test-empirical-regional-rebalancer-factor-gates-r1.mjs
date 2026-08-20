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
const complete=structuredClone(baseline);
const template=structuredClone(sourceCell.factors[factorId]);
for(const cell of complete.cells||[]){
  cell.factors=cell.factors||{};
  for(const factor of formulaFactors){
    cell.factors[factor]={
      ...structuredClone(template),
      state:'VERIFIED',
      value:0.5,
      evidence_refs:[`synthetic://bounded-complete/${cell.category_scope}/${cell.macroregion_id}/${factor}`],
      provenance_refs:[`synthetic://bounded-complete/${cell.category_scope}/${cell.macroregion_id}/${factor}/provenance`],
      rights_state:'ALLOW_SYNTHETIC_TEST_ONLY',
      confidence:'HIGH',
      methodology_ref:'synthetic://bounded-complete/methodology'
    };
  }
}
const completeInput=path.join(temp,'complete.input.json');
const completeOutput=path.join(temp,'complete.output.json');
fs.writeFileSync(completeInput,JSON.stringify(complete));
execFileSync(process.execPath,[
  'scripts/kidults/source-intelligence/build-empirical-regional-rebalancer-wave1-r1.mjs',
  completeInput,completeOutput,
],{stdio:'pipe'});
execFileSync(process.execPath,[
  'scripts/kidults/source-intelligence/validate-empirical-regional-rebalancer-wave1-r1.mjs',
  completeOutput,
],{stdio:'pipe'});
const completed=JSON.parse(fs.readFileSync(completeOutput,'utf8'));
assert.equal(completed.activation_gates.EVIDENCE_COMPLETENESS_PASS,true);
assert.equal(completed.activation_state,'HOLD_PENDING_ACTIVATION_GATES');
assert.equal(completed.activation_gates.CONCENTRATION_BIAS_PASS,'PENDING_REQUIRED_SHADOW_VALIDATION');
assert.equal(completed.activation_gates.SOURCE_REMOVAL_SENSITIVITY_PASS,'PENDING_REQUIRED_SHADOW_VALIDATION');
assert.equal(completed.regional_collection_quota_plan.state,'SHADOW_COMPUTABLE_NOT_ACTIVATED');
assert.equal(completed.regional_analytical_weight_plan.state,'SHADOW_COMPUTABLE_NOT_ACTIVATED');
assert.equal(completed.regional_collection_quota_plan.live_quota_mutations,0);
assert.equal(completed.regional_analytical_weight_plan.live_weight_mutations,0);
assert.ok(completed.cells.every(cell=>cell.collection_plan.missing_factors.length===0&&cell.analytical_plan.missing_factors.length===0));
assert.ok(completed.cells.every(cell=>Number.isFinite(cell.collection_plan.normalized_score)&&Number.isFinite(cell.analytical_plan.normalized_score)&&cell.live_mutation_authorized===false));
console.log(JSON.stringify({status:'PASS',factor_id:factorId,negative_controls:cases.length,complete_surface_cells:completed.cells.length,activation_state:completed.activation_state,live_mutations:0,production:'HOLD'}));
