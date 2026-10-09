import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeRuntimeDomainOutput,immutableObjectPairDigest} from '../../../scripts/kidults/runtime/runtime-domain-output-consumers-v1.mjs';
import {canonicalJsonDigest as digest} from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';

const sourceSha='a'.repeat(40),h='sha256:'+'b'.repeat(64),foreign='sha256:'+'c'.repeat(64);
const now=new Date('2026-10-09T00:34:00Z');
const payloads={
 VALUE_TRACEABILITY:{edge_count:1,source_digest:h,decision_digest:h,lineage_digest:h},
 SOURCE_RIGHTS:{source_admissions:[{source_id:'fixture-source',purpose:'CURRENT_SOLD_TRANSACTION',decision:'ADMITTED',
   rights_document_digest:h,independent_admission_digest:h,rights_atoms:['COLLECT','STORE','DERIVE','INTERNAL_REVIEW','DELETE'],
   effective_at:'2026-10-01T00:00:00Z',expires_at:'2026-11-01T00:00:00Z',retention_seconds:86400}]},
 ENTITY_RESOLUTION:{input_record_count:2,canonical_entity_count:1,unresolved_count:0,conflicting_identity_count:0,
   canonical_decisions_digest:h,independent_validation_digest:h},
 MARKET_EVIDENCE:{sold_record_count:2,liquidity_observation_count:2,independent_factual_origin_count:2,
   oldest_sold_at:'2026-10-08T00:34:00Z',oldest_liquidity_observed_at:'2026-10-08T00:34:00Z',
   sold_evidence_digest:h,liquidity_evidence_digest:h,historical_only:false,reference_only:false},
 ASI_EXECUTION:{input_digest:h,expected_processor_count:2,completed_processor_count:2,failed_processor_count:0,output_count:2,outputs_digest:h},
 IMMUTABLE_CANDIDATE:{exact_pair_digest:h,reservation_digest:h,objects:['CANDIDATE','EVIDENCE'].map(kind=>({kind,
   version_id:`fixture-${kind}`,object_digest:h,readback_digest:h,protected_object_ref_digest:kind==='CANDIDATE'?h:foreign,
   object_lock_mode:'COMPLIANCE',retain_until:'2036-10-09T00:34:00Z'}))},
 TRACK_B_VALIDATION:{exact_pair_digest:h,assessment_id:'fixture-assessment',assessment_digest:h,
   recommendation:'PUBLISHABLE_INTERNAL',overall_rankability:true,production_eligible:false,publication_eligible:false,sample_governance_digest:h},
 PROJECTION_TRUTH:{exact_pair_digest:h,assessment_digest:h,projection_digest:h,projection_id:'fixture-projection',
   projection_state:'APPROVED_INTERNAL',internal_display_right:'ALLOWED',observed_at:'2026-10-09T00:30:00Z',valid_until:'2026-10-09T01:30:00Z'},
 PORTAL_TRANSPARENCY_ACCESSIBILITY:{rendered_projection_digest:h,rendered_dom_digest:h,browser_execution_digest:h,
   accessibility_violation_count:0,flows:['COMPARE','WATCHLIST'].map(action=>({action,result:'SUCCESS'})),transparency_disclosure_digest:h},
 EOS_FOUNDER_WORKFLOW:{projection_digest:h,decision_id:'fixture-decision',decision_workflow_digest:h,
   actual_acceptance_event_digest:h,persisted_decision_readback_digest:h,human_acceptance_simulated:false},
 RUNTIME_RELIABILITY:{exact_pair_digest:h,business_records_replayed:2,injected_failure_count:2,recovered_failure_count:2,
   unrecovered_failure_count:0,db_readback_digest:h,pitr_restore_readback_digest:h,rollback_audit_digest:h},
 PRIVACY_RETENTION:{classified_record_count:2,deleted_record_count:2,unclassified_record_count:0,
   classification_digest:h,deletion_operation_digest:h,absence_readback_digest:h,
   expires_at:'2026-10-09T00:20:00Z',deleted_at:'2026-10-09T00:21:00Z',readback_at:'2026-10-09T00:22:00Z',
   deletion_deadline:'2026-10-09T00:25:00Z',readback_remaining_record_count:0},
};
const pairDigest=immutableObjectPairDigest(payloads.IMMUTABLE_CANDIDATE.objects);
for(const id of ['IMMUTABLE_CANDIDATE','TRACK_B_VALIDATION','PROJECTION_TRUTH','RUNTIME_RELIABILITY'])payloads[id].exact_pair_digest=pairDigest;
payloads.INTEGRATION_GATE={domains:[...Object.keys(payloads),'SECURITY_SUPPLY_CHAIN'].map(domain_id=>({domain_id,receipt_digest:h})),
 missing_domain_count:0,failed_domain_count:0,whole_chain_consumption_digest:h};
function seal(domainId,payload=payloads[domainId]){
 const body={id:'kidults-runtime-domain-output-v1',domain_id:domainId,source_sha:sourceSha,input_digest:h,fixture_evidence:false,
   ...structuredClone(payload),production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
 return {...body,output_digest:digest(body)};
}
function consume(domainId,output){return consumeRuntimeDomainOutput({domainId,output,sourceSha,inputDigest:h,
 sourceIds:['fixture-source'],inputRecordCount:2,dependencyOutputs:payloads,
 dependencyReceiptDigests:Object.fromEntries(payloads.INTEGRATION_GATE.domains.map(row=>[row.domain_id,h])),now});}

for(const id of Object.keys(payloads)){
 test(`${id}: fixture content validation cannot authenticate a native producer`,()=>{
   const r=consume(id,seal(id));
   assert.equal(r.state,'OUTPUT_CONTENT_VERIFIED_NOT_NATIVE_DOMAIN_CERTIFICATE');
   assert.equal(r.native_producer_authenticated,false);assert.equal(r.native_domain_receipt_emitted,false);
   assert.equal(r.whole_platform_runtime_proven,false);
 });
 test(`${id}: reject source, release and byte/digest drift`,()=>{
   const value=seal(id);value.source_sha='c'.repeat(40);assert.throws(()=>consume(id,value),/OUTPUT_BINDING/);
   const body=seal(id);delete body.output_digest;body.production='APPROVED';body.output_digest=digest(body);
   assert.throws(()=>consume(id,body),/RELEASE/);
   const bytes=seal(id);bytes.output_digest=foreign;assert.throws(()=>consume(id,bytes),/OUTPUT_DIGEST/);
 });
}
const mutations={
 VALUE_TRACEABILITY:o=>{o.source_digest=foreign},
 SOURCE_RIGHTS:o=>{o.source_admissions[0].rights_atoms=['COLLECT']},
 ENTITY_RESOLUTION:o=>{o.unresolved_count=1},
 MARKET_EVIDENCE:o=>{o.oldest_sold_at='2026-09-01T00:00:00Z'},
 ASI_EXECUTION:o=>{o.completed_processor_count=1},
 IMMUTABLE_CANDIDATE:o=>{o.objects[1].readback_digest=foreign},
 TRACK_B_VALIDATION:o=>{o.exact_pair_digest=foreign},
 PROJECTION_TRUTH:o=>{o.assessment_digest=foreign},
 PORTAL_TRANSPARENCY_ACCESSIBILITY:o=>{o.flows[1].action='COMPARE'},
 EOS_FOUNDER_WORKFLOW:o=>{o.human_acceptance_simulated=true},
 RUNTIME_RELIABILITY:o=>{o.recovered_failure_count=1},
 PRIVACY_RETENTION:o=>{o.deleted_at='2026-10-09T00:26:00Z'},
 INTEGRATION_GATE:o=>{o.domains[0].receipt_digest=foreign},
};
for(const [id,mutate] of Object.entries(mutations))test(`${id}: reject semantic violation even with a recomputed digest`,()=>{
 const payload=structuredClone(payloads[id]);mutate(payload);assert.throws(()=>consume(id,seal(id,payload)),/DOMAIN_OUTPUT_/);
});
for(const atoms of ['COLLECT STORE DERIVE INTERNAL_REVIEW DELETE',
 ['COLLECT','STORE','DERIVE','INTERNAL_REVIEW','DELETE','DELETE'],
 ['COLLECT','STORE','DERIVE','INTERNAL_REVIEW',1]])test(`reject malformed rights atom set ${JSON.stringify(atoms)}`,()=>{
 const p=structuredClone(payloads.SOURCE_RIGHTS);p.source_admissions[0].rights_atoms=atoms;
 assert.throws(()=>consume('SOURCE_RIGHTS',seal('SOURCE_RIGHTS',p)),/RIGHTS_ATOMS/);
});
test('reject partial entity processing even with a valid resealed output',()=>{
 const p={...payloads.ENTITY_RESOLUTION,input_record_count:1};
 assert.throws(()=>consume('ENTITY_RESOLUTION',seal('ENTITY_RESOLUTION',p)),/ER_INPUT_COVERAGE/);
});
test('entity coverage requires the authenticated count rather than output self assertion',()=>{
 assert.throws(()=>consumeRuntimeDomainOutput({domainId:'ENTITY_RESOLUTION',output:seal('ENTITY_RESOLUTION'),
 sourceSha,inputDigest:h,sourceIds:['fixture-source'],now}),/ER_AUTHENTICATED_RECORDS/);
});
test('pair digest rejects unrelated hash and modified immutable version',()=>{
 const p=structuredClone(payloads.IMMUTABLE_CANDIDATE);p.exact_pair_digest=h;
 assert.throws(()=>consume('IMMUTABLE_CANDIDATE',seal('IMMUTABLE_CANDIDATE',p)),/PAIR_OBJECT_BINDING/);
 p.exact_pair_digest=pairDigest;p.objects[1].version_id='other-version';
 assert.throws(()=>consume('IMMUTABLE_CANDIDATE',seal('IMMUTABLE_CANDIDATE',p)),/PAIR_OBJECT_BINDING/);
});
test('pair rejects the same protected object under two kinds even with a new pair hash',()=>{
 const p=structuredClone(payloads.IMMUTABLE_CANDIDATE);p.objects[1].protected_object_ref_digest=h;
 p.exact_pair_digest=immutableObjectPairDigest(p.objects);
 assert.throws(()=>consume('IMMUTABLE_CANDIDATE',seal('IMMUTABLE_CANDIDATE',p)),/PAIR_DISTINCT_OBJECTS/);
});
test('pair binding follows kind order independent of array order',()=>{
 const p=structuredClone(payloads.IMMUTABLE_CANDIDATE);p.objects.reverse();
 assert.equal(immutableObjectPairDigest(p.objects),pairDigest);
 assert.equal(consume('IMMUTABLE_CANDIDATE',seal('IMMUTABLE_CANDIDATE',p)).native_producer_authenticated,false);
});
