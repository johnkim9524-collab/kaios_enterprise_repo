#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const queueDir=process.argv[2]||'queue';
const feedbackPath=process.argv[3]||'/tmp/global-data-acquisition-master-matrix-feedback-v1.json';
const previousPlanPath=process.argv[4]||'/tmp/previous-source-pool/asi-discovery-steering-plan-v1.json';
const cycleCount=Number(process.argv[5]||0);
const outPath=process.argv[6]||'/tmp/asi-discovery-steering-plan-v1.json';
if(!Number.isInteger(cycleCount)||cycleCount<0)throw new Error('INVALID_CYCLE_COUNT');
const sweepNumber=Math.floor(cycleCount/10),cycleIndex=cycleCount%10;
const sha=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const feedback=JSON.parse(fs.readFileSync(feedbackPath,'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(queueDir,'manifest.json'),'utf8'));
if(feedback.id!=='kidults-global-data-acquisition-master-matrix-feedback-v1'||feedback.production!=='HOLD'||feedback.public_release!=='HOLD')throw new Error('FEEDBACK_BOUNDARY');
if(manifest.production!=='HOLD'||manifest.named_products!==160||manifest.shards?.length!==8)throw new Error('QUEUE_BOUNDARY');
const planInputFingerprint=sha({registry:manifest.input_registry_fingerprint,topology:manifest.global_topology_id});
const relevantEvidenceByGap={IDENTITY:['IDENTITY_CANONICAL_REFERENCE'],AUTHENTICITY:['IDENTITY_CANONICAL_REFERENCE'],SOLD_TRANSACTION:['CURRENT_SOLD_TRANSACTION']};
const feedbackRows=feedback.evidence_bindings||[];
const feedbackDigest=sha({summary:feedback.market_structure_feedback_summary,rows:feedbackRows.map(r=>[r.category_scope,r.macroregion_id,r.evidence_class,r.effective_priority_score,r.market_structure_feedback?.modifier||0])});
function validateReusable(p){
  if(!p||p.status!=='FROZEN_FEEDBACK_AWARE_SWEEP_PLAN'||p.production!=='HOLD'||p.public_release!=='HOLD')return false;
  if(p.sweep_number!==sweepNumber||p.plan_input_fingerprint!==planInputFingerprint)return false;
  if(!Array.isArray(p.category_plans)||p.category_plans.length!==8)return false;
  for(const c of p.category_plans){if(!Array.isArray(c.ordered_products)||c.ordered_products.length!==20||!Array.isArray(c.cycles)||c.cycles.length!==10)return false;const ids=c.ordered_products.map(x=>x.representative_product_id);if(new Set(ids).size!==20)return false;const selected=c.cycles.flatMap(x=>x.selected_product_ids);if(selected.length!==20||new Set(selected).size!==20)return false;}
  return true;
}
let plan=null,reused=false;
if(fs.existsSync(previousPlanPath)){
  try{const p=JSON.parse(fs.readFileSync(previousPlanPath,'utf8'));if(validateReusable(p)){plan=p;reused=true;}}catch{}
}
if(!plan){
  const categoryPlans=[];let feedbackInfluencedProducts=0;
  for(const shard of manifest.shards||[]){
    const doc=JSON.parse(fs.readFileSync(path.join(queueDir,shard.file),'utf8'));
    const by=new Map();for(const r of doc.records||[]){if(!by.has(r.representative_product_id))by.set(r.representative_product_id,[]);by.get(r.representative_product_id).push(r)}
    if(by.size!==20)throw new Error(`EXPECTED_20_PRODUCTS:${doc.category_id}:${by.size}`);
    const products=[];
    for(const [id,rows] of by){
      const first=rows[0];
      const scope=first.collection_scope_id;
      const regions=[...new Set(rows.flatMap(r=>r.target_regions||[]))];
      const evidence=[...new Set(rows.flatMap(r=>relevantEvidenceByGap[r.evidence_gap_class]||[]))];
      const matched=feedbackRows.filter(r=>r.category_scope===scope&&regions.includes(r.macroregion_id)&&evidence.includes(r.evidence_class));
      const priority=matched.length?Math.max(...matched.map(r=>Number(r.effective_priority_score??r.priority_score??0))):0;
      const modifier=matched.length?Math.max(...matched.map(r=>Number(r.market_structure_feedback?.modifier||0))):0;
      if(modifier>0)feedbackInfluencedProducts++;
      products.push({representative_product_id:id,collection_scope_id:scope,target_regions:regions,relevant_evidence_classes:evidence,steering_priority:Number(priority.toFixed(6)),market_structure_modifier:Number(modifier.toFixed(6))});
    }
    products.sort((a,b)=>b.steering_priority-a.steering_priority||b.market_structure_modifier-a.market_structure_modifier||a.representative_product_id.localeCompare(b.representative_product_id));
    const cycles=[];for(let i=0;i<10;i++)cycles.push({cycle_index:i,selected_product_ids:products.slice(i*2,i*2+2).map(x=>x.representative_product_id)});
    categoryPlans.push({category_id:doc.category_id,ordered_products:products,cycles});
  }
  categoryPlans.sort((a,b)=>a.category_id.localeCompare(b.category_id));
  plan={id:'kidults-asi-discovery-steering-plan-v1',version:'1.0.0',status:'FROZEN_FEEDBACK_AWARE_SWEEP_PLAN',sweep_number:sweepNumber,created_from_cycle_count:cycleCount,plan_input_fingerprint:planInputFingerprint,feedback_matrix_id:feedback.id,feedback_digest:feedbackDigest,feedback_modified_rows:Number(feedback.market_structure_feedback_summary?.modified_rows||0),feedback_influenced_products:feedbackInfluencedProducts,category_plans:categoryPlans,truth_boundary:'Market feedback changes frozen discovery order only. The complete 160-anchor sweep remains exactly-once across 10 cycles and rights/admission/runtime/source-access permissions are unchanged.',public_release:'HOLD',production:'HOLD'};
  plan.plan_digest=sha({sweep_number:plan.sweep_number,plan_input_fingerprint:plan.plan_input_fingerprint,feedback_digest:plan.feedback_digest,category_plans:plan.category_plans});
}
const selectedByCategory=Object.fromEntries(plan.category_plans.map(c=>[c.category_id,c.cycles[cycleIndex].selected_product_ids]));
const selected=[...Object.values(selectedByCategory).flat()];
if(selected.length!==16||new Set(selected).size!==16)throw new Error('CURRENT_CYCLE_SELECTION');
const output={...plan,current_cycle:{cycle_count:cycleCount,cycle_index:cycleIndex,selected_products_total:selected.length,selected_product_ids:selected,selected_by_category:selectedByCategory},reused_prior_plan:reused};
fs.writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',sweep_number:sweepNumber,cycle_index:cycleIndex,reused_prior_plan:reused,feedback_modified_rows:output.feedback_modified_rows,feedback_influenced_products:output.feedback_influenced_products,selected_products_total:selected.length,production:'HOLD'}));
