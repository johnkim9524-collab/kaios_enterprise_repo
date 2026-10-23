import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const template = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json', 'utf8'));

const expected = {
  TrackApprovalRole: {environment:'TrackEnvironment',workflowRefs:['TrackWorkflowRef']},
  KpmoApprovalRole: {environment:'KpmoEnvironment',workflowRefs:['KpmoWorkflowRef','TerminalRecoveryWorkflowRef']},
  VerifierApprovalRole: {environment:'VerifierEnvironment',workflowRefs:['VerifierWorkflowRef']},
};
const expectedSub = (environment, workflowRef) => ({
  'Fn::Sub': `repo:${'${GitHubRepository}'}:environment:${'${' + environment + '}'}:workflow_ref:${'${' + workflowRef + '}'}`,
});

test('autonomous approval roles retain exact environment and workflow-ref OIDC subjects', () => {
  for (const [logicalId, binding] of Object.entries(expected)) {
    const statement = template.Resources[logicalId].Properties.AssumeRolePolicyDocument.Statement[0];
    assert.equal(statement.Action, 'sts:AssumeRoleWithWebIdentity');
    assert.equal(statement.Condition.StringEquals['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
    const subjects = binding.workflowRefs.map(ref => expectedSub(binding.environment, ref));
    assert.deepEqual(statement.Condition.StringEquals['token.actions.githubusercontent.com:sub'], subjects.length === 1 ? subjects[0] : subjects);
  }
});

test('terminal recovery trust is limited to its exact protected-main workflow', () => {
  const parameter = template.Parameters.TerminalRecoveryWorkflowRef;
  const exactRef = 'johnkim9524-collab/kaios_enterprise_repo/.github/workflows/kpmo-continuous-assurance-terminal-recovery-v1.yml@refs/heads/main';
  assert.equal(parameter.Default, exactRef);
  assert.ok(new RegExp(parameter.AllowedPattern).test(exactRef));
});
test('autonomous approval environments and role names remain separation-of-duties distinct', () => {
  const environmentDefaults = ['TrackEnvironment', 'KpmoEnvironment', 'VerifierEnvironment']
    .map((name) => template.Parameters[name].Default);
  const roleNames = ['TrackApprovalRole', 'KpmoApprovalRole', 'VerifierApprovalRole']
    .map((name) => template.Resources[name].Properties.RoleName);
  assert.equal(new Set(environmentDefaults).size, 3);
  assert.equal(new Set(roleNames).size, 3);
});
