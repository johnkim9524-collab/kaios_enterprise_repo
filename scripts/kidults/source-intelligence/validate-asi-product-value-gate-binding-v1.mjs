#!/usr/bin/env node
import fs from 'node:fs';const v=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/asi-product-value-gated-discovery-v1.json','utf8'));const a=(x,c)=>{if(!x)throw new Error(c)};
a(v.id==='kidults-asi-product-value-gated-discovery-v1'&&v.status==='PRODUCT_VALUE_GATE_APPLIED_BEFORE_RIGHTS_GATE1','IDENTITY');a(v.pre_value_gate_candidate_count===v.product_value_admitted_count+v.product_value_enrichment_queue_count,'ACCOUNTING');a(v.candidate_count===v.candidates.length&&v.product_value_admitted_count===v.candidates.length,'ADMITTED_COUNT');a(v.product_value_gate_fail_closed===true&&v.acquisition_authorized===false,'BOUNDARY');
for(const c of v.candidates)a(c.product_value_gate==='PASS'&&c.product_value_score>=70&&c.product_value_source_id,'UNQUALIFIED_GATE1');
for(const c of v.product_value_enrichment_queue)a(c.acquisition_authorized===false&&c.reason,'ENRICHMENT_PROMOTION');
a(new Set(v.product_value_enrichment_queue.map(x=>x.candidate_id)).size===v.product_value_enrichment_queue.length,'ENRICHMENT_DEDUPE');
console.log(JSON.stringify({suite:'KIDULTS_ASI_PRODUCT_VALUE_GATE_BINDING_V1',result:'PASS',gate1_candidates:v.candidate_count,enrichment_queue:v.product_value_enrichment_queue_count},null,2));
