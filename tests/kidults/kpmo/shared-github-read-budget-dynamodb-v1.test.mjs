import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createProtectedDynamoDbGithubReadBudgetStore} from '../../../scripts/kidults/kpmo/lib/shared-github-read-budget-dynamodb-v1.mjs';
import {createSharedGithubReadBudget} from '../../../scripts/kidults/kpmo/lib/shared-github-read-budget-v1.mjs';

const scope={repository:'johnkim9524-collab/kaios_enterprise_repo',resource:'core',quota_owner_id:'installation-42'};
const identity={Account:'528314240275',Arn:'arn:aws:sts::528314240275:assumed-role/kidults-autonomous-kpmo-staging-role/run-1'};
function fixture({backend,caller=identity}={}){
  backend??={item:null,calls:[]};
  const {calls}=backend;
  const aws=(bin,args)=>{
    assert.equal(bin,'aws');calls.push(args);
    const op=args[1];
    if(op==='get-caller-identity')return JSON.stringify(caller);
    if(op==='get-item')return JSON.stringify({Item:backend.item});
    if(op==='put-item'){
      if(backend.item){const e=Error('conditional');e.stderr='ConditionalCheckFailedException';throw e;}
      backend.item=JSON.parse(args[args.indexOf('--item')+1]);return '{}';
    }
    if(op==='update-item'){
      const expected=JSON.parse(args[args.indexOf('--expression-attribute-values')+1])[':expected']?.N;
      if(backend.item?.budget_version?.N!==expected){const e=Error('conditional');e.stderr='ConditionalCheckFailedException';throw e;}
      const values=JSON.parse(args[args.indexOf('--expression-attribute-values')+1]);backend.item.budget_version=values[':next'];backend.item.budget_json=values[':body'];return '{}';
    }
    throw Error('unexpected AWS operation');
  };
  const makeStore=identity=>createProtectedDynamoDbGithubReadBudgetStore({scope,aws,identity});
  return {store:makeStore(caller),makeStore,calls,get:()=>backend.item};
}
const binding={operation_id:'a'.repeat(64),run_id:'100',run_attempt:1,source_sha:'b'.repeat(40),route:'/repos/johnkim9524-collab/kaios_enterprise_repo/branches/main',method:'GET',issued_at:100000};

test('protected DynamoDB adapter performs consistent reads and atomic cross-runner CAS',async()=>{
  const f=fixture(),shared=createSharedGithubReadBudget({store:f.store,scope,capacity:10,now:()=>100000});
  assert.equal(await f.store.read(f.store.key),null);
  const release=await shared.acquireLease({binding});assert.equal(typeof release.finish,'function');
  await release.finish();
  const row=await f.store.read(f.store.key);assert.equal(row.spent,1);assert.equal(row.operations[binding.operation_id].state,'COMPLETED');
  assert(f.calls.some(x=>x.includes('--consistent-read')));
  assert(f.calls.some(x=>x.includes('--condition-expression')&&x.some(y=>String(y).includes('attribute_not_exists(pk)'))));
  assert.equal(f.get().pk.S,f.store.key);
});

test('DynamoDB conflicts are surfaced and ambiguous writes are never replayed',async()=>{
  const f=fixture(),row={version:1,scope_digest:f.store.key.split('#')[1],config_digest:'c'.repeat(64),window_start:1,spent:1,blocked_until:0,operations:{},observed_at:1};
  assert.equal(await f.store.compareAndSwap(f.store.key,0,row),'COMMITTED');
  assert.equal(await f.store.compareAndSwap(f.store.key,0,row),'CONFLICT');
});

test('adapter rejects unrelated AWS identities, quota owners, and partition keys',async()=>{
  assert.throws(()=>createProtectedDynamoDbGithubReadBudgetStore({scope,identity:{Account:'1',Arn:'arn:bad'}}),/IDENTITY/);
  assert.throws(()=>createProtectedDynamoDbGithubReadBudgetStore({scope,identity:{Account:'528314240275',Arn:'arn:aws:sts::528314240275:assumed-role/kidults-github-read-resume-staging-role-evil/run-1'}}),/IDENTITY/);
  assert.throws(()=>createProtectedDynamoDbGithubReadBudgetStore({scope:{...scope,quota_owner_id:'*'},identity}),/SCOPE/);
  const f=fixture();await assert.rejects(f.store.read('AUTH#anything'),/KEY/);
});

test('dedicated read-resume runner role is admitted to the shared protected budget',()=>{
  const store=createProtectedDynamoDbGithubReadBudgetStore({scope,identity:{Account:'528314240275',
    Arn:'arn:aws:sts::528314240275:assumed-role/kidults-github-read-resume-staging-role/run-1'}});
  assert.equal(store.authority,'PROTECTED_ATOMIC_CAS');
});

test('finalizer cannot join the shared budget before explicit Owner activation',()=>{
  assert.throws(()=>createProtectedDynamoDbGithubReadBudgetStore({scope,identity:{Account:'528314240275',
    Arn:'arn:aws:sts::528314240275:assumed-role/kidults-autonomous-finalizer-staging-role/run-1'}}),/IDENTITY/);
  const template=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  const statements=template.Resources.FinalizerRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.equal(statements.some(statement=>(JSON.stringify(statement.Condition)||'').includes('GITHUB_READ_BUDGET#*')),false);
  assert.equal(JSON.stringify(statements).includes('dynamodb:DeleteItem'),false);
  assert.equal(JSON.stringify(statements).includes('dynamodb:BatchWriteItem'),false);
});

test('Track, KPMO, and independent-verification runners share one capped DynamoDB budget row',async()=>{
  const backend={item:null,calls:[]};
  const runners=['track','kpmo','verifier'].map((role,index)=>{
    const caller={Account:'528314240275',Arn:`arn:aws:sts::528314240275:assumed-role/kidults-autonomous-${role}-staging-role/runner-${index+1}`};
    const f=fixture({backend,caller});
    return {f,budget:createSharedGithubReadBudget({store:f.store,scope,capacity:10,maxConcurrent:2,now:()=>100000})};
  });
  const outcomes=await Promise.all(runners.map((runner,index)=>runner.budget.acquire({
    ...binding,operation_id:String(index+1).padStart(64,'0'),run_id:String(100+index),issued_at:100000,
  })));
  assert.equal(outcomes.filter(value=>value.fetch_allowed).length,2);
  assert.equal(outcomes.filter(value=>value.state==='READ_BUDGET_DEFERRED').length,1);
  assert.equal(new Set(runners.map(({f})=>f.store.key)).size,1);
  assert.equal(JSON.parse(backend.item.budget_json.S).spent,2);
  assert.ok(backend.calls.some(args=>args.includes('--consistent-read')));
  assert.equal(backend.item.pk.S,runners[0].f.store.key);
});
