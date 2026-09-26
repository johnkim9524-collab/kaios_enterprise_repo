import test from 'node:test';import assert from 'node:assert/strict';
import {validateReadinessConsumption} from '../../../scripts/kidults/kpmo/validate-governed-readiness-consumption-v1.mjs';
const now=Date.parse('2026-09-26T12:10:00Z'),head='a'.repeat(40);
const receipt={id:'kidults-governed-landing-readiness-receipt-v1',version:'1.0.0',state:'READY_PENDING_ATOMIC_LANDING',repository:'o/r',workflow_run_id:10,workflow_run_attempt:1,pull_request:2381,exact_head_sha:head,evaluated_at:'2026-09-26T12:00:01Z',final_live_reread:true,ordinary_readiness_published_success:false,atomic_landing_required:true,production:'HOLD',public_release:'HOLD',g5:'HOLD'};
const workflowPullRequests=JSON.stringify([{number:2381,head:{sha:head}}]);
const input={repository:'o/r',runId:10,runAttempt:1,prNumber:2381,headSha:head,now,maximumAgeSeconds:900,workflowName:'KIDULTS Governed Landing Authorization V1',workflowConclusion:'success',workflowEvent:'pull_request_target',workflowHeadSha:head,workflowHeadBranch:'main',workflowRepository:'o/r',workflowPullRequests};
test('consumes an exact-head readiness receipt inside the bounded window',()=>assert.equal(validateReadinessConsumption(receipt,input).state,'READINESS_EXACT_HEAD_CONSUMED_FOR_AUTONOMOUS_DISPATCH'));
for(const [name,mutate,code] of [
 ['head drift',x=>x.exact_head_sha='b'.repeat(40),'EXACT_HEAD'],['run drift',x=>x.workflow_run_id=11,'RUN_BINDING'],['attempt drift',x=>x.workflow_run_attempt=2,'RUN_BINDING'],['success escalation',x=>x.ordinary_readiness_published_success=true,'AUTHORITY_BOUNDARY'],['HOLD drift',x=>x.production='ALLOW','HOLD_BOUNDARY'],['stale pending',x=>x.evaluated_at='2026-09-26T11:00:00Z','TIMEOUT_RECONVERGENCE'],
])test(`fails closed on ${name}`,()=>{const x=structuredClone(receipt);mutate(x);assert.throws(()=>validateReadinessConsumption(x,input),new RegExp(code));});
test('fails closed when workflow_run PR bindings drift',()=>assert.throws(()=>validateReadinessConsumption(receipt,{...input,workflowPullRequests:JSON.stringify([{number:2381,head:{sha:'b'.repeat(40)}}])}),/READINESS_WORKFLOW_RUN_PR_BINDING_MISMATCH/));
test('fails closed when workflow_run is skipped instead of successful',()=>assert.throws(()=>validateReadinessConsumption(receipt,{...input,workflowConclusion:'skipped'}),/READINESS_WORKFLOW_NOT_SUCCESS/));
test('classifies merged or closed terminal receipts without dispatch authority',()=>{
 const merged={...receipt,state:'MERGED_POST_LANDING_VERIFICATION_REQUIRED',atomic_landing_required:false};
 const closed={...receipt,state:'CLOSED_TERMINAL_NON_AUTHORIZING',atomic_landing_required:false};
 assert.equal(validateReadinessConsumption(merged,input).dispatch_eligible,false);
 assert.equal(validateReadinessConsumption(closed,input).state,'READINESS_NONCONSUMABLE_TERMINAL');
});
