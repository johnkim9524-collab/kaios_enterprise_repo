import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyHealthReceipt,distinctNaturalGenerations,verifyMissionTerminal,verifyValueChainDomainReceipt} from '../../../scripts/kidults/kpmo/lib/whole-platform-runtime-evidence-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
const source='a'.repeat(40),run={id:900,run_attempt:1};
const body={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',repository:'johnkim9524-collab/kaios_enterprise_repo',source_sha:source,
  observer_run_id:900,observer_run_attempt:1,state:'VERIFIED_PASS',semantic_content_verified:true,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',
  producers:['SHADOW','REQUIREMENT','RESERVE','CANONICAL_TRUTH'].map((id,i)=>({id,state:'VERIFIED_PASS',artifact_content_validated:true,artifact_transport_verified:true,
    selected_run_id:i+1,selected_event:'workflow_run',selected_created_at:'2026-10-04T11:00:00Z'})),production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false};
const seal=b=>({...b,receipt_digest:sha256(canonicalJson(b))});
test('protected health requires exact source, observer, content validation and digest',()=>{
  assert.equal(verifyHealthReceipt(seal(body),run,source).state,'VERIFIED_PASS');
  for(const b of [{...body,source_sha:'b'.repeat(40)},{...body,observer_run_id:901},
    {...body,producers:body.producers.slice(1)},{...body,production:'ACTIVE'},
    {...body,producers:body.producers.map(p=>({...p,artifact_content_validated:false}))}])assert.throws(()=>verifyHealthReceipt(seal(b),run,source),/WHOLE_RUNTIME/);
  assert.throws(()=>verifyHealthReceipt({...seal(body),state:'VERIFIED_FAIL'},run,source),/DIGEST/);
});
test('two observers and a single refreshed producer do not prove two complete natural generations',()=>{
  assert.equal(distinctNaturalGenerations([body,{...body,observer_run_id:901}]),false);
  const newer={...body,producers:body.producers.map((p,i)=>({...p,selected_run_id:p.selected_run_id+10,selected_created_at:'2026-10-04T12:00:00Z'}))};
  assert.equal(distinctNaturalGenerations([newer,body]),true);
  assert.equal(distinctNaturalGenerations([{...newer,producers:[...newer.producers.slice(0,3),body.producers[3]]},body]),false);
  assert.equal(distinctNaturalGenerations([{...newer,producers:newer.producers.map(p=>({...p,selected_event:'workflow_dispatch'}))},body]),false);
});
test('canary and historical immutable receipts cannot substitute for current mission terminal',()=>{
  assert.throws(()=>verifyMissionTerminal({id:'kidults-autonomous-object-lock-canary-terminal-receipt-v1',state:'VERIFIED_PASS'},source,{}),/TERMINAL_TYPE/);
});
test('domain receipt rejects fixtures, metadata-only declarations and release elevation',()=>{
  const b={id:'kidults-value-chain-runtime-domain-receipt-v1',domain_id:'TRACK_B_VALIDATION',source_sha:source,repository:body.repository,
    run_id:900,run_attempt:1,state:'VERIFIED_PASS',execution_mode:'LIVE_RUNTIME',fixture_evidence:false,empirical_inputs_verified:true,
    primary_evidence:[{digest:'sha256:'+'a'.repeat(64),protected_source_ref:'governed-primary-receipt'}],production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
  assert.equal(verifyValueChainDomainReceipt(seal(b),'TRACK_B_VALIDATION',run,source).state,'VERIFIED_PASS');
  for(const changed of [{...b,fixture_evidence:true},{...b,empirical_inputs_verified:false},{...b,primary_evidence:[]},
    {...b,domain_id:'OTHER_DOMAIN'},{...b,provider_activation:'ACTIVE'}])
    assert.throws(()=>verifyValueChainDomainReceipt(seal(changed),'TRACK_B_VALIDATION',run,source),/WHOLE_RUNTIME/);
});
