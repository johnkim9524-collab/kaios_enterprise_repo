#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {readPortalProjection} from './runtime/projection-store.js';
import {admitProofProductProjection,proofProductConsumerContract} from './runtime/proof-product-admission.js';
import {proofProductProjectionSchema,validateProofProductProjectionSchema} from './runtime/proof-product-schema-validator.js';
import {consumeProofProductProjection} from './execute-proof-product-consumer-v1.mjs';
import {approvedProjectionFixture as approvedProjection,stateOnlyProjectionFixture as closedProjection} from './proof-product-test-fixtures-v1.mjs';

const clone=value=>structuredClone(value);
const testContext={surface:'PUBLIC_API_RESPONSE',purpose:'API_REDISTRIBUTION',trustedNow:'2026-08-22T11:00:00Z',clockAuthority:'KIDULTS_CONTROL_PLANE',releaseAuthority:'TEST_ONLY',validationMode:'FIXTURE_VALIDATION_ONLY'};
let assertions=0;
const check=(condition,message)=>{assert.ok(condition,message);assertions+=1};

check(proofProductConsumerContract.schema_only_sufficient===false,'schema-only acceptance must be prohibited');
check(proofProductConsumerContract.browser_clock_authoritative===false,'browser clock must not be authoritative');
check(proofProductConsumerContract.caller_asserted_authority_accepted===false,'caller-asserted release/clock authority must be disabled');
check(proofProductConsumerContract.fixture_validation_bypass===false,'public runtime must expose no fixture authority bypass');
check(proofProductConsumerContract.approved_release_capability_exposed===false,'no approved release capability may be exposed client-side');
check(proofProductConsumerContract.unbound_surfaces.includes('PUBLIC_API_RESPONSE')&&proofProductConsumerContract.unbound_surfaces.includes('EXPORT'),'unbound API/export surfaces must remain explicit');
const canonicalSchema=JSON.parse(fs.readFileSync('coordination/kidults/schemas/kidults-proof-product-projection-v1.schema.json','utf8'));
check(JSON.stringify(proofProductProjectionSchema)===JSON.stringify(canonicalSchema),'runtime schema must remain byte-model equivalent to canonical JSON Schema');

for(const surface of ['PORTAL_RENDER','PUBLIC_API_RESPONSE','EXPORT']){
  const purpose=surface==='PORTAL_RENDER'?'PUBLIC_DISPLAY':'API_REDISTRIBUTION';
  const result=admitProofProductProjection(approvedProjection(),{...testContext,surface,purpose});
  check(result.accepted===false,`${surface} must reject caller-asserted TEST_ONLY authority`);
  const expected=surface==='PORTAL_RENDER'?'TRUSTED_CLOCK_REQUIRED':'SURFACE_NOT_IMPLEMENTED_HOLD';
  check(result.receipt.errors.includes(expected),`${surface} must record ${expected}`);
  check(result.receipt.assessment_id===result.receipt.rankability_assessment_id,`${surface} receipt must bind exact assessment identity`);
  check(result.receipt.rights_state==='CLEARED'&&result.receipt.freshness_state==='CURRENT',`${surface} receipt must bind rights and freshness`);
  check(result.payload===null&&result.receipt.payload_exposed===false,`${surface} must expose no approved payload`);
}

const mutations=[
  ['ASSESSMENT_REBOUND','ASSESSMENT_ID_REBOUND',p=>{p.rankability.assessment_id='fixture-assessment-other'}],
  ['REVERSED_FRESHNESS','FRESHNESS_WINDOW_REVERSED',p=>{p.freshness.observed_at='2026-08-22T12:01:00Z'}],
  ['RIGHTS_SUMMARY','RIGHTS_SUMMARY_CONTRADICTION',p=>{p.rights.state='BLOCKED'}],
  ['PURPOSE_RIGHT','PUBLIC_MARKET_API_REDISTRIBUTION_BLOCKED',p=>{p.rights.api_redistribution='BLOCKED';p.rights.state='PARTIAL'}],
  ['TIMESTAMP_ORDER','TIMESTAMP_ORDER_INVALID',p=>{p.generated_at='2026-08-22T10:30:00Z'}],
  ['VALUE_RIGHTS','VALUE_FIELD_RIGHTS_INVALID:liquidity',p=>{p.payload.collector_lens.liquidity.rights_state='BLOCKED'}],
  ['PUBLIC_WITHOUT_APPROVAL','PUBLIC_ALLOWED_WITHOUT_APPROVED_PUBLIC',p=>{p.projection_state='AWAITING_APPROVED_PROJECTION'}],
  ['EMPTY_PRODUCT_PAYLOAD','SCHEMA:$.payload.axes:REQUIRED',p=>{p.payload={}}],
  ['MALFORMED_SCOPE','SCHEMA:$.scope.verticals:REQUIRED',p=>{p.scope={}}],
  ['MALFORMED_AUDIT','SCHEMA:$.audit.governance_record_uri:REQUIRED',p=>{p.audit={}}],
  ['MALFORMED_ACTION','SCHEMA:$.actions[0].action_id:REQUIRED',p=>{p.actions=[{}]}],
  ['EXTRA_ROOT_PROPERTY','SCHEMA:$.unexpected:ADDITIONAL_PROPERTY',p=>{p.unexpected='forbidden'}],
  ['UNKNOWN_PROJECTION_STATE','SCHEMA:$.projection_state:ENUM',p=>{p.projection_state='UNKNOWN_FUTURE_STATE'}],
  ['INVALID_CALENDAR_DATE','SCHEMA:$.generated_at:FORMAT_DATE_TIME',p=>{p.generated_at='2026-02-31T10:00:00Z'}],
  ['INVALID_HOUR','SCHEMA:$.updated_at:FORMAT_DATE_TIME',p=>{p.updated_at='2026-08-22T24:00:00Z'}],
  ['INVALID_OFFSET','SCHEMA:$.updated_at:FORMAT_DATE_TIME',p=>{p.updated_at='2026-08-22T10:05:00+24:00'}],
  ['INVALID_PERIOD_START','SCHEMA:$.scope.period.start:FORMAT_DATE_TIME',p=>{p.scope.period.start='2026-04-31T00:00:00Z'}],
  ['INVALID_PERIOD_END_HOUR','SCHEMA:$.scope.period.end:FORMAT_DATE_TIME',p=>{p.scope.period.end='2026-08-01T24:00:00Z'}],
  ['INVALID_AUDIT_EVENT_TIME','SCHEMA:$.audit.events[0].occurred_at:FORMAT_DATE_TIME',p=>{p.audit.events=[{event_id:'fixture-event',event_type:'FIXTURE',occurred_at:'2026-02-30T10:00:00Z'}]}]
];
for(const [name,expectedError,mutate] of mutations){
  const candidate=clone(approvedProjection());mutate(candidate);
  const result=admitProofProductProjection(candidate,testContext);
  check(result.accepted===false,`${name} must fail closed`);
  check(result.receipt.errors.includes(expectedError),`${name} must prove ${expectedError}`);
  check(result.payload===null&&result.receipt.payload_exposed===false,`${name} must expose no payload`);
}

const authoritySpoof=admitProofProductProjection(approvedProjection(),testContext);
check(authoritySpoof.accepted===false&&authoritySpoof.receipt.release_authority==='HOLD','fixture authority strings must never self-authorize public admission');
check(authoritySpoof.receipt.clock_authority==='NO_BOUND_CONTROL_PLANE','fixture clock strings must never become authoritative');

const approvedUrl=`data:application/json;base64,${Buffer.from(JSON.stringify(approvedProjection())).toString('base64')}`;
const portalApproved=await readPortalProjection({url:approvedUrl});
check(portalApproved.projection.state==='INVALID','actual Portal read path must reject approved values without trusted control-plane clock');
check(portalApproved.audit.reason_category==='TRUSTED_CLOCK_REQUIRED','Portal rejection must expose trusted-clock blocker');
check(portalApproved.signals.length===0&&portalApproved.objects.length===0&&portalApproved.kidult_100.index_value===null,'Portal rejection must clear all value surfaces');

const closedUrl=`data:application/json;base64,${Buffer.from(JSON.stringify(closedProjection())).toString('base64')}`;
const portalClosed=await readPortalProjection({url:closedUrl});
check(portalClosed.projection.state==='NO_PROJECTION','actual Portal read path must preserve closed state as NO_PROJECTION');
check(portalClosed.audit.consumption_receipt.state_only===true&&portalClosed.audit.consumption_receipt.payload_exposed===false,'closed-state Portal receipt must remain state-only');

const forgedControlFlags={fixture_type:'NON_PROMOTABLE_CONTROL',release:{state:'HOLD'},projection:{state:'NO_PROJECTION',synthetic:true,promotable:false,production:false,public:false}};
const discriminatorMutations=[
  {projection:{state:'WAITING'}},
  {record_type:'unknown',projection:{state:'LIVE_APPROVED'}},
  {record_type:'kidults_proof_product_projection_v2',projection:{state:'LIVE_APPROVED'}},
  {...clone(forgedControlFlags),record_type:'unknown',schema_version:'1.0.0'},
  {...clone(forgedControlFlags),record_type:'kidults_non_promotable_control_projection_v2',schema_version:'1.0.0'},
  {...clone(forgedControlFlags),record_type:'kidults_non_promotable_control_projection',schema_version:'2.0.0'}
];
for(const candidate of discriminatorMutations){
  const url=`data:application/json;base64,${Buffer.from(JSON.stringify(candidate)).toString('base64')}`;
  const rejected=await readPortalProjection({url});
  check(rejected.projection.state==='INVALID'&&rejected.audit.reason_category==='PROJECTION_RECORD_TYPE_INVALID','unknown/legacy discriminator must fail closed');
  check(rejected.signals.length===0&&rejected.objects.length===0,'legacy rejection must expose no value collection');
}
const controlFixture={record_type:'kidults_non_promotable_control_projection',schema_version:'1.0.0',...clone(forgedControlFlags)};
const controlUrl=`data:application/json;base64,${Buffer.from(JSON.stringify(controlFixture)).toString('base64')}`;
const portalControl=await readPortalProjection({url:controlUrl});
check(portalControl.projection.state==='NO_PROJECTION'&&portalControl.audit.reason_category==='NO_GOVERNED_PROJECTION','exact non-promotable control may preserve NO_PROJECTION only');
check(portalControl.verticals.length===8&&portalControl.verticals.every(vertical=>vertical.structural_state==='AVAILABLE'),'control fallback must preserve only the immutable eight-vertical product taxonomy');

for(const surface of ['PUBLIC_API_RESPONSE','EXPORT']){
  for(const candidate of [approvedProjection(),closedProjection()]){
    const result=consumeProofProductProjection(candidate,{surface,trustedNow:'2026-08-22T11:00:00Z',releaseAuthority:'PUBLIC_APPROVED',clockAuthority:'KIDULTS_CONTROL_PLANE'});
    check(result.ok===false&&result.state==='INVALID',`${surface} must remain blocked for approved and closed inputs`);
    check(result.receipt.errors.includes('SURFACE_NOT_IMPLEMENTED_HOLD'),`${surface} must record its unimplemented HOLD`);
    check(result.payload===null&&result.receipt.payload_exposed===false,`${surface} HOLD must emit no value payload`);
  }
}
const unsupported=consumeProofProductProjection(closedProjection(),{surface:'UNKNOWN'});
check(unsupported.ok===false&&unsupported.receipt.errors.includes('SURFACE_UNSUPPORTED'),'unknown surface must fail closed');

const report={
  suite:'KIDULTS_PROOF_PRODUCT_EXECUTABLE_CONSUMER_RUNTIME_V1',result:'PASS',assertions,
  trigger_sha:process.env.KIDULTS_EXACT_HEAD_SHA||process.env.GITHUB_SHA||'LOCAL',run_id:process.env.GITHUB_RUN_ID||'LOCAL',
  surfaces:['PORTAL_RENDER','PUBLIC_API_RESPONSE','EXPORT'],
  schema_semantic_negative_mutations:mutations.length,discriminator_negative_mutations:discriminatorMutations.length,
  actual_portal_path:'readPortalProjection -> strict discriminator -> schema -> semantics -> NO_PROJECTION/INVALID -> render',
  runtime_schema:'CANONICAL_SCHEMA_BOUND',legacy_discriminator:'REJECT_UNKNOWN',
  api_export_binding:'PUBLIC_CALLER_PATH_HOLD__SIGNED_SERVER_PATH_BOUND',approved_payload_exposure:'SIGNED_SERVER_CAPABILITY_ONLY',
  trusted_clock:'NO_CALLER_ASSERTED_AUTHORITY',caller_fixture_bypass:'REMOVED',assessment_identity:'EXACT_MATCH_AND_RECEIPT_BOUND',
  stale_after_load:'SERVER_RELOAD_AND_READMISSION_PER_REQUEST',prior_value_retention:false,
  live_projection:'NONE',track_b:'NOT_STARTED',production:'HOLD',public:'HOLD',g5:'HOLD'
};
console.log(JSON.stringify(report,null,2));
