import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'infrastructure/aws/staging/autonomous-internal-landing-v1.json';
const template = JSON.parse(fs.readFileSync(file, 'utf8'));
const oidc = JSON.parse(fs.readFileSync('coordination/kidults/governance/github-oidc-subject-customization-v1.json','utf8'));
const resources = template.Resources;
const table = resources.AutonomousLandingLedger.Properties;
const ledgerKey = resources.AutonomousLedgerKey.Properties;
const writerRole = resources.AutonomousLedgerWriterRole.Properties;
const writerFunction = resources.AutonomousLedgerWriterFunction.Properties;
const runner = fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');

const approvals = [
  ['Track','TrackEnvironment','TrackWorkflowRef','kidults-autonomous-track-staging-role','TrackApprovalSigningKey','kidults-autonomous-track-authorization-v1.yml','kidults.track.authorization.v1'],
  ['Kpmo','KpmoEnvironment','KpmoWorkflowRef','kidults-autonomous-kpmo-staging-role','KpmoApprovalSigningKey','kidults-autonomous-kpmo-authorization-v1.yml','kidults.kpmo.authorization.v1'],
  ['Verifier','VerifierEnvironment','VerifierWorkflowRef','kidults-autonomous-verifier-staging-role','VerifierApprovalSigningKey','kidults-autonomous-independent-verification-authorization-v1.yml','kidults.independent.verification.v1'],
];

assert.equal(table.TableName, 'kidults-autonomous-landing-staging-ledger');
assert.equal(table.BillingMode, 'PAY_PER_REQUEST');
assert.equal(table.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, true);
assert.equal(table.SSESpecification.SSEType, 'KMS');
assert.equal(ledgerKey.EnableKeyRotation, true);
assert.equal(template.Parameters.FinalizerEnvironment.Default, 'KIDULTS-AUTONOMOUS-FINALIZER');
const workflowRefPattern = '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/\\.github/workflows/[A-Za-z0-9_.-]+\\.ya?ml@refs/heads/main$';
for (const parameter of ['TrackWorkflowRef','KpmoWorkflowRef','VerifierWorkflowRef']) {
  assert.equal(template.Parameters[parameter].AllowedPattern, workflowRefPattern);
  assert.match(template.Parameters[parameter].Default, new RegExp(workflowRefPattern));
}
assert.equal(oidc.state, 'OWNER_GATE_REQUIRED');
assert.deepEqual(oidc.desired.include_claim_keys, ['repo','context','workflow_ref']);
assert.equal(oidc.aws_contract.custom_claim_condition_keys_forbidden, true);
assert.equal(fs.existsSync('.github/workflows/kidults-autonomous-internal-landing-v1.yml'), false);

const expectedSub = (environmentRef, workflowRef) => ({
  'Fn::Sub': `repo:${'${GitHubRepository}'}:environment:${'${' + environmentRef + '}'}:workflow_ref:${'${' + workflowRef + '}'}`,
});
const assertTrust = (role, environmentRef, workflowRef) => {
  const statement = role.AssumeRolePolicyDocument.Statement[0];
  const condition = statement.Condition.StringEquals;
  assert.equal(statement.Action, 'sts:AssumeRoleWithWebIdentity');
  assert.deepEqual(Object.keys(condition).sort(), ['token.actions.githubusercontent.com:aud','token.actions.githubusercontent.com:sub']);
  assert.equal(condition['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
  assert.deepEqual(condition['token.actions.githubusercontent.com:sub'], expectedSub(environmentRef, workflowRef));
};

const finalizerSubs = [];
for (const [prefix, environmentParameter, workflowParameter, roleName, signingKeyResource, workflowFile, eventName] of approvals) {
  const role = resources[`${prefix}ApprovalRole`].Properties;
  assert.equal(role.RoleName, roleName);
  assertTrust(role, environmentParameter, workflowParameter);
  const workflowPath = `.github/workflows/${workflowFile}`;
  const workflow = fs.readFileSync(workflowPath,'utf8');
  assert.match(workflow, new RegExp(`^name:`, 'm'));
  assert.ok(workflow.includes(`      - ${eventName}`));
  for (const other of approvals.map(value=>value[6]).filter(value=>value!==eventName)) assert.equal(workflow.includes(`      - ${other}`), false);
  assert.ok(workflow.includes(`environment: ${template.Parameters[environmentParameter].Default}`));
  assert.ok(workflow.includes('environment: KIDULTS-AUTONOMOUS-FINALIZER'));
  const approvalSection = workflow.split('  finalize-if-quorum:')[0];
  assert.match(approvalSection, /contents: read/);
  assert.doesNotMatch(approvalSection, /contents: write/);
  assert.match(workflow.split('  finalize-if-quorum:')[1], /contents: write/);
  const expectedRef = `johnkim9524-collab/kaios_enterprise_repo/.github/workflows/${workflowFile}@refs/heads/main`;
  assert.equal(template.Parameters[workflowParameter].Default, expectedRef);
  finalizerSubs.push({'Fn::Sub':`repo:${'${GitHubRepository}'}:environment:${'${FinalizerEnvironment}'}:workflow_ref:${'${' + workflowParameter + '}'}`});
  const actions = role.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
  assert.equal(actions.some(action => action.startsWith('dynamodb:')), false);
  assert.ok(actions.includes('lambda:InvokeFunction'));
  assert.ok(actions.includes('kms:Sign'));
  const sign = role.Policies[0].PolicyDocument.Statement.find(value => (value.Action || []).includes('kms:Sign'));
  assert.deepEqual(sign.Resource, {'Fn::GetAtt':[signingKeyResource,'Arn']});
}

const finalizer = resources.FinalizerRole.Properties;
const finalizerCondition = finalizer.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals;
assert.deepEqual(Object.keys(finalizerCondition).sort(), ['token.actions.githubusercontent.com:aud','token.actions.githubusercontent.com:sub']);
assert.equal(finalizerCondition['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
assert.deepEqual(finalizerCondition['token.actions.githubusercontent.com:sub'], finalizerSubs);
const finalizerActions = finalizer.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
for (const action of ['dynamodb:DescribeTable','dynamodb:GetItem','dynamodb:Query','lambda:InvokeFunction','kms:Sign']) assert.ok(finalizerActions.includes(action));
assert.equal(finalizerActions.includes('dynamodb:PutItem'), false);
assert.equal(finalizerActions.includes('dynamodb:UpdateItem'), false);

const writerActions = writerRole.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
for (const action of ['dynamodb:PutItem','dynamodb:UpdateItem','kms:Verify']) assert.ok(writerActions.includes(action));
assert.equal(writerActions.includes('kms:Sign'), false);
assert.equal(writerFunction.Runtime, 'python3.12');
const code = writerFunction.Code.ZipFile;
for (const marker of ['CREATE_APPROVAL','CREATE_RESERVATION','CONSUME_RESERVATION','verify_approval_signature','verify_finalizer_signature','FINALIZER_SIGNATURE_INVALID','APPROVAL_SIGNATURE_INVALID']) assert.ok(code.includes(marker), marker);

for (const marker of ['AUTONOMOUS_CALLER_WORKLOAD_FORBIDDEN','AUTONOMOUS_FINALIZER_ENVIRONMENT_MISMATCH',"mode === 'APPROVAL'","mode === 'FINALIZE'",'invokeFinalizerWriter','KIDULTS_AUTONOMOUS_WORKFLOW_REF']) assert.ok(runner.includes(marker), marker);
assert.equal(runner.includes("dynamodb','put-item"), false);
assert.equal(runner.includes("dynamodb','update-item"), false);

console.log(JSON.stringify({state:'VERIFIED_PASS',template:file,identity_model:'ROLE_SCOPED_CUSTOM_SUB_KMS_WORKLOAD_V3',approval_workloads:3,finalizer_workloads:1,aws_condition_keys:['aud','sub'],github_oidc_subject_customization:'OWNER_GATE_REQUIRED',production:'HOLD',public:'HOLD',g5:'HOLD'}));
