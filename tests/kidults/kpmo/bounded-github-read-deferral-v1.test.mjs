import test from 'node:test';
import assert from 'node:assert/strict';
import {readWithBoundedGithubDeferrals} from '../../../scripts/kidults/kpmo/lib/bounded-github-read-deferral-v1.mjs';

const route='actions/runs/4321/attempts/2/jobs?per_page=100';
const binding={root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:'a'.repeat(40),run_id:'9001',run_attempt:1,
  original_run_id:38132692877,original_run_attempt:1,original_artifact_id:11700046124,
  original_artifact_digest:'sha256:'+'b'.repeat(64)};
const checkpoint=(resumeAt)=>({id:'kidults-github-read-resume-checkpoint-v1',version:'1.0.0',state:'READ_DEFERRED_NOT_AUTHORITY',binding:structuredClone(binding),
  unfinished_operation:{method:'GET',route:`/repos/johnkim9524-collab/kaios_enterprise_repo/${route}`},reason:'HTTP_RATE_LIMIT',
  resume_at:new Date(resumeAt).toISOString(),original_reservation_preserved:true,reservation_write_performed:false,
  producer_failure_claimed:false,actual_authority_granted:false,promotion_eligible:false,mutation_retry_authorized:false});
function deferred(cp){const error=Error('GITHUB_READ_DEFERRED');error.read_resume_checkpoint=cp;return error;}

test('a valid deferred GET resumes once within the same runner deadline',async()=>{
  let now=1000,calls=0,waits=0;
  const result=await readWithBoundedGithubDeferrals({route,expectedBinding:binding,deadline:10000,now:()=>now,
    wait:async ms=>{waits++;now+=ms;},read:async()=>{calls++;if(calls===1)throw deferred(checkpoint(3000));return {id:4321};}});
  assert.deepEqual(result,{value:{id:4321},deferrals:1});assert.equal(calls,2);assert.equal(waits,1);
});

test('a second deferral is bounded and preserved for a HOLD receipt',async()=>{
  let now=1000,calls=0;
  await assert.rejects(readWithBoundedGithubDeferrals({route,expectedBinding:binding,deadline:9000,now:()=>now,
    wait:async ms=>{now+=ms;},read:async()=>{calls++;throw deferred(checkpoint(now+1000));}}),/GITHUB_READ_DEFERRED/);
  assert.equal(calls,3);
});

test('wrong runner binding, route, authority flags and out-of-deadline wait fail closed',async t=>{
  const mutations=[
    cp=>{cp.binding.run_id='9002';},
    cp=>{cp.unfinished_operation.route+='/extra';},
    cp=>{cp.actual_authority_granted=true;},
    cp=>{cp.resume_at=new Date(20000).toISOString();},
    cp=>{cp.resume_at=new Date(10000).toISOString();},
  ];
  for(const mutate of mutations){
    await t.test('reject malformed checkpoint',async()=>{
      const cp=checkpoint(3000);mutate(cp);let calls=0;
      await assert.rejects(readWithBoundedGithubDeferrals({route,expectedBinding:binding,deadline:10000,now:()=>1000,
        wait:async()=>{},
        read:async()=>{calls++;throw deferred(cp);}}),/BOUNDED_GITHUB_READ_/);
      assert.equal(calls,1);
    });
  }
});

test('bounded resume admits the complete validated recovery checkpoint route set',async()=>{
  const routes=['actions/runs/4321','actions/runs/4321/artifacts?per_page=100',
    'actions/runs/4321/attempts/2/jobs?per_page=100','actions/artifacts/500/zip','pulls/2655','branches/main',
    `git/commits/${'c'.repeat(40)}`,`compare/${'a'.repeat(40)}...${'b'.repeat(40)}`,
    `compare/${'a'.repeat(40)}...${'b'.repeat(40)}?per_page=1&page=2`,
    'actions/workflows/kidults-autonomous-track-authorization-v1.yml/runs?branch=main&event=repository_dispatch&status=failure&per_page=100&page=1'];
  for(const route of routes){
    const cp=checkpoint(1000);cp.unfinished_operation.route=`/repos/johnkim9524-collab/kaios_enterprise_repo/${route}`;
    await assert.rejects(readWithBoundedGithubDeferrals({route,expectedBinding:binding,deadline:10000,now:()=>1000,
      read:async()=>{throw deferred(cp);}}),/GITHUB_READ_DEFERRED/);
  }
});

test('bounded resume admits only source-SHA and time-bounded Sentinel discovery queries',async t=>{
  const sourceSha=binding.source_sha;
  const nowValue=Date.parse('2026-10-12T10:01:00.000Z');
  const start='2026-10-11T10:00:00.000Z',end='2026-10-12T10:00:00.000Z';
  const makeRoute=(sha,from,to)=>`actions/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml/runs?head_sha=${sha}&created=${encodeURIComponent(`${from}..${to}`)}&per_page=100&page=1`;
  const valid=makeRoute(sourceSha,start,end);
  const cp=checkpoint(nowValue);cp.unfinished_operation.route=`/repos/johnkim9524-collab/kaios_enterprise_repo/${valid}`;
  await assert.rejects(readWithBoundedGithubDeferrals({route:valid,expectedBinding:binding,deadline:nowValue+10000,now:()=>nowValue,
    read:async()=>{throw deferred(cp);}}),/GITHUB_READ_DEFERRED/);
  for(const route of [makeRoute('b'.repeat(40),start,end),makeRoute(sourceSha,'2026-10-10T00:00:00.000Z',end),
    makeRoute(sourceSha,start,'2026-10-12T10:02:00.000Z')]){
    const invalid={...cp,unfinished_operation:{method:'GET',route:`/repos/johnkim9524-collab/kaios_enterprise_repo/${route}`}};
    await t.test('rejects unbound or unbounded Sentinel query',async()=>{
      await assert.rejects(readWithBoundedGithubDeferrals({route,expectedBinding:binding,deadline:nowValue+10000,now:()=>nowValue,
        read:async()=>{throw deferred(invalid);}}),/BOUNDED_GITHUB_READ_ROUTE/);
    });
  }
});
