import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'infrastructure/aws/staging/autonomous-internal-landing-v1.json';
const template = JSON.parse(fs.readFileSync(file, 'utf8'));
const resources = template.Resources;
const role = resources.AutonomousLandingRole.Properties;
const table = resources.AutonomousLandingLedger.Properties;
const key = resources.AutonomousLedgerKey.Properties;
const statement = role.AssumeRolePolicyDocument.Statement[0];
const inline = role.Policies[0].PolicyDocument.Statement;

assert.equal(table.TableName, 'kidults-autonomous-landing-staging-ledger');
assert.equal(table.BillingMode, 'PAY_PER_REQUEST');
assert.equal(table.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, true);
assert.equal(table.SSESpecification.SSEType, 'KMS');
assert.equal(key.EnableKeyRotation, true);
assert.equal(role.RoleName, 'kidults-autonomous-landing-staging-role');
assert.equal(statement.Action, 'sts:AssumeRoleWithWebIdentity');
assert.equal(statement.Condition.StringEquals['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
assert.deepEqual(statement.Condition.StringLike['token.actions.githubusercontent.com:sub'], {
  'Fn::Sub': 'repo:${GitHubRepository}:ref:refs/heads/main',
});
assert.deepEqual(inline[0].Action.sort(), [
  'dynamodb:DescribeTable', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:UpdateItem',
].sort());
assert.equal(inline[1].Condition.StringEquals['kms:EncryptionContext:aws:dynamodb:tableName'].Ref, 'AutonomousLandingLedger');
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
  oidc_scope: 'EXACT_REPOSITORY_MAIN_REF',
  ledger: table.TableName,
  kms_rotation: true,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
}));
