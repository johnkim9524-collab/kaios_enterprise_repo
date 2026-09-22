import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const template = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
const role = template.Resources.AutonomousLandingRole.Properties;
const writerRole = template.Resources.AutonomousLedgerWriterRole.Properties;
const writer = template.Resources.AutonomousLedgerWriterFunction.Properties;
const runner = fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
const workflow = fs.readFileSync('.github/workflows/kidults-autonomous-internal-landing-v1.yml','utf8');

test('OIDC trust is bound to the protected autonomous staging environment', () => {
  const condition = role.AssumeRolePolicyDocument.Statement[0].Condition;
  assert.deepEqual(condition.StringLike['token.actions.githubusercontent.com:sub'], {
    'Fn::Sub': 'repo:${GitHubRepository}:environment:${GitHubEnvironment}',
  });
  assert.equal(workflow.includes('environment: KIDULTS-AUTONOMOUS-STAGING'), true);
  assert.equal(JSON.stringify(condition).includes('ref:refs/heads/main'), false);
});
test('GitHub OIDC runtime role cannot write the DynamoDB ledger directly', () => {
  const actions = role.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
  assert.equal(actions.includes('dynamodb:PutItem'), false);
  assert.equal(actions.includes('dynamodb:UpdateItem'), false);
  assert.equal(actions.includes('lambda:InvokeFunction'), true);
  assert.equal(runner.includes("dynamodb','put-item"), false);
  assert.equal(runner.includes("dynamodb','update-item"), false);
});

test('conditional writer is the only ledger mutation authority and rejects arbitrary actions', () => {
  const actions = writerRole.Policies[0].PolicyDocument.Statement.flatMap(value => value.Action || []);
  assert.deepEqual([...actions].sort(), ['dynamodb:PutItem','dynamodb:UpdateItem'].sort());
  const code = writer.Code.ZipFile;
  assert.match(code, /CREATE_APPROVAL/);
  assert.match(code, /CREATE_RESERVATION/);
  assert.match(code, /CONSUME_RESERVATION/);
  assert.match(code, /attribute_not_exists\(pk\) AND attribute_not_exists\(sk\)/);
  assert.match(code, /#s = :reserved AND run_id = :run AND head_sha = :head/);
  assert.match(code, /ACTION_FORBIDDEN/);
  assert.match(code, /ENVELOPE_DIGEST_MISMATCH/);
  assert.match(code, /ENVELOPE_GENERATION_MISMATCH/);
  assert.match(code, /ENVELOPE_REPOSITORY_MISMATCH/);
  assert.match(code, /ENVELOPE_EXPIRY_MISMATCH/);
  assert.match(code, /NONCE_DIGEST_INVALID/);
  assert.match(code, /HEAD_SHA_INVALID/);
  assert.match(code, /MERGE_SHA_INVALID/);
  assert.deepEqual(writer.Environment.Variables.GITHUB_REPOSITORY, { Ref: 'GitHubRepository' });
});
test('landing runner routes every mutation through the writer function', () => {
  assert.match(runner, /KIDULTS_AUTONOMOUS_LANDING_LEDGER_WRITER_FUNCTION/);
  assert.match(runner, /lambda','invoke/);
  for (const action of ['CREATE_APPROVAL','CREATE_RESERVATION','CONSUME_RESERVATION']) {
    assert.match(runner, new RegExp(action));
  }
  assert.match(workflow, /KIDULTS_AUTONOMOUS_LANDING_LEDGER_WRITER_FUNCTION/);
});
