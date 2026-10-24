import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyAssuranceCompletion} from '../../../scripts/kidults/kpmo/lib/assurance-completion-disposition-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',sha='a'.repeat(40);
const fixture=(conclusion='success')=>({expected:{repository:repo,sha,run_id:123,run_attempt:2},
 run:{id:123,run_attempt:2,repository:{full_name:repo},head_repository:{full_name:repo},head_branch:'main',
 name:'KIDULTS Platform Continuous Assurance V1',path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',head_sha:sha,status:'completed',conclusion:'success',event:'workflow_run'},
 jobs:[{id:1,run_id:123,run_attempt:2,head_sha:sha,name:'audit',status:'completed',conclusion},
 {id:2,run_id:123,run_attempt:2,head_sha:sha,name:'classify-canonical-identity',status:'completed',conclusion:'success'}]});
const coverageDispatchFixture=()=>{
 const f=fixture();
 f.run.event='workflow_dispatch';f.run.actor={login:'github-actions[bot]'};
 f.jobs[0].steps=[
  {name:'Enforce Sentinel terminal before Assurance',conclusion:'success'},
  {name:'Restore verified one-time Coverage continuation consumption',conclusion:'success'},
  {name:'Verify restored Coverage continuation consumption',conclusion:'success'},
 ];
 f.jobs[1].steps=[
  {name:'Validate and consume forwarded exact Coverage continuation',conclusion:'success'},
  {name:'Retain one-time Coverage continuation consumption receipt',conclusion:'success'},
 ];
 return f;
};
test('real successful audit is eligible but grants no authority',()=>{const r=classifyAssuranceCompletion(fixture());assert.equal(r.eligible_full_audit,true);assert.equal(r.authority_granted,false);});
test('bot-dispatched exact Coverage continuation can reach the authority gate after full audit',()=>{const r=classifyAssuranceCompletion(coverageDispatchFixture());assert.equal(r.eligible_full_audit,true);assert.equal(r.authority_granted,false);});
test('manual or incompletely bound workflow_dispatch cannot reach the authority gate',()=>{
 const wrongActor=coverageDispatchFixture();wrongActor.run.actor.login='johnkim9524-collab';
 assert.throws(()=>classifyAssuranceCompletion(wrongActor),/WORKFLOW_DISPATCH_ACTOR/);
 const missingConsumer=coverageDispatchFixture();missingConsumer.jobs[1].steps[0].conclusion='skipped';
 assert.throws(()=>classifyAssuranceCompletion(missingConsumer),/WORKFLOW_DISPATCH_COVERAGE_CONSUMPTION/);
 const missingSentinel=coverageDispatchFixture();missingSentinel.jobs[0].steps[0].conclusion='skipped';
 assert.throws(()=>classifyAssuranceCompletion(missingSentinel),/WORKFLOW_DISPATCH_AUDIT_BINDING/);
});
test('verified classification-only success is explicitly non-authorizing',()=>{const r=classifyAssuranceCompletion(fixture('skipped'));assert.equal(r.eligible_full_audit,false);assert.equal(r.disposition,'CLASSIFICATION_ONLY_NON_AUTHORIZING');assert.equal(r.whole_platform_runtime_proven,false);});
test('failed/cancelled audit is rejected even if workflow is green',()=>{for(const c of ['failure','cancelled','timed_out',null]) assert.throws(()=>classifyAssuranceCompletion(fixture(c)),/AUDIT_NON_SUCCESS/);});
test('skipped audit cannot disguise failed/missing classifier',()=>{for(const c of ['failure','skipped']){const f=fixture('skipped');f.jobs[1].conclusion=c;assert.throws(()=>classifyAssuranceCompletion(f),/CLASSIFICATION_NOT_VERIFIED/);}const f=fixture('skipped');f.jobs.pop();assert.throws(()=>classifyAssuranceCompletion(f),/CLASSIFICATION_NOT_VERIFIED/);});
test('fork/wrong workflow/stale SHA/attempt cannot qualify',()=>{for(const mutation of [f=>f.run.repository.full_name='fork/repo',f=>f.run.head_repository.full_name='fork/repo',f=>f.run.path='untrusted.yml',f=>f.run.head_sha='b'.repeat(40),f=>f.run.run_attempt=1,f=>f.run.status='in_progress']){const f=fixture();mutation(f);assert.throws(()=>classifyAssuranceCompletion(f),/RUN_BINDING/);}});
test('protected-main push full audit is eligible but remains non-authorizing',()=>{const f=fixture();f.run.event='push';const r=classifyAssuranceCompletion(f);assert.equal(r.event,'push');assert.equal(r.eligible_full_audit,true);assert.equal(r.authority_granted,false);assert.equal(r.whole_platform_runtime_proven,false);assert.equal(r.production,'HOLD');assert.equal(r.public,'HOLD');assert.equal(r.g5,'HOLD');});
test('unsupported event cannot qualify',()=>{const f=fixture();f.run.event='schedule';assert.throws(()=>classifyAssuranceCompletion(f),/EVENT_UNSUPPORTED/);});
test('job replay, duplicates and missing/multiple audit fail closed',()=>{for(const mutate of [f=>f.jobs[0].run_attempt=1,f=>f.jobs[0].head_sha='b'.repeat(40),f=>f.jobs.push({...f.jobs[0]}),f=>f.jobs.shift(),f=>f.jobs.push({...f.jobs[0],id:3})]){const f=fixture();mutate(f);assert.throws(()=>classifyAssuranceCompletion(f));}});
test('Assurance classification is non-authorizing and proof gate waits for the KPMO handoff',()=>{
  const workflow=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml','utf8');
  const classify=workflow.slice(workflow.indexOf('  classify-assurance-completion:'),workflow.indexOf('  deferred-runtime-proof-handoff-gate:'));
  assert.match(classify,/github\.event\.workflow_run\.path == '\.github\/workflows\/kidults-platform-continuous-assurance-v1\.yml'/);
  assert.match(classify,/classify-assurance-completion-disposition-v1\.mjs/);
  assert.match(classify,/github\.event\.workflow_run\.event == 'push'/);
  assert.doesNotMatch(workflow,/  success-authority-gate:\n/);
  const deferred=workflow.slice(workflow.indexOf('  deferred-runtime-proof-handoff-gate:'));
  assert.match(deferred,/github\.event\.workflow_run\.path == '\.github\/workflows\/kidults-autonomous-kpmo-authorization-v1\.yml'/);
  assert.match(deferred,/run-deferred-assurance-proof-gate-v1\.mjs/);
  assert.match(deferred,/state=="VERIFIED_PASS" or \.state=="NOT_APPLICABLE"/);
  assert.match(deferred,/exit 1|jq -e/);
});
