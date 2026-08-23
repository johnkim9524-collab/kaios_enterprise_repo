#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const steeringPath=process.argv[2]||'/tmp/asi-discovery-steering-plan-v1.json';
const balancePath=process.argv[3]||'/tmp/asi-throughput-coverage-autobalance-live-v1.json';
const outPath=process.argv[4]||'/tmp/asi-discovery-steering-plan-autobalanced-v1.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const p=read(steeringPath);
const b=read(balancePath);
if(p.production!=='HOLD'||p.public_release!=='HOLD')throw new Error('STEERING_BOUNDARY');
if(b.status!=='SHADOW_AUTOBALANCE_PLAN_READY'||b.production!=='HOLD'||b.public_release!=='HOLD')throw new Error('AUTOBALANCE_BOUNDARY');
if(b.rules?.rights_gate_can_never_be_weakened!==true||b.rules?.production_or_public_scope_can_never_expand!==true)throw new Error('AUTOBALANCE_PERMISSION_BOUNDARY');
const cycleIndex=Number(p.current_cycle?.cycle_index??-1);
if(!Number.isInteger(cycleIndex)||cycleIndex<0||cycleIndex>9)throw new Error('CYCLE_INDEX');
const scopeWeight=new Map((b.next_cycle_budget?.scope_priorities||[]).map(x=>[x.id,Number(x.priority_weight||1)]));
const regionWeight=new Map((b.next_cycle_budget?.region_priorities||[]).map(x=>[x.id,Number(x.priority_weight||1)]));
const balanceDigest=sha({throughput:b.throughput,coverage:b.coverage,next_cycle_budget:b.next_cycle_budget,rules:b.rules});

// A frozen 10-cycle sweep cannot be reordered mid-sweep. Budget is applied only at cycle 0.
if(cycleIndex!==0){
  const out={...p,autobalance:{state:'DEFERRED_TO_NEXT_SWEEP',budget_digest:balanceDigest,reason:'FROZEN_SWEEP_FAIRNESS',rights_gate_unchanged:true},public_release:'HOLD',production:'HOLD'};
  fs.writeFileSync(outPath,JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',autobalance:'DEFERRED_TO_NEXT_SWEEP',cycle_index:cycleIndex,selected_products:p.current_cycle?.selected_products_total,production:'HOLD'}));
  process.exit(0);
}

let influenced=0;
const categories=[];
for(const c of p.category_plans||[]){
  const products=(c.ordered_products||[]).map(x=>{
    const sw=(x.acquisition_category_scopes||[]).map(s=>scopeWeight.get(s)||1);
    const rw=(x.target_regions||[]).map(r=>regionWeight.get(r)||1);
    const scopeFactor=sw.length?Math.max(...sw):1;
    const regionFactor=rw.length?Math.max(...rw):1;
    const modifier=Number(((scopeFactor+regionFactor)/2).toFixed(6));
    if(modifier>1)influenced++;
    const base=Number(x.steering_priority||0);
    const combined=Number((base*modifier + Number(x.market_structure_modifier||0)*0.000001).toFixed(9));
    return {...x,autobalance_scope_factor:scopeFactor,autobalance_region_factor:regionFactor,autobalance_modifier:modifier,autobalanced_priority:combined};
  });
  products.sort((a,b)=>b.autobalanced_priority-a.autobalanced_priority||b.steering_priority-a.steering_priority||a.representative_product_id.localeCompare(b.representative_product_id));
  const cycles=[];for(let i=0;i<10;i++)cycles.push({cycle_index:i,selected_product_ids:products.slice(i*2,i*2+2).map(x=>x.representative_product_id)});
  categories.push({...c,ordered_products:products,cycles});
}
const selectedByCategory=Object.fromEntries(categories.map(c=>[c.category_id,c.cycles[0].selected_product_ids]));
const selected=Object.values(selectedByCategory).flat();
if(categories.length!==8||selected.length!==16||new Set(selected).size!==16)throw new Error('OVERLAY_SELECTION');
const all=categories.flatMap(c=>c.cycles.flatMap(x=>x.selected_product_ids));
if(all.length!==160||new Set(all).size!==160)throw new Error('OVERLAY_FULL_SWEEP_FAIRNESS');
const out={...p,version:'1.2.0',category_plans:categories,current_cycle:{...p.current_cycle,selected_products_total:16,selected_product_ids:selected,selected_by_category:selectedByCategory},autobalance:{state:'APPLIED_AT_SWEEP_BOUNDARY',budget_digest:balanceDigest,influenced_products:influenced,provider_diversification_required:Boolean(b.next_cycle_budget?.provider_diversification_required),rights_gate_unchanged:true},truth_boundary:'Autobalance may reorder discovery priority only at a new 10-cycle sweep boundary. It cannot alter source rights, admission, runtime permissions, Production/Public state, or exactly-once 160-anchor sweep fairness.',public_release:'HOLD',production:'HOLD'};
out.plan_digest=sha({base_plan_digest:p.plan_digest,budget_digest:balanceDigest,category_plans:categories});
fs.writeFileSync(outPath,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',autobalance:'APPLIED_AT_SWEEP_BOUNDARY',cycle_index:0,influenced_products:influenced,selected_products:16,production:'HOLD'}));
