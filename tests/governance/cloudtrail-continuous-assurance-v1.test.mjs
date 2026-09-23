import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const templatePath = 'infrastructure/aws/staging/cloudtrail-continuous-assurance-v1.json';
const workflowPath = '.github/workflows/kidults-aws-cloudtrail-continuous-assurance-v1.yml';

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
      Values: [{ 'Fn::Sub': '${ReceiptBucketArn}/' }],
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
  assert.match(workflow, /receipts\/cloudtrail-assurance-forbidden/);
  assert.match(workflow, /NEGATIVE_CANARY=PASS/);
  assert.doesNotMatch(workflow, /aws cloudtrail (stop-logging|delete-trail|put-event-selectors)/);
  assert.match(workflow, /Production=HOLD/);
  assert.match(workflow, /Public=HOLD/);
  assert.match(workflow, /G5=HOLD/);
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
