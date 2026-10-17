'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const {createHash}=require('node:crypto');
const {createHandler}=require('../../../infrastructure/aws/staging/natural-clock-dispatcher-v1.cjs');

const repository='johnkim9524-collab/kaios_enterprise_repo';
const sha='a'.repeat(40);
const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
function resumeEvent(){
  const binding={run_id:'4321',run_attempt:2,source_sha:sha,artifact_id:789,artifact_digest:`sha256:${'b'.repeat(64)}`,
    producer_event:'workflow_run',producer_conclusion:'failure'};
  const checkpoint_digests=['c'.repeat(64)],resume_at='2026-09-28T03:10:00.000Z';
  const identity=createHash('sha256').update(canonical({repo:repository,binding,checkpoint_digests,scheduled_at:Date.parse(resume_at)})).digest('hex');
  return {source:'aws.scheduler',slot:'READ_RESUME',resume_binding:binding,checkpoint_digests,resume_at,
    schedule_id:`kidults-read-resume-${identity.slice(0,40)}`};
}
function fixture(overrides={}) {
  const calls=[]; const writes=[];
  const request=async (url,options={})=>{
    calls.push({url,options});
    if(url.includes('/access_tokens')) return response(201,{token:'t'.repeat(30),repository_selection:'selected',repositories:[{id:42,full_name:repository}],permissions:{contents:'write',metadata:'read'}});
    if(url.endsWith(`/repos/${repository}`)) return response(200,{id:42,full_name:repository,default_branch:'main'});
    if(url.endsWith('/branches/main')) return response(200,{protected:true,commit:{sha:overrides.mainSha||sha}});
    if(url.endsWith('/dispatches')) return response(overrides.dispatchStatus??204,null);
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

test('dispatches one bound read-resume event without generating or exposing a nonce',async()=>{
  let nonceCalls=0;
  const event=resumeEvent();
  const x=fixture({now:()=>Date.parse('2026-09-28T03:00:00Z'),nonce:()=>{nonceCalls++;return 'n'.repeat(32);}});
  const out=await x.handler(event);
  assert.equal(out.state,'VERIFIED_READ_RESUME_DISPATCHED');assert.equal(nonceCalls,0);
  const request=x.calls.find(c=>c.url.endsWith('/dispatches'));
  const body=JSON.parse(request.options.body);
  assert.equal(body.event_type,'kidults.github.read.resume.v1');
  assert.deepEqual(body.client_payload.resume_binding,event.resume_binding);
  assert.equal(Object.hasOwn(body.client_payload,'nonce'),false);
  assert.equal(x.writes[0].dispatchId,event.schedule_id);
});

test('duplicate resume delivery reuses an exact ledger receipt and dispatches idempotently',async()=>{
  const event=resumeEvent();
  let saved,nowValue=Date.parse('2026-09-28T03:00:00Z');const overrides={now:()=>nowValue,
    putOnce:async value=>{if(saved){const error=new Error('duplicate');error.name='ConditionalCheckFailedException';throw error;}saved=value;},
    getLedger:async id=>id===event.schedule_id?{receipt_digest:saved.digest,exact_main_sha:saved.exactMainSha,issued_at:saved.issuedAt}:null};
  const x=fixture(overrides);await x.handler(event);
  const firstPayload=JSON.parse(x.calls.find(c=>c.url.endsWith('/dispatches')).options.body).client_payload;
  overrides.mainSha='f'.repeat(40);nowValue+=60000;
  const second=await x.handler(event);
  assert.equal(second.state,'VERIFIED_HOLD_DUPLICATE_NOT_REDISPATCHED');
  assert.equal(x.calls.filter(c=>c.url.endsWith('/dispatches')).length,1);
  const payloads=x.calls.filter(c=>c.url.endsWith('/dispatches')).map(c=>JSON.parse(c.options.body).client_payload);
  assert.deepEqual(payloads[0],firstPayload);
});

test('a definitive dispatch rejection is retried once, while a successful retry seals the ledger',async()=>{
  const event=resumeEvent();let saved=null,dispatchStatus=422,retryClaims=0;
  const x=fixture({get dispatchStatus(){return dispatchStatus;},
    putOnce:async value=>{if(saved){const error=new Error('duplicate');error.name='ConditionalCheckFailedException';throw error;}
      saved={receipt_digest:value.digest,exact_main_sha:value.exactMainSha,issued_at:value.issuedAt,dispatch_state:'PENDING'};},
    getLedger:async()=>saved,
    markDispatchState:async ({state})=>{assert.equal(saved.dispatch_state,'PENDING');saved.dispatch_state=state;},
    claimRejectedRetry:async()=>{assert.equal(saved.dispatch_state,'DEFINITIVELY_REJECTED');saved.dispatch_state='PENDING';retryClaims++;}});
  await assert.rejects(x.handler(event),/NATURAL_CLOCK_DISPATCH_HTTP_422/);
  assert.equal(saved.dispatch_state,'DEFINITIVELY_REJECTED');
  dispatchStatus=204;
  const result=await x.handler(event);
  assert.equal(result.state,'VERIFIED_READ_RESUME_DISPATCHED');
  assert.equal(retryClaims,1);assert.equal(saved.dispatch_state,'ACCEPTED');
  assert.equal(x.calls.filter(call=>call.url.endsWith('/dispatches')).length,2);
});

test('ambiguous dispatch outcome is held and never blindly replayed',async()=>{
  const event=resumeEvent();let saved=null,dispatchStatus=503,marks=[];
  const x=fixture({get dispatchStatus(){return dispatchStatus;},
    putOnce:async value=>{if(saved){const error=new Error('duplicate');error.name='ConditionalCheckFailedException';throw error;}
      saved={receipt_digest:value.digest,exact_main_sha:value.exactMainSha,issued_at:value.issuedAt,dispatch_state:'PENDING'};},
    getLedger:async()=>saved,markDispatchState:async ({state})=>{saved.dispatch_state=state;marks.push(state);}});
  await assert.rejects(x.handler(event),/NATURAL_CLOCK_DISPATCH_HTTP_503/);
  const result=await x.handler(event);
  assert.equal(result.state,'VERIFIED_HOLD_DUPLICATE_NOT_REDISPATCHED');
  assert.deepEqual(marks,['OUTCOME_UNKNOWN']);
  assert.equal(x.calls.filter(call=>call.url.endsWith('/dispatches')).length,1);
});

test('read-resume schedule name is cryptographically bound to its exact payload',async()=>{
  const event=resumeEvent();event.resume_binding.artifact_id++;
  await assert.rejects(()=>fixture().handler(event),/NATURAL_CLOCK_EVENT_DENIED/);
});

for(const [name,event] of [
  ['manual-shaped source',{source:'manual',slot:'P0B'}],
  ['unknown slot',{source:'aws.scheduler',slot:'OTHER'}],
  ['extra field',{source:'aws.scheduler',slot:'P0B',manual:true}],
  ['malformed read-resume binding',{source:'aws.scheduler',slot:'READ_RESUME',resume_binding:{}}],
]) test(`rejects ${name}`,async()=>assert.rejects(()=>fixture().handler(event),/NATURAL_CLOCK_EVENT_DENIED/));

test('fails closed when protected main is unavailable',async()=>{
  const x=fixture({request:async url=> url.endsWith('/branches/main') ? response(200,{protected:false,commit:{sha}}) :
    url.includes('/access_tokens') ? response(201,{token:'t'.repeat(30),repository_selection:'selected',repositories:[{id:42,full_name:repository}],permissions:{contents:'write'}}) :
    url.endsWith(`/repos/${repository}`) ? response(200,{id:42,full_name:repository,default_branch:'main'}) : response(500,{})});
  await assert.rejects(()=>x.handler({source:'aws.scheduler',slot:'P0B'}),/NATURAL_CLOCK_MAIN_INVALID/);
});
