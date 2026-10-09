import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyAssuranceCompletion} from '../../../scripts/kidults/kpmo/lib/assurance-completion-disposition-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',sha='a'.repeat(40);
const fixture=(conclusion='success')=>({expected:{repository:repo,sha,run_id:123,run_attempt:2},
 run:{id:123,run_attempt:2,repository:{full_name:repo},head_repository:{full_name:repo},head_branch:'main',
 name:'KIDULTS Platform Continuous Assurance V1',path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',head_sha:sha,status:'completed',conclusion:'success',event:'workflow_dispatch'},
 jobs:[{id:1,run_id:123,run_attempt:2,head_sha:sha,name:'audit',status:'completed',conclusion},
 {id:2,run_id:123,run_attempt:2,head_sha:sha,name:'classify-canonical-identity',status:'completed',conclusion:'success'}]});
test('real successful audit is eligible but grants no authority',()=>{const r=classifyAssuranceCompletion(fixture());assert.equal(r.eligible_full_audit,true);assert.equal(r.authority_granted,false);});
test('verified classification-only success is explicitly non-authorizing',()=>{const r=classifyAssuranceCompletion(fixture('skipped'));assert.equal(r.eligible_full_audit,false);assert.equal(r.disposition,'CLASSIFICATION_ONLY_NON_AUTHORIZING');assert.equal(r.whole_platform_runtime_proven,false);});
test('failed/cancelled audit is rejected even if workflow is green',()=>{for(const c of ['failure','cancelled','timed_out',null]) assert.throws(()=>classifyAssuranceCompletion(fixture(c)),/AUDIT_NON_SUCCESS/);});
test('skipped audit cannot disguise failed/missing classifier',()=>{for(const c of ['failure','skipped']){const f=fixture('skipped');f.jobs[1].conclusion=c;assert.throws(()=>classifyAssuranceCompletion(f),/CLASSIFICATION_NOT_VERIFIED/);}const f=fixture('skipped');f.jobs.pop();assert.throws(()=>classifyAssuranceCompletion(f),/CLASSIFICATION_NOT_VERIFIED/);});
test('fork/wrong workflow/stale SHA/attempt cannot qualify',()=>{for(const mutation of [f=>f.run.repository.full_name='fork/repo',f=>f.run.head_repository.full_name='fork/repo',f=>f.run.path='untrusted.yml',f=>f.run.head_sha='b'.repeat(40),f=>f.run.run_attempt=1,f=>f.run.status='in_progress']){const f=fixture();mutation(f);assert.throws(()=>classifyAssuranceCompletion(f),/RUN_BINDING/);}});
test('job replay, duplicates and missing/multiple audit fail closed',()=>{for(const mutate of [f=>f.jobs[0].run_attempt=1,f=>f.jobs[0].head_sha='b'.repeat(40),f=>f.jobs.push({...f.jobs[0]}),f=>f.jobs.shift(),f=>f.jobs.push({...f.jobs[0],id:3})]){const f=fixture();mutate(f);assert.throws(()=>classifyAssuranceCompletion(f));}});
