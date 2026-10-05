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
