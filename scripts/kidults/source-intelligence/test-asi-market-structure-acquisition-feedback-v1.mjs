import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const base=JSON.parse(await fs.readFile(process.argv[2]||'/tmp/empirical-regional-baseline-wave1-r1.json','utf8'));
const category='vinyl_recorded_music';const region='NORTH_AMERICA';const factorId='MARKET_SCALE';
const expected=new Set(['CURRENT_SOLD_TRANSACTION','LISTING_AVAILABILITY','REGIONAL_CONTEXT']);
const fixtureFactor={state:'VERIFIED',value:0.8,confidence:'MEDIUM',evidence_refs:['SYNTHETIC_CONTRACT_TEST_ONLY'],rights_state:'ALLOW_SYNTHETIC_TEST_ONLY',provenance_refs:['SYNTHETIC_CONTRACT_TEST_ONLY:PROVENANCE'],methodology_ref:'SYNTHETIC_CONTRACT_TEST_ONLY:METHODOLOGY'};
const makeFixture=()=>{const candidate=structuredClone(base);candidate.cells.push({category_scope:category,macroregion_id:region,factors:{[factorId]:structuredClone(fixtureFactor)},collection_quota:null,analytical_weight:null,eligibility:'TEST_ONLY'});return candidate;};
const run=async(candidate,id)=>{
  const input=`/tmp/asi-market-feedback-${id}.json`,out=`/tmp/asi-market-feedback-${id}-out.json`;
  await fs.writeFile(input,JSON.stringify(candidate));
  const r=spawnSync(process.execPath,['scripts/kidults/source-intelligence/build-asi-market-structure-acquisition-feedback-v1.mjs','/tmp/global-data-acquisition-master-matrix-v1.json',input,out],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||r.stdout);
  return JSON.parse(await fs.readFile(out,'utf8'));
};
const valid=await run(makeFixture(),'valid');
const validRows=valid.evidence_bindings.filter(v=>v.category_scope===category&&v.macroregion_id===region);const modified=validRows.filter(v=>v.market_structure_feedback.modifier>0);
if(!modified.length)throw new Error('NO_MODIFIED_ROWS');
for(const v of modified){if(!expected.has(v.evidence_class))throw new Error(`WRONG_EVIDENCE:${v.evidence_class}`);if(v.rights_state!=='UNASSESSED'||v.admission_state!=='NOT_ADMITTED'||v.runtime_state!=='NOT_CONNECTED')throw new Error('GATE_MUTATION');if(v.market_structure_feedback.ineligible_factors[factorId])throw new Error('VALID_FACTOR_MARKED_INELIGIBLE');}
for(const v of valid.evidence_bindings.filter(v=>v.category_scope!==category||v.macroregion_id!==region))if(v.market_structure_feedback.modifier!==0)throw new Error('CROSS_CELL_LEAKAGE');
const controls=[
  ['EVIDENCE_REFS_MISSING',factor=>{factor.evidence_refs=[];}],
  ['PROVENANCE_REFS_MISSING',factor=>{factor.provenance_refs=[];}],
  ['RIGHTS_NOT_ALLOW',factor=>{factor.rights_state='DENY';}],
  ['CONFIDENCE_NOT_COMPUTABLE',factor=>{factor.confidence='NOT_VERIFIED';}],
  ['METHODOLOGY_REF_MISSING',factor=>{factor.methodology_ref='';}],
  ['VALUE_OUT_OF_RANGE',factor=>{factor.value=1.01;}],
];
for(const [reason,mutate] of controls){
  const fixture=makeFixture();const cell=fixture.cells.at(-1);mutate(cell.factors[factorId]);
  const x=await run(fixture,reason.toLowerCase());
  const rows=x.evidence_bindings.filter(v=>v.category_scope===category&&v.macroregion_id===region&&expected.has(v.evidence_class));
  if(!rows.length)throw new Error(`${reason}:TARGET_ROWS_MISSING`);
  for(const row of rows){
    if(row.market_structure_feedback.modifier!==0)throw new Error(`${reason}:TAINTED_FACTOR_MUTATED_PRIORITY`);
    if(row.effective_priority_score!==Number(row.priority_score||0))throw new Error(`${reason}:EFFECTIVE_PRIORITY_CHANGED`);
    if(!row.market_structure_feedback.ineligible_factors[factorId]?.includes(reason))throw new Error(`${reason}:REASON_NOT_RECORDED`);
  }
}
console.log(JSON.stringify({status:'PASS',fixture:'SYNTHETIC_CONTRACT_TEST_ONLY',modified_rows:modified.length,category,region,factor_negative_controls:controls.length,rights_or_admission_mutation:false,tainted_factor_priority_mutation:false}));
