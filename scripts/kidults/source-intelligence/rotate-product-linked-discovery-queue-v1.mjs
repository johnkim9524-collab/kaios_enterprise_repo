#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const queueDir=process.argv[2]||'queue';
const cycleIndex=Number(process.argv[3]||0);
const perCategory=2;
const manifestPath=path.join(queueDir,'manifest.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(!Number.isInteger(cycleIndex)||cycleIndex<0) throw new Error('INVALID_CYCLE_INDEX');
let rotatedProducts=0;
for(const shard of manifest.shards||[]){
  const p=path.join(queueDir,shard.file);
  const doc=JSON.parse(fs.readFileSync(p,'utf8'));
  const by=new Map();
  for(const r of doc.records||[]){if(!by.has(r.representative_product_id))by.set(r.representative_product_id,[]);by.get(r.representative_product_id).push(r)}
  const ids=[...by.keys()].sort();
  if(ids.length<perCategory) throw new Error(`INSUFFICIENT_PRODUCTS:${doc.category_id}:${ids.length}`);
  const start=(cycleIndex*perCategory)%ids.length;
  const selected=[];for(let i=0;i<perCategory;i++)selected.push(ids[(start+i)%ids.length]);
  const selectedSet=new Set(selected);
  const ordered=[...selected.flatMap(id=>by.get(id)),...ids.filter(id=>!selectedSet.has(id)).flatMap(id=>by.get(id))];
  doc.records=ordered;
  doc.discovery_rotation={cycle_index:cycleIndex,selected_product_ids:selected,products_per_category:perCategory};
  fs.writeFileSync(p,JSON.stringify(doc));
  rotatedProducts+=selected.length;
}
manifest.discovery_rotation={cycle_index:cycleIndex,rotation_cycle_count:10,products_per_category_per_cycle:2,selected_products_total:rotatedProducts};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({status:'PASS',cycle_index:cycleIndex,selected_products_total:rotatedProducts,shards:manifest.shards?.length||0,production:'HOLD'}));
