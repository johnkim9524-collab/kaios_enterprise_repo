#!/usr/bin/env node
import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/asi-discovery-steering-plan-autobalanced-v1.json','utf8'));
const fail=m=>{throw new Error(m)};
if(p.production!=='HOLD'||p.public_release!=='HOLD')fail('BOUNDARY');
if(!p.autobalance||p.autobalance.rights_gate_unchanged!==true)fail('AUTOBALANCE_BOUNDARY');
if(!['APPLIED_AT_SWEEP_BOUNDARY','DEFERRED_TO_NEXT_SWEEP'].includes(p.autobalance.state))fail('AUTOBALANCE_STATE');
if(!Array.isArray(p.category_plans)||p.category_plans.length!==8)fail('CATEGORY_COUNT');
const all=[];
for(const c of p.category_plans){
  if(!Array.isArray(c.ordered_products)||c.ordered_products.length!==20||!Array.isArray(c.cycles)||c.cycles.length!==10)fail(`CATEGORY_SHAPE:${c.category_id}`);
  const ids=c.ordered_products.map(x=>x.representative_product_id);if(new Set(ids).size!==20)fail(`CATEGORY_DUP:${c.category_id}`);
  for(const x of c.ordered_products){
    if('rights_state'in x||'admission_state'in x||'runtime_state'in x||'acquisition_authorized'in x)fail(`PERMISSION_FIELD:${x.representative_product_id}`);
    if(p.autobalance.state==='APPLIED_AT_SWEEP_BOUNDARY'&&(!Number.isFinite(x.autobalance_modifier)||x.autobalance_modifier<1||!Number.isFinite(x.autobalanced_priority)))fail(`MODIFIER:${x.representative_product_id}`);
  }
  const selected=c.cycles.flatMap(x=>x.selected_product_ids);if(selected.length!==20||new Set(selected).size!==20)fail(`FULL_SWEEP:${c.category_id}`);
  all.push(...selected);
}
if(all.length!==160||new Set(all).size!==160)fail('GLOBAL_160');
if(p.current_cycle?.selected_products_total!==16||new Set(p.current_cycle?.selected_product_ids||[]).size!==16)fail('CURRENT_16');
if(p.autobalance.state==='APPLIED_AT_SWEEP_BOUNDARY'&&p.current_cycle?.cycle_index!==0)fail('MID_SWEEP_APPLY_FORBIDDEN');
console.log(JSON.stringify({status:'PASS',autobalance_state:p.autobalance.state,cycle_index:p.current_cycle?.cycle_index,global_unique_products:160,selected_this_cycle:16,production:'HOLD'}));
