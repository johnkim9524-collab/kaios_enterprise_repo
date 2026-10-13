import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='infrastructure/aws/staging/github-read-resume-role-v1.json';
const template=JSON.parse(fs.readFileSync(path,'utf8'));
const role=template.Resources.GithubReadResumeRole;
const statements=role.Properties.Policies[0].PolicyDocument.Statement;

test('resume role trusts only the exact protected main workflow and environment',()=>{
  assert.equal(role.Type,'AWS::IAM::Role');
  assert.equal(role.Properties.RoleName,'kidults-github-read-resume-staging-role');
  assert.equal(role.Properties.MaxSessionDuration,900);
  const condition=role.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals;
  assert.deepEqual(condition,{
    'token.actions.githubusercontent.com:aud':'sts.amazonaws.com',
    'token.actions.githubusercontent.com:sub':'repo:johnkim9524-collab/kaios_enterprise_repo:environment:KIDULTS-AUTONOMOUS-READ-RESUME:workflow_ref:johnkim9524-collab/kaios_enterprise_repo/.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml@refs/heads/main',
  });
});

test('resume role has the shared budget and one-time wake permissions within exact resource bounds',()=>{
  assert.deepEqual(statements,[
    {Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem'],Resource:{Ref:'LedgerTableArn'},
      Condition:{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['GITHUB_READ_BUDGET#*']}}},
    {Effect:'Allow',Action:['scheduler:CreateSchedule','scheduler:GetSchedule'],
      Resource:'arn:aws:scheduler:ap-northeast-2:528314240275:schedule/default/kidults-read-resume-*'},
    {Effect:'Allow',Action:'iam:PassRole',Resource:'arn:aws:iam::528314240275:role/kidults-natural-clock-scheduler-staging-v1',
      Condition:{StringEquals:{'iam:PassedToService':'scheduler.amazonaws.com'}}},
    {Effect:'Allow',Action:['s3:PutObject','s3:PutObjectRetention','s3:GetObject','s3:GetObjectVersion','s3:GetObjectRetention'],
      Resource:{'Fn::Sub':'arn:${AWS::Partition}:s3:::${ReceiptBucketName}/receipts/read-resume/*'}},
    {Effect:'Allow',Action:['kms:GenerateDataKey','kms:Decrypt'],Resource:{Ref:'ReceiptKeyArn'},
      Condition:{StringEquals:{'kms:ViaService':'s3.ap-northeast-2.amazonaws.com'},
        ArnEquals:{'kms:EncryptionContext:aws:s3:arn':{'Fn::Sub':'arn:${AWS::Partition}:s3:::${ReceiptBucketName}'}}}},
  ]);
  const serialized=JSON.stringify(role);
  for(const forbidden of ['dynamodb:Query','dynamodb:DeleteItem','dynamodb:BatchWriteItem','kms:Sign','lambda:InvokeFunction',
    'scheduler:UpdateSchedule','scheduler:DeleteSchedule','scheduler:CreateScheduleGroup'])
    assert.equal(serialized.includes(forbidden),false,forbidden);
  assert.match(template.Parameters.LedgerTableArn.AllowedPattern,/kidults-autonomous-landing-staging-ledger/);
  assert.match(statements[3].Resource['Fn::Sub'],/receipts\/read-resume\/\*/);
  assert.equal(statements[4].Resource.Ref,'ReceiptKeyArn');
  assert.equal(statements[4].Condition.StringEquals['kms:ViaService'],'s3.ap-northeast-2.amazonaws.com');
  assert.equal(statements[4].Condition.ArnEquals['kms:EncryptionContext:aws:s3:arn']['Fn::Sub'],
    'arn:${AWS::Partition}:s3:::${ReceiptBucketName}');
});

test('receipt KMS access is exact-action Owner-reserved and attached only to receipt key',()=>{
  const stack=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  assert.match(stack.Description,/OWNER_RESERVED_STAGING_INFRA_CHANGE/);
  const receiptStatements=stack.Resources.AutonomousReceiptKey.Properties.KeyPolicy.Statement;
  const grant=receiptStatements.find(value=>value.Sid==='AllowReadResumeObjectLockReceiptsThroughS3');
  assert.deepEqual(grant.Action,['kms:GenerateDataKey','kms:Decrypt']);
  assert.equal(grant.Principal.AWS,'arn:aws:iam::528314240275:role/kidults-github-read-resume-staging-role');
  assert.equal(grant.Condition.StringEquals['kms:ViaService'],'s3.ap-northeast-2.amazonaws.com');
  assert.deepEqual(grant.Condition.ArnEquals['kms:EncryptionContext:aws:s3:arn'],{'Fn::Sub':'${AutonomousReceiptBucket.Arn}'});
  assert.equal(stack.Resources.AutonomousLedgerKey.Properties.KeyPolicy.Statement.some(value=>value.Sid==='AllowReadResumeObjectLockReceiptsThroughS3'),false);
});
