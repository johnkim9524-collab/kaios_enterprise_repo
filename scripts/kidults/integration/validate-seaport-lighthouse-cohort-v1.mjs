#!/usr/bin/env node
import fs from 'node:fs';
const path=process.argv[2]||'artifacts/kidults-seaport-lighthouse/current-cohort.json';
const value=JSON.parse(fs.readFileSync(path,'utf8'));
const fail=(ok,code)=>{if(!ok)throw new Error(code)};
fail(value.record_type==='seaport_lighthouse_cohort','TYPE');
fail(value.admitted_count>=25&&value.admitted_count<=50,'COUNT_BOUND');
fail(value.admitted_count===value.unique_event_count,'DEDUPE');
fail(value.records.length===value.admitted_count,'RECORD_COUNT');
fail(value.sold_claim===false&&value.cohort_promotion_authorized===false,'PROMOTION');
fail(value.replay_authorized===false&&value.projection_authorized===false,'DOWNSTREAM');
fail(value.public_authorized===false&&value.production_authorized===false&&value.g5_authorized===false,'AUTHORITY');
for(const row of value.records){
 fail(row.market_observation_type==='ORDER_FULFILLED'&&row.sold_claim===false,'SOLD_RELABEL');
 fail(row.rights_state==='CONDITIONAL','RIGHTS_OVERCLAIM');
 fail(/^0x[a-f0-9]{64}$/i.test(row.transaction_hash)&&Number.isInteger(row.log_index),'IDENTITY');
 fail(/^sha256:[a-f0-9]{64}$/.test(row.source_payload_sha256),'DIGEST');
 fail(Date.now()-Date.parse(row.occurred_at)<=7*86400000,'FRESHNESS');
}
console.log(JSON.stringify({suite:'KIDULTS_SEAPORT_LIGHTHOUSE_VALIDATION_V1',result:'PASS',records:value.admitted_count,sold_claim:false,track_b:'READY_FOR_CONDITIONAL_BATCH_ASSESSMENT',public:'HOLD',production:'HOLD',g5:'HOLD'},null,2));
