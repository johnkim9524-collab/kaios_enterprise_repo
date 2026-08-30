#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
const [receiptPath, contractPath] = process.argv.slice(2);
if (!receiptPath || !contractPath) throw new Error('USAGE_RECEIPT_CONTRACT');
const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8')), contract=JSON.parse(fs.readFileSync(contractPath,'utf8'));
const hash = value => 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assert=(v,c)=>{if(!v)throw new Error(c)};
const readRows = path => { const result=new Map(); for(const row of JSON.parse(fs.readFileSync(path,'utf8')).records){assert(row.source_id,'UPSTREAM_SOURCE_ID_MISSING');assert(!result.has(row.source_id),'UPSTREAM_SOURCE_ID_DUPLICATE');result.set(row.source_id,row)} return result; };
const valueBy=readRows(receipt.inputs.product_value), rightsBy=readRows(receipt.inputs.rights), snapshotBy=readRows(receipt.inputs.snapshots), schemaBy=readRows(receipt.inputs.schemas);
assert(receipt.id==='kidults-asi-source-eligibility-receipts-v1'&&receipt.version==='1.0.0','IDENTITY');
assert(receipt.purpose_id===contract.purpose_id,'PURPOSE_DRIFT');
assert(new Set(receipt.records.map(r=>r.source_id)).size===receipt.records.length,'SOURCE_ID_DUPLICATE');
for(const row of receipt.records){
  assert(row.binding?.source_id===row.source_id&&row.binding?.purpose_id===receipt.purpose_id,'BINDING_IDENTITY');
  assert(row.receipt_digest===hash(row.binding),'RECEIPT_DIGEST_INVALID');
  const required=contract.required_bindings.every(key=>row.binding[key]!==undefined&&row.binding[key]!==null);
  const unexpired=Number.isFinite(Date.parse(row.binding.expires_at))&&Date.parse(row.binding.expires_at)>Date.parse(receipt.evaluated_at);
  const eligible=row.state==='ELIGIBLE';
  const value=valueBy.get(row.source_id), rights=rightsBy.get(row.source_id), snapshot=snapshotBy.get(row.source_id), schema=schemaBy.get(row.source_id);
  assert(row.binding.product_value_digest===(value?hash(value):null),'PRODUCT_VALUE_BINDING_DRIFT');
  assert(row.binding.rights_record_digest===(rights?hash(rights):null),'RIGHTS_BINDING_DRIFT');
  assert(row.binding.source_content_snapshot_digest===(snapshot?hash(snapshot):null),'SNAPSHOT_BINDING_DRIFT');
  assert(row.binding.source_schema_digest===(schema?hash(schema):null),'SCHEMA_BINDING_DRIFT');
  const evidenceEligible=Boolean(value&&rights&&snapshot&&schema&&
    value.value_admission_status===contract.eligibility_rules.value_status&&value.hard_minimum_complete===true&&Number.isFinite(value.value_score)&&value.value_score>=contract.eligibility_rules.minimum_value_score&&
    rights.decision===contract.eligibility_rules.rights_decision&&Object.entries(contract.eligibility_rules.required_rights).every(([key,val])=>rights.rights?.[key]===val)&&
    snapshot.capture_state===contract.eligibility_rules.snapshot_state&&snapshot.decision_promotion_eligible===true&&snapshot.source_content_sha256&&snapshot.governed_object_ref&&
    schema.state===contract.eligibility_rules.schema_state&&schema.terminal_sold_compatible===true&&schema.schema_sha256&&schema.sample_digest&&unexpired);
  assert(eligible===evidenceEligible,'ELIGIBILITY_NOT_DERIVED_FROM_EVIDENCE');
  assert(!eligible||required,'ELIGIBLE_BINDING_INCOMPLETE');
  assert(!eligible||unexpired,'ELIGIBLE_RECEIPT_EXPIRED');
  assert(!eligible||row.failures.length===0,'ELIGIBLE_WITH_FAILURES');
  assert(row.product_content_admission_authorized===eligible&&row.adapter_activation_authorized===eligible,'AUTHORIZATION_STATE_DRIFT');
  assert(row.production_authorized===false,'PRODUCTION_PROMOTION');
}
const eligible=receipt.records.filter(r=>r.state==='ELIGIBLE').length;
assert(receipt.summary.eligible===eligible&&receipt.summary.hold===receipt.records.length-eligible,'SUMMARY_DRIFT');
assert(receipt.summary.product_content_admitted===eligible&&receipt.summary.adapter_activation_authorized===eligible,'ADMISSION_SUMMARY_DRIFT');
assert(receipt.truth_boundary.metadata_discovery_admission_is_product_content_admission===false,'METADATA_CONTENT_BOUNDARY_WEAKENED');
console.log(JSON.stringify({suite:'ASI_SOURCE_ELIGIBILITY_RECEIPTS_V1',result:'VERIFIED_PASS',sources:receipt.records.length,eligible,hold:receipt.records.length-eligible}));
