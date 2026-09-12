#!/usr/bin/env node
import fs from 'node:fs';
const sourcePath=process.argv[2];
if(!sourcePath)throw new Error('SOURCE_RECORD_REQUIRED');
const s=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const requiredArrays=['customer_decisions','product_surfaces','coverage_gap_ids','provenance_fields'];
for(const f of requiredArrays)if(!Array.isArray(s[f])||s[f].length===0)throw new Error('PRODUCT_VALUE_HARD_MINIMUM:'+f);
if(!s.primary_object_identifier)throw new Error('PRODUCT_VALUE_HARD_MINIMUM:primary_object_identifier');
const evidenceModes=[
 Boolean(s.terminal_state_field&&s.realized_price_field),
 Boolean(s.authoritative_identity_or_specification),
 Boolean(s.population_or_supply_measure),
 Boolean(s.repeatable_market_activity_measure)
];
if(!evidenceModes.some(Boolean))throw new Error('PRODUCT_VALUE_HARD_MINIMUM:evidence_mode');
const weights={customer_decision_impact:25,object_identity_and_joinability:20,transaction_or_market_signal:20,freshness_and_update_reliability:15,global_coverage_increment:10,source_resilience_and_fallback_value:10};
let score=0;
for(const [metric,max] of Object.entries(weights)){
 const n=s.value_dimensions?.[metric];
 if(!Number.isFinite(n)||n<0||n>max)throw new Error('VALUE_DIMENSION_INVALID:'+metric);
 score+=n;
}
let disposition=score>=70?'VALUE_ELIGIBLE_CONTINUE_RIGHTS_REVIEW':score>=50?'WATCHLIST_ONLY_RESEARCH_NO_ACQUISITION':'REJECT_LOW_CUSTOMER_VALUE';
const rights=s.rights||{};
const rightsReady=['collect','store','derive','commercial_use'].every(k=>rights[k]==='ALLOW');
const acquisitionPriority=disposition==='VALUE_ELIGIBLE_CONTINUE_RIGHTS_REVIEW'?(rightsReady?'READY_FOR_SCHEMA_AND_COHORT_REVIEW':'RIGHTS_REVIEW_REQUIRED'):'NOT_ACQUISITION_ELIGIBLE';
const result={source_id:s.source_id,vertical:s.vertical,value_score:score,disposition,acquisition_priority:acquisitionPriority,rights_clear_for_purpose:rightsReady,open_access_is_product_value:false,production_authorized:false};
console.log(JSON.stringify(result,null,2));
