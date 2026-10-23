import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createProtectedDynamoDbGithubReadBudgetStore} from '../../../scripts/kidults/kpmo/lib/shared-github-read-budget-dynamodb-v1.mjs';
import {createSharedGithubReadBudget} from '../../../scripts/kidults/kpmo/lib/shared-github-read-budget-v1.mjs';

const repo='johnkim9524-collab/kaios_enterprise_repo';
const scope={repository:repo,resource:'core',quota_owner_id:'gha-repo-1281328888'};
const configuration={scope,capacity:10,windowMs:3600000,maxConcurrent:2,leaseMs:30000};
const envFor=(role='kpmo',resumeWorkflow='sentinel')=>({
  KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN:`arn:aws:kms:ap-northeast-2:528314240275:key/${role}`,
  KIDULTS_AUTONOMOUS_WORKLOAD_ID:`${role}-workload`,
  KIDULTS_READ_RESUME_SIGNING_KEY_ARN:'arn:aws:kms:ap-northeast-2:528314240275:key/read-resume',
  KIDULTS_READ_RESUME_WORKLOAD_ID:'read-resume-workload',
  GITHUB_WORKFLOW_REF:role==='read-resume'
    ?`${repo}/.github/workflows/${resumeWorkflow==='observer'?'kpmo-authorization-read-resume-observer-v1.yml':'kpmo-continuous-assurance-sentinel-health-v1.yml'}@refs/heads/main`
    :`${repo}/.github/workflows/kidults-autonomous-${role==='verifier'?'independent-verification':role}-authorization-v1.yml@refs/heads/main`,
  GITHUB_SHA:'b'.repeat(40),GITHUB_RUN_ID:'100',GITHUB_RUN_ATTEMPT:'1',
});
const identityFor=(role='kpmo')=>({Account:'528314240275',Arn:role==='read-resume'
  ?'arn:aws:sts::528314240275:assumed-role/kidults-github-read-resume-staging-role/run-1'
  :`arn:aws:sts::528314240275:assumed-role/kidults-autonomous-${role}-staging-role/run-1`});
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);

function fixture({backend,role='kpmo',caller=identityFor(role),ambiguousAfterWrite=false}={}){
  backend??={item:null,calls:[]};
  const calls=backend.calls;
  let signedDigest;
  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'shared-read-budget-test-'));
  const aws=(bin,args)=>{
    assert.equal(bin,'aws');calls.push(args);
    const commandIndex=args.findIndex(value=>['kms','lambda','sts'].includes(value));
    const command=args.slice(commandIndex);
    if(command[0]==='kms'&&command[1]==='sign'){
      assert.equal(args[args.indexOf('--key-id')+1],envFor(role)[role==='read-resume'?'KIDULTS_READ_RESUME_SIGNING_KEY_ARN':'KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN']);
      signedDigest=fs.readFileSync(args[args.indexOf('--message')+1].slice('fileb://'.length));
      assert.equal(signedDigest.length,32);
      return JSON.stringify({KeyId:args[args.indexOf('--key-id')+1],SigningAlgorithm:'ECDSA_SHA_256',Signature:Buffer.from('signed').toString('base64')});
    }
    if(command[0]==='lambda'&&command[1]==='invoke'){
      const payload=JSON.parse(command[command.indexOf('--payload')+1]);
      const {envelope}=payload;
      assert.equal(envelope.contract,'kidults-shared-github-read-budget-v1');
      assert.equal(envelope.repository,repo);
      assert.deepEqual(signedDigest,createHash('sha256').update(canonical(envelope)).digest());
      const physicalKey={pk:{S:`AUTH#${envelope.key}`},sk:{S:'V1'}};
      let response;
      if(envelope.action==='READ'){
        response={ok:true,action:'READ',key:envelope.key,row:backend.item?JSON.parse(backend.item.budget_json.S):null};
      }else{
        const expected=envelope.expected_version;
        if(expected===0&&backend.item){
          response={ok:true,action:'COMPARE_AND_SWAP',key:envelope.key,state:'CONFLICT'};
        }else if(expected>0&&Number(backend.item?.budget_version?.N)!==expected){
          response={ok:true,action:'COMPARE_AND_SWAP',key:envelope.key,state:'CONFLICT'};
        }else{
          backend.item={...physicalKey,budget_version:{N:String(envelope.next.version)},budget_json:{S:canonical(envelope.next)}};
          response={ok:true,action:'COMPARE_AND_SWAP',key:envelope.key,state:'COMMITTED',version:envelope.next.version};
          if(ambiguousAfterWrite)throw Error('simulated response loss after committed write');
        }
      }
      fs.writeFileSync(command.at(-1),JSON.stringify(response),{mode:0o600});
      return JSON.stringify({StatusCode:200});
    }
    if(command[0]==='sts'&&command[1]==='get-caller-identity')return JSON.stringify(caller);
    throw Error('unexpected AWS operation');
  };
  const makeStore=(whichRole=role,whichCaller=identityFor(whichRole))=>createProtectedDynamoDbGithubReadBudgetStore({
    scope,configuration,aws,identity:whichCaller,env:envFor(whichRole),tempRoot,
  });
  return {store:makeStore(),makeStore,calls,backend,tempRoot,cleanup:()=>fs.rmSync(tempRoot,{recursive:true,force:true})};
}
const binding={operation_id:'a'.repeat(64),run_id:'100',run_attempt:1,source_sha:'b'.repeat(40),route:`/repos/${repo}/branches/main`,method:'GET',issued_at:100000};

test('protected writer performs signed consistent reads and atomic cross-runner CAS',async t=>{
  const f=fixture();t.after(f.cleanup);
  const shared=createSharedGithubReadBudget({store:f.store,scope,capacity:10,now:()=>100000});
  assert.equal(await f.store.read(f.store.key),null);
  const release=await shared.acquireLease({binding});assert.equal(typeof release.finish,'function');
  await release.finish();
  const row=await f.store.read(f.store.key);assert.equal(row.spent,1);assert.equal(row.operations[binding.operation_id].state,'COMPLETED');
  assert(f.calls.some(x=>x.includes('kms')&&x[x.indexOf('kms')+1]==='sign'));
  assert(f.calls.some(x=>x.includes('lambda')&&x[x.indexOf('lambda')+1]==='invoke'&&JSON.parse(x[x.indexOf('--payload')+1]).envelope.action==='READ'));
  assert.equal(f.backend.item.pk.S,`AUTH#${f.store.key}`);
});

test('CAS conflicts are returned and ambiguous writer responses are never replayed',async t=>{
  const f=fixture();t.after(f.cleanup);
  const row={version:1,scope_digest:'c'.repeat(64),config_digest:'d'.repeat(64),window_start:1,spent:1,blocked_until:0,operations:{},observed_at:1};
  assert.equal(await f.store.compareAndSwap(f.store.key,0,row),'COMMITTED');
  assert.equal(await f.store.compareAndSwap(f.store.key,0,row),'CONFLICT');
  const uncertain=fixture({ambiguousAfterWrite:true});t.after(uncertain.cleanup);
  assert.equal(await uncertain.store.compareAndSwap(uncertain.store.key,0,{...row,scope_digest:'e'.repeat(64)}),'UNKNOWN');
  assert.equal(uncertain.calls.filter(x=>x.includes('lambda')&&x[x.indexOf('lambda')+1]==='invoke').length,1);
});

test('adapter rejects unrelated AWS identities and quota owners; operations reject unrelated partition keys',async t=>{
  const f=fixture();t.after(f.cleanup);
  assert.throws(()=>f.makeStore('kpmo',{Account:'1',Arn:'arn:bad'}),/ACCOUNT/);
  assert.throws(()=>createProtectedDynamoDbGithubReadBudgetStore({scope:{...scope,quota_owner_id:'*'},identity:identityFor(),env:envFor()}),/SCOPE/);
  await assert.rejects(f.store.read('AUTH#anything'),/KEY/);
  const resume=f.makeStore('read-resume');
  assert.equal(resume.authority,'PROTECTED_ATOMIC_CAS');
  assert.notEqual(resume.key,undefined);
  assert.throws(()=>createProtectedDynamoDbGithubReadBudgetStore({scope,configuration,aws:()=>'',identity:identityFor('read-resume'),
    env:{...envFor('read-resume'),GITHUB_WORKFLOW_REF:`${repo}/.github/workflows/untrusted.yml@refs/heads/main`},tempRoot:f.tempRoot}),/WORKFLOW_ROLE_BINDING/);
});

test('terminal authorization observer is admitted only as a read-resume workflow',async t=>{
  const f=fixture({role:'read-resume'});t.after(f.cleanup);
  const env={...envFor('read-resume','observer')};
  const store=createProtectedDynamoDbGithubReadBudgetStore({scope,configuration,aws:()=>{throw Error('unexpected AWS call');},
    identity:identityFor('read-resume'),env,tempRoot:f.tempRoot});
  assert.equal(store.authority,'PROTECTED_ATOMIC_CAS');
});

test('AWS CLI failures retain a bounded safe operation and error code without exposing stderr',async t=>{
  const f=fixture();t.after(f.cleanup);
  const aws=(bin,args)=>{
    if(args.includes('get-caller-identity'))return JSON.stringify(identityFor());
    const commandIndex=args.findIndex(value=>['kms','lambda'].includes(value));
    const command=args.slice(commandIndex);
    if(command[0]==='kms'&&command[1]==='sign')return JSON.stringify({
      KeyId:envFor().KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN,
      SigningAlgorithm:'ECDSA_SHA_256',Signature:Buffer.from('signed').toString('base64'),
    });
    const error=Error('Command failed: aws --region ap-northeast-2 lambda invoke --payload SECRET_PAYLOAD');
    error.stderr=Buffer.from('An error occurred (ExpiredTokenException) when calling the Invoke operation: TOKEN_MUST_NOT_LEAK');
    error.status=1;
    throw error;
  };
  const store=createProtectedDynamoDbGithubReadBudgetStore({scope,configuration,aws,identity:identityFor(),env:envFor(),tempRoot:f.tempRoot});
  await assert.rejects(store.read(store.key),error=>{
    assert.equal(error.message,'SHARED_GITHUB_READ_LAMBDA_AWS_LAMBDA_INVOKE_EXPIREDTOKENEXCEPTION');
    assert.deepEqual(error.failure_diagnostic,{id:'kidults-aws-command-failure-diagnostic-v1',version:'1.0.0',
      operation:'lambda.invoke',code:'ExpiredTokenException',retry_authorized:false,actual_authority_granted:false,promotion_eligible:false});
    assert.doesNotMatch(JSON.stringify(error.failure_diagnostic),/TOKEN_MUST_NOT_LEAK|SECRET_PAYLOAD/);
    return true;
  });
});

test('Track, KPMO, verifier, and read-resume runners consume one bounded shared budget row',async t=>{
  const backend={item:null,calls:[]};
  const runners=['track','kpmo','verifier','read-resume'].map((role,index)=>{
    const f=fixture({backend,role});
    return {f,budget:createSharedGithubReadBudget({store:f.store,scope,capacity:10,maxConcurrent:2,now:()=>100000})};
  });
  t.after(()=>runners.forEach(({f})=>f.cleanup()));
  const outcomes=await Promise.all(runners.map((runner,index)=>runner.budget.acquire({
    ...binding,operation_id:String(index+1).padStart(64,'0'),run_id:String(100+index),issued_at:100000,
  })));
  assert.equal(outcomes.filter(value=>value.fetch_allowed).length,2);
  assert.equal(outcomes.filter(value=>value.state==='READ_BUDGET_DEFERRED').length,2);
  assert.equal(new Set(runners.map(({f})=>f.store.key)).size,1);
  assert.equal(JSON.parse(backend.item.budget_json.S).spent,2);
  assert.equal(backend.item.pk.S,`AUTH#${runners[0].f.store.key}`);
});
