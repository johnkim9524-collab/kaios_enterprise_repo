#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const [valuePath, rightsPath, snapshotPath, schemaPath, contractPath, outputPath='/tmp/asi-source-eligibility-receipts-v1.json', evaluatedAtArg] = process.argv.slice(2);
if (![valuePath, rightsPath, snapshotPath, schemaPath, contractPath].every(Boolean)) throw new Error('USAGE_VALUE_RIGHTS_SNAPSHOT_SCHEMA_CONTRACT_OUTPUT');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = value => 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const values=read(valuePath), rights=read(rightsPath), snapshots=read(snapshotPath), schemas=read(schemaPath), contract=read(contractPath);
const evaluatedAt = evaluatedAtArg || new Date().toISOString();
if (!Number.isFinite(Date.parse(evaluatedAt))) throw new Error('EVALUATED_AT_INVALID');
const map = (rows, name) => { const result=new Map(); for(const row of rows||[]){if(!row.source_id)throw new Error(`${name}_SOURCE_ID_MISSING`);if(result.has(row.source_id))throw new Error(`${name}_SOURCE_ID_DUPLICATE`);result.set(row.source_id,row)} return result; };
const valueBy=map(values.records,'VALUE'), rightsBy=map(rights.records,'RIGHTS'), snapshotBy=map(snapshots.records,'SNAPSHOT'), schemaBy=map(schemas.records,'SCHEMA');
const rightsAllowed = r => r?.decision === contract.eligibility_rules.rights_decision && Object.entries(contract.eligibility_rules.required_rights).every(([key,val]) => r.rights?.[key] === val);
const records=[];
for (const [sourceId, right] of rightsBy) {
  const value=valueBy.get(sourceId), snapshot=snapshotBy.get(sourceId), schema=schemaBy.get(sourceId);
  const failures=[];
  if (!value || value.value_admission_status !== contract.eligibility_rules.value_status || value.hard_minimum_complete !== true || !Number.isFinite(value.value_score) || value.value_score < contract.eligibility_rules.minimum_value_score) failures.push('PRODUCT_VALUE_NOT_ELIGIBLE');
  if (!rightsAllowed(right)) failures.push('PURPOSE_RIGHTS_NOT_PASS');
  if (!snapshot || snapshot.capture_state !== contract.eligibility_rules.snapshot_state || snapshot.decision_promotion_eligible !== true || !snapshot.source_content_sha256 || !snapshot.governed_object_ref) failures.push('SOURCE_CONTENT_SNAPSHOT_NOT_BOUND');
  if (!schema || schema.state !== contract.eligibility_rules.schema_state || schema.terminal_sold_compatible !== true || !schema.schema_sha256 || !schema.sample_digest) failures.push('SOURCE_SPECIFIC_SCHEMA_NOT_BOUND');
  const expiryCandidates=[right?.evidence_binding?.recheck_due_at, schema?.expires_at].filter(Boolean);
  const expiresAt=expiryCandidates.length ? expiryCandidates.sort()[0] : null;
  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(evaluatedAt)) failures.push('EVIDENCE_EXPIRED_OR_EXPIRY_MISSING');
  const eligible=failures.length===0;
  const binding={source_id:sourceId,purpose_id:contract.purpose_id,product_value_digest:value?hash(value):null,rights_record_digest:hash(right),source_content_snapshot_digest:snapshot?hash(snapshot):null,source_schema_digest:schema?hash(schema):null,evaluated_at:evaluatedAt,expires_at:expiresAt};
  records.push({source_id:sourceId,purpose_id:contract.purpose_id,state:eligible?'ELIGIBLE':'HOLD',failures,binding,receipt_digest:hash(binding),product_content_admission_authorized:eligible,adapter_activation_authorized:eligible,production_authorized:false});
}
const eligible=records.filter(r=>r.state==='ELIGIBLE').length;
const output={id:'kidults-asi-source-eligibility-receipts-v1',version:'1.0.0',status:eligible?'BOUNDED_ELIGIBILITY_RECEIPTS_CREATED':'FAIL_CLOSED_NO_ELIGIBLE_SOURCE',evaluated_at:evaluatedAt,purpose_id:contract.purpose_id,inputs:{product_value:valuePath,rights: rightsPath,snapshots:snapshotPath,schemas:schemaPath,contract:contractPath},summary:{sources:records.length,eligible,hold:records.length-eligible,product_content_admitted:eligible,adapter_activation_authorized:eligible},records,truth_boundary:{metadata_discovery_admission_is_product_content_admission:false,production:'HOLD',public_release:'HOLD'}};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output.summary));
