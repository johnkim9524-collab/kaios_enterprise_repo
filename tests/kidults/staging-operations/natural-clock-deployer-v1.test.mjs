import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrap=JSON.parse(fs.readFileSync('infrastructure/aws/staging/natural-clock-deployer-bootstrap-v1.json','utf8'));
const workflow=fs.readFileSync('.github/workflows/kidults-natural-clock-deploy-v1.yml','utf8');
const clock=JSON.parse(fs.readFileSync('infrastructure/aws/staging/natural-clock-dispatcher-v1.json','utf8'));

test('bootstrap trust admits GitHub environment subject customization without crossing the exact environment prefix',()=>{
  const trust=bootstrap.Resources.DeployerRole.Properties.AssumeRolePolicyDocument.Statement[0];
  assert.deepEqual(trust.Principal.Federated,{Ref:'GitHubOidcProviderArn'});
  assert.equal(trust.Condition.StringEquals['token.actions.githubusercontent.com:aud'],'sts.amazonaws.com');
  assert.deepEqual(trust.Condition.StringLike['token.actions.githubusercontent.com:sub'],[
    {'Fn::Sub':'repo:${GitHubRepository}:environment:${GitHubEnvironment}'},
    {'Fn::Sub':'repo:${GitHubRepository}:environment:${GitHubEnvironment}:*'},
  ]);
  assert.equal(bootstrap.Parameters.WorkflowRef,undefined);
  const maxSessionDuration=bootstrap.Resources.DeployerRole.Properties.MaxSessionDuration;
  assert.ok(maxSessionDuration >= 3600 && maxSessionDuration <= 43200,`invalid IAM MaxSessionDuration: ${maxSessionDuration}`);
});

test('deployer is bounded to exact STAGING resources and cannot reach production',()=>{
  const source=JSON.stringify(bootstrap);
  for(const marker of ['kidults-natural-clock-staging-v1','kidults-natural-clock-dispatcher-staging-v1','kidults-natural-clock-ledger-staging-v1','KIDULTS-NATURAL-CLOCK-DEPLOYER']) assert.match(source,new RegExp(marker));
  assert.doesNotMatch(source,/\"Resource\":\"\*\"|production:[^H]|public:[^H]|g5:[^H]/i);
  for(const denied of ['organizations:','account:','iam:CreateUser','iam:CreateAccessKey']) assert.doesNotMatch(source,new RegExp(denied));
});

test('deployment auto-converges code-only exact-main updates while retaining Owner recovery and OIDC bounds',()=>{
  for(const marker of ["github.actor == github.repository_owner","github.sha == inputs.main_sha","id-token: write",'ScheduleState,ParameterValue=ENABLED','DEPLOY-STAGING-NATURAL-CLOCK-','AUTO-STAGING-NATURAL-CLOCK-','validate-staging-no-authority-expansion-v1.mjs','push:','negative_canary:\"PASS\"']) assert.ok(workflow.includes(marker),marker);
  assert.ok(!workflow.includes('workflow_run:'));
  assert.ok(!workflow.includes('pull_request:'));
  assert.ok(!workflow.includes('secrets.'));
});

test('managed natural-clock roles have stable bounded names',()=>{
  assert.equal(clock.Resources.DispatcherRole.Properties.RoleName,'kidults-natural-clock-dispatcher-staging-v1');
  assert.equal(clock.Resources.SchedulerRole.Properties.RoleName,'kidults-natural-clock-scheduler-staging-v1');
});
