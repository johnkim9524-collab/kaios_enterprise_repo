import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

const bootstrap = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-landing-deployer-bootstrap-v1.json', 'utf8'));
const approvalManifest = JSON.parse(fs.readFileSync('coordination/kidults/governance/approval-policy-file-manifest-v1.json', 'utf8'));
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
  const kmsRead = bootstrap.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement.find(
    statement => Array.isArray(statement.Action) && statement.Action.includes('kms:DescribeKey'),
  );
  assert.deepEqual(kmsRead?.Action, ['kms:DescribeKey']);
  assert.deepEqual(kmsRead?.Resource, [
    'arn:aws:kms:ap-northeast-2:528314240275:key/03d855ac-8e8c-4465-9984-bbf92987c6a0',
    'arn:aws:kms:ap-northeast-2:528314240275:key/088c00e6-bfc3-4aea-8dbf-b9e98ac2e8c7',
    'arn:aws:kms:ap-northeast-2:528314240275:key/c51e64be-54a8-4e7b-b16c-8e2b349902ec',
    'arn:aws:kms:ap-northeast-2:528314240275:key/887d2856-30c8-4a7f-8d85-c0b6e4978cc0',
    'arn:aws:kms:ap-northeast-2:528314240275:key/609e9ec0-3c22-40a0-b728-90fdf0756d3e',
    'arn:aws:kms:ap-northeast-2:528314240275:key/7aea838e-972e-468b-b0a7-001f6549e61c',
  ]);
  const auxiliaryRoleRead = bootstrap.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement.find(
    statement => Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'iam:GetRole',
  );
  assert.deepEqual(auxiliaryRoleRead?.Resource, [
    'arn:aws:iam::528314240275:role/kidults-autonomous-finalizer-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-ledger-writer-staging-role',
  ]);
  assert.doesNotMatch(JSON.stringify(auxiliaryRoleRead), /iam:PutRolePolicy/);
  const deployerSelfRead = bootstrap.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement.find(
    statement => Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'iam:GetRolePolicy'
      && statement.Resource === 'arn:aws:iam::528314240275:role/kidults-autonomous-landing-deployer-staging-v1',
  );
  assert.ok(deployerSelfRead);

  assert.match(source, /kidults-autonomous-track-staging-role/);
  assert.match(source, /kidults-autonomous-kpmo-staging-role/);
  assert.match(source, /kidults-autonomous-verifier-staging-role/);
  const approvalWrite = bootstrap.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement.find(
    statement => Array.isArray(statement.Action) && statement.Action.includes('iam:PutRolePolicy'),
  );
  assert.deepEqual(approvalWrite?.Resource, [
    'arn:aws:iam::528314240275:role/kidults-autonomous-track-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-kpmo-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-verifier-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-ledger-writer-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-finalizer-staging-role',
  ]);
});

test('all approval roles carry one exact ledger-key decrypt and no KMS decrypt wildcard', () => {
  for (const roleId of roleIds) {
    const statements = desired.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement;
    const decrypts = statements.filter(statement =>
      (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('kms:Decrypt'));
    assert.equal(decrypts.length, 1);
    assert.deepEqual(decrypts[0].Resource, {'Fn::GetAtt': ['AutonomousLedgerKey', 'Arn']});
  }
});

test('finalizer carries one exact ledger-key decrypt without widening existing receipt-key decrypt', () => {
  const statements = desired.Resources.FinalizerRole.Properties.Policies[0].PolicyDocument.Statement;
  const ledgerDecrypts = statements.filter(statement =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('kms:Decrypt')
    && same(statement.Resource, {'Fn::GetAtt': ['AutonomousLedgerKey', 'Arn']}));
  assert.equal(ledgerDecrypts.length, 1);
  const kmsResources = statements
    .filter(statement => (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('kms:Decrypt'))
    .map(statement => statement.Resource);
  assert.ok(kmsResources.every(resource => same(resource, {'Fn::GetAtt': ['AutonomousLedgerKey', 'Arn']})
    || same(resource, {'Fn::GetAtt': ['AutonomousReceiptKey', 'Arn']})));
});

test('ledger writer has only exact ledger-key Decrypt plus signing-key Verify as KMS actions', () => {
  const statements = desired.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement;
  const decrypts = statements.filter(statement =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('kms:Decrypt'));
  assert.equal(decrypts.length, 1);
  const kmsActions = statements.flatMap(statement =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).filter(Boolean).filter(action => action.startsWith('kms:')));
  assert.deepEqual(kmsActions.sort(), ['kms:Decrypt','kms:Verify'].sort());
});

test('manifest binds bootstrap and bounded STAGING validator as execution authorization controls', () => {
  const byPath = new Map(approvalManifest.files.map(file => [file.path, file]));
  for (const control of [
    'infrastructure/aws/staging/autonomous-landing-deployer-bootstrap-v1.json',
    'scripts/governance/validate-autonomous-landing-staging-deployment-v1.mjs',
  ]) {
    assert.equal(byPath.get(control)?.classification, 'EXECUTION_AUTHORIZATION_CONTROL');
    assert.ok(byPath.get(control)?.authorization_routing);
  }
});

test('deployment workflow auto-converges bounded STAGING deltas while preserving Owner recovery and OIDC bounds', () => {
  for (const marker of [
    "github.ref == 'refs/heads/main'",
    'github.actor == github.repository_owner',
    'github.sha == inputs.main_sha',
    'id-token: write',
    'inputs.template_sha256',
    'DEPLOY-STAGING-AUTONOMOUS-LANDING-',
    'validate-autonomous-landing-staging-deployment-v1.mjs',
    '--query TemplateBody --output json',
    'cloudformation describe-stack-events',
    'cloudformation-stack-events-failure.json',
    'kms:Decrypt',
    '03d855ac-8e8c-4465-9984-bbf92987c6a0',
    '088c00e6-bfc3-4aea-8dbf-b9e98ac2e8c7',
    'Verify governed deployer bootstrap prerequisite',
    'kidults-autonomous-landing-deployer-staging-v1',
    'kidults-autonomous-finalizer-staging-role',
    'finalizer_allowed_kms_action',
    'desired-template.compact.json',
    'if: always()',
    'push:',
    'schedule:',
    "cron: '17,47 * * * *'",
    'AUTO-STAGING-AUTONOMOUS-LANDING-',
  ]) assert.ok(workflow.includes(marker), marker);
  assert.ok(workflow.indexOf('uses: actions/checkout@') < workflow.indexOf('actual_template_sha=$(sha256sum'), 'checkout must precede template hashing');
  assert.match(workflow,/github\.event_name == 'schedule'/);
  assert.match(workflow,/\[ "\$GITHUB_EVENT_NAME" = push \] \|\| \[ "\$GITHUB_EVENT_NAME" = schedule \]/);
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


test('template validator accepts deployed Query state that still lacks bounded ledger decrypt', () => {
  const current = structuredClone(desired);
  for (const logicalId of roleIds) {
    current.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement =
      current.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement.filter(
        statement => !(Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'kms:Decrypt'),
      );
  }
  withFixture({current, desired}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
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

test('template validator accepts exact CloudFormation dynamic dependency fanout for writer policy change', () => {
  const current = structuredClone(desired);
  current.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement =
    current.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement.filter(
      statement => !(Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'kms:Decrypt'),
    );
  const dynamic = (LogicalResourceId, ResourceType, Name, CausingEntity) => ({ResourceChange: {
    Action: 'Modify', LogicalResourceId, ResourceType, Replacement: 'False',
    Details: [{Target: {Attribute: 'Properties', Name}, Evaluation: 'Dynamic',
      ChangeSource: 'ResourceAttribute', CausingEntity}],
  }});
  const changeSet = {
    Status: 'CREATE_COMPLETE',
    Changes: [
      dynamic('AutonomousLedgerWriterFunction', 'AWS::Lambda::Function', 'Role', 'AutonomousLedgerWriterRole.Arn'),
      {ResourceChange: {
        Action: 'Modify', LogicalResourceId: 'AutonomousLedgerWriterRole', ResourceType: 'AWS::IAM::Role', Replacement: 'False',
        Details: [{Target: {Attribute: 'Properties', Name: 'Policies'}, Evaluation: 'Static', ChangeSource: 'DirectModification'}],
      }},
      dynamic('FinalizerRole', 'AWS::IAM::Role', 'Policies', 'AutonomousLedgerWriterFunction.Arn'),
      ...roleIds.map(logicalId => dynamic(logicalId, 'AWS::IAM::Role', 'Policies', 'AutonomousLedgerWriterFunction.Arn')),
    ],
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

test('template validator rejects unrecognized dynamic dependency fanout', () => {
  const current = structuredClone(desired);
  current.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement =
    current.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement.filter(
      statement => !(Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'kms:Decrypt'),
    );
  const changeSet = {
    Status: 'CREATE_COMPLETE',
    Changes: [
      {ResourceChange: {
        Action: 'Modify', LogicalResourceId: 'AutonomousLedgerWriterRole', ResourceType: 'AWS::IAM::Role', Replacement: 'False',
        Details: [{Target: {Attribute: 'Properties', Name: 'Policies'}, ChangeSource: 'DirectModification'}],
      }},
      {ResourceChange: {
        Action: 'Modify', LogicalResourceId: 'AutonomousLedgerWriterFunction', ResourceType: 'AWS::Lambda::Function', Replacement: 'False',
        Details: [{Target: {Attribute: 'Properties', Name: 'Environment'}, Evaluation: 'Dynamic',
          ChangeSource: 'ResourceAttribute', CausingEntity: 'AutonomousLedgerWriterRole.Arn'}],
      }},
    ],
  };
  withFixture({current, desired, changeset: changeSet}, directory => {
    const result = spawnSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
      '--changeset', path.join(directory, 'changeset'),
    ], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CHANGE_SET_DYNAMIC_PROPERTY_INVALID/);
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
    assert.match(result.stderr, /TEMPLATE_DELTA_EXCEEDS_BOUNDED_LEDGER_READ_OR_LEGACY_VERIFIER_READ/);
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
