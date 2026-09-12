#!/usr/bin/env node
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const script='scripts/kidults/source-intelligence/evaluate-asi-source-product-value-v1.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kidults-value-gate-'));
const base={source_id:'candidate-1',vertical:'CARS',customer_decisions:['UNDERSTAND_REALIZED_VALUE'],product_surfaces:['COMPARE'],coverage_gap_ids:['gap-1'],provenance_fields:['official_url','record_id'],primary_object_identifier:'lot_id',terminal_state_field:'status',realized_price_field:'price',value_dimensions:{customer_decision_impact:23,object_identity_and_joinability:18,transaction_or_market_signal:19,freshness_and_update_reliability:13,global_coverage_increment:8,source_resilience_and_fallback_value:7},rights:{collect:'ALLOW',store:'ALLOW',derive:'ALLOW',commercial_use:'ALLOW'}};
const run=x=>{const p=path.join(dir,Math.random()+'.json');fs.writeFileSync(p,JSON.stringify(x));return spawnSync(process.execPath,[script,p],{encoding:'utf8'})};
let p=run(base);if(p.status!==0)throw new Error('HIGH_VALUE_REJECTED');let out=JSON.parse(p.stdout);if(out.value_score!==88||out.acquisition_priority!=='READY_FOR_SCHEMA_AND_COHORT_REVIEW')throw new Error('HIGH_VALUE_RESULT');
p=run({...base,rights:{collect:'ALLOW',store:'ALLOW',derive:'ALLOW',commercial_use:'HOLD'}});out=JSON.parse(p.stdout);if(out.acquisition_priority!=='RIGHTS_REVIEW_REQUIRED')throw new Error('RIGHTS_NOT_SEPARATE');
p=run({...base,value_dimensions:{...base.value_dimensions,customer_decision_impact:5,transaction_or_market_signal:5}});out=JSON.parse(p.stdout);if(out.disposition!=='WATCHLIST_ONLY_RESEARCH_NO_ACQUISITION')throw new Error('MID_VALUE_PROMOTED');
for(const [name,patch] of [['no-customer',{customer_decisions:[]}],['no-product',{product_surfaces:[]}],['no-gap',{coverage_gap_ids:[]}],['no-id',{primary_object_identifier:null}],['no-provenance',{provenance_fields:[]}],['no-evidence',{terminal_state_field:null,realized_price_field:null}]]){
 if(run({...base,...patch}).status===0)throw new Error('HARD_MINIMUM_ACCEPTED:'+name);
}
console.log(JSON.stringify({suite:'KIDULTS_ASI_SOURCE_PRODUCT_VALUE_GATE_V1',result:'PASS',positive_cases:3,negative_cases:6,external_calls:0},null,2));
