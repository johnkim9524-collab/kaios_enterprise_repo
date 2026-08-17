#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sourceQueueDir=process.argv[2]||'queue160';
const outDir=process.argv[3]||'queue64';
const selectionPath=process.argv[4]||'coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json';
const selection=JSON.parse(fs.readFileSync(selectionPath,'utf8'));
const selected=new Set(selection.records.map(x=>x.representative_product_id));
const scopeByProduct=new Map(selection.records.map(x=>[x.representative_product_id,x.target_scope_id]));
if(selected.size!==64) throw new Error(`Expected 64 selected products, got ${selected.size}`);
const sourceManifest=JSON.parse(fs.readFileSync(path.join(sourceQueueDir,'manifest.json'),'utf8'));
fs.mkdirSync(outDir,{recursive:true});
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const shards=[];let total=0;const seenProducts=new Set(),seenScopes=new Set();
for(const shard of sourceManifest.shards){
  const src=JSON.parse(fs.readFileSync(path.join(sourceQueueDir,shard.file),'utf8'));
  const records=(src.records||[]).filter(r=>selected.has(r.representative_product_id)).map(r=>({...r,poc_target_scope_id:scopeByProduct.get(r.representative_product_id),queue_state:'SELF_COLLECTED_POC_DISCOVERY_READY',acquisition_authorized:false}));
  for(const r of records){seenProducts.add(r.representative_product_id);seenScopes.add(r.poc_target_scope_id)}
  if(!records.length) continue;
  const payload={id:`scope-poc-targeted-queue-${src.category_id}-v1`,version:'1.0.0',status:'SELF_COLLECTED_POC_DISCOVERY_READY',category_id:src.category_id,record_count:records.length,records,acquisition_authorized:false,production:'HOLD'};
  const text=JSON.stringify(payload);const file=shard.file;fs.writeFileSync(path.join(outDir,file),text);shards.push({category_id:src.category_id,file,record_count:records.length,sha256:sha(text)});total+=records.length;
}
if(seenProducts.size!==64) throw new Error(`Expected 64 queue products, got ${seenProducts.size}`);
if(seenScopes.size!==32) throw new Error(`Expected 32 scopes, got ${seenScopes.size}`);
if(total!==512) throw new Error(`Expected 512 demand rows, got ${total}`);
const manifest={id:'scope-self-collected-poc-targeted-queue-v1',version:'1.0.0',status:'MATERIALIZED_SELF_COLLECTED_POC_DISCOVERY_READY',source_queue_manifest:sourceManifest.id,selection_id:selection.id,selected_products:64,scopes:32,demand_records:512,evidence_gap_classes_per_product:8,north_star:{autonomous:'PASS',global:'PASS_PLANNING_TOPOLOGY_EMPIRICAL_PENDING',irreplaceable_value:'PASS',transparent:'PASS'},discovery_active:true,acquisition_authorized:false,provider_contact_authorized:false,production:'HOLD',shards};
fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({products:64,scopes:32,demand_records:512,shards:shards.length,north_star:manifest.north_star},null,2));
