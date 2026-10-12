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

test('resume role can access only bounded shared-budget rows and has no signing or writer privilege',()=>{
  assert.deepEqual(statements,[{
    Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem'],Resource:{Ref:'LedgerTableArn'},
    Condition:{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['GITHUB_READ_BUDGET#*']}},
  }]);
  const serialized=JSON.stringify(role);
  for(const forbidden of ['dynamodb:Query','dynamodb:DeleteItem','dynamodb:BatchWriteItem','kms:Sign','kms:Decrypt','lambda:InvokeFunction'])
    assert.equal(serialized.includes(forbidden),false,forbidden);
  assert.match(template.Parameters.LedgerTableArn.AllowedPattern,/kidults-autonomous-landing-staging-ledger/);
});
