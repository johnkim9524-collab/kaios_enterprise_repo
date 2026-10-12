// Run bounded live-history regression in the existing independent STAGING CI job.
import '../../../scripts/kidults/supply-chain/restore-exact-github-artifact-history-v1.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

const bootstrap = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-landing-deployer-bootstrap-v1.json', 'utf8'));
const approvalManifest = JSON.parse(fs.readFileSync('coordination/kidults/governance/approval-policy-file-manifest-v1.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/kidults-autonomous-landing-staging-deploy-v1.yml', 'utf8');
// Freeze historical upgrade tests; compressed current code must not erase the
// legacy V1/V2 adversarial transition coverage.
const desired = JSON.parse(fs.readFileSync('tests/kidults/staging-operations/fixtures/autonomous-landing-template-consumption-v2.json', 'utf8'));
assert.equal(createHash('sha256').update(desired.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile).digest('hex'),'688466a27a54adc9419b3d7e414632818fff5199e89ba8e40d0157ce465ffc8d');
// The frozen fixture captures the historical Lambda capsule. Model today's
// desired IAM policy separately so transition tests cover the reviewed
// cross-runner budget permission while retaining the historical code digest.
const sharedBudgetStatement = {
  Effect: 'Allow',
  Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
  Resource: {'Fn::GetAtt': ['AutonomousLandingLedger', 'Arn']},
  Condition: {'ForAllValues:StringLike': {'dynamodb:LeadingKeys': ['GITHUB_READ_BUDGET#*']}},
};
for (const roleId of ['TrackApprovalRole', 'KpmoApprovalRole', 'VerifierApprovalRole']) {
  const statements = desired.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement;
  // Treat the frozen fixture as a base and materialize this exact reviewed
  // statement once. This keeps old fixtures compatible without weakening the
  // production validator's duplicate rejection.
  desired.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement =
    statements.filter(statement => !isDeepStrictEqual(statement, sharedBudgetStatement));
  desired.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement.push(structuredClone(sharedBudgetStatement));
}
const validator = 'scripts/governance/validate-autonomous-landing-staging-deployment-v1.mjs';
const deployedCapsuleTemplate = () => {
  const current = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  const zip = JSON.parse(fs.readFileSync('tests/kidults/staging-operations/fixtures/autonomous-landing-deployed-recovery-capsule.json','utf8'));
  assert.equal(createHash('sha256').update(zip).digest('hex'),'5950fd39493d33a9a371cbe1263858aeabe9edfeec816f26504ccc29fb8ba690');
  current.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile = zip;
  return current;
};
const failureAssuranceCapsuleTemplate = () => {
  const current=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  const zip=JSON.parse(fs.readFileSync('tests/kidults/staging-operations/fixtures/autonomous-landing-failure-assurance-capsule.json','utf8'));
  assert.equal(createHash('sha256').update(zip).digest('hex'),'d160ab65af2967635f75b637c5d5582529f5b2ef62a34e7b08cd00bbe715191d');
  current.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile=zip;
  return current;
};
test('exact failure-Assurance capsule upgrades to original terminal repair with Code-only non-replacing change set',()=>{
  const latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  assert.equal(createHash('sha256').update(latest.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile).digest('hex'),
    '636a85b5af3af28b6d6031f9b5f1b514c922013590825246939772b8c53a2cac');
  const changeset={Status:'CREATE_COMPLETE',Changes:[{ResourceChange:{Action:'Modify',LogicalResourceId:'AutonomousLedgerWriterFunction',
    ResourceType:'AWS::Lambda::Function',Replacement:'False',Details:[{Target:{Attribute:'Properties',Name:'Code'},Evaluation:'Static',ChangeSource:'DirectModification'}]}}]};
  withFixture({current:failureAssuranceCapsuleTemplate(),desired:latest,changeset},directory=>{
    assert.equal(JSON.parse(execFileSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired'),
      '--changeset',path.join(directory,'changeset')],{encoding:'utf8'})).mode,'CHANGE_REQUIRED');
  });
});
test('deployed admission roles gain the shared budget policy together with the verified recovery writer',()=>{
  const latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  const current=structuredClone(latest);
  for(const roleId of ['TrackApprovalRole','KpmoApprovalRole','VerifierApprovalRole']){
    current.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement=
      current.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement.filter(s=>JSON.stringify(s)!==JSON.stringify(sharedBudgetStatement));
  }
  const deployedCode=JSON.parse(fs.readFileSync('tests/kidults/staging-operations/fixtures/autonomous-landing-deployed-recovery-capsule.json','utf8'));
  current.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile=deployedCode;
  const changes=[...['TrackApprovalRole','KpmoApprovalRole','VerifierApprovalRole'].map(LogicalResourceId=>({ResourceChange:{
    Action:'Modify',LogicalResourceId,ResourceType:'AWS::IAM::Role',Replacement:'False',
    Details:[{Target:{Attribute:'Properties',Name:'Policies'},Evaluation:'Static',ChangeSource:'DirectModification'}]}})),
    {ResourceChange:{Action:'Modify',LogicalResourceId:'AutonomousLedgerWriterFunction',ResourceType:'AWS::Lambda::Function',Replacement:'False',
      Details:[{Target:{Attribute:'Properties',Name:'Code'},Evaluation:'Static',ChangeSource:'DirectModification'}]}}];
  const changeset={Status:'CREATE_COMPLETE',Changes:changes};
  withFixture({current,desired:latest,changeset},directory=>{
    const result=execFileSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired'),
      '--changeset',path.join(directory,'changeset')],{encoding:'utf8'});
    assert.equal(JSON.parse(result).mode,'CHANGE_REQUIRED');
  });
  for(const mutate of [
    t=>{t.Resources.TrackApprovalRole.Properties.Policies[0].PolicyDocument.Statement.push({Effect:'Allow',Action:'dynamodb:DeleteItem',Resource:'*'});},
    t=>{t.Resources.KpmoApprovalRole.Properties.Policies[0].PolicyDocument.Statement.find(s=>JSON.stringify(s)===JSON.stringify(sharedBudgetStatement)).Resource='*';},
  ]){
    const widened=structuredClone(latest);mutate(widened);
    withFixture({current,desired:widened,changeset},directory=>{
      assert.notEqual(spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired'),
        '--changeset',path.join(directory,'changeset')],{encoding:'utf8'}).status,0);
    });
  }
});
for(const [name,mutate] of [
  ['unregistered source', (c,d)=>{c.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile+='\n# drift';}],
  ['unregistered target', (c,d)=>{d.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile+='\n# drift';}],
  ['environment', (c,d)=>{d.Resources.AutonomousLedgerWriterFunction.Properties.Environment.Variables.EXTRA='drift';}],
  ['IAM', (c,d)=>{d.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement.push({Effect:'Allow',Action:'dynamodb:DeleteItem',Resource:'*'});}],
  ['downgrade', (c,d)=>{const old=c.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile;
    c.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile=d.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile;
    d.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile=old;}]
])test(`guard capsule upgrade rejects ${name}`,()=>{
  const current=failureAssuranceCapsuleTemplate(),latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  mutate(current,latest);
  withFixture({current,desired:latest},directory=>{
    assert.notEqual(spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'}).status,0);
  });
});
test('previously landed packed capsule upgrades to exact original terminal repair capsule', () => {
  const latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  withFixture({current:deployedCapsuleTemplate(),desired:latest},directory=>{
    const output=execFileSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'});
    assert.equal(JSON.parse(output).mode,'CHANGE_REQUIRED');
  });
});
test('packed capsule change set permits only a non-replacing Lambda Code modification',()=>{
  const latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  const changeset={Status:'CREATE_COMPLETE',Changes:[{ResourceChange:{
    Action:'Modify',LogicalResourceId:'AutonomousLedgerWriterFunction',ResourceType:'AWS::Lambda::Function',Replacement:'False',
    Details:[{Target:{Attribute:'Properties',Name:'Code'},Evaluation:'Static',ChangeSource:'DirectModification'}]
  }}]};
  withFixture({current:deployedCapsuleTemplate(),desired:latest,changeset},directory=>{
    const argv=[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired'),'--changeset',path.join(directory,'changeset')];
    assert.equal(JSON.parse(execFileSync('node',argv,{encoding:'utf8'})).mode,'CHANGE_REQUIRED');
    changeset.Changes[0].ResourceChange.Replacement='True';
    fs.writeFileSync(path.join(directory,'changeset'),JSON.stringify(changeset));
    assert.notEqual(spawnSync('node',argv,{encoding:'utf8'}).status,0);
  });
});
for (const [name,mutate] of [
  ['source code',t=>{t.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile+='\n# drift';}],
  ['target code',t=>{t.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile+='\n# drift';}],
  ['environment',t=>{t.Resources.AutonomousLedgerWriterFunction.Properties.Environment.Variables.EXTRA='drift';}],
  ['memory',t=>{t.Resources.AutonomousLedgerWriterFunction.Properties.MemorySize+=1;}],
  ['IAM',t=>{t.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement.push({Effect:'Allow',Action:'dynamodb:DeleteItem',Resource:'*'});}]
]) test(`packed capsule upgrade rejects ${name} drift without legacy shape exception`,()=>{
  const current=deployedCapsuleTemplate();
  const latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  mutate(name==='source code'?current:latest);
  withFixture({current,desired:latest},directory=>{
    const result=spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.doesNotMatch(result.stderr,/WRITER_CODE_EXPECTED_CLIENT_ERROR_IMPORT/);
  });
});
const roleIds = ['TrackApprovalRole', 'KpmoApprovalRole', 'VerifierApprovalRole'];
test('current capsule permits exact known V2 code and existing receipt bucket binding only',()=>{
  const latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  withFixture({current:desired,desired:latest},directory=>{
    const result=spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).mode,'CHANGE_REQUIRED');
  });
});
for(const [name,mutate] of [
 ['code',d=>d.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile+='\n# drift'],
 ['bucket',d=>d.Resources.AutonomousLedgerWriterFunction.Properties.Environment.Variables.RECEIPT_BUCKET={Ref:'OtherBucket'}],
 ['extra environment',d=>d.Resources.AutonomousLedgerWriterFunction.Properties.Environment.Variables.EXTRA='unexpected'],
 ['IAM',d=>d.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement.push({Effect:'Allow',Action:['dynamodb:Scan'],Resource:'*'})],
])test('current capsule rejects '+name+' drift',()=>{
 const latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));mutate(latest);
 withFixture({current:desired,desired:latest},directory=>{
   const result=spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'});assert.notEqual(result.status,0);
 });
});

const boundedQuery = {
  Effect: 'Allow',
  Action: ['dynamodb:Query'],
  Resource: {'Fn::GetAtt': ['AutonomousLandingLedger', 'Arn']},
  Condition: {'ForAllValues:StringLike': {'dynamodb:LeadingKeys': ['AUTH#*']}},
};
const stable = input => {
  if (Array.isArray(input)) return input.map(stable);
  if (input && typeof input === 'object') return Object.fromEntries(Object.keys(input).sort().map(key => [key, stable(input[key])]));
  return input;
};
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const currentTemplate = () => {
  const current = structuredClone(desired);
  for (const roleId of roleIds) {
    const statements = current.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement;
    current.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement = statements.filter(statement => !same(statement, boundedQuery));
  }
  return current;
};
const preRecoveryTemplate=()=>{
  const current=structuredClone(desired),properties=current.Resources.AutonomousLedgerWriterFunction.Properties;
  properties.Code.ZipFile=properties.Code.ZipFile.split('\n# BEGIN BOUNDED POSTMERGE RECOVERY LEDGER V1\n')[0];
  delete properties.Environment.Variables.RECEIPT_KEY_ARN;
  return current;
};

const legacyWriterZipFromDesired = desiredZip => {
  const reserveBlock = "\ndef reserve_once(item):\n    try:\n        ddb.put_item(\n            TableName=TABLE,\n            Item=item,\n            ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)',\n            ReturnValuesOnConditionCheckFailure='ALL_OLD'\n        )\n        return {'state': 'RESERVED', 'owner_run_id': item['run_id']['S']}\n    except ClientError as error:\n        if error.response.get('Error', {}).get('Code') != 'ConditionalCheckFailedException':\n            raise\n        prior = error.response.get('Item') or {}\n        owner_run_id = prior.get('run_id', {}).get('S', '')\n        prior_head_sha = prior.get('head_sha', {}).get('S', '')\n        prior_state = prior.get('state', {}).get('S', '')\n        if prior_state != 'RESERVED' or prior_head_sha != item['head_sha']['S'] or not RUN_ID.fullmatch(owner_run_id):\n            raise ValueError('RESERVATION_CONFLICT_INVALID')\n        return {'state': 'ALREADY_RESERVED', 'owner_run_id': owner_run_id}\n";
  const desiredReservation = "        reservation = reserve_once({\n            'pk': {'S': pk}, 'sk': {'S': sk}, 'state': {'S': 'RESERVED'},\n            'run_id': {'S': run_id}, 'head_sha': {'S': head_sha}\n        })\n        return {'ok': True, 'action': action, 'pk': pk, 'sk': sk, **reservation}";
  const legacyReservation = "        put_unique({\n            'pk': {'S': pk}, 'sk': {'S': sk}, 'state': {'S': 'RESERVED'},\n            'run_id': {'S': run_id}, 'head_sha': {'S': head_sha}\n        })\n        return {'ok': True, 'action': action, 'pk': pk, 'sk': sk}";
  return desiredZip.replace('from botocore.exceptions import ClientError\n', '').replace(reserveBlock, '').replace(desiredReservation, legacyReservation);
};
const legacyWriterTemplate = () => {
  const current = structuredClone(desired);
  current.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile =
    legacyWriterZipFromDesired(desired.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile);
  return current;
};
const withFixture = (files, callback) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-autonomous-landing-deployer-'));
  try {
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), `${JSON.stringify(body)}\n`);
    callback(directory);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
};

test('bootstrap trust is exact workflow/environment and permissions are bounded to three STAGING roles', () => {
  const trust = bootstrap.Resources.DeployerRole.Properties.AssumeRolePolicyDocument.Statement[0];
  assert.equal(trust.Condition.StringEquals['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
  assert.deepEqual(trust.Condition.StringEquals['token.actions.githubusercontent.com:sub'], {
    'Fn::Sub': 'repo:${GitHubRepository}:environment:${GitHubEnvironment}:workflow_ref:${WorkflowRef}',
  });
  const source = JSON.stringify(bootstrap);
  assert.doesNotMatch(source, /"Resource":"\*"/);
  assert.doesNotMatch(source, /iam:(CreateRole|DeleteRole|CreateUser|CreateAccessKey|UpdateAssumeRolePolicy|DeleteRolePolicy)/);
  const kmsRead = bootstrap.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement.find(
    statement => Array.isArray(statement.Action) && statement.Action.includes('kms:DescribeKey'),
  );
  assert.deepEqual(kmsRead?.Action, ['kms:DescribeKey']);
  assert.deepEqual(kmsRead?.Resource, [
    'arn:aws:kms:ap-northeast-2:528314240275:key/03d855ac-8e8c-4465-9984-bbf92987c6a0',
    'arn:aws:kms:ap-northeast-2:528314240275:key/088c00e6-bfc3-4aea-8dbf-b9e98ac2e8c7',
    'arn:aws:kms:ap-northeast-2:528314240275:key/c51e64be-54a8-4e7b-b16c-8e2b349902ec',
    'arn:aws:kms:ap-northeast-2:528314240275:key/887d2856-30c8-4a7f-8d85-c0b6e4978cc0',
    'arn:aws:kms:ap-northeast-2:528314240275:key/609e9ec0-3c22-40a0-b728-90fdf0756d3e',
    'arn:aws:kms:ap-northeast-2:528314240275:key/7aea838e-972e-468b-b0a7-001f6549e61c',
  ]);
  const auxiliaryRoleRead = bootstrap.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement.find(
    statement => Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'iam:GetRole',
  );
  assert.deepEqual(auxiliaryRoleRead?.Resource, [
    'arn:aws:iam::528314240275:role/kidults-autonomous-finalizer-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-ledger-writer-staging-role',
  ]);
  assert.doesNotMatch(JSON.stringify(auxiliaryRoleRead), /iam:PutRolePolicy/);
  const deployerSelfRead = bootstrap.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement.find(
    statement => Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'iam:GetRolePolicy'
      && statement.Resource === 'arn:aws:iam::528314240275:role/kidults-autonomous-landing-deployer-staging-v1',
  );
  assert.ok(deployerSelfRead);
  const ledgerWriterCodeUpdate = bootstrap.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement.find(
    statement => Array.isArray(statement.Action) && statement.Action.includes('lambda:UpdateFunctionCode'),
  );
  assert.deepEqual(ledgerWriterCodeUpdate?.Action, ['lambda:GetFunction', 'lambda:UpdateFunctionCode', 'lambda:UpdateFunctionConfiguration']);
  assert.equal(ledgerWriterCodeUpdate?.Resource, 'arn:aws:lambda:ap-northeast-2:528314240275:function:kidults-autonomous-ledger-writer-staging');
  assert.doesNotMatch(JSON.stringify(ledgerWriterCodeUpdate), /Resource":"\*"/);

  assert.match(source, /kidults-autonomous-track-staging-role/);
  assert.match(source, /kidults-autonomous-kpmo-staging-role/);
  assert.match(source, /kidults-autonomous-verifier-staging-role/);
  const approvalWrite = bootstrap.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement.find(
    statement => Array.isArray(statement.Action) && statement.Action.includes('iam:PutRolePolicy'),
  );
  assert.deepEqual(approvalWrite?.Resource, [
    'arn:aws:iam::528314240275:role/kidults-autonomous-track-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-kpmo-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-verifier-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-ledger-writer-staging-role',
    'arn:aws:iam::528314240275:role/kidults-autonomous-finalizer-staging-role',
  ]);
});

test('PassRole is the sole bootstrap delta from exact landed configuration closure', () => {
  // Canonical bootstrap JSON at exact main 34ff0ffc48c773d41ad7587233d69ea48b2f3282.
  const beforeDigest = 'fc59c7104f1f60be71550906972add2e443da66bc12c6c1607dd7bcf86d078f4';
  const after = structuredClone(bootstrap);
  const statements = after.Resources.DeployerRole.Properties.Policies[0].PolicyDocument.Statement;
  const passRole = statements.filter(statement => (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('iam:PassRole'));
  assert.equal(passRole.length, 1);
  assert.deepEqual(passRole[0], {
    Effect: 'Allow',
    Action: ['iam:PassRole'],
    Resource: 'arn:aws:iam::528314240275:role/kidults-autonomous-ledger-writer-staging-role',
    Condition: {StringEquals: {'iam:PassedToService': 'lambda.amazonaws.com'}},
  });
  statements.splice(statements.indexOf(passRole[0]), 1);
  assert.equal(createHash('sha256').update(JSON.stringify(stable(after))).digest('hex'), beforeDigest,
    'all existing permissions, resources, trust, and properties remain exact');
});

test('all approval roles carry one exact ledger-key decrypt and no KMS decrypt wildcard', () => {
  for (const roleId of roleIds) {
    const statements = desired.Resources[roleId].Properties.Policies[0].PolicyDocument.Statement;
    const decrypts = statements.filter(statement =>
      (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('kms:Decrypt'));
    assert.equal(decrypts.length, 1);
    assert.deepEqual(decrypts[0].Resource, {'Fn::GetAtt': ['AutonomousLedgerKey', 'Arn']});
  }
});

test('finalizer carries one exact ledger-key decrypt without widening existing receipt-key decrypt', () => {
  const statements = desired.Resources.FinalizerRole.Properties.Policies[0].PolicyDocument.Statement;
  const ledgerDecrypts = statements.filter(statement =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('kms:Decrypt')
    && same(statement.Resource, {'Fn::GetAtt': ['AutonomousLedgerKey', 'Arn']}));
  assert.equal(ledgerDecrypts.length, 1);
  const kmsResources = statements
    .filter(statement => (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('kms:Decrypt'))
    .map(statement => statement.Resource);
  assert.ok(kmsResources.every(resource => same(resource, {'Fn::GetAtt': ['AutonomousLedgerKey', 'Arn']})
    || same(resource, {'Fn::GetAtt': ['AutonomousReceiptKey', 'Arn']})));
});

test('ledger writer has only exact ledger-key Decrypt plus signing-key Verify as KMS actions', () => {
  const statements = desired.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement;
  const decrypts = statements.filter(statement =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('kms:Decrypt'));
  assert.equal(decrypts.length, 1);
  const kmsActions = statements.flatMap(statement =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).filter(Boolean).filter(action => action.startsWith('kms:')));
  assert.deepEqual(kmsActions.sort(), ['kms:Decrypt','kms:Verify'].sort());
});

test('manifest binds bootstrap and bounded STAGING validator as execution authorization controls', () => {
  const byPath = new Map(approvalManifest.files.map(file => [file.path, file]));
  for (const control of [
    'infrastructure/aws/staging/autonomous-landing-deployer-bootstrap-v1.json',
    'scripts/governance/validate-autonomous-landing-staging-deployment-v1.mjs',
  ]) {
    assert.equal(byPath.get(control)?.classification, 'EXECUTION_AUTHORIZATION_CONTROL');
    assert.ok(byPath.get(control)?.authorization_routing);
  }
});

test('deployment workflow auto-converges bounded STAGING deltas while preserving Owner recovery and OIDC bounds', () => {
  for (const marker of [
    "github.ref == 'refs/heads/main'",
    'github.actor == github.repository_owner',
    'github.sha == inputs.main_sha',
    'id-token: write',
    'inputs.template_sha256',
    'DEPLOY-STAGING-AUTONOMOUS-LANDING-',
    'validate-autonomous-landing-staging-deployment-v1.mjs',
    '--query TemplateBody --output json',
    'cloudformation describe-stack-events',
    'cloudformation-stack-events-failure.json',
    'kms:Decrypt',
    '03d855ac-8e8c-4465-9984-bbf92987c6a0',
    '088c00e6-bfc3-4aea-8dbf-b9e98ac2e8c7',
    'Verify governed deployer bootstrap prerequisite',
    'kidults-autonomous-landing-deployer-staging-v1',
    'kidults-autonomous-finalizer-staging-role',
    'finalizer_allowed_kms_action',
    'desired-template.compact.json',
    'if: always()',
    'push:',
    'AUTO-STAGING-AUTONOMOUS-LANDING-',
  ]) assert.ok(workflow.includes(marker), marker);
  assert.ok(workflow.indexOf('uses: actions/checkout@') < workflow.indexOf('actual_template_sha=$(sha256sum'), 'checkout must precede template hashing');
  assert.ok(!workflow.includes('schedule:'), 'normal STAGING convergence is protected-main push triggered, not scheduled');
  assert.doesNotMatch(workflow,/github\.event_name == 'schedule'/);
  assert.match(workflow,/\[ "\$GITHUB_EVENT_NAME" = push \]/);
  assert.doesNotMatch(workflow, /aws cloudformation get-template --stack-name \\\"\\$STACK_NAME\\\" --template-stage Original --query TemplateBody --output json > \\\"\\$RUNNER_TEMP\\\/current-template\\.json\\\"/);
  assert.ok(!workflow.includes('workflow_run:'));
  assert.ok(!workflow.includes('pull_request:'));
  assert.ok(!workflow.includes('secrets.'));
  assert.ok(!/inputs\.(command|script|stack_name|role_arn)/.test(workflow));
});

test('template validator accepts only the exact three-role Query delta and exact change set', () => {
  const changeSet = {
    Status: 'CREATE_COMPLETE',
    Changes: roleIds.map(LogicalResourceId => ({ResourceChange: {
      Action: 'Modify', LogicalResourceId, ResourceType: 'AWS::IAM::Role', Replacement: 'False',
      Details: [{Target: {Attribute: 'Properties', Name: 'Policies'}, ChangeSource: 'DirectModification'}],
    }})),
  };
  withFixture({current: currentTemplate(), desired, changeset: changeSet}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
      '--changeset', path.join(directory, 'changeset'),
    ], {encoding: 'utf8'});
    assert.equal(JSON.parse(output).mode, 'CHANGE_REQUIRED');
  });
});


test('template validator accepts deployed Query state that still lacks bounded ledger decrypt', () => {
  const current = structuredClone(desired);
  for (const logicalId of roleIds) {
    current.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement =
      current.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement.filter(
        statement => !(Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'kms:Decrypt'),
      );
  }
  withFixture({current, desired}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
    ], {encoding: 'utf8'});
    assert.equal(JSON.parse(output).mode, 'CHANGE_REQUIRED');
  });
});

test('template validator accepts rollback state with legacy Verifier DescribeTable plus Query', () => {
  const current = structuredClone(desired);
  const statements = current.Resources.VerifierApprovalRole.Properties.Policies[0].PolicyDocument.Statement;
  const query = statements.find(statement => same(statement, boundedQuery));
  query.Action = ['dynamodb:DescribeTable', 'dynamodb:Query'];
  const changeSet = {
    Status: 'CREATE_COMPLETE',
    Changes: [{ResourceChange: {
      Action: 'Modify', LogicalResourceId: 'VerifierApprovalRole', ResourceType: 'AWS::IAM::Role', Replacement: 'False',
      Details: [{Target: {Attribute: 'Properties', Name: 'Policies'}, ChangeSource: 'DirectModification'}],
    }}],
  };
  withFixture({current, desired, changeset: changeSet}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
      '--changeset', path.join(directory, 'changeset'),
    ], {encoding: 'utf8'});
    assert.equal(JSON.parse(output).mode, 'CHANGE_REQUIRED');
  });
});

test('template validator accepts exact CloudFormation dynamic dependency fanout for writer policy change', () => {
  const current = structuredClone(desired);
  current.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement =
    current.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement.filter(
      statement => !(Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'kms:Decrypt'),
    );
  const dynamic = (LogicalResourceId, ResourceType, Name, CausingEntity) => ({ResourceChange: {
    Action: 'Modify', LogicalResourceId, ResourceType, Replacement: 'False',
    Details: [{Target: {Attribute: 'Properties', Name}, Evaluation: 'Dynamic',
      ChangeSource: 'ResourceAttribute', CausingEntity}],
  }});
  const changeSet = {
    Status: 'CREATE_COMPLETE',
    Changes: [
      dynamic('AutonomousLedgerWriterFunction', 'AWS::Lambda::Function', 'Role', 'AutonomousLedgerWriterRole.Arn'),
      {ResourceChange: {
        Action: 'Modify', LogicalResourceId: 'AutonomousLedgerWriterRole', ResourceType: 'AWS::IAM::Role', Replacement: 'False',
        Details: [{Target: {Attribute: 'Properties', Name: 'Policies'}, Evaluation: 'Static', ChangeSource: 'DirectModification'}],
      }},
      dynamic('FinalizerRole', 'AWS::IAM::Role', 'Policies', 'AutonomousLedgerWriterFunction.Arn'),
      ...roleIds.map(logicalId => dynamic(logicalId, 'AWS::IAM::Role', 'Policies', 'AutonomousLedgerWriterFunction.Arn')),
    ],
  };
  withFixture({current, desired, changeset: changeSet}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
      '--changeset', path.join(directory, 'changeset'),
    ], {encoding: 'utf8'});
    assert.equal(JSON.parse(output).mode, 'CHANGE_REQUIRED');
  });
});


test('template validator accepts exact legacy ledger-writer code recovery and Lambda code change set', () => {
  const current = legacyWriterTemplate();
  const dynamic = (LogicalResourceId, ResourceType, Name, CausingEntity) => ({ResourceChange: {
    Action: 'Modify', LogicalResourceId, ResourceType, Replacement: 'False',
    Details: [{Target: {Attribute: 'Properties', Name}, Evaluation: 'Dynamic',
      ChangeSource: 'ResourceAttribute', CausingEntity}],
  }});
  const changeSet = {
    Status: 'CREATE_COMPLETE',
    Changes: [
      {ResourceChange: {
        Action: 'Modify', LogicalResourceId: 'AutonomousLedgerWriterFunction', ResourceType: 'AWS::Lambda::Function', Replacement: 'False',
        Details: [{Target: {Attribute: 'Properties', Name: 'Code'}, ChangeSource: 'DirectModification'}],
      }},
      dynamic('FinalizerRole', 'AWS::IAM::Role', 'Policies', 'AutonomousLedgerWriterFunction.Arn'),
      ...roleIds.map(logicalId => dynamic(logicalId, 'AWS::IAM::Role', 'Policies', 'AutonomousLedgerWriterFunction.Arn')),
    ],
  };
  withFixture({current, desired, changeset: changeSet}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
      '--changeset', path.join(directory, 'changeset'),
    ], {encoding: 'utf8'});
    assert.equal(JSON.parse(output).mode, 'CHANGE_REQUIRED');
  });
});

test('template validator rejects unclassified ledger-writer code drift', () => {
  const current = structuredClone(desired);
  current.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile += '\n# unreviewed code drift';
  withFixture({current, desired}, directory => {
    const result = spawnSync('node', [validator,
      '--current', path.join(directory, 'current'), '--desired', path.join(directory, 'desired'),
    ], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TEMPLATE_DELTA_EXCEEDS_BOUNDED_LEDGER_READ_OR_LEGACY_VERIFIER_READ/);
  });
});

test('template validator rejects unrecognized dynamic dependency fanout', () => {
  const current = structuredClone(desired);
  current.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement =
    current.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement.filter(
      statement => !(Array.isArray(statement.Action) && statement.Action.length === 1 && statement.Action[0] === 'kms:Decrypt'),
    );
  const changeSet = {
    Status: 'CREATE_COMPLETE',
    Changes: [
      {ResourceChange: {
        Action: 'Modify', LogicalResourceId: 'AutonomousLedgerWriterRole', ResourceType: 'AWS::IAM::Role', Replacement: 'False',
        Details: [{Target: {Attribute: 'Properties', Name: 'Policies'}, ChangeSource: 'DirectModification'}],
      }},
      {ResourceChange: {
        Action: 'Modify', LogicalResourceId: 'AutonomousLedgerWriterFunction', ResourceType: 'AWS::Lambda::Function', Replacement: 'False',
        Details: [{Target: {Attribute: 'Properties', Name: 'Environment'}, Evaluation: 'Dynamic',
          ChangeSource: 'ResourceAttribute', CausingEntity: 'AutonomousLedgerWriterRole.Arn'}],
      }},
    ],
  };
  withFixture({current, desired, changeset: changeSet}, directory => {
    const result = spawnSync('node', [validator,
      '--current', path.join(directory, 'current'),
      '--desired', path.join(directory, 'desired'),
      '--changeset', path.join(directory, 'changeset'),
    ], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CHANGE_SET_DYNAMIC_PROPERTY_INVALID/);
  });
});

test('template validator rejects unrelated resource mutation and extra change-set resources', () => {
  const current = currentTemplate();
  current.Resources.AutonomousLandingLedger.Properties.BillingMode = 'PROVISIONED';
  withFixture({current, desired}, directory => {
    const result = spawnSync('node', [validator,
      '--current', path.join(directory, 'current'), '--desired', path.join(directory, 'desired'),
    ], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TEMPLATE_DELTA_EXCEEDS_BOUNDED_LEDGER_READ_OR_LEGACY_VERIFIER_READ/);
  });
});

test('template validator recognizes an already applied exact template without creating another change set', () => {
  withFixture({current: desired, desired}, directory => {
    const output = execFileSync('node', [validator,
      '--current', path.join(directory, 'current'), '--desired', path.join(directory, 'desired'),
    ], {encoding: 'utf8'});
    assert.equal(JSON.parse(output).mode, 'ALREADY_APPLIED');
  });
});

test('template validator rejects duplicate shared budget IAM statements', () => {
  const duplicated = structuredClone(desired);
  duplicated.Resources.TrackApprovalRole.Properties.Policies[0].PolicyDocument.Statement.push(structuredClone(sharedBudgetStatement));
  withFixture({current: preRecoveryTemplate(), desired: duplicated}, directory => {
    const result = spawnSync('node', [validator,
      '--current', path.join(directory, 'current'), '--desired', path.join(directory, 'desired'),
    ], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BOUNDED_SHARED_BUDGET_STORE_STATEMENT_INVALID:TrackApprovalRole/);
  });
});

test('historic exact writer upgrades only code and bounded receipt-key environment without replacement',()=>{
  const changeset={Status:'CREATE_COMPLETE',Changes:[{ResourceChange:{Action:'Modify',LogicalResourceId:'AutonomousLedgerWriterFunction',ResourceType:'AWS::Lambda::Function',Replacement:'False',Details:['Code','Environment'].map(Name=>({Target:{Attribute:'Properties',Name},ChangeSource:'DirectModification'}))}}]};
  withFixture({current:preRecoveryTemplate(),desired,changeset},directory=>{
    const output=execFileSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired'),'--changeset',path.join(directory,'changeset')],{encoding:'utf8'});
    assert.equal(JSON.parse(output).mode,'CHANGE_REQUIRED');
  });
  assert.ok(Buffer.byteLength(JSON.stringify(desired))<=51200,'CloudFormation inline template must fit existing route');
});
for(const [name,mutate] of [
  ['legacy writer mutation',d=>{d.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile+='\n# unexpected';}],
  ['extra environment',d=>{d.Resources.AutonomousLedgerWriterFunction.Properties.Environment.Variables.EXTRA='unexpected';}],
  ['writer memory',d=>{d.Resources.AutonomousLedgerWriterFunction.Properties.MemorySize=1024;}],
  ['extra role authority',d=>{d.Resources.TrackApprovalRole.Properties.Policies[0].PolicyDocument.Statement.push({Effect:'Allow',Action:['dynamodb:PutItem'],Resource:'*'});}],
])test(`terminal recovery deploy rejects ${name}`,()=>{
  const changed=structuredClone(desired);mutate(changed);
  withFixture({current:preRecoveryTemplate(),desired:changed},directory=>{
    const result=spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'});
    assert.notEqual(result.status,0);
  });
});

const consumptionV1Template = () => {
  const current=structuredClone(desired);
  current.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile=current.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile.replace("        if any(attrs.get(key, {}).get('S') != value for key, value in\n               [('pk', pk), ('sk', sk), ('run_id', run_id), ('head_sha', head_sha),\n                ('state', 'CONSUMED'), ('merge_sha', merge_sha)]):\n            raise ValueError('CONSUME_NOT_CONFIRMED')\n        return {'ok': True, 'contract_version': '2.0.0', 'action': action, 'pk': attrs['pk']['S'], 'sk': attrs['sk']['S'],\n                'authorization_generation': generation, 'nonce_digest': nonce, 'run_id': attrs['run_id']['S'],\n                'head_sha': attrs['head_sha']['S'], 'merge_sha': attrs['merge_sha']['S'],\n                'state': attrs['state']['S'], 'conditional_write': True}\n","        if attrs.get('state', {}).get('S') != 'CONSUMED' or attrs.get('merge_sha', {}).get('S') != merge_sha:\n            raise ValueError('CONSUME_NOT_CONFIRMED')\n        return {'ok': True, 'action': action, 'pk': pk, 'sk': sk}\n");
  assert.equal(createHash("sha256").update(current.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile).digest("hex"),"3d2042663c64ce97360bb53ecb6758fea25303e0c2edd9966badee8717cd85ad");
  return current;
};
test('last successful deployed consumption V1 converges directly to the original terminal repair capsule',()=>{
  const latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  withFixture({current:consumptionV1Template(),desired:latest},directory=>{
    const output=execFileSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'});
    assert.equal(JSON.parse(output).mode,'CHANGE_REQUIRED');
  });
});
for(const [name,mutate] of [
  ['capsule code drift',d=>{d.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile+='\n# drift';}],
  ['receipt bucket drift',d=>{d.Resources.AutonomousLedgerWriterFunction.Properties.Environment.Variables.RECEIPT_BUCKET={Ref:'OtherBucket'};}],
  ['extra environment',d=>{d.Resources.AutonomousLedgerWriterFunction.Properties.Environment.Variables.EXTRA='unexpected';}],
  ['extra IAM authority',d=>{d.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement.push({Effect:'Allow',Action:['dynamodb:Scan'],Resource:'*'});}],
])test(`consumption V1 catch-up rejects ${name}`,()=>{
  const latest=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
  mutate(latest);
  withFixture({current:consumptionV1Template(),desired:latest},directory=>{
    const result=spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'});
    assert.notEqual(result.status,0);
  });
});
test('pre-recovery V2 and full V2 cannot downgrade to historical V1',()=>{
 const before=structuredClone(desired);
 before.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile=fs.readFileSync('scripts/kidults/kpmo/lib/autonomous-landing-ledger-core-v2.py','utf8');
 delete before.Resources.AutonomousLedgerWriterFunction.Properties.Environment.Variables.RECEIPT_KEY_ARN;
 for(const current of [before,desired])withFixture({current,desired:consumptionV1Template()},directory=>{
   const result=spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'});assert.notEqual(result.status,0);
 });
});
test('exact consumption v1 to v2 accepts only code modification',()=>{
  const changeset={Status:'CREATE_COMPLETE',Changes:[{ResourceChange:{Action:'Modify',LogicalResourceId:'AutonomousLedgerWriterFunction',ResourceType:'AWS::Lambda::Function',Replacement:'False',Details:[{Target:{Attribute:'Properties',Name:'Code'},ChangeSource:'DirectModification'}]}}]};
  withFixture({current:consumptionV1Template(),desired,changeset},directory=>{
    const result=spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired'),'--changeset',path.join(directory,'changeset')],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  });
});
for(const [name,mutate] of [
 ['code drift',d=>{d.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile+='\n# unexpected';}],
 ['memory drift',d=>{d.Resources.AutonomousLedgerWriterFunction.Properties.MemorySize=1024;}],
 ['environment drift',d=>{d.Resources.AutonomousLedgerWriterFunction.Properties.Environment.Variables.EXTRA='unexpected';}],
 ['IAM drift',d=>{d.Resources.TrackApprovalRole.Properties.Policies[0].PolicyDocument.Statement.push({Effect:'Allow',Action:['dynamodb:PutItem'],Resource:'*'});}],
])test(`consumption tuple upgrade rejects ${name}`,()=>{
 const changed=structuredClone(desired);mutate(changed);
 withFixture({current:consumptionV1Template(),desired:changed},directory=>{
  const result=spawnSync('node',[validator,'--current',path.join(directory,'current'),'--desired',path.join(directory,'desired')],{encoding:'utf8'});
  assert.notEqual(result.status,0);
 });
});
