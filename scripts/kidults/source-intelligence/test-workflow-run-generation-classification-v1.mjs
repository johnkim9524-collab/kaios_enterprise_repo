#!/usr/bin/env node

import assert from 'node:assert/strict';
import {classifyWorkflowRunGeneration} from './classify-workflow-run-generation-v1.mjs';

const repository='johnkim9524-collab/kaios_enterprise_repo';
const expectedWorkflowPath='.github/workflows/kidults-asi-p1-source-preflight-v1.yml';
const currentMainSha='a'.repeat(40), priorMainSha='b'.repeat(40);
const event=(overrides={})=>({workflow_run:{id:123,run_attempt:1,path:expectedWorkflowPath,head_repository:{full_name:repository},head_branch:'main',head_sha:currentMainSha,conclusion:'success',...overrides}});
const classify=(overrides={},options={})=>classifyWorkflowRunGeneration({event:event(overrides),currentMainSha:options.currentMainSha??currentMainSha,repository,expectedWorkflowPath});

let result=classify();
assert.deepEqual([result.state,result.classification,result.reason,result.current_main_authority],['VERIFIED_PASS','CURRENT_MAIN_EXACT','CURRENT_MAIN_PRODUCER_BOUND',true]);
result=classify({head_sha:priorMainSha});
assert.deepEqual([result.state,result.classification,result.reason,result.current_main_authority],['VERIFIED_SKIP','EXPECTED_NONAUTHORITATIVE_SKIP','STALE_PRIOR_MAIN_TRIGGER',false]);
for(const conclusion of ['failure','cancelled','timed_out']){
  result=classify({conclusion}); assert.equal(result.state,'VERIFIED_SKIP'); assert.equal(result.reason,'UPSTREAM_NON_SUCCESS');
}
for(const [overrides,reason] of [[{head_repository:{full_name:'other/repo'}},'PRODUCER_REPOSITORY_MISMATCH'],[{head_branch:'feature'},'PRODUCER_BRANCH_MISMATCH'],[{path:'.github/workflows/other.yml'},'PRODUCER_WORKFLOW_PATH_MISMATCH'],[{head_sha:'bad'},'PRODUCER_HEAD_SHA_INVALID']]){
  result=classify(overrides); assert.equal(result.state,'VERIFIED_FAIL'); assert.equal(result.reason,reason);
}
result=classifyWorkflowRunGeneration({event:{},currentMainSha,repository,expectedWorkflowPath}); assert.equal(result.reason,'WORKFLOW_RUN_EVENT_MISSING');
result=classify({}, {currentMainSha:'bad'}); assert.equal(result.reason,'CURRENT_MAIN_SHA_INVALID');
assert.equal(result.promotion_eligible,false); assert.equal(result.production,'HOLD');
console.log(JSON.stringify({state:'VERIFIED_PASS',test:'workflow-run-generation-classification-v1'}));
