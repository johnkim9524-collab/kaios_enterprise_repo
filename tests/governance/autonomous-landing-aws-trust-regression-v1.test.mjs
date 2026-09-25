import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const template = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json', 'utf8'));

const expected = {
  TrackApprovalRole: ['TrackEnvironment', 'TrackWorkflowRef'],
  KpmoApprovalRole: ['KpmoEnvironment', 'KpmoWorkflowRef'],
  VerifierApprovalRole: ['VerifierEnvironment', 'VerifierWorkflowRef'],
};

test('autonomous approval roles retain exact environment and workflow-ref OIDC subjects', () => {
  for (const [logicalId, [environment, workflowRef]] of Object.entries(expected)) {
    const statement = template.Resources[logicalId].Properties.AssumeRolePolicyDocument.Statement[0];
    assert.equal(statement.Action, 'sts:AssumeRoleWithWebIdentity');
    assert.equal(statement.Condition.StringEquals['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
    assert.deepEqual(statement.Condition.StringEquals['token.actions.githubusercontent.com:sub'], {
      'Fn::Sub': `repo:${'${GitHubRepository}'}:environment:${'${' + environment + '}'}:workflow_ref:${'${' + workflowRef + '}'}`,
    });
  }
});

test('autonomous approval environments and role names remain separation-of-duties distinct', () => {
  const environmentDefaults = ['TrackEnvironment', 'KpmoEnvironment', 'VerifierEnvironment']
    .map((name) => template.Parameters[name].Default);
  const roleNames = ['TrackApprovalRole', 'KpmoApprovalRole', 'VerifierApprovalRole']
    .map((name) => template.Resources[name].Properties.RoleName);
  assert.equal(new Set(environmentDefaults).size, 3);
  assert.equal(new Set(roleNames).size, 3);
});
