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

test('receipt KMS access remains scoped to the Owner-reserved role and does not change the existing key policy',()=>{
  const stack=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  const receiptStatements=stack.Resources.AutonomousReceiptKey.Properties.KeyPolicy.Statement;
  assert.equal(receiptStatements.find(value=>value.Sid==='EnableAccountAdministration')?.Principal?.AWS?.['Fn::Sub'],
    'arn:${AWS::Partition}:iam::${AWS::AccountId}:root');
  assert.equal(receiptStatements.some(value=>value.Sid==='AllowReadResumeObjectLockReceiptsThroughS3'),false);
  assert.equal(stack.Resources.AutonomousLedgerKey.Properties.KeyPolicy.Statement.some(value=>value.Sid==='AllowReadResumeObjectLockReceiptsThroughS3'),false);
});

test('repository_dispatch cannot select the code executed by the OIDC trusted workflow',()=>{
  const workflow=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
  const job=workflow.slice(workflow.indexOf('  read-resume-checkpoint:\n'));
  const checkout=job.slice(job.indexOf('      - name: Checkout exact protected main consumer'),
    job.indexOf('      - name: Verify exact consumer checkout'));
  const verify=job.slice(job.indexOf('      - name: Verify exact consumer checkout'),
    job.indexOf('      - name: Consume exact deferred read'));
  assert.match(checkout,/ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(checkout,/github\.event\.client_payload\.exact_main_sha/);
  assert.match(verify,/EXPECTED_MAIN_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(verify,/EXPECTED_REPOSITORY_ID: \$\{\{ github\.repository_id \}\}/);
  assert.match(verify,/\.sender\.login == "kidults-autonomous-landing-staging\[bot\]"/);
  assert.match(verify,/\.repository\.id \| tostring/);
  assert.match(verify,/\.client_payload\.exact_main_sha == \$main_sha/);
  assert.ok(job.indexOf('      - name: Verify exact consumer checkout')
    < job.indexOf('OIDC_JSON=$(curl'));
});
