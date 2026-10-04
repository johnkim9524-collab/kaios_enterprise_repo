import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {brokerResumeDispatch} from '../../../scripts/kidults/staging-operations/lib/broker-resume-dispatch-v1.mjs';
import {buildBrokerCode,buildTemplates} from '../../../scripts/governance/build-resume-broker-template-v1.mjs';
const repository='johnkim9524-collab/kaios_enterprise_repo';
const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const time=Date.parse('2026-10-04T10:00:00Z');
const envelope={repository,repository_id:'123',pull_request:42,base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40),
  scope_digest:'sha256:'+'d'.repeat(64),authorization_generation:'generation-000001',nonce_digest:'sha256:'+'e'.repeat(64),
  issued_at:new Date(time-1000).toISOString(),expires_at:new Date(time+3600000).toISOString(),production:'HOLD',public:'HOLD',g5:'HOLD'};
const event={action:'RESUME_AUTHORIZATION_DISPATCH',envelope,run_id:'101',run_attempt:1};
function setup({transport='ok'}={}) {
  const rows=new Map(); let sends=0,mints=0;
  const conditional=()=>Object.assign(new Error('conditional'),{name:'ConditionalCheckFailedException'});
  const ledgerRequest=async(op,p)=>{
    assert.equal(p.TableName,'test-operation-table');
    const k=JSON.stringify(p.Key||{pk:p.Item.pk,sk:p.Item.sk});
    if(op==='Get') {assert.equal(p.ConsistentRead,true);return {Item:structuredClone(rows.get(k))};}
    if(op==='Put') {if(rows.has(k))throw conditional();rows.set(k,structuredClone(p.Item));return {};}
    if(op==='Update') {
      const row=rows.get(k),v=p.ExpressionAttributeValues;
      if(!row || row.owner!==v[':owner'] || row.state!=='IN_FLIGHT') throw conditional();
      row.state=v[':next'];row.receipt=structuredClone(v[':receipt']);return {};
    }
    throw Error('unexpected request');
  };
  const dependencies={config:{repository,repositoryId:'123',operationTable:'test-operation-table',activationRunFloor:'100'},
    ledgerRequest,getPrivateKey:async()=>key,now:()=>time,
    mint:async()=>{mints++;return {ok:true,token:'fixture-private-token'};},
    request:async(url,options)=>{assert.equal(url,`https://api.github.com/repos/${repository}/dispatches`);assert.equal(options.redirect,'error');
      sends++;if(transport==='lost')throw Error('lost reply');return {status:transport==='bad'?202:204};}};
  return {rows,dependencies,counts:()=>({sends,mints}),call:(e=event,owner='owner-1')=>brokerResumeDispatch({...dependencies,event:e,owner})};
}
test('native protected-source bundle loads the same runtime and has no unregistered imports',async()=>{
  const context={require:createRequire(import.meta.url),exports:{},Buffer,AbortSignal,console};
  vm.createContext(context);vm.runInContext(buildBrokerCode(),context);
  const module=await vm.runInContext("__resumeLoad('scripts/kidults/staging-operations/lib/broker-resume-dispatch-v1.mjs')",context);
  assert.equal(typeof module.brokerResumeDispatch,'function');
  const s=setup();const result=await module.brokerResumeDispatch({...s.dependencies,event,owner:'bundle-owner'});
  assert.equal(result.state,'EXECUTED_VERIFIED');assert.equal(s.counts().sends,1);
});
test('twelve concurrent sessions send once; replacement reuses authenticated acknowledgement',async()=>{
  const s=setup();const results=await Promise.all(Array.from({length:12},(_,i)=>s.call(event,`owner-${i}`)));
  assert.equal(results.filter(r=>r.state==='EXECUTED_VERIFIED').length,1);assert.equal(s.counts().sends,1);
  const reused=await s.call(event,'replacement');assert.equal(reused.state,'REUSED_SUCCESS');assert.equal(s.counts().sends,1);
  assert.equal(JSON.stringify(reused).includes('fixture-private-token'),false);
});
test('lost response is UNKNOWN and never automatically dispatched again',async()=>{
  const s=setup({transport:'lost'});await assert.rejects(s.call(),/lost reply/);
  assert.equal((await s.call(event,'replacement')).state,'HOLD_RECONCILE');assert.equal(s.counts().sends,1);
});
test('non-204 response does not authenticate success',async()=>{
  const s=setup({transport:'bad'});await assert.rejects(s.call(),/DISPATCH_OUTCOME_UNKNOWN/);
  assert.equal((await s.call(event,'replacement')).state,'HOLD_RECONCILE');assert.equal(s.counts().sends,1);
});
test('new clock generation cannot dispatch the same exact tuple again',async()=>{
  const s=setup();await s.call();await assert.rejects(s.call({...event,run_id:'102',envelope:{...envelope,authorization_generation:'generation-000002'}},'clock-2'),/EXACT_TUPLE_ALREADY_CLAIMED/);
  assert.equal(s.counts().sends,1);
});
test('invalid stored signature blocks reuse without a second send',async()=>{
  const s=setup();await s.call();const row=[...s.rows.values()].find(r=>r.state==='SUCCESS');row.receipt.signature='AAAA';
  await assert.rejects(s.call(event,'replacement'),/REMOTE_RECEIPT_INVALID/);assert.equal(s.counts().sends,1);
});
test('legacy run IDs, rerun attempts, caller table overrides and HOLD changes deny before writes',async()=>{
  for(const e of [{...event,run_id:'100'},{...event,run_attempt:2},{...event,table:'bypass'},
    {...event,envelope:{...envelope,production:'ACTIVE'}}]) {
    const s=setup();await assert.rejects(s.call(e),/DENIED/);assert.equal(s.rows.size,0);assert.equal(s.counts().sends,0);
  }
});
test('bootstrap authority isolates table and namespaces; normal template has no added authority',()=>{
  const {original,desired}=buildTemplates();assert.equal(Object.keys(original.Resources).length,3);
  assert.equal(desired.Resources.ResumeOperationTable.DeletionPolicy,'Retain');
  const policy=desired.Resources.BrokerRole.Properties.Policies.at(-1).PolicyDocument.Statement[0];
  assert.deepEqual(policy.Action,['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem']);
  assert.deepEqual(policy.Resource,{'Fn::GetAtt':['ResumeOperationTable','Arn']});
  assert.deepEqual(policy.Condition['ForAllValues:StringLike']['dynamodb:LeadingKeys'],['RESUME_OPERATION_V1#*','RESUME_TUPLE_V1#*']);
  assert.equal(JSON.stringify(desired).includes('AWSLambdaBasicExecutionRole'),false);
});
