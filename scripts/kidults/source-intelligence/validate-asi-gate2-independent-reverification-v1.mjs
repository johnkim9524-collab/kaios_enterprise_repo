#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-gate2-independent-reverification-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-gate2-independent-reverification-v1')fail('id mismatch');
if(x.status!=='SHADOW_GATE2_INDEPENDENT_REVERIFICATION_COMPLETE')fail('status mismatch');
if(x.requested_purpose!=='DISCOVERY_METADATA_INDEX_ONLY')fail('purpose mismatch');
if(x.gate1_decision_reuse_forbidden!==true)fail('Gate1 reuse rule missing');
if(x.collection_right_created!==false||x.acquisition_authorized!==false)fail('Gate2 crossed acquisition boundary');
if(x.production!=='HOLD'||x.public_release!=='HOLD')fail('Production/Public must HOLD');
const all=[...(x.verified_eligible_pool||[]),...(x.conditional_approval_queue||[]),...(x.needs_clarification_queue||[]),...(x.blocked_queue||[])];
if(all.length!==Number(x.input_safe_candidate_count||0))fail('partition mismatch');
if((x.receipts||[]).length!==all.length)fail('receipt count mismatch');
for(const r of x.receipts||[]){
 if(r.receipt_type!=='GATE_2_INDEPENDENT_REVERIFICATION_RECEIPT')fail('receipt type mismatch');
 if(r.gate1_decision_used_as_evidence!==false)fail('Gate1 decision reused as evidence');
 if(r.collection_right_created!==false||r.store_right_created!==false||r.derive_right_created!==false||r.redistribution_right_created!==false||r.acquisition_authorized!==false)fail('rights self-promotion');
 if(r.decision==='VERIFIED_FOR_GATE_3'){
  if(r.purpose_rights_matrix?.discover_metadata!=='ALLOW')fail('verified receipt lacks metadata right');
  if(!r.independent_evidence?.evidence_fingerprint)fail('verified receipt lacks independent evidence');
 }
 for(const k of ['collect','store','derive','redistribute','public_project','sold_event_fields','listing_fields','population_or_census_fields'])if(r.purpose_rights_matrix?.[k]!=='UNKNOWN')fail(`unproven purpose promoted: ${k}`);
}
for(const c of x.verified_eligible_pool||[])if(c.gate_2_state!=='VERIFIED_FOR_GATE_3')fail('verified pool contamination');
console.log(JSON.stringify({status:'PASS',input:x.input_safe_candidate_count,verified_for_gate3:x.verified_for_gate3_count,clarification:x.needs_clarification_count,stale_gate1:x.stale_gate1_count,production:x.production},null,2));
