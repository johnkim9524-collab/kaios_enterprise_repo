import fs from 'node:fs';
const p='coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json';
const m='coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));const matrix=JSON.parse(fs.readFileSync(m,'utf8'));
const fail=s=>{console.error('FAIL',s);process.exit(1)};
if(x.records.length!==64)fail('64 products required');
if(new Set(x.records.map(r=>r.representative_product_id)).size!==64)fail('product IDs must be unique');
const ids=new Set(matrix.scopes.map(s=>s.scope_id));
if(ids.size!==32)fail('matrix scope count');
const by=new Map();for(const r of x.records){if(!ids.has(r.target_scope_id))fail(`unknown scope ${r.target_scope_id}`);by.set(r.target_scope_id,(by.get(r.target_scope_id)||0)+1)}
if(by.size!==32)fail('32 scope coverage required');for(const [k,v] of by)if(v!==2)fail(`${k} must have 2 products`);
if(x.governance.provider_contact_authorized!==false||x.governance.production!=='HOLD')fail('provider/production hold');
if(x.source_artifact.artifact_id!==9286462549)fail('official artifact mismatch');
if(!x.migration_warnings.some(w=>w.scope_id==='vintage_digital_watches'&&w.severity==='P0_SCOPE_SEMANTIC_REVIEW'))fail('semantic warning required');
console.log(JSON.stringify({status:'PASS',scopes:32,products:64,products_per_scope:2,unique_products:64,migration_warnings:x.migration_warnings.length,provider_contact:'HOLD',production:'HOLD'},null,2));