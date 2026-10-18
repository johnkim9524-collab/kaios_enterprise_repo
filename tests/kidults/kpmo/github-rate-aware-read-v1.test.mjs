import test from 'node:test';
import assert from 'node:assert/strict';
import {createGithubRateAwareRead,createReadBudget,readResumeCheckpoint} from '../../../scripts/kidults/kpmo/lib/github-rate-aware-read-v1.mjs';
import {createSharedGithubReadBudget} from '../../../scripts/kidults/kpmo/lib/shared-github-read-budget-v1.mjs';
const url='https://api.github.com/repos/johnkim9524-collab/kaios_enterprise_repo/actions/runs/10';
const binding={root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:'a'.repeat(40),run_id:20,run_attempt:1,original_run_id:38132692877,original_run_attempt:1};
function fixture(responses,options={}){let time=100000,calls=0;const waits=[],checkpoints=[];
 const now=()=>time,wait=async ms=>{waits.push(ms);time+=ms;},budget=createReadBudget({now,wait,minIntervalMs:0});
 const read=createGithubRateAwareRead({token:'fake',binding,now,wait,budget,onCheckpoint:c=>checkpoints.push(c),...options,fetchImpl:async(_url,options)=>{assert.equal(options.method,'GET');calls++;const r=responses.shift();if(r instanceof Error)throw r;return r;}});
 return {read,now,wait,budget,waits,checkpoints,calls:()=>calls,setTime:t=>{time=t;}};}
const response=(status,headers={},body={ok:true})=>new Response(JSON.stringify(body),{status,headers});
test('successful read no approval claim',async()=>{const f=fixture([response(200)]);assert.deepEqual(await f.read(url),{ok:true});assert.equal(f.calls(),1);});
const transientSocket=()=>Object.assign(new TypeError('fetch failed'),{cause:Object.assign(new Error('other side closed'),{code:'UND_ERR_SOCKET'})});
test('transient socket close retries a GET with a separately charged attempt',async()=>{
 const f=fixture([transientSocket(),response(200)],{maxRetries:0,maxTransportRetries:1});
 assert.deepEqual(await f.read(url),{ok:true});assert.equal(f.calls(),2);assert.deepEqual(f.waits,[250]);assert.equal(f.budget.snapshot().calls,2);
});
test('transient transport retry consumes a fresh cross-runner permit',async()=>{
 let time=100000,row=null,attempts=0;const scope={repository:'johnkim9524-collab/kaios_enterprise_repo',resource:'core',quota_owner_id:'transient-retry-test'};
 const store={authority:'PROTECTED_ATOMIC_CAS',read:async()=>structuredClone(row),compareAndSwap:async(_key,version,next)=>{if((row?.version??0)!==version)return 'CONFLICT';row=structuredClone(next);return 'COMMITTED';}};
 const now=()=>time,wait=async ms=>{time+=ms;};
 const budget=createSharedGithubReadBudget({store,scope,capacity:10,maxConcurrent:1,now});
 const read=createGithubRateAwareRead({token:'fake',binding,now,wait,budget,operationDedupeKey:'resume:run:10',maxRetries:0,maxTransportRetries:1,
   fetchImpl:async()=>{attempts++;if(attempts===1)throw transientSocket();return response(200);}});
 assert.deepEqual(await read(url),{ok:true});assert.equal(attempts,2);assert.equal(row.spent,2);
 assert.equal(Object.keys(row.operations).length,2);assert.ok(Object.values(row.operations).every(item=>item.state==='COMPLETED'));
});
test('exhausted transient retries defer a bounded read checkpoint',async()=>{
 const f=fixture([transientSocket(),transientSocket()],{maxRetries:0,maxTransportRetries:1});
 await assert.rejects(f.read(url),/GITHUB_READ_DEFERRED/);assert.equal(f.calls(),2);assert.deepEqual(f.waits,[250]);
 assert.equal(f.checkpoints.length,1);assert.equal(f.checkpoints[0].reason,'TRANSIENT_NETWORK');assert.equal(f.checkpoints[0].producer_failure_claimed,false);
});
test('unknown transport errors remain fail closed without retry',async()=>{
 const f=fixture([new Error('unexpected programming error')],{maxTransportRetries:2});
 await assert.rejects(f.read(url),/unexpected programming error/);assert.equal(f.calls(),1);assert.equal(f.checkpoints.length,0);
});
test('internal AbortSignal timeout is checkpointed as a bounded transport failure',async()=>{
 const checkpoints=[];let calls=0;
 const read=createGithubRateAwareRead({token:'fake',binding,deadlineMs:10,resumeDeadline:100100,
  now:()=>100000,wait:async()=>{},maxTransportRetries:1,onCheckpoint:x=>checkpoints.push(x),
  fetchImpl:async(_url,options)=>{calls++;await new Promise(resolve=>setTimeout(resolve,20));throw options.signal.reason;}});
 await assert.rejects(read(url),/GITHUB_READ_DEFERRED/);
 assert.equal(calls,1);assert.equal(checkpoints[0].http_diagnostic.transport_code,'ABORT_SIGNAL_TIMEOUT');
 assert.equal(checkpoints[0].resume_at,new Date(100100).toISOString());
});
test('transport failures do not consume the HTTP throttle retry allowance',async()=>{
 const f=fixture([transientSocket(),response(429,{'retry-after':'1'}),response(429,{'retry-after':'1'})],
  {maxRetries:1,maxTransportRetries:1});
 await assert.rejects(f.read(url),/GITHUB_READ_DEFERRED/);
 assert.equal(f.calls(),3);assert.deepEqual(f.waits,[250,1000]);
 assert.equal(f.checkpoints[0].reason,'HTTP_RATE_LIMIT');assert.equal(f.checkpoints[0].attempts_used,3);
});
test('HTTP rate metadata is honored when the response body stream closes',async()=>{
 const body=new ReadableStream({start(controller){controller.error(transientSocket());}});
 const f=fixture([new Response(body,{status:429,headers:{'retry-after':'2'}})],{maxRetries:0,maxTransportRetries:2});
 await assert.rejects(f.read(url),/GITHUB_READ_DEFERRED/);
 assert.equal(f.calls(),1);assert.equal(f.checkpoints[0].reason,'HTTP_RATE_LIMIT');
 assert.ok(Date.parse(f.checkpoints[0].resume_at)>=100000+2000);
});
test('transient checkpoint resume time is clamped to the outer runner deadline',async()=>{
 const f=fixture([transientSocket()],{maxTransportRetries:0,resumeDeadline:100050});
 await assert.rejects(f.read(url),/GITHUB_READ_DEFERRED/);
 assert.equal(f.checkpoints[0].resume_at,new Date(100050).toISOString());
 assert.equal(f.checkpoints[0].diagnostic.transport_code,'UND_ERR_SOCKET');
});

test('primary quota reset waits and resumes same GET',async()=>{const f=fixture([response(403,{'x-ratelimit-remaining':'0','x-ratelimit-reset':'102'}),response(200)]);await f.read(url);assert.deepEqual(f.waits,[3000]);assert.equal(f.calls(),2);assert.equal(f.checkpoints.length,0);});
test('secondary Retry-After controls bounded wait',async()=>{const f=fixture([response(403,{'retry-after':'2'},{message:'You have exceeded a secondary rate limit.'}),response(200)]);await f.read(url);assert.deepEqual(f.waits,[2000]);});
test('429 without headers defers one minute rather than spins',async()=>{const f=fixture([response(429)]);await assert.rejects(f.read(url),/DEFERRED/);assert.equal(f.calls(),1);assert.equal(f.checkpoints[0].resume_at,new Date(160000).toISOString());assert.equal(f.checkpoints[0].producer_failure_claimed,false);});
test('long reset is checkpointed; original binding preserved',async()=>{const f=fixture([response(403,{'x-ratelimit-remaining':'0','x-ratelimit-reset':'3700'})]);await assert.rejects(f.read(url),/DEFERRED/);assert.equal(f.checkpoints[0].binding.original_run_id,38132692877);assert.equal(f.checkpoints[0].reservation_write_performed,false);assert.equal(f.calls(),1);});
test('access denied 403 never retries',async()=>{const f=fixture([response(403,{}, {message:'Resource not accessible by integration'})]);await assert.rejects(f.read(url),e=>e.http_diagnostic.classification==='INTEGRATION_ACCESS_DENIED_REPORTED');assert.equal(f.calls(),1);assert.equal(f.checkpoints.length,0);});
test('generic 403 is not assumed throttling',async()=>{const f=fixture([response(403)]);await assert.rejects(f.read(url),/GITHUB_HTTP_403/);assert.equal(f.calls(),1);});
for(const reset of ['99','999999999','not-a-time'])test('invalid reset '+reset+' fails without retry',async()=>{const f=fixture([response(403,{'x-ratelimit-remaining':'0','x-ratelimit-reset':reset})]);await assert.rejects(f.read(url),/INVALID_RATE_RESET/);assert.equal(f.calls(),1);});
test('repeated throttling has finite attempts and increasing delays',async()=>{const headers={'retry-after':'1'},f=fixture([response(429,headers),response(429,headers),response(429,headers)]);await assert.rejects(f.read(url),/DEFERRED/);assert.equal(f.calls(),3);assert.deepEqual(f.waits,[1000,2000]);assert.equal(f.checkpoints[0].attempts_used,3);});
test('successful remaining zero blocks subsequent reads',async()=>{const f=fixture([response(200,{'x-ratelimit-remaining':'0','x-ratelimit-reset':'3700'})]);await f.read(url);await assert.rejects(f.read(url),/DEFERRED/);assert.equal(f.calls(),1);});
test('shared invocation budget caps concurrent callers and calls',async()=>{let active=0,max=0,count=0;const budget=createReadBudget({maxCalls:3,maxConcurrent:1,minIntervalMs:0});const read=createGithubRateAwareRead({token:'fake',binding,budget,fetchImpl:async()=>{active++;max=Math.max(max,active);count++;await new Promise(r=>setTimeout(r,2));active--;return response(200);}});const results=await Promise.allSettled(Array.from({length:6},()=>read(url)));assert.equal(count,3);assert.equal(max,1);assert.equal(results.filter(r=>r.status==='rejected').length,3);});
test('body cap cancels without waiting for uncooperative cleanup',async()=>{let cancelled=false;const f=fixture([{ok:true,status:200,headers:new Headers(),body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(1048577)}),cancel:()=>{cancelled=true;return new Promise(()=>{});},releaseLock:()=>{}})}}]);await assert.rejects(f.read(url),/RESPONSE_BOUND/);assert.equal(cancelled,true);});
test('clock rollback is not retry authority',async()=>{const f=fixture([response(200)]);f.setTime(99999);await assert.rejects(f.read(url),/CLOCK_ROLLBACK/);assert.equal(f.calls(),0);});
test('foreign origin cannot receive token',async()=>{const f=fixture([]);await assert.rejects(f.read('https://example.com/repos/test'),/ORIGIN/);assert.equal(f.calls(),0);});
test('bounded artifact ZIP bytes follow only an HTTPS GitHub artifact storage redirect',async()=>{
 const bytes=Buffer.from('zip-data'),url='https://api.github.com/repos/johnkim9524-collab/kaios_enterprise_repo/actions/artifacts/123/zip';
 let calls=0;
 const read=createGithubRateAwareRead({token:'fake',binding,responseMode:'bytes',maxBytes:1024,allowArtifactRedirect:true,
  fetchImpl:async(target,options)=>{calls++;
   if(calls===1){assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer fake');return new Response('',{status:302,headers:{location:'https://run-1.blob.core.windows.net/container?sig=opaque'}});}
   assert.equal(target.hostname,'run-1.blob.core.windows.net');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);
   assert.equal(options.headers['X-GitHub-Api-Version'],undefined);return new Response(bytes,{status:200});}});
 assert.deepEqual(await read(url),bytes);
 assert.equal(calls,2);
});
test('artifact ZIP redirect to an untrusted host is rejected',async()=>{
 let calls=0;
 const read=createGithubRateAwareRead({token:'fake',binding,responseMode:'bytes',maxBytes:1024,allowArtifactRedirect:true,
  fetchImpl:async()=>{calls++;return new Response('',{status:302,headers:{location:'https://example.com/archive?secret=hidden'}});}});
 await assert.rejects(read('https://api.github.com/repos/johnkim9524-collab/kaios_enterprise_repo/actions/artifacts/123/zip'),/GITHUB_READ_REDIRECT/);
 assert.equal(calls,1);
});
test('duplicate handoff events sharing a protected budget cannot reissue a GET',async()=>{
 let row=null,requests=0;const scope={repository:'johnkim9524-collab/kaios_enterprise_repo',resource:'core',quota_owner_id:'handoff-test'};
 const store={authority:'PROTECTED_ATOMIC_CAS',read:async()=>structuredClone(row),compareAndSwap:async(_key,version,next)=>{
  await new Promise(resolve=>setTimeout(resolve,0));if((row?.version??0)!==version)return 'CONFLICT';row=structuredClone(next);return 'COMMITTED';}};
 const make=(run_id)=>createGithubRateAwareRead({token:'fake',binding:{...binding,run_id,source_sha:'a'.repeat(40)},now:()=>100000,
  budget:createSharedGithubReadBudget({store,scope,capacity:10,maxConcurrent:2,now:()=>100000}),
  operationDedupeKey:'producer:987:1:'+('a'.repeat(40)),fetchImpl:async()=>{requests++;return response(200);}});
 const results=await Promise.allSettled([make('200')(url),make('201')(url)]);
 assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal(requests,1);
 assert.equal(results.filter(item=>item.status==='rejected'&&/OPERATION_REBIND/.test(item.reason.message)).length,1);
});
test('checkpoint excludes nonce and credentials',()=>{const c=readResumeCheckpoint({binding:{...binding,nonce:'SECRET',token:'SECRET'},route:'/repos/test/actions/runs/10',resumeAt:100000,attempts:1,reason:'HTTP_RATE_LIMIT'});assert.ok(!JSON.stringify(c).includes('SECRET'));assert.equal(c.actual_authority_granted,false);});
test('checkpoint keeps exact run identity across a resumed attempt',()=>{const c=readResumeCheckpoint({binding:{...binding,run_attempt:2},route:'/repos/johnkim9524-collab/kaios_enterprise_repo/actions/runs/10',resumeAt:100000,attempts:1,reason:'HTTP_RATE_LIMIT'});assert.equal(c.binding.run_attempt,2);assert.equal(c.binding.run_id,20);assert.equal(c.original_reservation_preserved,true);});

test('body deadline cannot return late success',async()=>{let time=100000;const reader={read:async()=>{time=100101;return {done:true};},cancel:async()=>{},releaseLock:()=>{}};const read=createGithubRateAwareRead({token:'late',binding,now:()=>time,deadlineMs:100,budget:createReadBudget({now:()=>time,minIntervalMs:0}),fetchImpl:async()=>({ok:true,status:200,headers:new Headers(),body:{getReader:()=>reader}})});await assert.rejects(read(url),/BODY_DEADLINE/);});
test('budget queue times out and removes abandoned waiter',async()=>{const budget=createReadBudget({maxConcurrent:1,minIntervalMs:0});const release=await budget.acquire();await assert.rejects(budget.acquire({deadline:Date.now()+5}),/BUDGET_DEADLINE/);release();const next=await budget.acquire({deadline:Date.now()+1000});next();assert.equal(budget.snapshot().active,0);});
