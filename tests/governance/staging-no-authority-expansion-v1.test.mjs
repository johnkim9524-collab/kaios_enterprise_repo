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
const run = (current, desired, extra=[]) => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'staging-no-expand-'));
  const a=path.join(dir,'a.json'), b=path.join(dir,'b.json');
  fs.writeFileSync(a,JSON.stringify(current)); fs.writeFileSync(b,JSON.stringify(desired));
  const r=spawnSync(process.execPath,[validator,'--current',a,'--desired',b,...extra],{encoding:'utf8'});
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
