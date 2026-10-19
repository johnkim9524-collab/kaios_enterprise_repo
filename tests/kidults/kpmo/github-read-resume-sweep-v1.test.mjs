import test from 'node:test';
import assert from 'node:assert/strict';
import {READ_RESUME_SWEEP_PRODUCERS,readResumeSweepRoute,selectReadResumeSweepCandidates,deterministicReadResumeSweepWakeAt}
  from '../../../scripts/kidults/kpmo/lib/github-read-resume-sweep-v1.mjs';

const now=Date.parse('2026-10-19T05:00:00.000Z');
const producer=READ_RESUME_SWEEP_PRODUCERS[0];
const base={id:321,run_attempt:1,name:producer.name,path:producer.path,status:'completed',conclusion:'failure',head_branch:'main',
  head_sha:'a'.repeat(40),event:'repository_dispatch',created_at:'2026-10-19T04:45:00.000Z',
  repository:{full_name:'johnkim9524-collab/kaios_enterprise_repo',id:1281328888},
  head_repository:{full_name:'johnkim9524-collab/kaios_enterprise_repo'}};

test('sweep route is exact, time-bounded and restricted to the four approved producers',()=>{
  assert.equal(READ_RESUME_SWEEP_PRODUCERS.length,4);
  assert.equal(readResumeSweepRoute(producer,{createdAfter:'2026-10-19T04:30:00.000Z'}),
    'actions/workflows/kidults-autonomous-track-authorization-v1.yml/runs?branch=main&status=completed&created=%3E%3D2026-10-19T04:30:00.000Z&per_page=100&page=1');
  assert.throws(()=>readResumeSweepRoute({name:'other',path:producer.path},{createdAfter:'2026-10-19T04:30:00.000Z'}),/PRODUCER/);
  assert.throws(()=>readResumeSweepRoute(producer,{createdAfter:'not-a-date'}),/CREATED_AFTER/);
});

test('candidate selection binds exact failed main runs, repository and recent creation time',()=>{
  const invalid=[
    {...base,conclusion:'success'},
    {...base,head_branch:'feature'},
    {...base,head_sha:'bad'},
    {...base,event:'schedule'},
    {...base,repository:{...base.repository,id:7}},
    {...base,head_repository:{full_name:'fork/other'}},
    {...base,created_at:'2026-10-19T04:00:00.000Z'},
    {...base,created_at:'2026-10-19T05:01:00.000Z'},
  ];
  const listing={total_count:1+invalid.length,workflow_runs:[...invalid,base]};
  assert.deepEqual(selectReadResumeSweepCandidates({producer,listing,now,windowMs:30*60*1000}),[base]);
});

test('candidate selection accepts GitHub workflow_run display-name suffixes when workflow path is exact',()=>{
  const kpmo=READ_RESUME_SWEEP_PRODUCERS.find(item=>item.role==='kpmo');
  const run={...base,name:`${kpmo.name} completed`,path:kpmo.path,event:'workflow_run'};
  assert.deepEqual(selectReadResumeSweepCandidates({producer:kpmo,listing:{total_count:1,workflow_runs:[run]},now}),[run]);
});

test('selection sorts newest-first and enforces a bounded limit',()=>{
  const older={...base,id:320,created_at:'2026-10-19T04:40:00.000Z'};
  const newest={...base,id:322,created_at:'2026-10-19T04:55:00.000Z'};
  const result=selectReadResumeSweepCandidates({producer,listing:{total_count:3,workflow_runs:[older,newest,base]},now,limit:2});
  assert.deepEqual(result.map(run=>run.id),[322,321]);
  assert.throws(()=>selectReadResumeSweepCandidates({producer,listing:{total_count:0,workflow_runs:[]},now,limit:11}),/CONFIG/);
});

test('malformed or unbounded listing data fails closed',()=>{
  assert.throws(()=>selectReadResumeSweepCandidates({producer,listing:{total_count:0,workflow_runs:[base]},now}),/LISTING/);
  assert.throws(()=>selectReadResumeSweepCandidates({producer,listing:{total_count:101,workflow_runs:Array(101).fill(base)},now}),/LISTING/);
  assert.throws(()=>selectReadResumeSweepCandidates({producer,listing:{total_count:2,workflow_runs:[base,{...base,conclusion:'cancelled'}]},now}),/DUPLICATE_RUN_IDENTITY/);
  assert.throws(()=>selectReadResumeSweepCandidates({producer:{name:'x',path:'x'},listing:{total_count:0,workflow_runs:[]},now}),/PRODUCER/);
});

test('repeated sweeps derive the same future wake from the source run and checkpoint',()=>{
  const createdAt='2026-10-19T04:55:00.000Z';
  const first=deterministicReadResumeSweepWakeAt({createdAt,checkpointResumeAt:now,now,windowMs:28*60*1000});
  const second=deterministicReadResumeSweepWakeAt({createdAt,checkpointResumeAt:now,now:now+15*60*1000,windowMs:28*60*1000});
  assert.equal(first,Date.parse('2026-10-19T05:26:00.000Z'));
  assert.equal(second,first);
  assert.equal(deterministicReadResumeSweepWakeAt({createdAt,checkpointResumeAt:Date.parse('2026-10-19T05:40:00.000Z'),now}),
    Date.parse('2026-10-19T05:40:00.000Z'));
  assert.throws(()=>deterministicReadResumeSweepWakeAt({createdAt:'2026-10-19T04:00:00.000Z',checkpointResumeAt:now,now}),/WAKE_CONFIG/);
});

test('wake calculation accepts GitHub whole-second UTC timestamps',()=>{
  const createdAt='2026-10-19T04:45:00Z';
  assert.equal(deterministicReadResumeSweepWakeAt({createdAt,checkpointResumeAt:now,now}),
    Date.parse('2026-10-19T05:16:00.000Z'));
  assert.throws(()=>deterministicReadResumeSweepWakeAt({createdAt:'2026-10-19T04:45:00+00:00',checkpointResumeAt:now,now}),
    /WAKE_CONFIG/);
});

test('the 28-minute scan boundary schedules once and ages out before the next sweep',()=>{
  const boundary={...base,created_at:'2026-10-19T04:32:00.000Z'};
  const selected=selectReadResumeSweepCandidates({producer,listing:{total_count:1,workflow_runs:[boundary]},now,windowMs:28*60*1000});
  assert.deepEqual(selected,[boundary]);
  const wake=deterministicReadResumeSweepWakeAt({createdAt:boundary.created_at,checkpointResumeAt:now,now,
    windowMs:28*60*1000});
  assert.equal(wake,Date.parse('2026-10-19T05:03:00.000Z'));
  const nextSweep=now+15*60*1000;
  assert.deepEqual(selectReadResumeSweepCandidates({producer,listing:{total_count:1,workflow_runs:[boundary]},
    now:nextSweep,windowMs:28*60*1000}),[]);
  const justOutside={...boundary,created_at:'2026-10-19T04:31:59.999Z'};
  assert.deepEqual(selectReadResumeSweepCandidates({producer,listing:{total_count:1,workflow_runs:[justOutside]},
    now,windowMs:28*60*1000}),[]);
});
