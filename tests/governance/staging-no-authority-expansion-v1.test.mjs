import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const validator = path.resolve('scripts/governance/validate-staging-no-authority-expansion-v1.mjs');
const base = {
  Resources: {
    Role: {Type:'AWS::IAM::Role', Properties:{
      AssumeRolePolicyDocument:{Statement:[{Effect:'Allow',Action:'sts:AssumeRole',Principal:{Service:'lambda.amazonaws.com'}}]},
      Policies:[{PolicyName:'p',PolicyDocument:{Statement:[{Effect:'Allow',Action:['s3:GetObject','s3:PutObject'],Resource:'arn:aws:s3:::x/*'}]}}]
    }},
    Fn: {Type:'AWS::Lambda::Function', Properties:{Runtime:'nodejs24.x',Role:{Ref:'Role'},Code:{ZipFile:'old'}}}
  }
};
const run = (current, desired, extra=[], context=null) => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'staging-no-expand-'));
  const a=path.join(dir,'a.json'), b=path.join(dir,'b.json');
  fs.writeFileSync(a,JSON.stringify(current)); fs.writeFileSync(b,JSON.stringify(desired));
  const env={...process.env};
  if(context){
    const eventPath=path.join(dir,'event.json');
    fs.writeFileSync(eventPath,JSON.stringify(context.event));
    Object.assign(env,context.env,{GITHUB_EVENT_PATH:eventPath});
  }
  const r=spawnSync(process.execPath,[validator,'--current',a,'--desired',b,...extra],{encoding:'utf8',env});
  fs.rmSync(dir,{recursive:true,force:true});
  return r;
};
test('identical template passes',()=>assert.equal(run(base,base).status,0));
test('lambda code-only change passes when explicitly allowed',()=>{
  const d=structuredClone(base); d.Resources.Fn.Properties.Code={ZipFile:'new'};
  assert.equal(run(base,d,['--allow-lambda-code-change']).status,0);
});
test('broker timeout increase cannot be activated as an automatic code-only update',()=>{
  const current=structuredClone(base),desired=structuredClone(base);
  current.Resources.Fn.Properties.Timeout=30;desired.Resources.Fn.Properties.Timeout=180;
  const r=run(current,desired,['--allow-lambda-code-change']);
  assert.notEqual(r.status,0);assert.match(r.stderr,/STAGING_LAMBDA_NONCODE_CHANGE_OWNER_BOUNDARY/);
});
test('IAM reduction passes',()=>{
  const d=structuredClone(base);
  d.Resources.Role.Properties.Policies[0].PolicyDocument.Statement[0].Action=['s3:GetObject'];
  assert.equal(run(base,d).status,0);
});
test('IAM expansion fails closed',()=>{
  const d=structuredClone(base);
  d.Resources.Role.Properties.Policies[0].PolicyDocument.Statement[0].Action.push('s3:DeleteObject');
  const r=run(base,d);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/STAGING_IAM_EXPANSION_OWNER_BOUNDARY/);
});
test('trust change fails closed',()=>{
  const d=structuredClone(base);
  d.Resources.Role.Properties.AssumeRolePolicyDocument.Statement[0].Principal.Service='ec2.amazonaws.com';
  const r=run(base,d);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/STAGING_TRUST_CHANGE_OWNER_BOUNDARY/);
});

const ownerFlag=['--allow-lambda-code-change','--allow-owner-reviewed-broker-timeout-30-to-180'];
const ownerContext=()=>{
  const sha='a'.repeat(40),changeSet=`kidults-broker-${sha.slice(0,12)}-123`;
  const inputs={main_sha:sha,stack_name:'kidults-autonomous-event-token-broker-staging',change_set_name:changeSet,
    authorization_id:`DEPLOY-STAGING-BROKER-${sha.slice(0,12)}-${changeSet}`,owner_timeout_30_to_180:'true'};
  return {event:{inputs},env:{GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',
    GITHUB_REPOSITORY_OWNER:'johnkim9524-collab',GITHUB_ACTOR:'johnkim9524-collab',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'456',
    GITHUB_REF:'refs/heads/main',GITHUB_SHA:sha,DEPLOY_MAIN_SHA:sha,STACK_NAME:inputs.stack_name,CHANGE_SET_NAME:changeSet,AUTHORIZATION_ID:inputs.authorization_id}};
};
const timeoutTemplates=()=>{
  const current=structuredClone(base);current.Resources.BrokerFunction=current.Resources.Fn;delete current.Resources.Fn;
  current.Resources.BrokerFunction.Properties.Timeout=30;
  const desired=structuredClone(current);desired.Resources.BrokerFunction.Properties.Timeout=180;
  desired.Resources.BrokerFunction.Properties.Code={ZipFile:'new'};
  return [current,desired];
};
test('exact Owner native context allows only bounded broker timeout scope without granting authority',()=>{
  const r=run(...timeoutTemplates(),ownerFlag,ownerContext());assert.equal(r.status,0,r.stderr);
  const receipt=JSON.parse(r.stdout);assert.equal(receipt.state,'VERIFIED_OWNER_ONLY_TIMEOUT_SCOPE');
  assert.equal(receipt.owner_timeout_transition,true);assert.equal(receipt.authority_granted,false);
});
for(const [field,value] of Object.entries({GITHUB_EVENT_NAME:'push',GITHUB_ACTOR:'other',GITHUB_RUN_ATTEMPT:'2',
  GITHUB_REF:'refs/heads/feature',GITHUB_REPOSITORY:'other/repo',DEPLOY_MAIN_SHA:'b'.repeat(40),AUTHORIZATION_ID:'AUTO-STAGING-BROKER',GITHUB_RUN_ID:'123'})){
  test(`Owner timeout opt-in rejects mismatched ${field}`,()=>{
    const ctx=ownerContext();ctx.env[field]=value;
    const r=run(...timeoutTemplates(),ownerFlag,ctx);assert.notEqual(r.status,0);assert.match(r.stderr,/STAGING_OWNER_TIMEOUT_CONTEXT_MISMATCH/);
  });
}
test('native event must contain the explicit opt-in and exact authorization tuple',()=>{
  for(const field of ['owner_timeout_30_to_180','main_sha','change_set_name','authorization_id','stack_name']){
    const ctx=ownerContext();ctx.event.inputs[field]='wrong';
    assert.notEqual(run(...timeoutTemplates(),ownerFlag,ctx).status,0,field);
  }
});
for(const [label,mutate] of [
  ['different starting timeout',(a,b)=>{a.Resources.BrokerFunction.Properties.Timeout=31;}],
  ['different target timeout',(a,b)=>{b.Resources.BrokerFunction.Properties.Timeout=181;}],
  ['another Lambda',(a,b)=>{a.Resources.Fn=a.Resources.BrokerFunction;b.Resources.Fn=b.Resources.BrokerFunction;delete a.Resources.BrokerFunction;delete b.Resources.BrokerFunction;}],
  ['runtime change',(a,b)=>{b.Resources.BrokerFunction.Properties.Runtime='nodejs22.x';}],
  ['IAM expansion',(a,b)=>{b.Resources.Role.Properties.Policies[0].PolicyDocument.Statement[0].Action.push('s3:DeleteObject');}],
  ['trust change',(a,b)=>{b.Resources.Role.Properties.AssumeRolePolicyDocument.Statement[0].Principal.Service='ec2.amazonaws.com';}],
  ['IAM reduction during Owner transition',(a,b)=>{b.Resources.Role.Properties.Policies[0].PolicyDocument.Statement[0].Action=['s3:GetObject'];}],
  ['Lambda resource attribute',(a,b)=>{b.Resources.BrokerFunction.DeletionPolicy='Retain';}],
  ['IAM role property',(a,b)=>{b.Resources.Role.Properties.PermissionsBoundary='arn:other';}],
  ['template parameter',(a,b)=>{b.Parameters={New:{Type:'String',Default:'changed'}};}],
  ['new resource',(a,b)=>{b.Resources.New={Type:'AWS::S3::Bucket',Properties:{}};}]
]){
  test(`Owner timeout opt-in rejects ${label}`,()=>{
    const [a,b]=timeoutTemplates();mutate(a,b);assert.notEqual(run(a,b,ownerFlag,ownerContext()).status,0);
  });
}
test('ordinary code-only updates resume after the timeout transition',()=>{
  const [,current]=timeoutTemplates();const desired=structuredClone(current);desired.Resources.BrokerFunction.Properties.Code={ZipFile:'later'};
  const r=run(current,desired,['--allow-lambda-code-change']);assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).owner_timeout_transition,false);
});
test('actual workflow derivation rejects newline environment injection before writing GITHUB_ENV',()=>{
  const workflow=fs.readFileSync('.github/workflows/kidults-autonomous-event-broker-deploy-v1.yml','utf8');
  const step=workflow.split('      - name: Derive exact bounded deployment inputs')[1].split('      - uses: actions/checkout')[0];
  const script=step.split('        run: |\n')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
  const ctx=ownerContext(),inputs=ctx.event.inputs;
  const inputEnv={INPUT_MAIN_SHA:inputs.main_sha,INPUT_STACK_NAME:inputs.stack_name,INPUT_CHANGE_SET_NAME:inputs.change_set_name,INPUT_AUTHORIZATION_ID:inputs.authorization_id};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'broker-inputs-'));const envPath=path.join(dir,'env');
  try{
    for(const field of Object.keys(inputEnv)) for(const newline of ['\n','\r\n']){
      fs.writeFileSync(envPath,'');
      const env={...process.env,...ctx.env,...inputEnv,GITHUB_ENV:envPath,[field]:inputEnv[field]+newline+'BASH_ENV=/untrusted'};
      const r=spawnSync('bash',['--noprofile','--norc','-c',script],{encoding:'utf8',env});
      assert.notEqual(r.status,0,field);assert.equal(fs.readFileSync(envPath,'utf8'),'');
    }
    const r=spawnSync('bash',['--noprofile','--norc','-c',script],{encoding:'utf8',env:{...process.env,...ctx.env,...inputEnv,GITHUB_ENV:envPath}});
    assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(envPath,'utf8').trim().split('\n').length,4);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual pre-mutation main guard denies drift or failed reads with zero mutation calls',()=>{
  const workflow=fs.readFileSync('.github/workflows/kidults-autonomous-event-broker-deploy-v1.yml','utf8');
  const guard=workflow.match(/          assert_current_main\(\) \{[\s\S]*?\n          \}/)[0].replace(/^          /gm,'');
  assert.match(workflow,/assert_current_main\n          aws cloudformation create-change-set/);
  assert.match(workflow,/assert_current_main\n            aws cloudformation execute-change-set/);
  const script=`set -euo pipefail\ncurl(){ if [ "$READ_FAIL" = true ]; then return 22; fi; printf '{"object":{"sha":"%s"}}' "$LIVE_MAIN"; }\n${guard}\nassert_current_main\nprintf CREATE\nassert_current_main\nprintf EXECUTE\n`;
  for(const [sha,failed,expected] of [['b'.repeat(40),'false',false],['a'.repeat(40),'true',false],['a'.repeat(40),'false',true]]){
    const r=spawnSync('bash',['--noprofile','--norc','-c',script],{encoding:'utf8',env:{...process.env,DEPLOY_MAIN_SHA:'a'.repeat(40),SOURCE_READ_TOKEN:'test',LIVE_MAIN:sha,READ_FAIL:failed}});
    if(expected){assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'CREATEEXECUTE');}
    else{assert.notEqual(r.status,0);assert.equal(r.stdout,'');}
  }
});
