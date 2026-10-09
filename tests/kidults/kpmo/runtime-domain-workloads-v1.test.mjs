import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {executeRuntimeDomainWorkloads} from '../../../scripts/kidults/runtime/runtime-domain-workloads-v1.mjs';
import {canonicalJsonDigest as digest} from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';

const definition=JSON.parse(fs.readFileSync(new URL('../../../coordination/kidults/kpmo/runtime-domain-evidence-demand-v1.json',import.meta.url)));
const sourceSha='a'.repeat(40);
const holds={production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
function fixtureConnection(){
  const event={event_id:'event-1',content_digest:'sha256:'+'b'.repeat(64),source_id:'source-1',
    source_event_id:'lot-1',canonical_object_id:'object-1',acquisition_receipt_id:'acq-1',rights_receipt_id:'rights-1'};
  const evidence={canonical_object_id:'object-1',assertion:{predicate:'REALIZED_SALE',transaction_status:'SOLD'},
    lineage:{current_sold_event_id:event.event_id,current_sold_content_digest:event.content_digest,
      source_id:event.source_id,acquisition_receipt_id:event.acquisition_receipt_id,rights_receipt_id:event.rights_receipt_id}};
  const body={source_sha:sourceSha,canonical_run_id:'123',native_domain_receipt_emitted:false,
    evidence_scope:'FILE_INTEGRITY_AND_CONTENT_VALIDATION_ONLY',
    rights_decisions:[{source_id:'source-1',decision:'RIGHTS_CLEAR_FOR_PURPOSE'}],
    bundle:{event_versions:[event],evidence:[evidence],receipt:{status:'PASS',counts:{admitted:1,rejected:0,quarantined:0}}},
    lineage:{event_versions_digest:digest([event]),evidence_digest:digest([evidence])}};
  return {state:'INPUT_TRANSPORT_AND_CONTENT_VERIFIED',source_sha:sourceSha,run_id:123,
    binding_transport_authenticated:true,native_domain_receipt_emitted:false,
    input_processing:{...body,content_digest:digest(body)},...holds};
}
function run(connection,def=definition){return executeRuntimeDomainWorkloads({connection,definition:def,sourceSha});}
function reseal(connection){
  const input=connection.input_processing;
  input.lineage.event_versions_digest=digest(input.bundle.event_versions);
  input.lineage.evidence_digest=digest(input.bundle.evidence);
  delete input.content_digest;input.content_digest=digest(input);
  return connection;
}

test('all thirteen joins are observable without fabricating native execution',()=>{
  const x=run({state:'HOLD',blocker:'AUTHENTICATED_INPUT_REFERENCE_MISSING'});
  assert.equal(x.domain_count,13);assert.equal(x.locally_executed_domain_count,0);
  assert.equal(x.native_verified_domain_count,0);assert.equal(x.external_writes,0);
  assert.ok(x.domains.every(d=>d.native_state==='HOLD'&&!d.native_domain_proven&&d.processing===null));
  assert.equal(x.native_domain_receipt_emitted,false);
});
test('fixture input computes six local stages, without native certificates or remote effects',()=>{
  const c=fixtureConnection(),before=JSON.stringify(c),x=run(c);
  assert.equal(x.locally_executed_domain_count,6);assert.equal(x.native_verified_domain_count,0);
  assert.equal(JSON.stringify(c),before);
  assert.equal(x.domains.find(d=>d.domain_id==='VALUE_TRACEABILITY').processing.edge_count,1);
  assert.equal(x.domains.find(d=>d.domain_id==='ENTITY_RESOLUTION').processing.entity_count,1);
  assert.equal(x.domains.find(d=>d.domain_id==='MARKET_EVIDENCE').processing.liquidity_proven,false);
  assert.ok(x.domains.filter(d=>['IMMUTABLE_CANDIDATE','TRACK_B_VALIDATION','PROJECTION_TRUTH',
    'PORTAL_TRANSPARENCY_ACCESSIBILITY','EOS_FOUNDER_WORKFLOW','RUNTIME_RELIABILITY','INTEGRATION_GATE'].includes(d.domain_id))
    .every(d=>d.processing===null&&d.processing_state==='NOT_EXECUTED'));
  assert.equal(x.whole_platform_runtime_proven,false);
  const {receipt_digest,...body}=x;assert.equal(receipt_digest,digest(body));
  const text=JSON.stringify(x);
  for(const secret of ['object-1','lot-1','rights-1','acq-1'])assert.equal(text.includes(secret),false);
});
for(const [name,mutate,code] of [
  ['source drift',c=>{c.source_sha='c'.repeat(40)},'CONNECTION_BINDING'],
  ['native certificate assertion',c=>{c.native_domain_receipt_emitted=true},'CONNECTION_BINDING'],
  ['release elevation',c=>{c.production='APPROVED'},'CONNECTION_BINDING'],
  ['mutated stage bytes',c=>{c.input_processing.rights_decisions=[]},'INPUT_DIGEST'],
  ['foreign run',c=>{c.run_id=124},'INPUT_SCOPE'],
  ['foreign evidence event',c=>{c.input_processing.bundle.evidence[0].lineage.current_sold_event_id='foreign';reseal(c)},'LINEAGE_EVENT_JOIN'],
  ['foreign rights receipt',c=>{c.input_processing.bundle.evidence[0].lineage.rights_receipt_id='foreign';reseal(c)},'LINEAGE_SOURCE_JOIN'],
  ['missing rights source',c=>{c.input_processing.rights_decisions=[];reseal(c)},'RIGHTS_SOURCE_COVERAGE'],
  ['non-SOLD evidence',c=>{c.input_processing.bundle.evidence[0].assertion.transaction_status='LISTED';reseal(c)},'SOLD_SEMANTICS'],
])test(`rejects ${name}`,()=>{const c=fixtureConnection();mutate(c);assert.throws(()=>run(c),new RegExp(code));});
test('missing, duplicate, cyclic or authority-changing domain definitions fail closed',()=>{
  for(const mutate of [d=>d.domains.pop(),d=>d.domains[1].id=d.domains[0].id,
    d=>d.domains[0].requires=['INTEGRATION_GATE'],d=>d.dispatch_authority=true]){
    const d=structuredClone(definition);mutate(d);assert.throws(()=>run(null,d),/DOMAIN_WORKLOAD_/);
  }
});
