import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateAutonomousPostmerge} from '../../../scripts/kidults/kpmo/lib/autonomous-postmerge-validation-v1.mjs';

const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json'));
const sha = 'd'.repeat(40), mergedAt = '2026-10-03T12:00:00Z';
const row = (expected, id, event = 'push') => ({...expected,id,event,head_sha:sha,head_branch:'main',status:'completed',conclusion:'success',run_attempt:1,created_at:'2026-10-03T12:00:01Z',updated_at:'2026-10-03T12:00:02Z'});
const fixture = () => [...policy.required_workflows.map((item,i)=>row(item,i+1)),row(policy.canonical_convergence.producer,20),{...row(policy.canonical_convergence.consumer,21,'workflow_run'),created_at:'2026-10-03T12:00:03Z'}];
const evaluate = runs => evaluateAutonomousPostmerge(runs,policy,sha,mergedAt);

test('exact push suite and ordered canonical success prove bounded landing integrity',()=>{
  const result=evaluate(fixture());
  assert.equal(result.state,'VERIFIED_PASS');
  assert.equal(result.required_workflows.length,6);
  assert.equal(result.promotion_eligible,false);
});
test('superseded asynchronous producer failures do not replace exact push controls',()=>{
  const runs=fixture();
  runs.push({...row({name:'Sentinel',path:'.github/workflows/sentinel.yml'},30,'workflow_run'),conclusion:'failure'});
  assert.equal(evaluate(runs).state,'VERIFIED_PASS');
});
test('missing or nonterminal required workflow cannot authorize consumption',()=>{
  assert.equal(evaluate(fixture().slice(1)).state,'WAITING');
  const runs=fixture(); runs[0].status='in_progress'; runs[0].conclusion=null;
  assert.equal(evaluate(runs).state,'WAITING');
});
test('required failure, cancelled, ambiguous, stale SHA and wrong event fail closed',()=>{
  for(const mutate of [r=>r[0].conclusion='failure',r=>r[0].conclusion='cancelled',r=>r.push({...r[0],id:99})]){
    const runs=fixture();mutate(runs);assert.equal(evaluate(runs).state,'VERIFIED_FAIL');
  }
  for(const mutate of [r=>r[0].head_sha='a'.repeat(40),r=>r[0].event='workflow_dispatch']){
    const runs=fixture();mutate(runs);assert.equal(evaluate(runs).state,'WAITING');
  }
});
test('canonical consumer cannot precede its producer or disappear',()=>{
  const runs=fixture();runs.at(-1).created_at='2026-10-03T12:00:01Z';
  assert.equal(evaluate(runs).state,'VERIFIED_FAIL');
  assert.equal(evaluate(fixture().slice(0,-1)).state,'WAITING');
});
