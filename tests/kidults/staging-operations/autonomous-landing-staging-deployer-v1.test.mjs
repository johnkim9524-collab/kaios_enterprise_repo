import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

const bootstrap = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-landing-deployer-bootstrap-v1.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/kidults-autonomous-landing-staging-deploy-v1.yml', 'utf8');
const desired = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json', 'utf8'));
const validator = 'scripts/governance/validate-autonomous-landing-staging-deployment-v1.mjs';
const roleIds = ['TrackApprovalRole', 'KpmoApprovalRole', 'VerifierApprovalRole'];

const boundedQuery = {
  Effect: 'Allow',
  Action: ['dynamodb:Query'],
  Resource: {'Fn::GetAtt': ['AutonomousLandingLedger', 'Arn']},
  Condition: {'ForAllValues:StringLike': {'dynamodb:LeadingKeys': ['AUTH#*']}},
};
const stable = input => {
  if (Array.isArray(input)) return input.map(stable);
  if (input && typeof input === 'object') return Object.fromEntries(Object.keys(input).sort().map(key => [key, stable(input[key])]));
  return input;
};
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const currentTemplate = () => {
  const current = structuredClone(desired);
  for (const roleId of roleIds) {
    const statements = current.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement;
    current.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement = statements.filter(statement => !same(statement, boundedQuery));
  }
  return current;
};
const withFixture = (files, callback) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-autonomous-landing-deployer-'));
  try {
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), `${JSON.stringify(body)}\n`);
    callback(directory);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
};

test('bootstrap trust is exact workflow/environment and permissions are bounded to three STAGING roles', () => {
  const trust = bootstrap.Resources.DeployerRole.Properties.AssumeRolePolicyDocument.Statement[0];
  assert.equal(trust.Condition.StringEquals['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
  assert.deepEqual(trust.Condition.StringEquals['token.actions.githubusercontent.com:sub'], {
    'Fn::Sub': 'repo:${GitHubRepository}:environment:${GitHubEnvironment}:workflow_ref:${WorkflowRef}',
  });
  const source = JSON.stringify(bootstrap);
  assert.doesNotMatch(source, /"Resource":"\*"/);
  assert.doesNotMatch(source, /iam:(CreateRole|DeleteRole|CreateUser|CreateAccessKey|UpdateAssumeRolePolicy|DeleteRolePolicy)/);
  assert.match(source, /kidults-autonomous-track-staging-role/);
  assert.match(source, /kidults-autonomous-kpmo-staging-role/);
  assert.match(source, /kidults-autonomous-verifier-staging-role/);
  assert.doesNotMatch(source, /kidults-autonomous-finalizer-staging-role/);
});

test('deployment workflow is owner/exact-main/manual/OIDC bound and does not expose a generic command surface', () => {
  for (const marker of [
    "github.ref == 'refs/heads/main'",
    'github.actor == github.repository_owner',
    'github.sha == inputs.main_sha',
    'id-token: write',
    'inputs.template_sha256',
    'DEPLOY-STAGING-AUTONOMOUS-LANDING-',
    'validate-autonomous-landing-staging-deployment-v1.mjs',
    '--query TemplateBody --output json',
  ]) assert.ok(workflow.includes(marker), marker);
  assert.doesNotMatch(workflow, /aws cloudformation get-template --stack-name \\\"\\$STACK_NAME\\\" --template-stage Original --query TemplateBody --output json > \\\"\\$RUNNER_TEMP\\\/current-template\\.json\\\"/);
  assert.ok(!workflow.includes('workflow_run:'));
  assert.ok(!workflow.includes('pull_request:'));
  assert.ok(!workflow.includes('secrets.'));
  assert.ok(!/inputs\.(command|script|stack_name|role_arn)/.test(workflow));
});

test('template validator accepts only the exact three-role Query delta and exact change set', () => {
  const changeSet = {
    Status: 'CREATE_COMPLETE',
    Changes: roleIds.map(LogicalResourceId => ({ResourceChange: {
      Action: 'Modify', LogicalResourceId, ResourceType: 'AWS::IAM::Role', Replacement: 'False',
      Details: [{Target: {Attribute: 'Properties', Name: 'Policies'}, ChangeSource: 'DirectModification'}],
    }})),
  };
  withFixture({current: currentTemplate(), desired, changeset: changeSet}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
      '--changeset', path.join(directory, 'changeset'),
    ], {encoding: 'utf8'});
    assert.equal(JSON.parse(output).mode, 'CHANGE_REQUIRED');
  });
});


test('template validator accepts rollback state with legacy Verifier DescribeTable plus Query', () => {
  const current = structuredClone(desired);
  const statements = current.Resources.VerifierApprovalRole.Properties.Policies[0].PolicyDocument.Statement;
  const query = statements.find(statement => same(statement, boundedQuery));
  query.Action = ['dynamodb:DescribeTable', 'dynamodb:Query'];
  const changeSet = {
    Status: 'CREATE_COMPLETE',
    Changes: [{ResourceChange: {
      Action: 'Modify', LogicalResourceId: 'VerifierApprovalRole', ResourceType: 'AWS::IAM::Role', Replacement: 'False',
      Details: [{Target: {Attribute: 'Properties', Name: 'Policies'}, ChangeSource: 'DirectModification'}],
    }}],
  };
  withFixture({current, desired, changeset: changeSet}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
      '--changeset', path.join(directory, 'changeset'),
    ], {encoding: 'utf8'});
    assert.equal(JSON.parse(output).mode, 'CHANGE_REQUIRED');
  });
});

test('template validator rejects unrelated resource mutation and extra change-set resources', () => {
  const current = currentTemplate();
  current.Resources.AutonomousLandingLedger.Properties.BillingMode = 'PROVISIONED';
  withFixture({current, desired}, directory => {
    const result = spawnSync('node', [validator,
      '--current', path.join(directory, 'current'), '--desired', path.join(directory, 'desired'),
    ], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TEMPLATE_DELTA_EXCEEDS_BOUNDED_LEDGER_QUERY_OR_LEGACY_VERIFIER_READ/);
  });
});

test('template validator recognizes an already applied exact template without creating another change set', () => {
  withFixture({current: desired, desired}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'), '--desired', path.join(directory, 'desired'),
    ], {encoding: 'utf8'});
    assert.equal(JSON.parse(output).mode, 'ALREADY_APPLIED');
  });
});
