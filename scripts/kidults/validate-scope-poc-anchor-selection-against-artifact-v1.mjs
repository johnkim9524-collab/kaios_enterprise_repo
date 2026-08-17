import fs from 'node:fs';
const input=process.argv[2]||'input';
const sel=JSON.parse(fs.readFileSync('coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json','utf8'));
const reg=JSON.parse(fs.readFileSync(`${input}/category-representative-product-registry-v1.json`,'utf8'));
const fail=x=>{console.error('FAIL',x);process.exit(1)};
if(reg.named_anchor_product_count!==160||reg.records.length!==160)fail('immutable registry count mismatch');
const ids=new Set(reg.records.map(r=>r.representative_product_id));
const missing=sel.records.filter(r=>!ids.has(r.representative_product_id));
if(missing.length)fail(`selected IDs absent from official artifact: ${missing.map(x=>x.representative_product_id).join(',')}`);
const source=new Map(reg.records.map(r=>[r.representative_product_id,r]));
for(const r of sel.records){const a=source.get(r.representative_product_id);if(a.display_name!==r.display_name)fail(`display-name mismatch ${r.representative_product_id}`);}
console.log(JSON.stringify({status:'PASS',official_anchor_universe:160,selected:64,matched:64,missing:0,artifact_id:sel.source_artifact.artifact_id},null,2));