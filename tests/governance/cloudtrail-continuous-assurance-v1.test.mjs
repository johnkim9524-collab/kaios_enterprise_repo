import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const templatePath = 'infrastructure/aws/staging/cloudtrail-continuous-assurance-v1.json';
const workflowPath = '.github/workflows/kidults-aws-cloudtrail-continuous-assurance-v1.yml';
const eventAssurancePath = 'scripts/governance/run-cloudtrail-event-assurance-v1.sh';

test('CloudTrail assurance validator passes the canonical contract', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/governance/validate-cloudtrail-continuous-assurance-v1.mjs'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.public, 'HOLD');
  assert.equal(receipt.g5, 'HOLD');
});

test('S3 data events are scoped to the existing immutable receipt bucket', () => {
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const selector =
    template.Resources.StagingAssuranceTrail.Properties.EventSelectors[0];
  assert.deepEqual(selector.DataResources, [
    {
      Type: 'AWS::S3::Object',
      Values: [
        { 'Fn::Sub': '${ReceiptBucketArn}/' },
        {
          'Fn::Sub':
            'arn:${AWS::Partition}:s3:::kidults-cloudtrail-negative-boundary-staging-${AWS::AccountId}/',
        },
      ],
    },
  ]);

  const roleStatements =
    template.Resources.CloudTrailAssuranceRole.Properties.Policies[0]
      .PolicyDocument.Statement;
  const writeStatement = roleStatements.find((statement) =>
    statement.Action.includes('s3:PutObject'),
  );
  assert.deepEqual(writeStatement.Resource, {
    'Fn::Sub': '${ReceiptBucketArn}/receipts/cloudtrail-assurance/*',
  });
});

test('workflow negative canary is non-mutating and HOLD preserving', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const eventAssurance = fs.readFileSync(eventAssurancePath, 'utf8');
  assert.match(eventAssurance, /receipts\/cloudtrail-assurance-forbidden/);
  assert.match(eventAssurance, /NEGATIVE_CANARY=PASS/);
  assert.doesNotMatch(workflow, /aws cloudtrail (stop-logging|delete-trail|put-event-selectors)/);
  assert.match(workflow, /Production=HOLD/);
  assert.match(workflow, /Public=HOLD/);
  assert.match(workflow, /G5=HOLD/);
});

test('scheduled assurance binds live protected main before AWS credentials', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /schedule:\s*\n\s*- cron: '17 3 \* \* \*'/);
  assert.match(workflow, /git\/ref\/heads\/main/);
  assert.match(workflow, /test "\$LIVE_MAIN_SHA" = "\$EXPECTED_MAIN_SHA"/);
  assert.ok(
    workflow.indexOf('test "$LIVE_MAIN_SHA" = "$EXPECTED_MAIN_SHA"') <
      workflow.indexOf('Acquire short-lived assurance credentials'),
  );
});

test('event consumer binds exact run identity and rejects missing or duplicate evidence', () => {
  const script = fs.readFileSync(eventAssurancePath, 'utf8');
  assert.match(script, /aws logs start-query/);
  assert.match(script, /aws logs get-query-results/);
  assert.match(script, /LOG_QUERY_\$\{label\}_DUPLICATE/);
  assert.match(script, /LOG_QUERY_\$\{label\}_NOT_OBSERVED/);
  assert.match(script, /EXPECTED_MAIN_SHA/);
  assert.match(script, /GITHUB_RUN_ID/);
  assert.match(script, /ASSURANCE_SESSION_NAME/);
  assert.match(script, /userIdentity\.sessionContext\.sessionIssuer\.arn/);
  assert.match(script, /recipientAccountId/);
});

test('positive and every negative boundary require CloudTrail event evidence', () => {
  const script = fs.readFileSync(eventAssurancePath, 'utf8');
  for (const label of [
    'positive_s3',
    'positive_kms',
    'negative_forbidden_prefix',
    'negative_wrong_bucket',
    'negative_wrong_key',
    'negative_wrong_region',
    'negative_wrong_role',
  ]) {
    assert.match(script, new RegExp(`query_one_event ${label}`));
  }
  assert.match(script, /DENIED_AND_OBSERVED_EXACTLY_ONCE/);
  assert.match(script, /CLOUDTRAIL_EXACT_EVENT_BINDING=PASS/);
  assert.doesNotMatch(script, /cloudtrail lookup-events/);
});

test('log storage is retained and immutable for ten years', () => {
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const bucket = template.Resources.CloudTrailLogBucket;
  assert.equal(bucket.DeletionPolicy, 'Retain');
  assert.equal(bucket.UpdateReplacePolicy, 'Retain');
  assert.equal(
    bucket.Properties.ObjectLockConfiguration.Rule.DefaultRetention.Mode,
    'COMPLIANCE',
  );
  assert.equal(
    bucket.Properties.ObjectLockConfiguration.Rule.DefaultRetention.Years,
    10,
  );
});
