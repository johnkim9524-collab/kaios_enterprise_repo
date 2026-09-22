import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const template = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
const workflow = fs.readFileSync('.github/workflows/kidults-autonomous-internal-landing-v1.yml','utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');

const approvals = [
  ['Track','TrackEnvironment','TrackApprovalSigningKey'],
  ['Kpmo','KpmoEnvironment','KpmoApprovalSigningKey'],
  ['Verifier','VerifierEnvironment','VerifierApprovalSigningKey'],
];

test('approval OIDC roles are role-scoped and cannot read or write the ledger directly', () => {
  for (const [prefix, environmentParameter, signingKey] of approvals) {
    const role = template.Resources[`${prefix}ApprovalRole`].Properties;
    const condition = role.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals;
    assert.deepEqual(condition['token.actions.githubusercontent.com:repository_id'], {Ref:'GitHubRepositoryId'});
    assert.deepEqual(condition['token.actions.githubusercontent.com:workflow'], {Ref:'GitHubWorkflowName'});
    assert.equal(condition['token.actions.githubusercontent.com:ref'], 'refs/heads/main');
    assert.deepEqual(condition['token.actions.githubusercontent.com:environment'], {Ref:environmentParameter});
    const actions = role.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
    assert.equal(actions.some(action => action.startsWith('dynamodb:')), false);
    assert.ok(actions.includes('lambda:InvokeFunction'));
    assert.ok(actions.includes('kms:Sign'));
    const sign = role.Policies[0].PolicyDocument.Statement.find(value => (value.Action || []).includes('kms:Sign'));
    assert.deepEqual(sign.Resource, {'Fn::GetAtt':[signingKey,'Arn']});
  }
});

test('finalizer OIDC role alone has readback plus finalizer signing authority, not direct ledger writes', () => {
  const role = template.Resources.FinalizerRole.Properties;
  const condition = role.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals;
  assert.deepEqual(condition['token.actions.githubusercontent.com:environment'], {Ref:'FinalizerEnvironment'});
  const actions = role.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
  for (const action of ['dynamodb:Query','lambda:InvokeFunction','kms:Sign']) assert.ok(actions.includes(action));
  assert.equal(actions.includes('dynamodb:PutItem'), false);
  assert.equal(actions.includes('dynamodb:UpdateItem'), false);
});

test('writer requires role KMS signatures for approvals and finalizer KMS signatures for reservation lifecycle', () => {
  const writer = template.Resources.AutonomousLedgerWriterFunction.Properties;
  const code = writer.Code.ZipFile;
  for (const marker of [
    'ROLE_WORKLOAD_IDS','verify_approval_signature','verify_finalizer_signature',
    'FINALIZER_SIGNING_KEY_MISMATCH','FINALIZER_ENVIRONMENT_MISMATCH','FINALIZER_WORKLOAD_ID_MISMATCH','FINALIZER_SIGNATURE_INVALID',
    'APPROVAL_SIGNATURE_INVALID','CREATE_RESERVATION','CONSUME_RESERVATION',
  ]) assert.match(code, new RegExp(marker));
  const writerActions = template.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
  assert.ok(writerActions.includes('kms:Verify'));
  assert.equal(writerActions.includes('kms:Sign'), false);
});

test('workflow separates approval GitHub read authority from finalizer write authority', () => {
  assert.match(workflow, /record-role-approval:/);
  assert.match(workflow, /finalize-if-quorum:/);
  assert.match(workflow, /KIDULTS_AUTONOMOUS_MODE: APPROVAL/);
  assert.match(workflow, /KIDULTS_AUTONOMOUS_MODE: FINALIZE/);
  assert.match(workflow, /environment: KIDULTS-AUTONOMOUS-FINALIZER/);
  const approvalSection = workflow.split('  finalize-if-quorum:')[0];
  assert.match(approvalSection, /contents: read/);
  assert.doesNotMatch(approvalSection, /contents: write/);
  const finalizerSection = workflow.split('  finalize-if-quorum:')[1];
  assert.match(finalizerSection, /contents: write/);
});

test('runner rejects caller-supplied identity and uses runtime workload identity', () => {
  assert.match(runner, /AUTONOMOUS_CALLER_WORKLOAD_FORBIDDEN/);
  assert.match(runner, /KIDULTS_AUTONOMOUS_WORKFLOW_REF/);
  assert.match(runner, /KIDULTS_AUTONOMOUS_REPOSITORY_ID/);
  assert.match(runner, /invokeFinalizerWriter/);
  assert.equal(runner.includes('AUTONOMOUS_EVENT_SENDER_ID_MISMATCH'), false);
  assert.equal(runner.includes("dynamodb','put-item"), false);
  assert.equal(runner.includes("dynamodb','update-item"), false);
});
