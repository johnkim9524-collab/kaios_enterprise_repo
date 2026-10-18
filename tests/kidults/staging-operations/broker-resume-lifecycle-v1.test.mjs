import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {canonicalJson} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {brokerResumeLifecycle,brokerReconcileLifecycleOperation,brokerMintFinalizer,observeLifecycleCutover,classifyFinalizerTokenDrain,brokerReadFinalizerRecoveryContext} from '../../../scripts/kidults/staging-operations/lib/broker-resume-lifecycle-v1.mjs';
const {assertPublicMintBoundary}=createRequire(import.meta.url)('../../../infrastructure/aws/staging/autonomous-event-token-broker-v1.cjs');
const repository='johnkim9524-collab/kaios_enterprise_repo',sha=c=>c.repeat(40);
const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const time=Date.parse('2026-10-10T00:00:00Z');
const event={action:'RESUME_LIFECYCLE_OPERATION',repository,repository_id:'123',run_id:'101',run_attempt:1,operation:'STALE_BASE_CONVERGENCE',
  binding:{pull_request:42,old_base_sha:sha('a'),expected_head_sha:sha('b'),current_main_sha:sha('c'),changed_paths:['src/a.js']}};
function setup({operation=event.operation,lost=false,drift=false,reversed=false,readFailure=false}={}){
  const cutoverKey={pk:'RESUME_TUPLE_V1#LIFECYCLE_CUTOVER_V1',sk:'OPERATION'};
  const phaseKey={pk:'RESUME_TUPLE_V1#FAMILY_PHASE_CUTOVER_V1',sk:'OPERATION'};
  const rows=new Map([[JSON.stringify(cutoverKey),{...cutoverKey,installed_at:time-3840001,not_before:time-1}],
    [JSON.stringify(phaseKey),{...phaseKey,installed_at:time-240001,not_before:time-1}]]);let writes=0,mints=0,mutated=false;
  const e=structuredClone(event);e.operation=operation;if(operation==='REDUNDANT_PR_HYGIENE')e.binding.changed_paths=[];
  const conditional=()=>Object.assign(new Error('conditional'),{name:'ConditionalCheckFailedException'});
  const dependencies={config:{repository,repositoryId:'123',operationTable:'test-table',activationRunFloor:'100'},
    now:()=>time,getPrivateKey:async()=>key,mint:async()=>{mints++;return {ok:true,token:'PRIVATE_WRITE_TOKEN',read_token:'PRIVATE_READ_TOKEN',expires_at:new Date(time+3600000).toISOString()};},
    ledgerRequest:async(op,p)=>{
      const k=JSON.stringify(p.Key||{pk:p.Item.pk,sk:p.Item.sk});
      if(op==='Get')return {Item:structuredClone(rows.get(k))};
      if(op==='Put'){if(rows.has(k))throw conditional();rows.set(k,structuredClone(p.Item));return {};}
      const row=rows.get(k),v=p.ExpressionAttributeValues;
      if(v[':original']){
        if(!row||row.operation_key!==v[':original']||row.owner!==v[':originalOwner']||row.state!==(v[':priorState']||v[':flight'])||
          (v[':none']&&(row.phase!==v[':pre']||row.schema!==v[':schema'])))throw conditional();
        if(v[':none'])row.state=v[':none'];
        else {row.operation_key=v[':next'];row.owner=v[':owner'];row.state=v[':flight'];row.schema=v[':schema'];
          row.binding=structuredClone(v[':binding']);row.phase=v[':pre'];}
        return {};
      }
      if(v[':unknown']){
        if(!row||row.state!==v[':unknown']||JSON.stringify(row.binding)!==JSON.stringify(v[':binding']))throw conditional();
        row.state=v[':success'];row.receipt=structuredClone(v[':receipt']);return {};
      }
      if(v[':success']){
        if(!row||row.operation_key!==v[':key']||row.owner!==v[':owner']||row.state!==v[':flight']||row.phase!==v[':started']||
          row.schema!==v[':schema']||JSON.stringify(row.binding)!==JSON.stringify(v[':binding']))throw conditional();
        row.state=v[':success'];return {};
      }
      if(!row||row.owner!==v[':owner']||row.state!=='IN_FLIGHT'||(v[':pre']&&row.phase!==v[':pre'])||
        (v[':key']&&(row.operation_key!==v[':key']||row.schema!==v[':schema'])))throw conditional();
      if(v[':started'])row.phase=v[':started'];
      else if(v[':key']&&v[':next']==='WRITE_STARTED')row.phase=v[':next'];
      else {row.state=v[':next'];row.receipt=structuredClone(v[':receipt']);}return {};
    },request:async(url,options)=>{
      const route=url.split(`/repos/${repository}`)[1],method=options.method;
      assert.equal(options.redirect,'error');
      let body,status=200;
      const pr=()=>({number:42,state:mutated&&operation==='REDUNDANT_PR_HYGIENE'?'closed':'open',merged:false,
        head:{sha:mutated&&operation==='STALE_BASE_CONVERGENCE'?sha(drift?'e':'d'):sha('b'),repo:{full_name:repository}},
        base:{ref:'main',sha:mutated&&operation==='STALE_BASE_CONVERGENCE'?sha('c'):sha('a'),repo:{full_name:repository}}});
      if(method!=='GET'){
        assert.equal(options.headers.Authorization,'Bearer PRIVATE_WRITE_TOKEN');writes++;mutated=true;
        if(lost)throw Error('lost reply');
        if(method==='PUT'){assert.deepEqual(JSON.parse(options.body),{expected_head_sha:sha('b')});status=202;body={message:'accepted'};}
        else{assert.deepEqual(JSON.parse(options.body),{state:'closed'});body=pr();}
      }else{
        assert.equal(options.headers.Authorization,'Bearer PRIVATE_READ_TOKEN');
        if(readFailure&&mutated)throw Error('readback unavailable');
        if(route==='/pulls/42')body=pr();
        else if(route==='/branches/main')body={commit:{sha:sha('c')}};
        else if(route===`/git/commits/${sha('d')}`)body={sha:sha('d'),parents:(reversed?[sha('c'),sha('b')]:[sha('b'),sha('c')]).map(sha=>({sha}))};
        else if(route.startsWith('/git/commits/'))body={sha:route.split('/').at(-1),tree:{sha:sha('f')}};
        else throw Error(`unexpected route ${route}`);
      }
      return {ok:true,status,json:async()=>body};
    }};
  return {rows,event:e,dependencies,counts:()=>({writes,mints}),call:(owner='owner-1',input=e)=>brokerResumeLifecycle({...dependencies,event:input,owner})};
}
for(const operation of ['STALE_BASE_CONVERGENCE','REDUNDANT_PR_HYGIENE'])test(`${operation} concurrent clocks write once and replacement consumes original signed readback`,async()=>{
  const s=setup({operation});const results=await Promise.all(Array.from({length:12},(_,i)=>s.call(`owner-${i}`,{...s.event,run_id:String(101+i)})));
  assert.equal(results.filter(r=>r.state==='EXECUTED_VERIFIED').length,1);assert.deepEqual(s.counts(),{writes:1,mints:1});
  const reused=await s.call('replacement',{...s.event,run_id:'200'});assert.equal(reused.state,'REUSED_SUCCESS');
  assert.deepEqual(s.counts(),{writes:1,mints:1});assert.doesNotMatch(JSON.stringify(reused),/PRIVATE_(WRITE|READ)_TOKEN/);
});
for(const fixture of [{lost:true},{readFailure:true},{reversed:true},{operation:'REDUNDANT_PR_HYGIENE',lost:true}])test(`uncertain mutation remains fenced ${JSON.stringify(fixture)}`,async()=>{
  const s=setup(fixture);await assert.rejects(s.call());assert.equal((await s.call('replacement')).state,'HOLD_RECONCILE');
  assert.deepEqual(s.counts(),{writes:1,mints:1});assert.equal([...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#')).state,'UNKNOWN');
});
test('lost stale-base response is reconciled only from the exact ordered commit graph and both durable rows',async()=>{
  const s=setup({lost:true});await assert.rejects(s.call());
  const reconcileEvent={...structuredClone(s.event),action:'RECONCILE_LIFECYCLE_OPERATION'};
  const identity={caller_class:'DISPATCHER',run_id:reconcileEvent.run_id,source_sha:reconcileEvent.binding.current_main_sha};
  const priorMint=s.dependencies.mint;
  s.dependencies.mint=async args=>{assert.equal(args.action,'MINT_INSTALLATION_TOKEN');assert.equal(args.permission_profile,undefined);
    assert.equal(args.authorization_generation.startsWith('lifecycle-reconcile-'),true);
    return {...await priorMint(args),token:'PRIVATE_READ_TOKEN'};};
  const receipt=await brokerReconcileLifecycleOperation({...s.dependencies,event:reconcileEvent,callerIdentity:identity});
  assert.equal(receipt.state,'RECONCILED_SUCCESS');assert.equal(receipt.physical_store_readback,'VERIFIED');
  assert.equal(receipt.receipt.outcome.reconciled_from_native_readback,true);
  const operation=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#'));
  const family=[...s.rows.values()].find(r=>r.schema==='LIFECYCLE_PHASE_FENCE_V1');
  assert.equal(operation.state,'SUCCESS');assert.equal(family.state,'SUCCESS');assert.equal(family.phase,'WRITE_STARTED');
  assert.equal(s.counts().writes,1);assert.equal(s.counts().mints,2);
});
test('redundant-PR close outcomes stay on the original broker path and are never replayed by this update reconciler',async()=>{
  const s=setup({operation:'REDUNDANT_PR_HYGIENE',lost:true});await assert.rejects(s.call());
  const input={...structuredClone(s.event),action:'RECONCILE_LIFECYCLE_OPERATION'};
  const result=await brokerReconcileLifecycleOperation({...s.dependencies,event:input,
    callerIdentity:{caller_class:'DISPATCHER',run_id:input.run_id,source_sha:input.binding.current_main_sha}});
  assert.equal(result.state,'NOT_APPLICABLE');assert.equal(result.reconciliation_mutation_attempted,false);
  assert.deepEqual(s.counts(),{writes:1,mints:1});
});
test('changed inventory cannot manufacture a second operation for the same mutation tuple',async()=>{
  const s=setup();await s.call();const changed=structuredClone(s.event);changed.binding.changed_paths=['src/other.js'];
  assert.equal((await s.call('replacement',changed)).state,'REUSED_SUCCESS');assert.equal(s.counts().writes,1);
});
test('tampered durable success is rejected without mint or mutation',async()=>{
  const s=setup();await s.call();[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#')).receipt.signature='tampered';await assert.rejects(s.call('replacement'),/RECEIPT_INVALID/);assert.equal(s.counts().writes,1);
});
for(const operation of ['STALE_BASE_CONVERGENCE','REDUNDANT_PR_HYGIENE'])test(`main drift cannot bypass the unresolved ${operation} family`,async()=>{
  const s=setup({operation,lost:true});await assert.rejects(s.call());
  const changed=structuredClone(s.event);changed.binding.current_main_sha=sha('e');changed.run_id='102';
  assert.equal((await s.call('new-clock',changed)).state,'HOLD_RECONCILE');assert.deepEqual(s.counts(),{writes:1,mints:1});
});
for(const operation of ['STALE_BASE_CONVERGENCE','REDUNDANT_PR_HYGIENE'])test(`a different mutation cannot bypass an unresolved ${operation} on the same PR head`,async()=>{
  const s=setup({operation,lost:true});await assert.rejects(s.call());
  const changed=structuredClone(s.event);changed.operation=operation==='STALE_BASE_CONVERGENCE'?'REDUNDANT_PR_HYGIENE':'STALE_BASE_CONVERGENCE';changed.binding.changed_paths=['src/a.js'];
  assert.equal((await s.call('different-operation',changed)).state,'HOLD_RECONCILE');assert.deepEqual(s.counts(),{writes:1,mints:1});
});
for(const change of [e=>e.run_attempt=2,e=>e.run_id='100',e=>e.repository='fork/repo',e=>e.operation='MERGE',e=>e.binding.changed_paths=['../secret']])test('invalid lifecycle authority is denied before token mint',async()=>{
  const s=setup(),e=structuredClone(s.event);change(e);await assert.rejects(s.call('owner',e),/RESUME_LIFECYCLE_DENIED/);assert.deepEqual(s.counts(),{writes:0,mints:0});
});
test('public token mint cannot bypass the lifecycle ledger',()=>{
  for(const permission_profile of ['AUTONOMOUS_STALE_BASE_CONVERGENCE','AUTONOMOUS_REDUNDANT_PR_HYGIENE'])
    assert.throws(()=>assertPublicMintBoundary({action:'MINT_INSTALLATION_TOKEN',permission_profile}),/LIFECYCLE_LEDGER_REQUIRED/);
  for(const permission_profile of [undefined,'AUTONOMOUS_EVENT_DISPATCH'])assert.throws(()=>assertPublicMintBoundary({action:'MINT_INSTALLATION_TOKEN',permission_profile}),/LIFECYCLE_LEDGER_REQUIRED/);
});
test('the first protected lifecycle call starts one durable legacy-token drain and performs no mutation',async()=>{
  const s=setup();s.rows.clear();
  const first=await s.call();assert.equal(first.reason,'LEGACY_TOKEN_DRAIN_WINDOW');assert.equal(first.mutation_attempted,false);
  s.dependencies.now=()=>time+1000;const later=await s.call('later');assert.equal(later.not_before,first.not_before);
  assert.deepEqual(s.counts(),{writes:0,mints:0});assert.equal(s.rows.size,1);
  s.dependencies.now=()=>time+3840000;assert.equal((await s.call('eligible')).reason,'FAMILY_PHASE_INVOCATION_DRAIN_WINDOW');
  s.dependencies.now=()=>time+4080000;assert.equal((await s.call('eligible')).state,'EXECUTED_VERIFIED');assert.equal(s.counts().writes,1);
});
const finalizerEvent={action:'MINT_INSTALLATION_TOKEN',repository,repository_id:'123',pull_request:42,base_sha:sha('c'),head_sha:sha('b'),authorization_generation:'finalizer-generation-1',nonce_digest:'sha256:'+'a'.repeat(64),run_id:'101',run_attempt:1};
const finalizerIdentity={caller_class:'FINALIZER',run_id:'101',source_sha:sha('c')};
test('Finalizer token handoff shares the lifecycle fence and never reissues a lost token',async()=>{
  const s=setup();const results=await Promise.all(Array.from({length:12},(_,i)=>brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:`finalizer-${i}`})));
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(s.counts().mints,1);
  const handoff=results.find(r=>r.ok).protected_handoff;
  assert.equal(handoff.state,'TOKEN_ISSUED_NOT_LANDING_SUCCESS');assert.doesNotMatch(JSON.stringify(handoff),/PRIVATE_(WRITE|READ)_TOKEN/);
  assert.equal((await s.call('later-lifecycle')).state,'HOLD_RECONCILE');assert.deepEqual(s.counts(),{writes:0,mints:1});
  assert.equal((await brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'replacement'})).state,'HOLD_RECONCILE');assert.equal(s.counts().mints,1);
});
test('Finalizer cannot obtain a write token while lifecycle outcome is UNKNOWN',async()=>{
  const s=setup({lost:true});await assert.rejects(s.call());
  const result=await brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'finalizer'});
  assert.equal(result.state,'HOLD_RECONCILE');assert.deepEqual(s.counts(),{writes:1,mints:1});
});

test('Finalizer and lifecycle share the drain without claiming a writer before readiness',async()=>{
  const s=setup();s.rows.clear();
  const first=await observeLifecycleCutover(s.dependencies);
  const held=await brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'early'});
  assert.equal(held.reason,'LEGACY_TOKEN_DRAIN_WINDOW');assert.equal(held.not_before,first.not_before);
  assert.equal((await s.call()).not_before,first.not_before);
  assert.deepEqual(s.counts(),{writes:0,mints:0});assert.equal(s.rows.size,1);
  s.dependencies.now=()=>time+3840000;
  const priorMint=s.dependencies.mint; s.dependencies.mint=async()=>({...await priorMint(),expires_at:new Date(s.dependencies.now()+3600000).toISOString()});
  assert.equal((await observeLifecycleCutover(s.dependencies)).state,'CUTOVER_READY');
  assert.equal((await brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'ready'})).ok,true);
  assert.deepEqual(s.counts(),{writes:0,mints:1});
});

test('proven pre-mutation denial settles only a new exact-main operation and preserves original terminal',async()=>{
  const s=setup();s.dependencies.mint=async()=>({ok:false});
  await assert.rejects(s.call(),/TOKEN_DENIED/);
  const original=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#'));
  assert.equal(original.state,'NO_MUTATION');assert.equal(original.phase,'PRE_MUTATION');
  assert.equal(original.receipt.mutation_attempted,false);assert.equal(s.counts().writes,0);
  assert.equal((await s.call('old-owner')).state,'HOLD_RECONCILE');
  const changed=structuredClone(s.event);changed.binding.current_main_sha=sha('e');
  // The new live-tuple check also fails: its denial is settled, with no PUT.
  const settled=await s.call('new-owner',changed).catch(e=>e);
  assert.match(settled.message,/TOKEN_DENIED/);
  assert.equal(s.counts().writes,0);assert.equal(original.state,'NO_MUTATION');
  assert.equal([...s.rows.values()].filter(r=>r.pk.startsWith('RESUME_OPERATION_V1#')&&r.state==='NO_MUTATION').length,2);
  assert.equal((await s.call('old-owner')).state,'HOLD_RECONCILE');
});
test('legacy UNKNOWN exposes bounded original binding without releasing the family or minting',async()=>{
  const s=setup({lost:true});await assert.rejects(s.call());
  const original=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#'));delete original.phase;
  const changed=structuredClone(s.event);changed.binding.current_main_sha=sha('e');
  const held=await s.call('replacement',changed);
  assert.equal(held.original_operation_state,'UNKNOWN');assert.equal(held.original_operation_phase,'UNAVAILABLE');
  assert.equal(held.original_binding_verified,true);assert.match(held.original_operation_key,/^sha256:/);
  assert.doesNotMatch(JSON.stringify(held),/PRIVATE_|signature|error_code/);assert.deepEqual(s.counts(),{writes:1,mints:1});
});
test('signing key failure creates no family fence',async()=>{
  const s=setup();s.dependencies.getPrivateKey=async()=>{throw Error('SIGNING_KEY_UNAVAILABLE');};
  await assert.rejects(s.call(),/SIGNING_KEY_UNAVAILABLE/);
  assert.equal([...s.rows.values()].filter(r=>r.operation_key).length,0);assert.deepEqual(s.counts(),{writes:0,mints:0});
});

test('concurrent exact-main settlement allows one fresh mutation and permanently fences original NO_MUTATION',async()=>{
  const s=setup();const mint=s.dependencies.mint;s.dependencies.mint=async()=>({ok:false});
  await assert.rejects(s.call(),/TOKEN_DENIED/);s.dependencies.mint=mint;
  const request=s.dependencies.request;s.dependencies.request=async(url,options)=>{
    const response=await request(url,options);const value=await response.json();
    if(url.endsWith('/branches/main'))value.commit.sha=sha('e');
    if(url.endsWith('/pulls/42')&&value.head.sha===sha('d'))value.base.sha=sha('e');
    if(url.endsWith(`/git/commits/${sha('d')}`))value.parents[1].sha=sha('e');
    return {...response,json:async()=>value};
  };
  const changed=structuredClone(s.event);changed.binding.current_main_sha=sha('e');
  const results=await Promise.all(Array.from({length:12},(_,i)=>s.call(`settler-${i}`,changed)));
  assert.equal(results.filter(r=>r.state==='EXECUTED_VERIFIED').length,1);
  assert.deepEqual(s.counts(),{writes:1,mints:1});
  const old=[...s.rows.values()].find(r=>r.state==='NO_MUTATION');assert.ok(old);
  assert.equal((await s.call('old-owner')).state,'HOLD_RECONCILE');
  assert.equal(old.state,'NO_MUTATION');assert.deepEqual(s.counts(),{writes:1,mints:1});
});
for(const corrupt of [r=>delete r.phase,r=>r.phase='WRITE_STARTED',r=>r.receipt.mutation_attempted=true,r=>r.owner='forged',r=>r.binding.stage_id='other'])
test('unverified pre-mutation settlement never releases the family',async()=>{
  const s=setup();s.dependencies.mint=async()=>({ok:false});await assert.rejects(s.call());
  const original=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#')&&r.state==='NO_MUTATION');corrupt(original);
  const changed=structuredClone(s.event);changed.binding.current_main_sha=sha('e');
  assert.equal((await s.call('replacement',changed)).state,'HOLD_RECONCILE');assert.equal(s.counts().writes,0);
});
test('lost durable WRITE_STARTED acknowledgement remains fenced without GitHub mutation',async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;
  s.dependencies.ledgerRequest=async(op,p)=>{const result=await request(op,p);
    if(p.ExpressionAttributeValues?.[':started'])throw Error('LOST_PHASE_ACK');return result;};
  await assert.rejects(s.call(),/OPERATION_OUTCOME_AND_LEDGER_UNCERTAIN/);
  const original=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#'));
  assert.equal(original.state,'IN_FLIGHT');assert.equal(original.phase,'WRITE_STARTED');assert.equal(s.counts().writes,0);
  const changed=structuredClone(s.event);changed.binding.current_main_sha=sha('e');
  assert.equal((await s.call('replacement',changed)).state,'HOLD_RECONCILE');assert.equal(s.counts().writes,0);
});

const driftInput=s=>{const input=structuredClone(s.event);input.binding.current_main_sha=sha('e');return input;};
function liveDrift(s) {
  const request=s.dependencies.request;s.dependencies.request=async(url,options)=>{
    const response=await request(url,options),value=await response.json();
    if(url.endsWith('/branches/main'))value.commit.sha=sha('e');
    if(url.endsWith('/pulls/42')&&value.head.sha===sha('d'))value.base.sha=sha('e');
    if(url.endsWith(`/git/commits/${sha('d')}`))value.parents[1].sha=sha('e');
    return {...response,json:async()=>value};
  };
}
test('family-only interrupted read is fenced and archived before a fresh operation executes',async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;let failed=false;
  s.dependencies.ledgerRequest=async(op,p)=>{
    if(!failed&&op==='Get'&&p.Key.pk.startsWith('RESUME_OPERATION_V1#')){failed=true;throw Error('READ_INTERRUPTED');}
    return request(op,p);
  };
  await assert.rejects(s.call(),/READ_INTERRUPTED/);assert.equal(s.counts().writes,0);
  assert.equal([...s.rows.values()].filter(r=>r.pk.startsWith('RESUME_OPERATION_V1#')).length,0);
  liveDrift(s);assert.equal((await s.call('replacement',driftInput(s))).state,'EXECUTED_VERIFIED');
  assert.equal(s.counts().writes,1);
  const archived=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#')&&r.state==='NO_MUTATION');
  assert.equal(archived.owner,'owner-1');assert.equal(archived.receipt.mutation_attempted,false);
  assert.equal((await s.call('old-writer')).state,'HOLD_RECONCILE');assert.equal(s.counts().writes,1);
});
test('a live old writer cannot late-claim an orphan after protected settlement',async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;let resume,entered;
  const paused=new Promise(r=>entered=r),release=new Promise(r=>resume=r);let intercepted=false;
  s.dependencies.ledgerRequest=async(op,p)=>{
    if(!intercepted&&op==='Put'&&p.Item.pk.startsWith('RESUME_OPERATION_V1#')&&p.Item.state==='IN_FLIGHT') {
      intercepted=true;entered();await release;
    }
    return request(op,p);
  };
  const old=s.call();await paused;liveDrift(s);
  assert.equal((await s.call('replacement',driftInput(s))).state,'EXECUTED_VERIFIED');resume();
  assert.equal((await old).state,'OBSERVE_EXISTING');assert.equal(s.counts().writes,1);
});
test('unchanged-main orphan followers preserve original family owner and later drift remains recoverable',async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;let failed=false;
  s.dependencies.ledgerRequest=async(op,p)=>{
    if(!failed&&op==='Get'&&p.Key.pk.startsWith('RESUME_OPERATION_V1#')){failed=true;throw Error('FIRST_READ_LOST');}
    return request(op,p);
  };
  await assert.rejects(s.call('original'),/FIRST_READ_LOST/);
  assert.equal((await s.call('same-key-replacement')).state,'HOLD_RECONCILE');
  assert.equal([...s.rows.values()].filter(r=>r.pk.startsWith('RESUME_OPERATION_V1#')).length,0);
  assert.equal([...s.rows.values()].find(r=>r.operation_key).owner,'original');
  liveDrift(s);assert.equal((await s.call('drift-replacement',driftInput(s))).state,'EXECUTED_VERIFIED');
  assert.equal(s.counts().writes,1);
});
test('family settlement wins the WRITE CAS race and fences a paused old execution',async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;let resume,entered;
  const paused=new Promise(r=>entered=r),release=new Promise(r=>resume=r);let intercepted=false;
  s.dependencies.ledgerRequest=async(op,p)=>{
    if(!intercepted&&op==='Update'&&p.ExpressionAttributeValues?.[':next']==='WRITE_STARTED') {
      intercepted=true;entered();await release;
    }
    return request(op,p);
  };
  const old=s.call().catch(e=>e);await paused;liveDrift(s);
  assert.equal((await s.call('replacement',driftInput(s))).state,'EXECUTED_VERIFIED');resume();
  assert.match((await old).message,/OPERATION_OUTCOME_AND_LEDGER_UNCERTAIN/);assert.equal(s.counts().writes,1);
});
test('lost family WRITE acknowledgement preserves family WRITE and operation PRE without mutation',async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;
  s.dependencies.ledgerRequest=async(op,p)=>{const result=await request(op,p);
    if(p.ExpressionAttributeValues?.[':next']==='WRITE_STARTED')throw Error('LOST_FAMILY_WRITE_ACK');return result;};
  await assert.rejects(s.call(),/OPERATION_OUTCOME_AND_LEDGER_UNCERTAIN/);
  const family=[...s.rows.values()].find(r=>r.schema==='LIFECYCLE_PHASE_FENCE_V1');
  const operation=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#'));
  assert.equal(family.phase,'WRITE_STARTED');assert.equal(operation.phase,'PRE_MUTATION');
  assert.equal((await s.call('replacement',driftInput(s))).state,'HOLD_RECONCILE');assert.equal(s.counts().writes,0);
});
for(const stage of ['family','operation'])test(`lost ${stage} NO_MUTATION acknowledgement reconciles protected readback`,async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;let failed=false;
  s.dependencies.mint=async()=>({ok:false});
  s.dependencies.ledgerRequest=async(op,p)=>{const result=await request(op,p);
    if(!failed&&p.ExpressionAttributeValues?.[':next']==='NO_MUTATION'&&
      p.Key.pk.startsWith(stage==='family'?'RESUME_TUPLE_V1#':'RESUME_OPERATION_V1#')){failed=true;throw Error('LOST_NONE_ACK');}
    return result;};
  await assert.rejects(s.call(),/OPERATION_OUTCOME_AND_LEDGER_UNCERTAIN/);
  await assert.rejects(s.call('replacement',driftInput(s)),/TOKEN_DENIED/);
  assert.equal([...s.rows.values()].filter(r=>r.pk.startsWith('RESUME_OPERATION_V1#')&&r.state==='NO_MUTATION').length,2);
  assert.equal(s.counts().writes,0);
});
test('a legacy family-only orphan is never interpreted as pre-mutation proof',async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;
  s.dependencies.ledgerRequest=async(op,p)=>{
    if(op==='Get'&&p.Key.pk.startsWith('RESUME_OPERATION_V1#'))throw Error('INTERRUPTED');
    return request(op,p);
  };
  await assert.rejects(s.call());s.dependencies.ledgerRequest=request;
  const family=[...s.rows.values()].find(r=>r.operation_key);delete family.schema;delete family.binding;delete family.phase;
  const held=await s.call('replacement',driftInput(s));assert.equal(held.original_operation_state,'UNAVAILABLE');
  assert.equal(held.state,'HOLD_RECONCILE');assert.deepEqual(s.counts(),{writes:0,mints:0});
});
test('new phase fencing waits out older bounded broker invocations without releasing legacy rows',async()=>{
  const s=setup();s.rows.delete(JSON.stringify({pk:'RESUME_TUPLE_V1#FAMILY_PHASE_CUTOVER_V1',sk:'OPERATION'}));
  const held=await s.call();assert.equal(held.reason,'FAMILY_PHASE_INVOCATION_DRAIN_WINDOW');assert.equal(held.mutation_attempted,false);
  assert.equal([...s.rows.values()].filter(r=>r.operation_key).length,0);assert.deepEqual(s.counts(),{writes:0,mints:0});
  s.dependencies.now=()=>time+239999;assert.equal((await s.call('early')).not_before,held.not_before);
  s.dependencies.now=()=>time+240000;assert.equal((await s.call('ready')).state,'EXECUTED_VERIFIED');assert.equal(s.counts().writes,1);
});
test('both deployable broker timeouts fit the invocation drain bound',()=>{
  for(const name of ['autonomous-event-token-broker-v1.json','autonomous-event-token-broker-resume-v1.json']) {
    const template=JSON.parse(fs.readFileSync(new URL(`../../../infrastructure/aws/staging/${name}`,import.meta.url)));
    const timeout=template.Resources.BrokerFunction.Properties.Timeout;
    assert.ok(Number.isInteger(timeout)&&timeout>0&&timeout<=180);
  }
});
for(const stage of ['settle','transfer'])test(`lost ${stage} family acknowledgement is reconciled without replay`,async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;let interrupted=false,lost=false;
  s.dependencies.ledgerRequest=async(op,p)=>{
    if(!interrupted&&op==='Get'&&p.Key.pk.startsWith('RESUME_OPERATION_V1#')) {
      interrupted=true;throw Error('ORPHAN_READ_INTERRUPTED');
    }
    const result=await request(op,p),v=p.ExpressionAttributeValues;
    if(!lost&&v?.[':original']&&(stage==='settle'?v[':none']:v[':priorState'])) {
      lost=true;throw Error('FAMILY_ACK_LOST');
    }
    return result;
  };
  await assert.rejects(s.call(),/ORPHAN_READ_INTERRUPTED/);liveDrift(s);
  await assert.rejects(s.call('replacement',driftInput(s)),/FAMILY_ACK_LOST/);
  assert.equal(s.counts().writes,0);
  assert.equal((await s.call('replacement',driftInput(s))).state,'EXECUTED_VERIFIED');
  assert.equal(s.counts().writes,1);
  assert.equal((await s.call('replacement',driftInput(s))).state,'REUSED_SUCCESS');
  assert.equal(s.counts().writes,1);
});
test('an old claim winning orphan archival stays fenced until protected readback settles it',async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;let interrupted=false,raced=false;
  s.dependencies.ledgerRequest=async(op,p)=>{
    if(!interrupted&&op==='Get'&&p.Key.pk.startsWith('RESUME_OPERATION_V1#')) {
      interrupted=true;throw Error('ORPHAN_READ_INTERRUPTED');
    }
    if(!raced&&op==='Put'&&p.Item.pk.startsWith('RESUME_OPERATION_V1#')&&p.Item.state==='NO_MUTATION') {
      raced=true;
      await request('Put',{...p,Item:{...p.Item,state:'IN_FLIGHT',receipt:undefined}});
    }
    return request(op,p);
  };
  await assert.rejects(s.call(),/ORPHAN_READ_INTERRUPTED/);liveDrift(s);
  assert.equal((await s.call('replacement',driftInput(s))).state,'HOLD_RECONCILE');
  assert.equal(s.counts().writes,0);
  assert.equal((await s.call('replacement',driftInput(s))).state,'EXECUTED_VERIFIED');
  assert.equal(s.counts().writes,1);
});
for(const corruption of ['schema','owner','binding'])test(`malformed orphan ${corruption} cannot authorize settlement`,async()=>{
  const s=setup(),request=s.dependencies.ledgerRequest;
  s.dependencies.ledgerRequest=async(op,p)=>{
    if(op==='Get'&&p.Key.pk.startsWith('RESUME_OPERATION_V1#'))throw Error('INTERRUPTED');
    return request(op,p);
  };
  await assert.rejects(s.call());s.dependencies.ledgerRequest=request;
  const family=[...s.rows.values()].find(r=>r.operation_key);
  if(corruption==='schema')family.schema='UNRECOGNIZED';
  if(corruption==='owner')family.owner='';
  if(corruption==='binding')family.binding.payload_sha256=`sha256:${'0'.repeat(64)}`;
  assert.equal((await s.call('replacement',driftInput(s))).state,'HOLD_RECONCILE');
  assert.deepEqual(s.counts(),{writes:0,mints:0});
});

test('protected token expiry is signed, durable and only a read-only recovery prerequisite',async()=>{
 const s=setup();const result=await brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'original'});
 const receipt=result.protected_handoff;
 const familyRow=[...s.rows.values()].find(r=>r.schema==='FINALIZER_TOKEN_FENCE_V2');
 const operationRow=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#'));
 const input={receipt,familyRow,operationRow,publicKey:crypto.createPublicKey(key),now:time+3600000};
 assert.equal(classifyFinalizerTokenDrain(input).reason,'FINALIZER_TOKEN_DRAIN_WAIT');
 const drained=classifyFinalizerTokenDrain({...input,now:time+3660000});
 assert.equal(drained.state,'TOKEN_DRAIN_VERIFIED_NOT_RECOVERY_AUTHORITY');
 assert.equal(drained.recovery_authority,false);assert.equal(drained.mutation_attempted,false);
 assert.deepEqual(drained.original_execution,{run_id:'101',run_attempt:1,source_sha:sha('c'),authorization_generation:'finalizer-generation-1',nonce_digest:'sha256:'+'a'.repeat(64)});
 for(const mutate of [
  r=>r.token_expires_at=new Date(time+900000).toISOString(),
  r=>r.original_execution.run_id='999',r=>r.original_execution.nonce_digest='sha256:'+'b'.repeat(64),
  r=>r.signature='forged',r=>r.drain_not_before=0,
 ]) {
  const forged=structuredClone(receipt);mutate(forged);
  assert.equal(classifyFinalizerTokenDrain({...input,receipt:forged,now:time+3660000}).state,'HOLD_RECONCILE');
 }
 assert.equal(classifyFinalizerTokenDrain({...input,operationRow:{...operationRow,state:'UNKNOWN'},now:time+3660000}).state,'HOLD_RECONCILE');
 assert.equal(classifyFinalizerTokenDrain({...input,familyRow:{...familyRow,owner:'replacement'},now:time+3660000}).state,'HOLD_RECONCILE');
 assert.equal(classifyFinalizerTokenDrain({...input,familyRow:{...familyRow,schema:undefined},now:time+3660000}).reason,'LEGACY_FINALIZER_TOKEN_EXPIRY_UNBOUND');
 assert.equal(s.counts().mints,1);
});
for(const mutate of [e=>e.run_id='102',e=>e.run_attempt=2,e=>delete e.nonce_digest,e=>e.nonce_digest='invalid'])
test('finalizer handoff rejects caller-selected execution binding before mint',async()=>{
 const s=setup(),e=structuredClone(finalizerEvent);mutate(e);
 await assert.rejects(brokerMintFinalizer({...s.dependencies,event:e,callerIdentity:finalizerIdentity,owner:'claim'}),/FINALIZER_INPUT/);
 assert.equal(s.counts().mints,0);
});
for(const expires_at of [undefined,'invalid',new Date(time+1000).toISOString(),new Date(time+4000000).toISOString()])
test('missing or unbounded minted expiry never produces an authenticated success',async()=>{
 const s=setup();s.dependencies.mint=async()=>({ok:true,token:'PRIVATE_WRITE_TOKEN',expires_at});
 await assert.rejects(brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'claim'}),/FINALIZER_TOKEN_EXPIRY_UNBOUND/);
 const row=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#'));
 assert.equal(row.state,'UNKNOWN');
 assert.equal((await brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'replacement'})).state,'HOLD_RECONCILE');
});

test('mint that returns after the protected invocation deadline remains UNKNOWN without replay',async()=>{
 const s=setup();let clock=time;s.dependencies.now=()=>clock;
 s.dependencies.mint=async()=>{clock=time+180001;return {ok:true,token:'PRIVATE_WRITE_TOKEN',expires_at:new Date(time+3600000).toISOString()};};
 await assert.rejects(brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'original'}),/FINALIZER_TOKEN_EXPIRY_UNBOUND/);
 const row=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#'));
 assert.equal(row.state,'UNKNOWN');
 assert.equal((await brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'replacement'})).state,'HOLD_RECONCILE');
});
test('paused pre-mint invocation cannot mint after its durable deadline',async()=>{
 const s=setup();let clock=time;s.dependencies.now=()=>clock;
 s.dependencies.getPrivateKey=async()=>{clock=time+180001;return key;};
 await assert.rejects(brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'original'}),/FINALIZER_MINT_WINDOW_EXPIRED/);
 assert.equal(s.counts().mints,0);
});
test('event-provided identity is never substituted for protected handler identity',async()=>{
 const s=setup();const e={...finalizerEvent,callerIdentity:finalizerIdentity};
 await assert.rejects(brokerMintFinalizer({...s.dependencies,event:e,owner:'original'}),/FINALIZER_INPUT/);
 assert.equal(s.counts().mints,0);
});
test('a missing operation success receipt cannot prove drained tokens',async()=>{
 const s=setup();const r=await brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'original'});
 const familyRow=[...s.rows.values()].find(r=>r.schema==='FINALIZER_TOKEN_FENCE_V2');
 const operationRow=[...s.rows.values()].find(r=>r.pk.startsWith('RESUME_OPERATION_V1#'));
 delete operationRow.receipt;
 assert.equal(classifyFinalizerTokenDrain({receipt:r.protected_handoff,familyRow,operationRow,publicKey:crypto.createPublicKey(key),now:time+3660000}).state,'HOLD_RECONCILE');
});

async function recoveryContextSetup({merged=true}={}) {
 const s=setup();await brokerMintFinalizer({...s.dependencies,event:finalizerEvent,callerIdentity:finalizerIdentity,owner:'original'});
 const current=sha(merged?'d':'c');
 const input={action:'READ_FINALIZER_RECOVERY_CONTEXT',repository,repository_id:'123',pull_request:42,head_sha:sha('b'),base_sha:current,run_id:'202',run_attempt:1};
 const native={run:{id:101,run_attempt:1,head_sha:sha('c'),head_branch:'main',repository:{full_name:repository,id:123},
   path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',event:'repository_dispatch',status:'completed',conclusion:'failure',updated_at:new Date(time+1000).toISOString()},
   pr:{number:42,state:merged?'closed':'open',merged,merge_commit_sha:merged?current:null,
     head:{sha:sha('b'),repo:{full_name:repository}},base:{ref:'main',sha:sha('c'),repo:{full_name:repository}}},
   main:{name:'main',protected:true,commit:{sha:current}},
   head:{sha:sha('b'),tree:{sha:sha('f')}},merge:{sha:sha('d'),tree:{sha:sha('f')},parents:[{sha:sha('c')},{sha:sha('b')}]}};
 let reads=0,readMints=0;const ledgerRequest=s.dependencies.ledgerRequest;
 const deps={...s.dependencies,now:()=>time+3660000,ledgerRequest:async(op,p)=>{assert.equal(op,'Get');assert.equal(p.ConsistentRead,true);return ledgerRequest(op,p);},
   mint:async()=>{readMints++;return {ok:true,token:'PRIVATE_READ_TOKEN'};},request:async(url,options)=>{
     assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer PRIVATE_READ_TOKEN');reads++;
     const route=url.split(`/repos/${repository}`)[1];
     const name=route==='/actions/runs/101'?'run':route==='/pulls/42'?'pr':route==='/branches/main'?'main':route.endsWith(sha('b'))?'head':route.endsWith(sha('d'))?'merge':null;
     assert.ok(name);return {ok:true,json:async()=>structuredClone(native[name])};
   }};
 const identity={caller_class:'FINALIZER',run_id:'202',source_sha:current};
 return {s,input,native,deps,counts:()=>({reads,readMints}),call:()=>brokerReadFinalizerRecoveryContext({...deps,event:input,callerIdentity:identity})};
}
test('generic recovery context authenticates original token drain and native merge graph with GET only',async()=>{
 const r=await recoveryContextSetup();const before=JSON.stringify([...r.s.rows]);const result=await r.call();
 assert.equal(result.receipt.state,'POSTMERGE_RECONCILIATION_CONTEXT_ONLY');assert.equal(result.receipt.recovery_authority,false);
 assert.equal(result.receipt.original_execution.run_id,'101');assert.deepEqual(result.receipt.merge.ordered_parents,[sha('c'),sha('b')]);
 assert.equal(before,JSON.stringify([...r.s.rows]));assert.deepEqual(r.counts(),{reads:6,readMints:1});
 const {signature,...signed}=result.receipt;assert.equal(crypto.verify('RSA-SHA256',Buffer.from(canonicalJson(signed)),crypto.createPublicKey(key),Buffer.from(signature,'base64')),true);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_(WRITE|READ)_TOKEN/);
});
test('unmerged context explicitly withholds mutation/recovery authority',async()=>{
 const r=await recoveryContextSetup({merged:false});const result=await r.call();
 assert.equal(result.receipt.state,'UNMERGED_REQUIRES_PROTECTED_RECOVERY_PROTOCOL');assert.equal(result.receipt.merge,null);
 assert.equal(result.receipt.recovery_authority,false);assert.equal(result.receipt.mutation_attempted,false);
});
for(const corrupt of [r=>r.native.run.status='in_progress',r=>r.native.run.run_attempt=2,r=>r.native.run.event='workflow_dispatch',
 r=>r.native.run.head_sha=sha('e'),r=>r.native.main.commit.sha=sha('e'),r=>r.native.main.protected=false,
 r=>r.native.pr.head.sha=sha('e'),r=>r.native.merge.parents.reverse(),r=>r.native.merge.tree.sha=sha('e')])
test('recovery context rejects native execution/tuple/merge drift without granting authority',async()=>{
 const r=await recoveryContextSetup();corrupt(r);const result=await r.call();assert.equal(result.state,'HOLD_RECONCILE');assert.equal(result.recovery_authority,false);
});
for(const corrupt of [r=>r.deps.now=()=>time+3600000,r=>[...r.s.rows.values()].find(x=>x.schema==='FINALIZER_TOKEN_FENCE_V2').schema='LEGACY',
 r=>[...r.s.rows.values()].find(x=>x.pk.startsWith('RESUME_OPERATION_V1#')).state='UNKNOWN',r=>r.input.pull_request=1677])
test('undrained/legacy/UNKNOWN/quarantined work cannot even mint the narrow reader',async()=>{
 const r=await recoveryContextSetup();corrupt(r);assert.equal((await r.call()).state,'HOLD_RECONCILE');assert.deepEqual(r.counts(),{reads:0,readMints:0});
});
