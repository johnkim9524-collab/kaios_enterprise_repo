import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyHealthReceipt,distinctNaturalGenerations,verifyMissionTerminal,verifyValueChainDomainReceipt,verifyNaturalChainTerminal} from '../../../scripts/kidults/kpmo/lib/whole-platform-runtime-evidence-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
const source='a'.repeat(40),run={id:900,run_attempt:1};
const body={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',repository:'johnkim9524-collab/kaios_enterprise_repo',source_sha:source,
  observer_run_id:900,observer_run_attempt:1,state:'VERIFIED_PASS',semantic_content_verified:true,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',
  producers:['SHADOW','REQUIREMENT','RESERVE','CANONICAL_TRUTH'].map((id,i)=>({id,state:'VERIFIED_PASS',artifact_content_validated:true,artifact_transport_verified:true,
    selected_run_id:i+1,selected_run_attempt:1,selected_event:id==='SHADOW'?'push':id==='RESERVE'?'repository_dispatch':'workflow_run',selected_created_at:'2026-10-04T11:00:00Z'})),producer_cohort_bound:true,producer_cohort_span_ms:0,producer_cohort_earliest_created_at:'2026-10-04T11:00:00Z',producer_cohort_latest_created_at:'2026-10-04T11:00:00Z',producer_cohort_failure_class:null,production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false};
const seal=b=>({...b,receipt_digest:sha256(canonicalJson(b))});
test('natural terminal binds both downstream runs and original Sentinel receipt without elevating authority',()=>{
  const native={repository:{full_name:body.repository},head_sha:source,head_branch:'main',event:'workflow_run',run_attempt:1,status:'completed',conclusion:'success'};
  const gateRun={...native,id:902,path:'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml'};
  const assurance={...native,id:901,path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml'};
  const health=seal(body),audit=seal({source:{sha:source,match:true},states:{internal_control_state:'VERIFIED_PASS'},execution:{workflow_run_id:'901',workflow_run_attempt:'1',upstream:{run_id:'900',run_attempt:'1',workflow_path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',repository:body.repository,conclusion:'success'}}});
  const gate={receipt_id:'kpmo-continuous-assurance-success-authority-gate-v1',state:'VERIFIED_PASS',repository:body.repository,current_protected_main_sha:source,
    upstream_assurance:{run_id:901,run_attempt:1,head_sha:source,event:'workflow_run',conclusion:'success'},producer_health_run_id:900,producer_health_run_attempt:1,producer_health_receipt_digest:health.receipt_digest,producer_health_state:'VERIFIED_PASS',producer_health_conclusion:'success',
    coverage_scope:body.coverage_scope,whole_platform_authority:false,promotion_eligible:false,empirical_authority:false,provider_authority:false,database_authority:false,empirical_delta:0,production:'HOLD',public:'HOLD',g5:'HOLD'};
  assert.equal(verifyNaturalChainTerminal(seal(gate),gateRun,assurance,audit,health,source).state,'VERIFIED_PASS');
  for(const changed of [{...gate,producer_health_run_id:899},{...gate,producer_health_receipt_digest:'sha256:'+'0'.repeat(64)},{...gate,whole_platform_authority:true},{...gate,current_protected_main_sha:'b'.repeat(40)}])
    assert.throws(()=>verifyNaturalChainTerminal(seal(changed),gateRun,assurance,audit,health,source),/CHAIN_/);
  assert.throws(()=>verifyNaturalChainTerminal(seal(gate),gateRun,{...assurance,event:'workflow_dispatch'},audit,health,source),/CHAIN_NATIVE/);
  assert.throws(()=>verifyNaturalChainTerminal(seal(gate),gateRun,assurance,seal({...Object.fromEntries(Object.entries(audit).filter(([key])=>key!=='receipt_digest')),execution:{...audit.execution,upstream:{...audit.execution.upstream,run_id:'899'}}}),health,source),/CHAIN_AUDIT_UPSTREAM/);
});
test('protected health requires exact source, observer, content validation and digest',()=>{
  assert.equal(verifyHealthReceipt(seal(body),run,source).state,'VERIFIED_PASS');
  for(const b of [{...body,source_sha:'b'.repeat(40)},{...body,observer_run_id:901},
    {...body,producers:body.producers.slice(1)},{...body,production:'ACTIVE'},
    {...body,producers:body.producers.map(p=>({...p,artifact_content_validated:false}))}])assert.throws(()=>verifyHealthReceipt(seal(b),run,source),/WHOLE_RUNTIME/);
  assert.throws(()=>verifyHealthReceipt({...seal(body),state:'VERIFIED_FAIL'},run,source),/DIGEST/);
});
test('mixed producer cohort is held and cannot be consumed as a natural generation',()=>{
  const mixed={...body,producer_cohort_bound:false,producer_cohort_span_ms:45*60*1000+1,producer_cohort_failure_class:'PRODUCER_COHORT_WINDOW_EXCEEDED'};
  assert.throws(()=>verifyHealthReceipt(seal(mixed),run,source),/WHOLE_RUNTIME_HEALTH_COHORT/);
  assert.equal(distinctNaturalGenerations([mixed,body]),false);
});
test('two observers and a single refreshed producer do not prove two complete natural generations',()=>{
  assert.equal(distinctNaturalGenerations([body,{...body,observer_run_id:901}]),false);
  const newer={...body,producers:body.producers.map((p,i)=>({...p,selected_run_id:p.selected_run_id+10,selected_created_at:'2026-10-04T12:00:00Z'}))};
  assert.equal(distinctNaturalGenerations([newer,body]),true);
  assert.equal(distinctNaturalGenerations([{...newer,producers:[...newer.producers.slice(0,3),body.producers[3]]},body]),false);
  assert.equal(distinctNaturalGenerations([{...newer,producers:newer.producers.map(p=>({...p,selected_event:'workflow_dispatch'}))},body]),false);
  assert.equal(distinctNaturalGenerations([{...newer,producers:newer.producers.map(p=>({...p,selected_run_attempt:2}))},body]),false);
  assert.equal(distinctNaturalGenerations([{...newer,source_sha:'b'.repeat(40)},body]),false);
  assert.equal(distinctNaturalGenerations([{...newer,producers:newer.producers.slice(1)},body]),false);
  assert.equal(distinctNaturalGenerations([{...newer,producers:newer.producers.map(p=>({...p,selected_event:'unknown'}))},body]),false);
  assert.equal(distinctNaturalGenerations([{...newer,producers:newer.producers.map(p=>p.id==='REQUIREMENT'?{...p,semantic_scope:'COVERAGE_CONTENT_BOUND_ALIAS_NOT_NEW_EXECUTION'}:p)},body]),false);
  assert.equal(distinctNaturalGenerations([newer,{...body,producers:body.producers.map(p=>p.id==='REQUIREMENT'?{...p,semantic_scope:'COVERAGE_CONTENT_BOUND_ALIAS_NOT_NEW_EXECUTION'}:p)}]),false);
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
