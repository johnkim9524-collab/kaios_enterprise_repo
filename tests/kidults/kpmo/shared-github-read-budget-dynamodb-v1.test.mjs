import test from 'node:test';
import assert from 'node:assert/strict';
import {createProtectedDynamoDbGithubReadBudgetStore} from '../../../scripts/kidults/kpmo/lib/shared-github-read-budget-dynamodb-v1.mjs';
import {createSharedGithubReadBudget} from '../../../scripts/kidults/kpmo/lib/shared-github-read-budget-v1.mjs';

const scope={repository:'johnkim9524-collab/kaios_enterprise_repo',resource:'core',quota_owner_id:'installation-42'};
const identity={Account:'528314240275',Arn:'arn:aws:sts::528314240275:assumed-role/kidults-autonomous-kpmo-staging-role/run-1'};
function fixture(){
  let item=null;const calls=[];
  const aws=(bin,args)=>{
    assert.equal(bin,'aws');calls.push(args);
    const op=args[1];
    if(op==='get-caller-identity')return JSON.stringify(identity);
    if(op==='get-item')return JSON.stringify({Item:item});
    if(op==='put-item'){
      if(item){const e=Error('conditional');e.stderr='ConditionalCheckFailedException';throw e;}
      item=JSON.parse(args[args.indexOf('--item')+1]);return '{}';
    }
    if(op==='update-item'){
      const expected=JSON.parse(args[args.indexOf('--expression-attribute-values')+1])[':expected']?.N;
      if(item?.budget_version?.N!==expected){const e=Error('conditional');e.stderr='ConditionalCheckFailedException';throw e;}
      const values=JSON.parse(args[args.indexOf('--expression-attribute-values')+1]);item.budget_version=values[':next'];item.budget_json=values[':body'];return '{}';
    }
    throw Error('unexpected AWS operation');
  };
  return {store:createProtectedDynamoDbGithubReadBudgetStore({scope,aws,identity}),calls,get:()=>item};
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
