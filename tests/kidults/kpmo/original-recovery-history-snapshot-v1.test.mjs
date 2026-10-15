import test from 'node:test';
import assert from 'node:assert/strict';
import {listOriginalRecoveryHistory,operatingProofFailureDisposition} from '../../../scripts/kidults/kpmo/collect-whole-platform-operating-proof-v1.mjs';
const originalRun={id:38132692877,created_at:'2026-10-11T10:38:53Z'},observedAt='2026-10-12T06:00:00Z';
const rows=Array.from({length:101},(_,i)=>({id:i+1,created_at:'2026-10-11T12:00:00Z',status:'in_progress',conclusion:null}));
const call=get=>listOriginalRecoveryHistory({originalRun,observedAt,get,workflow:'track.yml'});
test('explicit rate-aware read deferral remains HOLD and does not become producer failure',()=>{
  const deferred=Error('GITHUB_READ_DEFERRED');
  deferred.read_resume_checkpoint={state:'READ_DEFERRED_NOT_AUTHORITY',reason:'RATE_WAIT'};
  assert.deepEqual(operatingProofFailureDisposition(deferred),
    {state:'VERIFIED_HOLD',reason:'GITHUB_READ_DEFERRED_NOT_AUTHORITY'});
  assert.deepEqual(operatingProofFailureDisposition(Error('HTTP_403_PERMISSION')),
    {state:'VERIFIED_FAIL',reason:'HTTP_403_PERMISSION'});
});
test('completion during pagination does not change fixed created-window membership',async()=>{
  const seen=[];
  const result=await call(async route=>{
    const q=new URL('https://example.invalid/'+route).searchParams;seen.push(q);
    if(q.has('status'))throw Error('mutable status filter');
    const page=Number(q.get('page'));
    if(page===2)rows[100]={...rows[100],status:'completed',conclusion:'success'};
    return {total_count:rows.length,workflow_runs:structuredClone(rows.slice((page-1)*100,page*100))};
  });
  assert.equal(result.workflow_runs.length,101);assert.equal(result.complete,true);assert.equal(result.workflow_runs[100].conclusion,'success');
  assert.equal(seen.length,2);assert.ok(seen.every(q=>q.get('created')===seen[0].get('created')));
});
for(const [name,get,code] of [
  ['incomplete provider index',async()=>({total_count:0,workflow_runs:[],incomplete_results:true}),'INDEX'],
  ['partial page',async()=>({total_count:101,workflow_runs:rows.slice(0,99)}),'PAGE_CARDINALITY'],
  ['duplicate identity',async()=>({total_count:2,workflow_runs:[rows[0],rows[0]]}),'DUPLICATE'],
  ['outside cutoff',async()=>({total_count:1,workflow_runs:[{...rows[0],created_at:'2026-10-12T06:00:01Z'}]}),'INCIDENT_WINDOW'],
  ['before incident',async()=>({total_count:1,workflow_runs:[{...rows[0],created_at:'2026-10-11T10:38:52Z'}]}),'INCIDENT_WINDOW'],
  ['changed membership',async route=>new URL('https://example.invalid/'+route).searchParams.get('page')==='1'
    ?{total_count:101,workflow_runs:rows.slice(0,100)}:{total_count:102,workflow_runs:[rows[100]]},'CHANGED']
])test(`history rejects ${name} without accepting a bounded prefix`,async()=>{
  await assert.rejects(call(get),new RegExp('RECOVERY_HISTORY_'+code));
});
test('exactly 1000 results are partitioned instead of assumed complete',async()=>{
  let requests=0;
  const start=Date.parse(originalRun.created_at);
  const observed='2026-10-12T06:00:00Z';
  const all=Array.from({length:1000},(_,i)=>({...rows[0],id:i+1,
    created_at:new Date(start+i*60000).toISOString()}));
  const result=await listOriginalRecoveryHistory({originalRun,observedAt:observed,workflow:'track.yml',get:async route=>{
    requests++;
    const q=new URL('https://example.invalid/'+route).searchParams;
    const [from,to]=q.get('created').split('..').map(Date.parse);
    const page=Number(q.get('page'));
    const match=all.filter(run=>Date.parse(run.created_at)>=from&&Date.parse(run.created_at)<=to);
    return {total_count:match.length,workflow_runs:match.slice((page-1)*100,page*100)};
  }});
  assert.ok(requests>10&&requests<240);assert.equal(result.workflow_runs.length,1000);assert.equal(result.complete,true);
});
test('2,500-run history is completely reconciled through disjoint created windows',async()=>{
  let requests=0;
  const start=Date.parse(originalRun.created_at);
  const observed='2026-10-15T06:00:00Z';
  const all=Array.from({length:2500},(_,i)=>({...rows[0],id:i+1,
    created_at:new Date(start+i*100000).toISOString()}));
  const result=await listOriginalRecoveryHistory({originalRun,observedAt:observed,workflow:'track.yml',get:async route=>{
    requests++;
    const q=new URL('https://example.invalid/'+route).searchParams;
    const [from,to]=q.get('created').split('..').map(Date.parse);
    const page=Number(q.get('page'));
    const match=all.filter(run=>Date.parse(run.created_at)>=from&&Date.parse(run.created_at)<=to);
    return {total_count:match.length,workflow_runs:match.slice((page-1)*100,page*100)};
  }});
  assert.equal(result.workflow_runs.length,2500);assert.equal(result.total_count,2500);
  assert.equal(result.complete,true);assert.equal(result.read_count,requests);
  assert.ok(requests>25&&requests<240);
  assert.ok(result.workflow_runs.some(run=>run.id===1));
  assert.equal(new Set(result.workflow_runs.map(run=>run.id)).size,2500);
});
test('an overfull exact-second bucket fails closed within the read ceiling',async()=>{
  let requests=0;
  await assert.rejects(listOriginalRecoveryHistory({originalRun,observedAt:originalRun.created_at,
   workflow:'track.yml',get:async route=>{
    requests++;
    const q=new URL('https://example.invalid/'+route).searchParams;
    const page=Number(q.get('page'));
    return {total_count:1001,workflow_runs:rows.slice(0,page===1?100:1)};
  }}),/RECOVERY_HISTORY_TIMESTAMP_DENSITY/);
  assert.ok(requests<240);
});
test('over-1000 history cannot exceed the recovery read budget',async()=>{
  let requests=0;
  await assert.rejects(call(async route=>{
    requests++;
    const page=Number(new URL('https://example.invalid/'+route).searchParams.get('page'));
    return {total_count:2500,workflow_runs:rows.slice(0,page===1?100:100)};
  }),/RECOVERY_HISTORY_READ_BUDGET/);
  assert.equal(requests,240);
});
