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
  ['partial page',async()=>({total_count:101,workflow_runs:rows.slice(0,99)}),'TRUNCATED'],
  ['duplicate identity',async()=>({total_count:2,workflow_runs:[rows[0],rows[0]]}),'DUPLICATE'],
  ['outside cutoff',async()=>({total_count:1,workflow_runs:[{...rows[0],created_at:'2026-10-12T06:00:01Z'}]}),'INCIDENT_WINDOW'],
  ['before incident',async()=>({total_count:1,workflow_runs:[{...rows[0],created_at:'2026-10-11T10:38:52Z'}]}),'INCIDENT_WINDOW'],
  ['changed membership',async route=>new URL('https://example.invalid/'+route).searchParams.get('page')==='1'
    ?{total_count:101,workflow_runs:rows.slice(0,100)}:{total_count:102,workflow_runs:[rows[100]]},'CHANGED']
])test(`history rejects ${name} without accepting a bounded prefix`,async()=>{
  await assert.rejects(call(get),new RegExp('RECOVERY_HISTORY_'+code));
});
test('exact 1000-row boundary is exhausted in ten requests',async()=>{
  let requests=0;
  const all=Array.from({length:1000},(_,i)=>({...rows[0],id:i+1}));
  const result=await call(async route=>{
    requests++;const page=Number(new URL('https://example.invalid/'+route).searchParams.get('page'));
    return {total_count:1000,workflow_runs:all.slice((page-1)*100,page*100)};
  });
  assert.equal(requests,10);assert.equal(result.workflow_runs.length,1000);assert.equal(result.complete,true);
});
test('over-1000 history returns only the bounded prefix and cannot prove absence',async()=>{
  let requests=0;
  const all=Array.from({length:1001},(_,i)=>({...rows[0],id:i+1}));
  const result=await call(async route=>{
    requests++;const page=Number(new URL('https://example.invalid/'+route).searchParams.get('page'));
    return {total_count:all.length,workflow_runs:all.slice((page-1)*100,page*100)};
  });
  assert.equal(requests,10);assert.equal(result.workflow_runs.length,1000);
  assert.equal(result.total_count,1001);assert.equal(result.complete,false);
});
