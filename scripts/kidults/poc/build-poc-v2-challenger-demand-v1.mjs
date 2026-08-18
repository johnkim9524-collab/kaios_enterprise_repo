#!/usr/bin/env node
import fs from 'node:fs';
const matrixPath=process.argv[2]||'coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.2.json';
const outPath=process.argv[3]||'tmp/poc-v2-challenger-demand-v1.json';
const contract=JSON.parse(fs.readFileSync('coordination/kidults/poc/global-market-evidence-poc-v2-selection-contract-v1.json','utf8'));
const matrix=JSON.parse(fs.readFileSync(matrixPath,'utf8'));
const scopes=matrix.scopes||matrix.records||matrix.collection_scopes||[];
if(scopes.length!==32) throw new Error(`EXPECTED_32_SCOPES_GOT_${scopes.length}`);
const rows=[];
for(const s of scopes){
  const scope_id=s.scope_id||s.id;
  if(!scope_id) throw new Error('SCOPE_ID_MISSING');
  for(const spec of contract.challenger_slots_per_scope){
    rows.push({scope_id,challenger_role:spec.slot,purpose:spec.purpose,state:'DISCOVERY_REQUIRED',named_product:null,representative_product_id:null,evidence_refs:[],rights_state:'NOT_VERIFIED',selection_reason:null});
  }
}
const out={id:'poc-v2-challenger-demand-v1',scope_count:scopes.length,challenger_rows:rows.length,canonical_anchor_count:160,target_total_products:320,rows,governance:{fail_closed:true,provider_contact:'HOLD',production:'HOLD'}};
fs.mkdirSync(outPath.split('/').slice(0,-1).join('/'),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(out,null,2));
console.log(JSON.stringify({status:'PASS',scopes:scopes.length,challenger_rows:rows.length,target_total_products:320},null,2));
