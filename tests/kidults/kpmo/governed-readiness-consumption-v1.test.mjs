import test from 'node:test';import assert from 'node:assert/strict';
import {validateReadinessConsumption} from '../../../scripts/kidults/kpmo/validate-governed-readiness-consumption-v1.mjs';
const now=Date.parse('2026-09-26T12:10:00Z'),head='a'.repeat(40),base='b'.repeat(40);
const receipt={id:'kidults-governed-landing-readiness-receipt-v1',version:'1.0.0',state:'READY_PENDING_ATOMIC_LANDING',repository:'o/r',workflow_run_id:10,workflow_run_attempt:1,pull_request:2381,exact_base_sha:base,exact_head_sha:head,evaluated_at:'2026-09-26T12:00:01Z',final_live_reread:true,ordinary_readiness_published_success:false,atomic_landing_required:true,production:'HOLD',public_release:'HOLD',g5:'HOLD'};
const input={repository:'o/r',runId:10,runAttempt:1,prNumber:2381,headSha:head,baseSha:base,now,maximumAgeSeconds:900};
test('consumes an exact-head readiness receipt inside the bounded window',()=>assert.equal(validateReadinessConsumption(receipt,input).state,'READINESS_EXACT_HEAD_CONSUMED_FOR_AUTONOMOUS_DISPATCH'));
for(const [name,mutate,code] of [
 ['head drift',x=>x.exact_head_sha='c'.repeat(40),'EXACT_BINDING'],['base drift',x=>x.exact_base_sha='c'.repeat(40),'EXACT_BINDING'],['run drift',x=>x.workflow_run_id=11,'RUN_BINDING'],['success escalation',x=>x.ordinary_readiness_published_success=true,'AUTHORITY_BOUNDARY'],['HOLD drift',x=>x.production='ALLOW','HOLD_BOUNDARY'],['stale pending',x=>x.evaluated_at='2026-09-26T11:00:00Z','TIMEOUT_RECONVERGENCE'],
])test(`fails closed on ${name}`,()=>{const x=structuredClone(receipt);mutate(x);assert.throws(()=>validateReadinessConsumption(x,input),new RegExp(code));});
test('draft development receipt authorizes only exact-bound lifecycle transition',()=>{
  const draft={...receipt,state:'DRAFT_DEVELOPMENT_VALIDATED_NON_PROMOTABLE',promotion_eligible:false,landing_authorization_created:false,atomic_landing_required:false};
  const result=validateReadinessConsumption(draft,input);
  assert.equal(result.draft_transition_eligible,true);
  assert.equal(result.exact_base_sha,base);
  assert.equal(result.production,'HOLD');
});
test('draft receipt with promotion or authority claims is rejected',()=>{
  const draft={...receipt,state:'DRAFT_DEVELOPMENT_VALIDATED_NON_PROMOTABLE',promotion_eligible:true,landing_authorization_created:false,atomic_landing_required:false};
  assert.throws(()=>validateReadinessConsumption(draft,input),/DRAFT_AUTHORITY_BOUNDARY/);
});

for(const state of ['READY_OPERATION_AUTHORITY_PENDING','READY_NON_GOVERNED_SCOPE_VERIFIED']) {
  const isolated={...receipt,state,status_context:'KIDULTS Landing Readiness V1',ordinary_readiness_published_success:true,
    promotion_eligible:false,landing_authorization_created:false,atomic_landing_required:state==='READY_OPERATION_AUTHORITY_PENDING'};
  test(`consumes isolated ${state} readiness without landing authority`,()=>{
    const result=validateReadinessConsumption(isolated,input);
    assert.equal(result.landing_authorization_created,false);assert.equal(result.promotion_eligible,false);
    assert.equal(result.draft_transition_eligible,undefined);
  });
  for(const [name,change] of [['required context',{status_context:'KIDULTS Governed Landing Authorization V1'}],
    ['authorization',{landing_authorization_created:true}],['promotion',{promotion_eligible:true}],
    ['atomic claim',{atomic_landing_required:!isolated.atomic_landing_required}],['missing reread',{final_live_reread:false}]]) {
    test(`isolated ${state} rejects ${name}`,()=>assert.throws(()=>validateReadinessConsumption({...isolated,...change},input),/ISOLATED_AUTHORITY_BOUNDARY/));
  }
}

for(const field of ['promotion_eligible','landing_authorization_created']) {
  test(`legacy readiness rejects contradictory ${field} escalation`,()=>
    assert.throws(()=>validateReadinessConsumption({...receipt,[field]:true},input),/AUTHORITY_BOUNDARY/));
}
