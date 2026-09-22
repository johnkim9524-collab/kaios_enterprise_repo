import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'infrastructure/aws/staging/autonomous-internal-landing-v1.json';
const template = JSON.parse(fs.readFileSync(file, 'utf8'));
const resources = template.Resources;
const table = resources.AutonomousLandingLedger.Properties;
const ledgerKey = resources.AutonomousLedgerKey.Properties;
const writerRole = resources.AutonomousLedgerWriterRole.Properties;
const writerFunction = resources.AutonomousLedgerWriterFunction.Properties;
const workflow = fs.readFileSync('.github/workflows/kidults-autonomous-internal-landing-v1.yml','utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');

const approvals = [
  ['Track','TrackEnvironment','kidults-autonomous-track-staging-role','TrackApprovalSigningKey','TrackWorkloadId'],
  ['Kpmo','KpmoEnvironment','kidults-autonomous-kpmo-staging-role','KpmoApprovalSigningKey','KpmoWorkloadId'],
  ['Verifier','VerifierEnvironment','kidults-autonomous-verifier-staging-role','VerifierApprovalSigningKey','VerifierWorkloadId'],
];

assert.equal(table.TableName, 'kidults-autonomous-landing-staging-ledger');
assert.equal(table.BillingMode, 'PAY_PER_REQUEST');
assert.equal(table.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, true);
assert.equal(table.SSESpecification.SSEType, 'KMS');
assert.equal(ledgerKey.EnableKeyRotation, true);
assert.equal(template.Parameters.GitHubRepositoryId.Default, '1281328888');
assert.equal(template.Parameters.GitHubWorkflowName.Default, 'KIDULTS Autonomous Internal Landing V1');
assert.equal(template.Parameters.FinalizerEnvironment.Default, 'KIDULTS-AUTONOMOUS-FINALIZER');

const assertTrust = (role, environmentRef) => {
  const statement = role.AssumeRolePolicyDocument.Statement[0];
  const condition = statement.Condition.StringEquals;
  assert.equal(statement.Action, 'sts:AssumeRoleWithWebIdentity');
  assert.equal(condition['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
  assert.deepEqual(condition['token.actions.githubusercontent.com:sub'], {
    'Fn::Sub': 'repo:${GitHubRepository}:environment:${' + environmentRef + '}',
  });
  assert.deepEqual(condition['token.actions.githubusercontent.com:repository_id'], {Ref:'GitHubRepositoryId'});
  assert.deepEqual(condition['token.actions.githubusercontent.com:workflow'], {Ref:'GitHubWorkflowName'});
  assert.equal(condition['token.actions.githubusercontent.com:ref'], 'refs/heads/main');
  assert.deepEqual(condition['token.actions.githubusercontent.com:environment'], {Ref:environmentRef});
};

for (const [prefix, environmentParameter, roleName, signingKeyResource] of approvals) {
  const role = resources[`${prefix}ApprovalRole`].Properties;
  assert.equal(role.RoleName, roleName);
  assertTrust(role, environmentParameter);
  const actions = role.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
  assert.equal(actions.some(action => action.startsWith('dynamodb:')), false);
  assert.equal(actions.includes('lambda:InvokeFunction'), true);
  assert.equal(actions.includes('kms:Sign'), true);
  const sign = role.Policies[0].PolicyDocument.Statement.find(value => (value.Action || []).includes('kms:Sign'));
  assert.deepEqual(sign.Resource, {'Fn::GetAtt':[signingKeyResource,'Arn']});
  const key = resources[signingKeyResource].Properties;
  assert.equal(key.KeySpec, 'ECC_NIST_P256');
  assert.equal(key.KeyUsage, 'SIGN_VERIFY');
}

const finalizer = resources.FinalizerRole.Properties;
assert.equal(finalizer.RoleName, 'kidults-autonomous-finalizer-staging-role');
assertTrust(finalizer, 'FinalizerEnvironment');
const finalizerActions = finalizer.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
for (const action of ['dynamodb:DescribeTable','dynamodb:GetItem','dynamodb:Query','lambda:InvokeFunction','kms:Sign']) assert.ok(finalizerActions.includes(action));
assert.equal(finalizerActions.includes('dynamodb:PutItem'), false);
assert.equal(finalizerActions.includes('dynamodb:UpdateItem'), false);
assert.equal(resources.FinalizerSigningKey.Properties.KeySpec, 'ECC_NIST_P256');
assert.equal(resources.FinalizerSigningKey.Properties.KeyUsage, 'SIGN_VERIFY');

const writerActions = writerRole.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
assert.ok(writerActions.includes('dynamodb:PutItem'));
assert.ok(writerActions.includes('dynamodb:UpdateItem'));
assert.ok(writerActions.includes('kms:Verify'));
assert.equal(writerActions.includes('kms:Sign'), false);

assert.equal(writerFunction.Runtime, 'python3.12');
assert.deepEqual(writerFunction.Environment.Variables.LEDGER_TABLE, {Ref:'AutonomousLandingLedger'});
for (const variable of [
  'TRACK_SIGNING_KEY_ARN','KPMO_SIGNING_KEY_ARN','VERIFIER_SIGNING_KEY_ARN','FINALIZER_SIGNING_KEY_ARN',
  'TRACK_ENVIRONMENT','KPMO_ENVIRONMENT','VERIFIER_ENVIRONMENT','FINALIZER_ENVIRONMENT',
  'TRACK_WORKLOAD_ID','KPMO_WORKLOAD_ID','VERIFIER_WORKLOAD_ID','FINALIZER_WORKLOAD_ID',
]) assert.ok(writerFunction.Environment.Variables[variable], variable);

const code = writerFunction.Code.ZipFile;
for (const marker of [
  'CREATE_APPROVAL','CREATE_RESERVATION','CONSUME_RESERVATION',
  'ROLE_KEYS','ROLE_WORKLOAD_IDS','FINALIZER_SIGNING_KEY','verify_finalizer_signature',
  'SIGNING_KEY_ROLE_MISMATCH','WORKLOAD_SIGNING_KEY_MISMATCH','WORKLOAD_ENVIRONMENT_MISMATCH','WORKLOAD_ID_MISMATCH',
  'FINALIZER_SIGNING_KEY_MISMATCH','FINALIZER_ENVIRONMENT_MISMATCH','FINALIZER_WORKLOAD_ID_MISMATCH','FINALIZER_SIGNATURE_INVALID',
  "ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)'",
  "ConditionExpression='#s = :reserved AND run_id = :run AND head_sha = :head'",
]) assert.ok(code.includes(marker), marker);

for (const marker of [
  'record-role-approval:','finalize-if-quorum:','KIDULTS-AUTONOMOUS-FINALIZER',
  'KIDULTS_AUTONOMOUS_MODE: APPROVAL','KIDULTS_AUTONOMOUS_MODE: FINALIZE',
  'KIDULTS_AUTONOMOUS_WORKLOAD_ROLE_ARN','KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN',
  'KIDULTS_AUTONOMOUS_WORKLOAD_ID','KIDULTS_AUTONOMOUS_WORKLOAD_REGISTRY_JSON',
  'Verify exact workload checkout','Verify exact finalizer checkout',
]) assert.ok(workflow.includes(marker), marker);
assert.equal(workflow.includes('KIDULTS_AUTONOMOUS_ACTOR_REGISTRY_JSON'), false);

for (const marker of [
  'AUTONOMOUS_CALLER_WORKLOAD_FORBIDDEN','AUTONOMOUS_FINALIZER_ENVIRONMENT_MISMATCH',
  "mode === 'APPROVAL'","mode === 'FINALIZE'",'invokeFinalizerWriter',
  'KIDULTS_AUTONOMOUS_WORKFLOW_REF','KIDULTS_AUTONOMOUS_REPOSITORY_ID',
]) assert.ok(runner.includes(marker), marker);
assert.equal(runner.includes("dynamodb','put-item"), false);
assert.equal(runner.includes("dynamodb','update-item"), false);
assert.ok(runner.indexOf('await validateLiveCandidate();') < runner.indexOf('putApproval();'));

for (const resource of Object.values(resources)) {
  const tags = resource.Properties?.Tags ?? [];
  if (!tags.length) continue;
  const values = Object.fromEntries(tags.map(({Key,Value}) => [Key,Value]));
  assert.equal(values.Environment, 'STAGING');
  assert.equal(values.Production, 'HOLD');
  assert.equal(values.Public, 'HOLD');
  assert.equal(values.G5, 'HOLD');
}

console.log(JSON.stringify({
  state:'VERIFIED_PASS',
  template:file,
  identity_model:'ROLE_SCOPED_OIDC_KMS_WORKLOAD_V2_FINALIZER_SPLIT',
  approval_workloads:3,
  finalizer_workloads:1,
  approval_github_write:false,
  runtime_direct_dynamodb_write:false,
  writer_boundary:'LAMBDA_CONDITIONAL_WRITE_KMS_VERIFY_FINALIZER_SIGNED',
  production:'HOLD',public:'HOLD',g5:'HOLD',
}));
