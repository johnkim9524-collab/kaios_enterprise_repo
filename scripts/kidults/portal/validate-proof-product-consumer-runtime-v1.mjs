#!/usr/bin/env node
import assert from 'node:assert/strict';

import {readPortalProjection} from '../../../apps/kidults-enterprise-staging/public/portal-r001/projection-store.js';
import {admitProofProductProjection,proofProductConsumerContract} from '../../../apps/kidults-enterprise-staging/public/portal-r001/proof-product-admission.js';
import {consumeProofProductProjection} from './execute-proof-product-consumer-v1.mjs';

const collectorFields=['what_changed','why_it_matters','comparable_context','liquidity','risk','possible_action'];
const institutionalFields=['universe','coverage','market_scale','depth','turnover','concentration','exposure','confidence'];
const clone=value=>structuredClone(value);
const verifiedField=field_id=>({field_id,state:'VERIFIED',value:`fixture-${field_id}`,evidence_references:[`fixture:evidence:${field_id}`],rights_state:'CLEARED',freshness_state:'CURRENT',confidence_classification:'HIGH',limitations:['TEST_FIXTURE_ONLY']});
const closedField=field_id=>({field_id,state:'UNAVAILABLE',evidence_references:[],rights_state:'UNKNOWN',freshness_state:'UNKNOWN',confidence_classification:'NOT_ASSESSED',reason:'No approved Projection',opening_conditions:['Immutable Candidate/Evidence pair and Track B assessment'],limitations:['NO_PROJECTION']});

function baseProjection(payload){
  return {
    record_type:'kidults_proof_product_projection',contract_version:'1.0.0',projection_id:'fixture-approved-market-v1',
    product_type:'MARKET_PROJECTION_API',projection_state:'APPROVED_PUBLIC',display_eligibility:'PUBLIC_ALLOWED',
    scope:{verticals:['COLLECTIBLES'],period:{start:'2026-08-01T00:00:00Z',end:'2026-08-22T00:00:00Z'},geographies:['GLOBAL'],venues:['FIXTURE'],currencies:['USD']},
    method_version:'fixture-method-v1',lineage:{snapshot_id:'fixture-snapshot-v1',evidence_package_id:'fixture-evidence-v1',assessment_id:'fixture-assessment-v1',previous_projection_id:null},
    evidence_summary:{state:'PAIRED',source_count:2,independent_source_family_count:2,evidence_references:['fixture:evidence:1','fixture:evidence:2']},
    rights:{state:'CLEARED',internal_analysis:'ALLOWED',public_display:'ALLOWED',api_redistribution:'ALLOWED',profile_id:'fixture-rights-v1'},
    freshness:{state:'CURRENT',observed_at:'2026-08-22T10:00:00Z',valid_until:'2026-08-22T12:00:00Z'},
    confidence:{state:'ASSESSED',classification:'HIGH',value:0.95,method_version:'fixture-confidence-v1'},
    rankability:{state:'RANKABLE',assessment_id:'fixture-assessment-v1',reasons:['TEST FIXTURE — no live Track B assessment']},
    limitations:['TEST_FIXTURE_ONLY','NO_LIVE_PROJECTION'],missing_data:[],
    actions:[{action_id:'VIEW_GOVERNANCE',state:'ENABLED',destination:'/governance',reason:''}],
    audit:{governance_record_uri:'/governance',projection_record_uri:'/governance/projections/fixture-approved-market-v1',events:[]},
    payload,generated_at:'2026-08-22T10:00:00Z',updated_at:'2026-08-22T10:05:00Z'
  };
}

function approvedProjection(){
  return baseProjection({
    axes:[{axis_id:'time',label:'Observation period',unit:'date'}],filters:['PERIOD','CURRENCY','GEOGRAPHY','VENUE','VERTICAL'],
    collector_lens:Object.fromEntries(collectorFields.map(key=>[key,verifiedField(key)])),
    institutional_lens:Object.fromEntries(institutionalFields.map(key=>[key,verifiedField(key)]))
  });
}

function closedProjection(){
  const projection=baseProjection({
    axes:[{axis_id:'time',label:'Observation period',unit:'date'}],filters:['PERIOD','CURRENCY','GEOGRAPHY','VENUE','VERTICAL'],
    collector_lens:Object.fromEntries(collectorFields.map(key=>[key,closedField(key)])),
    institutional_lens:Object.fromEntries(institutionalFields.map(key=>[key,closedField(key)]))
  });
  Object.assign(projection,{projection_id:'fixture-closed-market-v1',projection_state:'AWAITING_APPROVED_PROJECTION',display_eligibility:'STATE_ONLY'});
  projection.lineage={previous_projection_id:null};
  projection.evidence_summary={state:'NOT_PAIRED',source_count:null,independent_source_family_count:null,evidence_references:[]};
  projection.rights={state:'UNKNOWN',internal_analysis:'UNKNOWN',public_display:'UNKNOWN',api_redistribution:'UNKNOWN',profile_id:null};
  projection.freshness={state:'UNKNOWN',observed_at:null,valid_until:null};
  projection.confidence={state:'NOT_ASSESSED',classification:'NOT_ASSESSED',value:null,method_version:null};
  projection.rankability={state:'PENDING',assessment_id:null,reasons:['Track B not started']};
  return projection;
}

const testContext={surface:'PUBLIC_API_RESPONSE',purpose:'API_REDISTRIBUTION',trustedNow:'2026-08-22T11:00:00Z',clockAuthority:'KIDULTS_CONTROL_PLANE',releaseAuthority:'TEST_ONLY'};
let assertions=0;
const check=(condition,message)=>{assert.ok(condition,message);assertions+=1};

check(proofProductConsumerContract.schema_only_sufficient===false,'schema-only acceptance must be prohibited');
check(proofProductConsumerContract.browser_clock_authoritative===false,'browser clock must not be authoritative');

for(const surface of ['PORTAL_RENDER','PUBLIC_API_RESPONSE','EXPORT']){
  const purpose=surface==='PORTAL_RENDER'?'PUBLIC_DISPLAY':'API_REDISTRIBUTION';
  const result=admitProofProductProjection(approvedProjection(),{...testContext,surface,purpose});
  check(result.accepted===true,`${surface} valid TEST_ONLY fixture should reach the shared executable gate`);
  check(result.receipt.assessment_id===result.receipt.rankability_assessment_id,`${surface} receipt must bind exact assessment identity`);
  check(result.receipt.rights_state==='CLEARED'&&result.receipt.freshness_state==='CURRENT',`${surface} receipt must bind rights and freshness`);
}

const mutations=[
  ['ASSESSMENT_REBOUND',p=>{p.rankability.assessment_id='fixture-assessment-other'}],
  ['EXPIRED_AT_RENDER',p=>{p.freshness.valid_until='2026-08-22T11:00:00Z'}],
  ['FUTURE_OBSERVATION',p=>{p.freshness.observed_at='2026-08-22T11:30:00Z'}],
  ['REVERSED_FRESHNESS',p=>{p.freshness.observed_at='2026-08-22T12:01:00Z'}],
  ['RIGHTS_SUMMARY',p=>{p.rights.state='BLOCKED'}],
  ['PURPOSE_RIGHT',p=>{p.rights.api_redistribution='BLOCKED';p.rights.state='PARTIAL'}],
  ['FUTURE_UPDATE',p=>{p.updated_at='2026-08-22T11:30:00Z'}],
  ['TIMESTAMP_ORDER',p=>{p.generated_at='2026-08-22T10:30:00Z'}],
  ['VALUE_RIGHTS',p=>{p.payload.collector_lens.liquidity.rights_state='BLOCKED'}],
  ['PUBLIC_WITHOUT_APPROVAL',p=>{p.projection_state='AWAITING_APPROVED_PROJECTION'}]
];
for(const [name,mutate] of mutations){
  const candidate=clone(approvedProjection());mutate(candidate);
  const result=admitProofProductProjection(candidate,testContext);
  check(result.accepted===false,`${name} must fail closed`);
  check(result.payload===null&&result.receipt.payload_exposed===false,`${name} must expose no payload`);
}

const beforeExpiry=admitProofProductProjection(approvedProjection(),testContext);
const atExpiry=admitProofProductProjection(approvedProjection(),{...testContext,trustedNow:'2026-08-22T12:00:00Z'});
check(beforeExpiry.accepted===true,'fixture should pass before expiry');
check(atExpiry.accepted===false&&atExpiry.receipt.reason==='FRESHNESS_EXPIRED_AT_CONSUMPTION','stale-after-load must be revalidated at consumption time');

const approvedUrl=`data:application/json;base64,${Buffer.from(JSON.stringify(approvedProjection())).toString('base64')}`;
const portalApproved=await readPortalProjection({url:approvedUrl});
check(portalApproved.projection.state==='INVALID','actual Portal read path must reject approved values without trusted control-plane clock');
check(portalApproved.audit.reason_category==='TRUSTED_CLOCK_REQUIRED','Portal rejection must expose trusted-clock blocker');
check(portalApproved.signals.length===0&&portalApproved.objects.length===0&&portalApproved.kidult_100.index_value===null,'Portal rejection must clear all value surfaces');

const closedUrl=`data:application/json;base64,${Buffer.from(JSON.stringify(closedProjection())).toString('base64')}`;
const portalClosed=await readPortalProjection({url:closedUrl});
check(portalClosed.projection.state==='NO_PROJECTION','actual Portal read path must preserve closed state as NO_PROJECTION');
check(portalClosed.audit.consumption_receipt.state_only===true&&portalClosed.audit.consumption_receipt.payload_exposed===false,'closed-state Portal receipt must remain state-only');

for(const surface of ['PUBLIC_API_RESPONSE','EXPORT']){
  const result=consumeProofProductProjection(approvedProjection(),{surface,trustedNow:'2026-08-22T11:00:00Z'});
  check(result.ok===false&&result.state==='INVALID',`${surface} must remain blocked without release authority`);
  check(result.payload===null&&result.receipt.reason==='RELEASE_AUTHORITY_HOLD',`${surface} HOLD must emit no value payload`);
}

const report={
  suite:'KIDULTS_PROOF_PRODUCT_EXECUTABLE_CONSUMER_RUNTIME_V1',result:'PASS',assertions,
  trigger_sha:process.env.GITHUB_SHA||'LOCAL',run_id:process.env.GITHUB_RUN_ID||'LOCAL',
  surfaces:['PORTAL_RENDER','PUBLIC_API_RESPONSE','EXPORT'],negative_mutations:mutations.length,
  actual_portal_path:'readPortalProjection -> proof-product admission -> NO_PROJECTION/INVALID -> render',
  trusted_clock:'CONTROL_PLANE_REQUIRED__BROWSER_CLOCK_REJECTED',assessment_identity:'EXACT_MATCH_AND_RECEIPT_BOUND',
  stale_after_load:'REVALIDATED_AT_CONSUMPTION',prior_value_retention:false,
  live_projection:'NONE',track_b:'NOT_STARTED',production:'HOLD',public:'HOLD',g5:'HOLD'
};
console.log(JSON.stringify(report,null,2));
