'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const {createHandler}=require('../../../infrastructure/aws/staging/natural-clock-dispatcher-v1.cjs');

const repository='johnkim9524-collab/kaios_enterprise_repo';
const sha='a'.repeat(40);
const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
function fixture(overrides={}) {
  const calls=[]; const writes=[];
  const request=async (url,options={})=>{
    calls.push({url,options});
    if(url.includes('/access_tokens')) return response(201,{token:'t'.repeat(30),repository_selection:'selected',repositories:[{id:42,full_name:repository}],permissions:{contents:'write',metadata:'read'}});
    if(url.endsWith(`/repos/${repository}`)) return response(200,{id:42,full_name:repository,default_branch:'main'});
    if(url.endsWith('/branches/main')) return response(200,{protected:true,commit:{sha}});
    if(url.endsWith('/dispatches')) return response(204,null);
    throw new Error(`unexpected ${url}`);
  };
  return {calls,writes,handler:createHandler({getPrivateKey:async()=>privateKey,request,
    putOnce:async value=>writes.push(value),now:()=>Date.parse('2026-09-28T03:00:00Z'),nonce:()=> 'n'.repeat(32),
    config:{repository,repositoryId:'42',appId:'7',installationId:'8'},...overrides})};
}

test('binds protected main, writes replay ledger before repository dispatch',async()=>{
  const x=fixture();
  const out=await x.handler({source:'aws.scheduler',slot:'P0B'});
  assert.equal(out.state,'VERIFIED_DISPATCHED'); assert.equal(out.exact_main_sha,sha);
  assert.equal(x.writes.length,1);
  const dispatch=x.calls.find(c=>c.url.endsWith('/dispatches'));
  const body=JSON.parse(dispatch.options.body);
  assert.equal(body.event_type,'kidults.natural.clock.p0b.v1');
  assert.equal(body.client_payload.source,'AWS_EVENTBRIDGE_SCHEDULER');
  assert.equal(body.client_payload.exact_main_sha,sha);
});

test('admits the Pooling root as a governed natural-clock slot',async()=>{
  const x=fixture();
  const out=await x.handler({source:'aws.scheduler',slot:'POOLING'});
  assert.equal(out.slot,'POOLING');
  const body=JSON.parse(x.calls.find(c=>c.url.endsWith('/dispatches')).options.body);
  assert.equal(body.event_type,'kidults.natural.clock.pooling.v1');
  assert.equal(body.client_payload.slot,'POOLING');
});

for(const [name,event] of [
  ['manual-shaped source',{source:'manual',slot:'P0B'}],
  ['unknown slot',{source:'aws.scheduler',slot:'OTHER'}],
  ['extra field',{source:'aws.scheduler',slot:'P0B',manual:true}],
]) test(`rejects ${name}`,async()=>assert.rejects(()=>fixture().handler(event),/NATURAL_CLOCK_EVENT_DENIED/));

test('fails closed when protected main is unavailable',async()=>{
  const x=fixture({request:async url=> url.endsWith('/branches/main') ? response(200,{protected:false,commit:{sha}}) :
    url.includes('/access_tokens') ? response(201,{token:'t'.repeat(30),repository_selection:'selected',repositories:[{id:42,full_name:repository}],permissions:{contents:'write'}}) :
    url.endsWith(`/repos/${repository}`) ? response(200,{id:42,full_name:repository,default_branch:'main'}) : response(500,{})});
  await assert.rejects(()=>x.handler({source:'aws.scheduler',slot:'P0B'}),/NATURAL_CLOCK_MAIN_INVALID/);
});
