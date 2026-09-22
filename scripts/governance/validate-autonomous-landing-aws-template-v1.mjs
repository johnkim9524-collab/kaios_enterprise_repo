import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'infrastructure/aws/staging/autonomous-internal-landing-v1.json';
const template = JSON.parse(fs.readFileSync(file, 'utf8'));
const resources = template.Resources;
const role = resources.AutonomousLandingRole.Properties;
const writerRole = resources.AutonomousLedgerWriterRole.Properties;
const writerFunction = resources.AutonomousLedgerWriterFunction.Properties;
const table = resources.AutonomousLandingLedger.Properties;
const key = resources.AutonomousLedgerKey.Properties;
const statement = role.AssumeRolePolicyDocument.Statement[0];
const runtimeStatements = role.Policies[0].PolicyDocument.Statement;
const writerStatements = writerRole.Policies[0].PolicyDocument.Statement;

assert.equal(table.TableName, 'kidults-autonomous-landing-staging-ledger');
assert.equal(table.BillingMode, 'PAY_PER_REQUEST');
assert.equal(table.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, true);
assert.equal(table.SSESpecification.SSEType, 'KMS');
assert.equal(key.EnableKeyRotation, true);
assert.equal(role.RoleName, 'kidults-autonomous-landing-staging-role');
assert.equal(template.Parameters.GitHubEnvironment.Default, 'KIDULTS-AUTONOMOUS-STAGING');
assert.equal(statement.Action, 'sts:AssumeRoleWithWebIdentity');
assert.equal(statement.Condition.StringEquals['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
assert.deepEqual(statement.Condition.StringLike['token.actions.githubusercontent.com:sub'], {
  'Fn::Sub': 'repo:${GitHubRepository}:environment:${GitHubEnvironment}',
});
const runtimeDdb = runtimeStatements.find(value => (value.Action || []).includes('dynamodb:Query'));
assert.ok(runtimeDdb);
assert.deepEqual([...runtimeDdb.Action].sort(), ['dynamodb:DescribeTable','dynamodb:GetItem','dynamodb:Query'].sort());
assert.equal(runtimeDdb.Action.includes('dynamodb:PutItem'), false);
assert.equal(runtimeDdb.Action.includes('dynamodb:UpdateItem'), false);
const invoke = runtimeStatements.find(value => (value.Action || []).includes('lambda:InvokeFunction'));
assert.ok(invoke);
assert.deepEqual(invoke.Resource, { 'Fn::GetAtt': ['AutonomousLedgerWriterFunction','Arn'] });
assert.deepEqual([...writerStatements[0].Action].sort(), ['dynamodb:PutItem','dynamodb:UpdateItem'].sort());
assert.equal(writerFunction.Runtime, 'python3.12');
assert.deepEqual(writerFunction.Environment.Variables.LEDGER_TABLE, { Ref: 'AutonomousLandingLedger' });
const code = writerFunction.Code.ZipFile;
for (const marker of [
  'CREATE_APPROVAL','CREATE_RESERVATION','CONSUME_RESERVATION',
  "ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)'",
  "ConditionExpression='#s = :reserved AND run_id = :run AND head_sha = :head'",
  "raise ValueError('ACTION_FORBIDDEN')",
  "raise ValueError('ENVELOPE_DIGEST_MISMATCH')",
  "raise ValueError('ENVELOPE_GENERATION_MISMATCH')",
  "raise ValueError('ENVELOPE_REPOSITORY_MISMATCH')",
  "raise ValueError('ENVELOPE_EXPIRY_MISMATCH')",
  "NONCE_DIGEST_INVALID",
  "HEAD_SHA_INVALID",
  "MERGE_SHA_INVALID",
]) assert.ok(code.includes(marker), marker);
assert.deepEqual(writerFunction.Environment.Variables.GITHUB_REPOSITORY, { Ref: 'GitHubRepository' });
const workflow = fs.readFileSync('.github/workflows/kidults-autonomous-internal-landing-v1.yml','utf8');
assert.ok(workflow.includes('environment: KIDULTS-AUTONOMOUS-STAGING'));
assert.ok(workflow.includes('KIDULTS_AUTONOMOUS_LANDING_LEDGER_WRITER_FUNCTION'));
const runner = fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
assert.equal(runner.includes("dynamodb','put-item"), false);
assert.equal(runner.includes("dynamodb','update-item"), false);
assert.ok(runner.includes("lambda','invoke"));
for (const action of ['CREATE_APPROVAL','CREATE_RESERVATION','CONSUME_RESERVATION']) assert.ok(runner.includes(action));
for (const resource of Object.values(resources)) {
  const tags = resource.Properties?.Tags ?? [];
  if (!tags.length) continue;
  const values = Object.fromEntries(tags.map(({ Key, Value }) => [Key, Value]));
  assert.equal(values.Environment, 'STAGING');
  assert.equal(values.Production, 'HOLD');
  assert.equal(values.Public, 'HOLD');
  assert.equal(values.G5, 'HOLD');
}
console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  template: file,
  oidc_scope: 'EXACT_REPOSITORY_PROTECTED_ENVIRONMENT',
  runtime_direct_dynamodb_write: false,
  writer_boundary: 'LAMBDA_CONDITIONAL_WRITE_ONLY',
  ledger: table.TableName,
  kms_rotation: true,
  production: 'HOLD', public: 'HOLD', g5: 'HOLD',
}));
