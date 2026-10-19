import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedGithubReadBudget} from '../../../scripts/kidults/kpmo/lib/shared-github-read-budget-v1.mjs';
const scope={repository:'johnkim9524-collab/kaios_enterprise_repo',resource:'core',quota_owner_id:'installation-reviewed-binding'};
function fixture(){let row=null,time=100000;const store={authority:'PROTECTED_ATOMIC_CAS',read:async()=>structuredClone(row),compareAndSwap:async(_key,version,next)=>{await new Promise(r=>setTimeout(r,0));if((row?.version??0)!==version)return 'CONFLICT';row=structuredClone(next);return 'COMMITTED';}};return {store,now:()=>time,setTime:t=>{time=t;},read:()=>row};}
const b=n=>({operation_id:String(n).padStart(64,'0'),run_id:10+n,run_attempt:1,source_sha:'a'.repeat(40),route:'/repos/'+scope.repository+'/actions/runs/10',method:'GET',issued_at:100000});
const create=f=>createSharedGithubReadBudget({store:f.store,scope,capacity:3,maxConcurrent:2,now:f.now});
test('independent clients share atomic concurrency budget',async()=>{const f=fixture(),a=create(f),c=create(f);const result=await Promise.all([a.acquire(b(1)),c.acquire(b(2)),a.acquire(b(3))]);assert.equal(result.filter(r=>r.fetch_allowed).length,2);assert.equal(f.read().spent,2);assert.equal(result.filter(r=>r.state==='READ_BUDGET_DEFERRED').length,1);});
test('duplicate events charge once and do not reissue GET',async()=>{const f=fixture(),a=create(f),c=create(f);const r=await Promise.all([a.acquire(b(1)),c.acquire(b(1))]);assert.equal(r.filter(x=>x.fetch_allowed).length,1);assert.equal(f.read().spent,1);});
test('retries preserve the original operation binding across runner timestamps without another GET permit',async()=>{const f=fixture(),a=create(f);const request=b(1);const first=await a.acquire(request);await a.finish(request,first.permit.fence);f.setTime(101000);const retry=await a.acquire({...request,issued_at:101000});assert.equal(retry.state,'EXISTING_PERMIT_NO_REISSUE');assert.equal(retry.fetch_allowed,false);assert.equal(f.read().spent,1);});
test('completion permits next distinct read while retaining charged budget',async()=>{const f=fixture(),a=create(f),r=await a.acquire(b(1));await a.finish(b(1),r.permit.fence);assert.equal((await a.acquire(b(1))).fetch_allowed,false);assert.equal((await a.acquire(b(2))).fetch_allowed,true);assert.equal(f.read().spent,2);});
test('shared reset pauses distinct clients',async()=>{const f=fixture(),a=create(f),c=create(f);await a.pauseUntil(200000);const r=await c.acquire(b(2));assert.equal(r.fetch_allowed,false);assert.equal(r.resume_at,new Date(200000).toISOString());});
test('unknown CAS must reconcile; never blindly retry',async()=>{const f=fixture();let calls=0;f.store.compareAndSwap=async()=>{calls++;return 'UNKNOWN';};await assert.rejects(create(f).acquire(b(1)),/UNKNOWN_RECONCILE/);assert.equal(calls,1);});
test('bounded jittered CAS conflicts can recover without changing the operation binding',async()=>{
 const f=fixture(),waits=[];let conflicts=0;const commit=f.store.compareAndSwap;
 f.store.compareAndSwap=async(...args)=>{if(conflicts++<3)return 'CONFLICT';return commit(...args);};
 const budget=createSharedGithubReadBudget({store:f.store,scope,capacity:3,maxConcurrent:2,now:f.now,wait:async ms=>waits.push(ms),random:()=>0});
 const result=await budget.acquire(b(1));assert.equal(result.fetch_allowed,true);assert.equal(conflicts,4);assert.deepEqual(waits,[4,8,16]);
 assert.equal(f.read().spent,1);
});
test('fence and immutable operation binding reject rebind',async()=>{const f=fixture(),a=create(f),r=await a.acquire(b(1));await assert.rejects(a.finish(b(1),r.permit.fence+1),/FENCE/);await assert.rejects(a.acquire({...b(1),source_sha:'b'.repeat(40)}),/REBIND/);});
test('expired request cannot resurrect after window pruning',async()=>{const f=fixture(),a=create(f);await a.acquire(b(1));f.setTime(4000000);await assert.rejects(a.acquire(b(1)),/REQUEST_EXPIRED/);});
test('new window admits fresh reads with old reservation untouched',async()=>{const f=fixture(),a=create(f);await a.acquire(b(1));f.setTime(4000000);assert.equal((await a.acquire({...b(2),issued_at:4000000})).fetch_allowed,true);assert.equal(f.read().spent,1);assert.ok(!JSON.stringify(f.read()).includes('RESERVE#'));});
test('clock rollback rejects shared mutation',async()=>{const f=fixture(),a=create(f);await a.acquire(b(1));f.setTime(99999);await assert.rejects(a.acquire(b(2)),/CLOCK_ROLLBACK/);});
test('rerun attempts use the same shared quota without bypassing its cap',async()=>{const f=fixture(),a=create(f);const retry={...b(1),run_attempt:2};assert.equal((await a.acquire(retry)).fetch_allowed,true);const second={...b(2),run_attempt:2};assert.equal((await a.acquire(second)).fetch_allowed,true);assert.equal((await a.acquire({...b(3),run_attempt:2})).state,'READ_BUDGET_DEFERRED');});
test('local artifact is not a protected atomic store',()=>{const f=fixture();f.store.authority='ACTIONS_ARTIFACT';assert.throws(()=>create(f),/STORE_AUTHORITY/);});
