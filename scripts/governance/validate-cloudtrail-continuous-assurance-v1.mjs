import assert from 'node:assert/strict';
import fs from 'node:fs';

const templatePath = 'infrastructure/aws/staging/cloudtrail-continuous-assurance-v1.json';
const workflowPath = '.github/workflows/kidults-aws-cloudtrail-continuous-assurance-v1.yml';
const eventAssurancePath = 'scripts/governance/run-cloudtrail-event-assurance-v1.sh';

const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
const resources = template.Resources || {};
const outputs = template.Outputs || {};

assert.equal(template.AWSTemplateFormatVersion, '2010-09-09');
assert.match(template.Description, /STAGING CloudTrail Continuous Assurance/);

const bucket = resources.CloudTrailLogBucket;
assert.equal(bucket.Type, 'AWS::S3::Bucket');
assert.equal(bucket.DeletionPolicy, 'Retain');
assert.equal(bucket.UpdateReplacePolicy, 'Retain');
assert.equal(bucket.Properties.ObjectLockEnabled, true);
assert.equal(bucket.Properties.ObjectLockConfiguration.ObjectLockEnabled, 'Enabled');
assert.equal(bucket.Properties.ObjectLockConfiguration.Rule.DefaultRetention.Mode, 'COMPLIANCE');
assert.equal(bucket.Properties.ObjectLockConfiguration.Rule.DefaultRetention.Years, 10);
assert.equal(bucket.Properties.VersioningConfiguration.Status, 'Enabled');
assert.deepEqual(bucket.Properties.PublicAccessBlockConfiguration, {
  BlockPublicAcls: true,
  BlockPublicPolicy: true,
  IgnorePublicAcls: true,
  RestrictPublicBuckets: true,
});
assert.equal(
  bucket.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0]
    .ServerSideEncryptionByDefault.SSEAlgorithm,
  'AES256',
);

const bucketPolicy = resources.CloudTrailLogBucketPolicy.Properties.PolicyDocument.Statement;
assert.ok(bucketPolicy.some((statement) => statement.Sid === 'DenyInsecureTransport'));
assert.ok(bucketPolicy.some((statement) => statement.Sid === 'CloudTrailAclCheck'));
assert.ok(bucketPolicy.some((statement) => statement.Sid === 'CloudTrailWrite'));

const trail = resources.StagingAssuranceTrail;
assert.equal(trail.Type, 'AWS::CloudTrail::Trail');
assert.equal(trail.Properties.TrailName, 'kidults-staging-continuous-assurance');
assert.equal(trail.Properties.IsLogging, true);
assert.equal(trail.Properties.IsMultiRegionTrail, true);
assert.equal(trail.Properties.IncludeGlobalServiceEvents, true);
assert.equal(trail.Properties.EnableLogFileValidation, true);
assert.equal(trail.Properties.EventSelectors.length, 1);
assert.equal(trail.Properties.EventSelectors[0].IncludeManagementEvents, true);
assert.equal(trail.Properties.EventSelectors[0].ReadWriteType, 'All');
assert.equal(trail.Properties.EventSelectors[0].DataResources.length, 1);
assert.equal(trail.Properties.EventSelectors[0].DataResources[0].Type, 'AWS::S3::Object');
assert.deepEqual(
  trail.Properties.EventSelectors[0].DataResources[0].Values,
  [
    { 'Fn::Sub': '${ReceiptBucketArn}/' },
    {
      'Fn::Sub':
        'arn:${AWS::Partition}:s3:::kidults-cloudtrail-negative-boundary-staging-${AWS::AccountId}/',
    },
  ],
);

const logGroup = resources.CloudTrailLogGroup;
assert.equal(logGroup.DeletionPolicy, 'Retain');
assert.equal(logGroup.UpdateReplacePolicy, 'Retain');
assert.equal(logGroup.Properties.LogGroupName, undefined, 'stack-generated name prevents retained-resource redeploy collisions');
assert.equal(logGroup.Properties.RetentionInDays, 3653);
assert.deepEqual(resources.StagingAssuranceTrail.Properties.CloudWatchLogsLogGroupArn, {
  'Fn::GetAtt': ['CloudTrailLogGroup', 'Arn'],
});
assert.ok(!JSON.stringify(template).includes('${CloudTrailLogGroup.Arn}:*'), 'LogGroup Arn already carries the stream wildcard');

for (const name of [
  'CloudTrailMutationMetricFilter',
  'CloudTrailDeliveryErrorMetricFilter',
  'CloudTrailMutationAlarm',
  'CloudTrailDeliveryAlarm',
  'AssuranceAlertTopic',
]) {
  assert.ok(resources[name], `RESOURCE_REQUIRED:${name}`);
}

const role = resources.CloudTrailAssuranceRole;
assert.equal(role.Type, 'AWS::IAM::Role');
assert.equal(role.Properties.MaxSessionDuration, 3600);
const trust = role.Properties.AssumeRolePolicyDocument.Statement[0];
assert.equal(trust.Action, 'sts:AssumeRoleWithWebIdentity');
assert.deepEqual(trust.Principal.Federated, { Ref: 'GitHubOidcProviderArn' });
assert.equal(
  trust.Condition.StringEquals['token.actions.githubusercontent.com:aud'],
  'sts.amazonaws.com',
);
assert.deepEqual(
  trust.Condition.StringEquals['token.actions.githubusercontent.com:sub'],
  {
    'Fn::Sub':
      'repo:${GitHubRepository}:environment:${AssuranceEnvironment}:workflow_ref:${AssuranceWorkflowRef}',
  },
);

const statements = role.Properties.Policies[0].PolicyDocument.Statement;
const readbackActions = statements[0].Action;
for (const action of [
  'cloudtrail:DescribeTrails',
  'cloudtrail:GetEventSelectors',
  'cloudtrail:GetTrailStatus',
  'cloudtrail:ListTags',
  'logs:StartQuery',
  'logs:GetQueryResults',
  'logs:StopQuery',
  'cloudformation:DetectStackDrift',
  'cloudformation:DetectStackResourceDrift',
  'cloudformation:DescribeStackResourceDrifts',
  'cloudwatch:DescribeAlarms',
  'iam:GetRole',
  's3:GetBucketEncryption',
  's3:GetBucketOwnershipControls',
  's3:GetBucketTagging',
]) {
  assert.ok(readbackActions.includes(action), `ACTION_REQUIRED:${action}`);
}
assert.deepEqual(statements[1].Resource, {
  'Fn::Sub': '${ReceiptBucketArn}/receipts/cloudtrail-assurance/*',
});
assert.deepEqual(statements[2].Resource, { Ref: 'ReceiptKeyArn' });

for (const key of ['ProductionState', 'PublicState', 'G5State']) {
  assert.equal(outputs[key].Value, 'HOLD');
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const eventAssurance = fs.readFileSync(eventAssurancePath, 'utf8');
for (const marker of [
  'permissions: {}',
  'id-token: write',
  'EXPECTED_MAIN_SHA',
  'refs/heads/main',
  'kidults-staging-continuous-assurance',
  'get-event-selectors',
  'get-trail-status',
  'LogFileValidationEnabled',
  'IsMultiRegionTrail',
  'IncludeManagementEvents',
  'AWS::S3::Object',
  'detect-stack-drift',
  'describe-stack-resource-drifts',
  'get-bucket-encryption',
  'get-bucket-ownership-controls',
  'get-bucket-tagging',
  'cloudtrail list-tags',
  'KNOWN_PROVIDER_READBACK_GAP_DIRECT_API_PASS',
  'run-cloudtrail-event-assurance-v1.sh',
  'Production',
  'Public',
  'G5',
]) {
  assert.ok(workflow.includes(marker), `WORKFLOW_MARKER_REQUIRED:${marker}`);
}
assert.equal(workflow.includes('DeleteTrail'), false);
assert.equal(workflow.includes('StopLogging'), false);
assert.equal(workflow.includes('put-event-selectors'), false);
assert.equal(workflow.includes('if [ -z "${AWS_ACCESS_KEY_ID:-}" ]'), false);
assert.ok(workflow.includes('aws sts get-caller-identity --output json >/dev/null 2>&1'));

for (const marker of [
  'aws logs start-query',
  'aws logs get-query-results',
  'LOG_QUERY_${label}_DUPLICATE',
  'LOG_QUERY_${label}_NOT_OBSERVED',
  'ASSURANCE_SESSION_NAME',
  'positive_s3',
  'positive_kms',
  'negative_forbidden_prefix',
  'negative_wrong_bucket',
  'negative_wrong_key',
  'negative_wrong_region',
  'negative_wrong_role',
  'CLOUDTRAIL_EXACT_EVENT_BINDING=PASS',
  'POSITIVE_CANARY=PASS',
  'NEGATIVE_CANARY=PASS',
  'COMPLIANCE',
  'TERMINAL_RECEIPT=PASS',
  'OBJECT_LOCK_COMPLIANCE_VERIFIED',
]) {
  assert.ok(
    eventAssurance.includes(marker),
    `EVENT_ASSURANCE_MARKER_REQUIRED:${marker}`,
  );
}
assert.equal(eventAssurance.includes('cloudtrail lookup-events'), false);

console.log(
  JSON.stringify({
    state: 'VERIFIED_PASS',
    template: templatePath,
    workflow: workflowPath,
    identity_model: 'ROLE_SCOPED_CUSTOM_SUB_CLOUDTRAIL_OBJECT_LOCK_V2',
    trail: 'MULTI_REGION_MANAGEMENT_AND_SCOPED_S3_DATA_EVENTS',
    retention: 'OBJECT_LOCK_COMPLIANCE_10_YEARS',
    alerts: 2,
    exact_sha: 'REQUIRED',
    negative_canary: 'NON_MUTATING_FAIL_CLOSED',
    event_observation: 'CLOUDWATCH_LOGS_EXACTLY_ONCE_BOUND',
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  }),
);
