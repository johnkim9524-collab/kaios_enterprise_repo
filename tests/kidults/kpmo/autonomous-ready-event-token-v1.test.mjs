import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
const transport=source.slice(source.indexOf('const graphql ='),source.indexOf('const awsJson ='));
const transition=source.slice(source.indexOf('const rebindDraftReady ='),source.indexOf('\n\ntry {',source.indexOf('const rebindDraftReady =')));
function runtime(mode='FINALIZE'){
 const calls=[];const context={mode,policy:{},envelope:{head_sha:'exact-head'},token:'actions-test-token',AutonomousLandingError:class extends Error{},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({data:{}})};},api:async()=>({draft:false}),validateDraftReadyRebind:({after})=>after};
 vm.runInNewContext(transport+transition+'\nglobalThis.ready=rebindDraftReady;',context);
 return {calls,ready:context.ready};
}
test('actual Ready transport uses the explicit broker token and exact PR identity',async()=>{
 const r=runtime();await r.ready({draft:true,node_id:'PR_exact_2565'},'ghs_broker_test');
 assert.equal(r.calls.length,1);assert.equal(r.calls[0].url,'https://api.github.com/graphql');assert.equal(r.calls[0].options.headers.Authorization,'Bearer ghs_broker_test');assert.equal(r.calls[0].options.redirect,'error');assert.deepEqual(JSON.parse(r.calls[0].options.body).variables,{pullRequestId:'PR_exact_2565'});
 assert.match(source,/const eventToken=await acquireEventToken\(\)/);assert.match(source,/rebindDraftReady\(candidate\.pr,eventToken\)/);
});
for(const credential of [undefined,'','actions-test-token'])test('Ready rejects missing or Actions credential '+String(credential),async()=>{const r=runtime();await assert.rejects(r.ready({draft:true,node_id:'PR_exact_2565'},credential),/AUTONOMOUS_READY_EVENT_TOKEN_REQUIRED/);assert.equal(r.calls.length,0);});
test('non-finalizer workload cannot perform Ready mutation',async()=>{const r=runtime('APPROVAL');await assert.rejects(r.ready({draft:true,node_id:'PR_exact_2565'},'ghs_broker_test'),/AUTONOMOUS_READY_EVENT_TOKEN_REQUIRED/);assert.equal(r.calls.length,0);});
test('existing Ready is consumed without another mutation',async()=>{const r=runtime();const result=await r.ready({draft:false});assert.equal(result.state,'ALREADY_READY');assert.equal(result.head_sha,'exact-head');assert.equal(r.calls.length,0);});

// Exercise the actual transport and immutable-object reader without credentials.
const readTransport=source.slice(source.indexOf('const api ='),source.indexOf('const graphql ='));
function readRuntime(responder){
 const calls=[];
 const context={repository:'test/repo',token:'test-token',Buffer,envelope:{base_sha:'a'.repeat(40),head_sha:'b'.repeat(40)},
  AutonomousLandingError:class extends Error{constructor(code,detail=''){super(detail?`${code}:${detail}`:code);}},fetch:async(url,options)=>{calls.push({url,options});return responder(url,options,calls.length);}};
 vm.runInNewContext(readTransport+'\nglobalThis.reader={api,immutableContent,attachImmutableContents};',context);
 return {calls,...context.reader};
}
const blobResponse=value=>({ok:true,status:200,json:async()=>({type:'file',encoding:'base64',content:Buffer.from(value).toString('base64')})});
test('exact immutable bytes are reused across repeated candidate validations',async()=>{
 const r=readRuntime(url=>blobResponse(url));const files=[{filename:'src/a.js',status:'modified'},{filename:'src/b.js',status:'added'}];
 const first=await r.attachImmutableContents(files);const second=await r.attachImmutableContents(files);
 assert.deepEqual(JSON.parse(JSON.stringify(first)),JSON.parse(JSON.stringify(second)));assert.equal(r.calls.length,3);
 assert.equal(first[1].base_content,'');
 await r.immutableContent('src/a.js','c'.repeat(40));assert.equal(r.calls.length,4);
 await r.api('/pulls/42');await r.api('/pulls/42');assert.equal(r.calls.length,6);
});
test('immutable source reads are serialized',async()=>{
 let active=0,maximum=0;const r=readRuntime(async url=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return blobResponse(url);});
 await r.attachImmutableContents([{filename:'a',status:'modified'},{filename:'b',status:'modified'}]);assert.equal(maximum,1);assert.equal(r.calls.length,4);
});
test('mutable refs never enter the immutable cache',async()=>{
 const r=readRuntime(()=>blobResponse('x'));
 for(const ref of ['main','refs/heads/main','b'.repeat(39),undefined])await assert.rejects(r.immutableContent('a',ref),/AUTONOMOUS_IMMUTABLE_REF_INVALID/);
 assert.equal(r.calls.length,0);
});
test('invalid and rejected object reads are never cached',async()=>{
 let attempt=0;const r=readRuntime(()=>++attempt===1?{ok:true,status:200,json:async()=>({type:'dir'})}:blobResponse('fixed'));
 await assert.rejects(r.immutableContent('a','a'.repeat(40)),/AUTONOMOUS_IMMUTABLE_BLOB_INVALID/);
 assert.equal(await r.immutableContent('a','a'.repeat(40)),'fixed');assert.equal(r.calls.length,2);
});
for(const status of [403,429])test('rate-limit rejection remains fail closed and carries safe reset metadata '+status,async()=>{
 const r=readRuntime(()=>({ok:false,status,headers:new Map([['x-ratelimit-remaining','0'],['x-ratelimit-reset','1791512400'],['retry-after','60']]),json:async()=>({message:'API rate limit exceeded for installation. test-token'})}));
 await assert.rejects(r.api('/contents/a?ref='+'a'.repeat(40)),error=>{assert.match(error.message,/"rate_limited":true/);assert.match(error.message,/1791512400/);assert.doesNotMatch(error.message,/test-token|installation/);return true;});assert.equal(r.calls.length,1);
});
test('ordinary 403 is not reclassified or retried as a rate limit',async()=>{
 const r=readRuntime(()=>({ok:false,status:403,headers:new Map(),json:async()=>({message:'Resource not accessible by integration'})}));
 await assert.rejects(r.api('/pulls/42'),/"rate_limited":false/);assert.equal(r.calls.length,1);
});
test('writes are never automatically retried after a rate-limit response',async()=>{
 const r=readRuntime(()=>({ok:false,status:403,headers:new Map([['x-ratelimit-remaining','0']]),json:async()=>({message:'API rate limit exceeded'})}));
 await assert.rejects(r.api('/pulls/42/merge',{method:'PUT',body:'{}'}),/AUTONOMOUS_GITHUB_API_403/);assert.equal(r.calls.length,1);
});
