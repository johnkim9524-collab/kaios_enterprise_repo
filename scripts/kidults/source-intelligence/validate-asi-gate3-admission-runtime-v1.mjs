#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-gate3-admission-runtime-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-gate3-admission-runtime-v1')fail('id mismatch');
if(x.status!=='SHADOW_GATE3_ADMISSION_CLASSIFICATION_COMPLETE')fail('status mismatch');
if(x.requested_purpose!=='DISCOVERY_METADATA_INDEX_ONLY')fail('purpose mismatch');
if(x.content_acquisition_authorized!==false||x.collection_right_created!==false)fail('Gate3 created acquisition/collection right');
if(x.admission_scope_limited_to_discovery_metadata_index_only!==true)fail('admission scope not bounded');
if(x.production!=='HOLD'||x.public_release!=='HOLD')fail('Production/Public must HOLD');
const all=[...(x.bounded_metadata_index_admission_pool||[]),...(x.external_approval_queue||[]),...(x.conditional_hold_queue||[]),...(x.rejected_queue||[])];
if(all.length!==Number(x.input_verified_for_gate3_count||0))fail('Gate3 partition mismatch');
for(const r of x.receipts||[]){
  if(r.gate!=='GATE_3_ADMISSION_ACTIVATION_VERIFICATION')fail('gate mismatch');
  if(r.requested_purpose!=='DISCOVERY_METADATA_INDEX_ONLY')fail('receipt purpose mismatch');
  if(r.collection_right_created!==false||r.store_right_created!==false||r.derive_right_created!==false||r.redistribution_right_created!==false)fail('rights self-promotion');
  if(r.content_acquisition_authorized!==false)fail('content acquisition authorized');
  if(r.public_projection!==false||r.production!=='HOLD')fail('public/production bypass');
  if(r.runtime_controls?.target_site_body_crawl!==false||r.runtime_controls?.content_acquisition!==false||r.runtime_controls?.credential_activation!==false)fail('runtime control weakened');
  if(r.decision==='ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION'&&r.metadata_index_admission_authorized!==true)fail('admitted receipt missing bounded metadata authorization');
}
for(const c of x.bounded_metadata_index_admission_pool||[]){
  if(c.gate_3_state!=='ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION')fail('admitted pool contamination');
  if(c.admission_state!=='ADMITTED_DISCOVERY_METADATA_INDEX_ONLY')fail('admission state too broad');
  if(c.acquisition_authorized!==false||c.content_acquisition_authorized!==false)fail('content acquisition bypass');
  const g2=c.gate_2_receipt||{};
  if(g2.decision!=='VERIFIED_FOR_GATE_3')fail('Gate2 decision invalid');
  if(g2.purpose_rights_matrix?.discover_metadata!=='ALLOW')fail('discover_metadata not allowed');
  for(const k of ['collect','store','derive','internal_calibration','retention','redistribute','public_project','sold_event_fields','listing_fields','population_or_census_fields'])if(g2.purpose_rights_matrix?.[k]!=='UNKNOWN')fail(`unproven purpose promoted: ${k}`);
}
console.log(JSON.stringify({status:'PASS',admitted:x.admitted_count,external_approval:x.external_approval_required_count,hold:x.conditional_hold_count,rejected:x.rejected_count,production:x.production},null,2));
