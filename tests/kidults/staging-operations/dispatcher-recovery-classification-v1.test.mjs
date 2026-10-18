import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDispatcherTrigger,buildOwnerReviewRequired,buildPolicyRepairRequired,compareStaleCandidateAgainstMain} from '../../../scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
const sha=c=>c.repeat(40);
const input={repository:'johnkim9524-collab/kaios_enterprise_repo',repositoryId:'1281328888',sourceSha:sha('a'),ref:'refs/heads/main',runAttempt:1,eventName:'workflow_run',event:{workflow_run:{conclusion:'success',event:'pull_request_target',path:'.github/workflows/kidults-scope-aware-authoritative-status-v1.yml',head_repository:{id:1281328888,full_name:'johnkim9524-collab/kaios_enterprise_repo'},pull_requests:[{number:42,head:{repo:{id:1281328888}}}]}}};
test('native trigger requires exactly one same-repository PR and never authorizes landing',()=>{
  const r=validateDispatcherTrigger(input);assert.equal(r.authority_created,false);assert.equal(r.pull_request,42);
  const legacy=structuredClone(input);delete legacy.event.workflow_run.head_repository;legacy.event.workflow_run.pull_requests=[{number:42,head:{repo:{id:1281328888}}}];
  assert.equal(validateDispatcherTrigger(legacy).pull_request,42);
});
test('native trigger rejects forks, contradiction, absent identity, wrong path, ref and retries',()=>{
  const mutations=[x=>x.event.workflow_run.head_repository.id=7,x=>x.event.workflow_run.head_repository.full_name='attacker/repo',x=>x.event.workflow_run.pull_requests=[{number:42,head:{repo:{id:7}}}],x=>{delete x.event.workflow_run.head_repository; x.event.workflow_run.pull_requests=[];},x=>x.event.workflow_run.pull_requests=[],x=>delete x.event.workflow_run.pull_requests,x=>x.event.workflow_run.pull_requests.push(x.event.workflow_run.pull_requests[0]),x=>x.event.workflow_run.path='evil.yml',x=>x.runAttempt=2,x=>x.ref='refs/heads/evil'];
  for(const mutate of mutations){const x=structuredClone(input);mutate(x);assert.throws(()=>validateDispatcherTrigger(x),/DISPATCH_TRIGGER_/);}
});
test('stale review/repair disposition preserves original base and current main with no mutation authority',()=>{
  const context={pr:{number:42,state:'open',merged:false,base:{ref:'main',sha:sha('b'),repo:{full_name:input.repository,id:1281328888}},head:{sha:sha('c')}},mainSha:sha('a'),treeSha:sha('d'),files:[{filename:'scripts/guard.mjs'}]};
  for(const [fn,code,state] of [[buildOwnerReviewRequired,'CAPABILITY_GUARD_WEAKENED','OWNER_REVIEW_REQUIRED'],[buildPolicyRepairRequired,'INDEPENDENT_SECURITY_CAPABILITY_ADDED','POLICY_REPAIR_REQUIRED']]){
    const r=fn({...context,error:{code,message:code}});assert.equal(r.state,state);assert.equal(r.binding.base_sha,sha('b'));assert.equal(r.binding.current_main_sha,sha('a'));assert.equal(r.binding.classification_mode,'STALE_BASE');assert.equal(r.autonomous_eligible,false);assert.equal(r.merge_authorized,false);
  }
});
test('mixed stale candidate preserves exact already-present and residual file evidence without eligibility',async()=>{
  const token={sourceReader:{hasSource:()=>true,blobOrNull:async(ref,path)=>({sha:path==='scripts/already.mjs'?sha('e'):ref===sha('c')?sha('f'):sha('d')})}};
  const r=await compareStaleCandidateAgainstMain({repository:input.repository,baseSha:sha('b'),mainSha:sha('a'),headSha:sha('c'),files:[{filename:'scripts/already.mjs',status:'modified'},{filename:'scripts/residual.mjs',status:'modified'}],token});
  assert.deepEqual(r.members.map(x=>x.state),['ALREADY_PRESENT_EXACT_BLOB','RESIDUAL_CHANGE_REQUIRES_VALIDATION']);assert.equal(r.all_changed_files_equal_current_main,false);assert.equal(r.autonomous_eligible,false);assert.equal(r.merge_authorized,false);
});
