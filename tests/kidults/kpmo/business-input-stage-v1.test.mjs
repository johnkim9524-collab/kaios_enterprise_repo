import './native-input-chain-boundary-v1.test.mjs';
import './runtime-domain-workloads-v1.test.mjs';
import './runtime-domain-output-consumers-v1.test.mjs';
import './authenticated-runtime-domain-outputs-v1.test.mjs';
import {test} from 'node:test';
// Keep the native transport adversaries in the existing required CI suite.
import './authenticated-business-input-v1.test.mjs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {executeBoundBusinessInput} from '../../../scripts/kidults/runtime/execute-bound-business-input-v1.mjs';
import {executeBusinessInputStage} from '../../../scripts/kidults/runtime/execute-business-input-stage-v1.mjs';
import {canonicalJsonDigest} from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import {NOW,batchEnvelope,rawObservation,receiptRegistryFor,sealObservation} from '../market/current-sold-test-helpers-v1.mjs';
import {verifyValueChainDomainReceipt} from '../../../scripts/kidults/kpmo/lib/whole-platform-runtime-evidence-v1.mjs';
test('pair bytes stay pinned across downstream processing and drift is rejected before dispatch',()=>{
  const result=spawnSync('python3',['-I','tests/kidults/integration/exact-pair-input-connection-v1.test.py'],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stderr);
});
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

function boundFixture(){
  const f=fixture(),files=Object.fromEntries(['envelope','receiptRegistry','purposeRights'].map(k=>[k,Buffer.from(JSON.stringify(f[k]))]));
  return {...f,files,binding:{schema_version:'business-input-file-binding-v1',source_sha:f.sourceSha,canonical_run_id:f.runId,
    file_digests:Object.fromEntries(Object.entries(files).map(([k,b])=>[k,'sha256:'+createHash('sha256').update(b).digest('hex')]))}};
}
function replaceFile(f,key,value){f.files[key]=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
  f.binding.file_digests[key]='sha256:'+createHash('sha256').update(f.files[key]).digest('hex');}
test('binds all three exact byte inputs while retaining unauthenticated native HOLD',()=>{
  const f=boundFixture(),r=executeBoundBusinessInput(f);
  assert.equal(r.file_integrity_verified,true);assert.equal(r.binding_authority_authenticated,false);
  assert.equal(r.bundle.evidence.length,1);assert.equal(r.empirical_inputs_authenticated,false);
  assert.equal(r.native_domain_receipt_emitted,false);assert.equal(r.native_domain_state,'HOLD');
  assert.equal(r.file_binding_digest,canonicalJsonDigest(f.binding));
  const {content_digest,...body}=r;assert.equal(content_digest,canonicalJsonDigest(body));
  assert.throws(()=>verifyValueChainDomainReceipt(r,'ASI_EXECUTION',{id:1,run_attempt:1},f.sourceSha));
});
for(const [name,mutate] of [
  ['foreign SHA',f=>f.binding.source_sha='b'.repeat(40)],
  ['foreign run',f=>f.binding.canonical_run_id='foreign'],
  ['missing binding',f=>delete f.binding],
  ['unknown schema',f=>f.binding.schema_version='future'],
  ['missing file',f=>delete f.files.purposeRights],
  ['extra file',f=>f.files.extra=Buffer.from('{}')],
  ['missing digest',f=>delete f.binding.file_digests.envelope],
  ['malformed digest',f=>f.binding.file_digests.envelope='sha256:x'],
  ['changed envelope bytes',f=>f.files.envelope=Buffer.concat([f.files.envelope,Buffer.from(' ')])],
  ['changed registry bytes',f=>f.files.receiptRegistry=Buffer.from('{}')],
  ['changed rights bytes',f=>f.files.purposeRights=Buffer.from('[]')],
  ['oversized bytes',f=>replaceFile(f,'envelope',Buffer.alloc(2*1024*1024+1))],
  ['invalid UTF-8',f=>replaceFile(f,'envelope',Buffer.from([0xff]))],
  ['invalid JSON',f=>replaceFile(f,'envelope',Buffer.from('{'))],
  ['rights denied despite matching digest',f=>{const rights=JSON.parse(f.files.purposeRights);rights[0].rights_state='DENY';replaceFile(f,'purposeRights',rights);}]
])test(`bound loader rejects ${name}`,()=>{const f=boundFixture();mutate(f);assert.throws(()=>executeBoundBusinessInput(f));});
