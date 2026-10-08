import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeBusinessInputStage} from '../../../scripts/kidults/runtime/execute-business-input-stage-v1.mjs';
import {canonicalJsonDigest} from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import {NOW,batchEnvelope,rawObservation,receiptRegistryFor,sealObservation} from '../market/current-sold-test-helpers-v1.mjs';
import {verifyValueChainDomainReceipt} from '../../../scripts/kidults/kpmo/lib/whole-platform-runtime-evidence-v1.mjs';
function fixture(){const r=sealObservation(rawObservation()),envelope=batchEnvelope([r]),receiptRegistry=receiptRegistryFor(r);
  const binding={purpose:'CURRENT_SOLD_TRANSACTION',source_roles:['SOLD_TRANSACTION'],
    evidence_classes:['CURRENT_SOLD_TRANSACTION'],fields:['transaction_id','sold_status','realized_price','currency','sale_date'],
    outputs:['INTERNAL_CURRENT_SOLD_EVIDENCE'],scope_verified:true,time_scope_verified:true,freshness_verified:true,license_scope_verified:true,
    evidence_refs:['registry:unit-test-only'],evidence_digest:'sha256:'+'a'.repeat(64),
    observed_at:new Date(NOW.getTime()-1000).toISOString(),review_due_at:new Date(NOW.getTime()+100000).toISOString()};
  return {envelope,receiptRegistry,sourceSha:envelope.source_sha,runId:envelope.canonical_run_id,now:NOW,
    expectedRegistryDigest:canonicalJsonDigest(receiptRegistry),purposeRights:[{source_id:r.source_id,rights_state:'ALLOW',
      purpose_rights:{collect:'ALLOW',store:'ALLOW',derive:'ALLOW'},commercial_use_authorized:true,access_authorized:true,purpose_bindings:[binding]}]};}
test('executes rights, atomic admission and exact input-to-Evidence lineage without minting empirical authority',()=>{
  const f=fixture(),r=executeBusinessInputStage(f);
  assert.equal(r.bundle.evidence.length,1);assert.equal(r.lineage.input_digest,canonicalJsonDigest(f.envelope));
  assert.equal(r.lineage.evidence_digest,r.bundle.receipt.evidence_digest);
  assert.equal(r.native_domain_state,'HOLD');assert.equal(r.native_domain_receipt_emitted,false);
  for(const k of ['empirical_inputs_authenticated','acquisition_authorized','ledger_write_authorized','immutable_candidate_created','track_b_started','promotion_authority'])assert.equal(r[k],false);
  assert.throws(()=>verifyValueChainDomainReceipt(r,'ASI_EXECUTION',{id:1,run_attempt:1},f.sourceSha));
});
for(const [name,mutate] of [
  ['source drift',f=>f.sourceSha='b'.repeat(40)],['run drift',f=>f.runId='other-run'],
  ['missing input',f=>f.envelope.observations=[]],['unbounded input',f=>f.envelope.observations=Array(101).fill(f.envelope.observations[0])],
  ['missing rights',f=>f.purposeRights=[]],['duplicate rights',f=>f.purposeRights.push(f.purposeRights[0])],
  ['rights denial',f=>f.purposeRights[0].rights_state='DENY'],['historical-only rights',f=>f.purposeRights[0].purpose_bindings[0].evidence_classes=['HISTORICAL_SALE_ACTIVITY']],
  ['stale rights',f=>f.purposeRights[0].purpose_bindings[0].review_due_at='2000-01-01T00:00:00Z'],
  ['registry digest drift',f=>f.expectedRegistryDigest='sha256:'+'b'.repeat(64)],
  ['unregistered acquisition',f=>f.envelope.observations[0].acquisition_receipt_id='missing'],
])test(`rejects ${name}`,()=>{const f=fixture();mutate(f);assert.throws(()=>executeBusinessInputStage(f));});
