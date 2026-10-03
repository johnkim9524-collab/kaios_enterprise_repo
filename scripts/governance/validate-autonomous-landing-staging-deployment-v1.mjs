#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const APPROVAL_ROLE_IDS = ['TrackApprovalRole', 'KpmoApprovalRole', 'VerifierApprovalRole'];
const WRITER_ROLE_ID = 'AutonomousLedgerWriterRole';
const WRITER_FUNCTION_ID = 'AutonomousLedgerWriterFunction';
const FINALIZER_ROLE_ID = 'FinalizerRole';
const ROLE_IDS = [...APPROVAL_ROLE_IDS, WRITER_ROLE_ID, FINALIZER_ROLE_ID];
const QUERY_STATEMENT = {
  Effect: 'Allow',
  Action: ['dynamodb:Query'],
  Resource: {'Fn::GetAtt': ['AutonomousLandingLedger', 'Arn']},
  Condition: {'ForAllValues:StringLike': {'dynamodb:LeadingKeys': ['AUTH#*']}},
};
const LEGACY_VERIFIER_QUERY_STATEMENT = {
  ...QUERY_STATEMENT,
  Action: ['dynamodb:DescribeTable', 'dynamodb:Query'],
};
const LEDGER_DECRYPT_STATEMENT = {
  Effect: 'Allow',
  Action: ['kms:Decrypt'],
  Resource: {'Fn::GetAtt': ['AutonomousLedgerKey', 'Arn']},
};

const expectedLegacyWriterZipFromDesired = desiredZip => {
  const reserveBlock = "\ndef reserve_once(item):\n    try:\n        ddb.put_item(\n            TableName=TABLE,\n            Item=item,\n            ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)',\n            ReturnValuesOnConditionCheckFailure='ALL_OLD'\n        )\n        return {'state': 'RESERVED', 'owner_run_id': item['run_id']['S']}\n    except ClientError as error:\n        if error.response.get('Error', {}).get('Code') != 'ConditionalCheckFailedException':\n            raise\n        prior = error.response.get('Item') or {}\n        owner_run_id = prior.get('run_id', {}).get('S', '')\n        prior_head_sha = prior.get('head_sha', {}).get('S', '')\n        prior_state = prior.get('state', {}).get('S', '')\n        if prior_state != 'RESERVED' or prior_head_sha != item['head_sha']['S'] or not RUN_ID.fullmatch(owner_run_id):\n            raise ValueError('RESERVATION_CONFLICT_INVALID')\n        return {'state': 'ALREADY_RESERVED', 'owner_run_id': owner_run_id}\n";
  const desiredReservation = "        reservation = reserve_once({\n            'pk': {'S': pk}, 'sk': {'S': sk}, 'state': {'S': 'RESERVED'},\n            'run_id': {'S': run_id}, 'head_sha': {'S': head_sha}\n        })\n        return {'ok': True, 'action': action, 'pk': pk, 'sk': sk, **reservation}";
  const legacyReservation = "        put_unique({\n            'pk': {'S': pk}, 'sk': {'S': sk}, 'state': {'S': 'RESERVED'},\n            'run_id': {'S': run_id}, 'head_sha': {'S': head_sha}\n        })\n        return {'ok': True, 'action': action, 'pk': pk, 'sk': sk}";
  assert.ok(desiredZip.includes('from botocore.exceptions import ClientError'), 'WRITER_CODE_EXPECTED_CLIENT_ERROR_IMPORT');
  assert.ok(desiredZip.includes(reserveBlock), 'WRITER_CODE_EXPECTED_RESERVE_ONCE');
  assert.ok(desiredZip.includes(desiredReservation), 'WRITER_CODE_EXPECTED_RESERVATION_RETURN');
  return desiredZip
    .replace('from botocore.exceptions import ClientError\n', '')
    .replace(reserveBlock, '')
    .replace(desiredReservation, legacyReservation);
};
const PRE_CANONICAL_WRITER_SHA256 = '26d2928e70666e2b4d6be65ef9be4bdc53ca83e7d7848ecf796f7c165b6ae89d';
const sha256Hex = value => createHash('sha256').update(value).digest('hex');
const RECOVERY_BASE_WRITER_SHA256 = '2d8ffee622929b322de4b75957122ca44928cef08bad38a63a34b39d907e1b72';
const isExactPostmergeRecoveryWriterUpgrade = (current, desired) => {
  const from=current?.Resources?.[WRITER_FUNCTION_ID],to=desired?.Resources?.[WRITER_FUNCTION_ID];
  const source=from?.Properties?.Code?.ZipFile;
  if(typeof source!=='string'||sha256Hex(source)!==RECOVERY_BASE_WRITER_SHA256)return false;
  const expected=structuredClone(from);
  expected.Properties.Code.ZipFile=JSON.parse(execFileSync('python3',[
    'scripts/kidults/staging-operations/bundle-postmerge-recovery-ledger-v1.py','--emit-code-from-stdin'],
    {input:JSON.stringify(source),encoding:'utf8',timeout:10000,maxBuffer:262144,stdio:['pipe','pipe','pipe']}));
  expected.Properties.Environment.Variables.RECEIPT_KEY_ARN={'Fn::GetAtt':['AutonomousReceiptKey','Arn']};
  return equal(expected,to);
};
const isBoundedCanonicalWriterUpgrade = (currentZip, desiredZip) =>
  sha256Hex(currentZip) === PRE_CANONICAL_WRITER_SHA256 &&
  ['CREATE_CANONICAL_CLAIM','TAKEOVER_CANONICAL_CLAIM','COMMIT_CANONICAL_CLAIM','CREATE_CANONICAL_ALIAS',
   'CANONICAL_ALIAS_BINDING_INVALID','service_now = int(datetime.now(timezone.utc).timestamp())']
    .every(marker => desiredZip.includes(marker));
const isAllowedLegacyWriterCodeRecovery = (current, desired) => {
  const currentFunction = current?.Resources?.[WRITER_FUNCTION_ID];
  const desiredFunction = desired?.Resources?.[WRITER_FUNCTION_ID];
  if (currentFunction?.Type !== 'AWS::Lambda::Function' || desiredFunction?.Type !== 'AWS::Lambda::Function') return false;
  const currentZip = currentFunction.Properties?.Code?.ZipFile;
  const desiredZip = desiredFunction.Properties?.Code?.ZipFile;
  if (typeof currentZip !== 'string' || typeof desiredZip !== 'string' || currentZip === desiredZip) return false;
  const currentWithoutCode = structuredClone(currentFunction);
  const desiredWithoutCode = structuredClone(desiredFunction);
  delete currentWithoutCode.Properties.Code.ZipFile;
  delete desiredWithoutCode.Properties.Code.ZipFile;
  if (!equal(currentWithoutCode, desiredWithoutCode)) return false;
  return currentZip === expectedLegacyWriterZipFromDesired(desiredZip) || isBoundedCanonicalWriterUpgrade(currentZip, desiredZip);
};

const args = process.argv.slice(2);
const value = flag => {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error('ARGUMENT_REQUIRED:' + flag);
  return args[index + 1];
};
const stable = input => {
  if (Array.isArray(input)) return input.map(stable);
  if (input && typeof input === 'object') {
    return Object.fromEntries(Object.keys(input).sort().map(key => [key, stable(input[key])]));
  }
  return input;
};
const equal = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function assertDesiredBoundary(desired) {
  for (const logicalId of APPROVAL_ROLE_IDS) {
    const role = desired?.Resources?.[logicalId];
    assert.equal(role?.Type, 'AWS::IAM::Role', 'ROLE_TYPE_INVALID:' + logicalId);
    const statements = role?.Properties?.Policies?.[0]?.PolicyDocument?.Statement;
    assert.ok(Array.isArray(statements), 'ROLE_POLICY_STATEMENTS_INVALID:' + logicalId);
    assert.equal(statements.filter(statement => equal(statement, QUERY_STATEMENT)).length, 1,
      'BOUNDED_QUERY_STATEMENT_INVALID:' + logicalId);
    assert.equal(statements.filter(statement => equal(statement, LEDGER_DECRYPT_STATEMENT)).length, 1,
      'BOUNDED_LEDGER_DECRYPT_STATEMENT_INVALID:' + logicalId);
    const source = JSON.stringify(role);
    for (const forbidden of ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:BatchWriteItem']) {
      assert.ok(!source.includes(forbidden), 'DYNAMODB_WRITE_FORBIDDEN:' + logicalId + ':' + forbidden);
    }
  }
  const finalizer = desired?.Resources?.[FINALIZER_ROLE_ID];
  assert.equal(finalizer?.Type, 'AWS::IAM::Role', 'FINALIZER_ROLE_TYPE_INVALID');
  const finalizerStatements = finalizer?.Properties?.Policies?.[0]?.PolicyDocument?.Statement;
  assert.ok(Array.isArray(finalizerStatements), 'FINALIZER_ROLE_POLICY_STATEMENTS_INVALID');
  assert.equal(finalizerStatements.filter(statement => equal(statement, LEDGER_DECRYPT_STATEMENT)).length, 1,
    'BOUNDED_FINALIZER_LEDGER_DECRYPT_STATEMENT_INVALID');
  const writer = desired?.Resources?.[WRITER_ROLE_ID];
  assert.equal(writer?.Type, 'AWS::IAM::Role', 'WRITER_ROLE_TYPE_INVALID');
  const writerStatements = writer?.Properties?.Policies?.[0]?.PolicyDocument?.Statement;
  assert.ok(Array.isArray(writerStatements), 'WRITER_ROLE_POLICY_STATEMENTS_INVALID');
  assert.equal(writerStatements.filter(statement => equal(statement, LEDGER_DECRYPT_STATEMENT)).length, 1,
    'BOUNDED_WRITER_LEDGER_DECRYPT_STATEMENT_INVALID');
  const writerKmsActions = writerStatements.flatMap(statement =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).filter(Boolean).filter(action => String(action).startsWith('kms:')));
  assert.deepEqual(writerKmsActions.sort(), ['kms:Decrypt','kms:Verify'].sort(), 'WRITER_KMS_ACTION_BOUNDARY_INVALID');
}

function withoutBoundedRead(template) {
  const copy = structuredClone(template);
  for (const logicalId of APPROVAL_ROLE_IDS) {
    const statements = copy.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement;
    copy.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement =
      statements.filter(statement => !equal(statement, QUERY_STATEMENT) && !equal(statement, LEDGER_DECRYPT_STATEMENT));
  }
  const finalizerStatements = copy.Resources[FINALIZER_ROLE_ID].Properties.Policies[0].PolicyDocument.Statement;
  copy.Resources[FINALIZER_ROLE_ID].Properties.Policies[0].PolicyDocument.Statement =
    finalizerStatements.filter(statement => !equal(statement, LEDGER_DECRYPT_STATEMENT));
  const writerStatements = copy.Resources[WRITER_ROLE_ID].Properties.Policies[0].PolicyDocument.Statement;
  copy.Resources[WRITER_ROLE_ID].Properties.Policies[0].PolicyDocument.Statement =
    writerStatements.filter(statement => !equal(statement, LEDGER_DECRYPT_STATEMENT));
  return copy;
}

const isExactWriterGetItemUpgrade = (currentStatement, desiredStatement) => {
  if (!currentStatement || !desiredStatement) return false;
  const currentActions = currentStatement.Action;
  const desiredActions = desiredStatement.Action;
  if (!Array.isArray(currentActions) || !Array.isArray(desiredActions)) return false;
  if (!equal([...currentActions].sort(), ['dynamodb:PutItem','dynamodb:UpdateItem'].sort())) return false;
  if (!equal([...desiredActions].sort(), ['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem'].sort())) return false;
  return equal({...currentStatement,Action:desiredActions}, desiredStatement);
};

function normalizeAllowedRecoveryState(template, desired) {
  const copy = structuredClone(template);
  if(isExactPostmergeRecoveryWriterUpgrade(copy,desired)){
    copy.Resources[WRITER_FUNCTION_ID]=structuredClone(desired.Resources[WRITER_FUNCTION_ID]);
  }else if (isAllowedLegacyWriterCodeRecovery(copy, desired)) {
    copy.Resources[WRITER_FUNCTION_ID].Properties.Code.ZipFile = desired.Resources[WRITER_FUNCTION_ID].Properties.Code.ZipFile;
  }
  for (const logicalId of APPROVAL_ROLE_IDS) {
    const statements = copy.Resources?.[logicalId]?.Properties?.Policies?.[0]?.PolicyDocument?.Statement;
    assert.ok(Array.isArray(statements), 'CURRENT_ROLE_POLICY_STATEMENTS_INVALID:' + logicalId);
    let exactQueryCount = 0;
    let exactDecryptCount = 0;
    let legacyVerifierCount = 0;
    const normalizedStatements = [];
    for (const statement of statements) {
      if (equal(statement, QUERY_STATEMENT)) { exactQueryCount += 1; continue; }
      if (equal(statement, LEDGER_DECRYPT_STATEMENT)) { exactDecryptCount += 1; continue; }
      if (logicalId === 'VerifierApprovalRole' && equal(statement, LEGACY_VERIFIER_QUERY_STATEMENT)) {
        legacyVerifierCount += 1; continue;
      }
      normalizedStatements.push(statement);
    }
    assert.ok(exactQueryCount <= 1, 'CURRENT_TEMPLATE_DUPLICATE_QUERY:' + logicalId);
    assert.ok(exactDecryptCount <= 1, 'CURRENT_TEMPLATE_DUPLICATE_LEDGER_DECRYPT:' + logicalId);
    assert.ok(legacyVerifierCount <= 1, 'CURRENT_TEMPLATE_DUPLICATE_LEGACY_VERIFIER_QUERY');
    assert.ok(!(exactQueryCount && legacyVerifierCount), 'CURRENT_TEMPLATE_CONFLICTING_VERIFIER_QUERY');
    copy.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement = normalizedStatements;
  }
  const finalizerStatements = copy.Resources?.[FINALIZER_ROLE_ID]?.Properties?.Policies?.[0]?.PolicyDocument?.Statement;
  assert.ok(Array.isArray(finalizerStatements), 'CURRENT_FINALIZER_ROLE_POLICY_STATEMENTS_INVALID');
  const finalizerDecryptCount = finalizerStatements.filter(statement => equal(statement, LEDGER_DECRYPT_STATEMENT)).length;
  assert.ok(finalizerDecryptCount <= 1, 'CURRENT_TEMPLATE_DUPLICATE_FINALIZER_LEDGER_DECRYPT');
  copy.Resources[FINALIZER_ROLE_ID].Properties.Policies[0].PolicyDocument.Statement =
    finalizerStatements.filter(statement => !equal(statement, LEDGER_DECRYPT_STATEMENT));
  const writerStatements = copy.Resources?.[WRITER_ROLE_ID]?.Properties?.Policies?.[0]?.PolicyDocument?.Statement;
  const desiredWriterStatements = desired.Resources?.[WRITER_ROLE_ID]?.Properties?.Policies?.[0]?.PolicyDocument?.Statement;
  assert.ok(Array.isArray(writerStatements) && Array.isArray(desiredWriterStatements), 'CURRENT_WRITER_ROLE_POLICY_STATEMENTS_INVALID');
  const currentDdb = writerStatements.find(statement => Array.isArray(statement.Action) && statement.Action.includes('dynamodb:PutItem'));
  const desiredDdb = desiredWriterStatements.find(statement => Array.isArray(statement.Action) && statement.Action.includes('dynamodb:PutItem'));
  if (isExactWriterGetItemUpgrade(currentDdb, desiredDdb)) currentDdb.Action = [...desiredDdb.Action];
  const writerDecryptCount = writerStatements.filter(statement => equal(statement, LEDGER_DECRYPT_STATEMENT)).length;
  assert.ok(writerDecryptCount <= 1, 'CURRENT_TEMPLATE_DUPLICATE_WRITER_LEDGER_DECRYPT');
  copy.Resources[WRITER_ROLE_ID].Properties.Policies[0].PolicyDocument.Statement =
    writerStatements.filter(statement => !equal(statement, LEDGER_DECRYPT_STATEMENT));
  return copy;
}

function validateTemplates(current, desired) {
  assertDesiredBoundary(desired);
  if (equal(current, desired)) return 'ALREADY_APPLIED';
  assert.ok(
    equal(normalizeAllowedRecoveryState(current, desired), withoutBoundedRead(desired)),
    'TEMPLATE_DELTA_EXCEEDS_BOUNDED_LEDGER_READ_OR_LEGACY_VERIFIER_READ',
  );
  return 'CHANGE_REQUIRED';
}

function validateChangeSet(changeSet, current, desired) {
  assert.equal(changeSet?.Status, 'CREATE_COMPLETE', 'CHANGE_SET_NOT_CREATE_COMPLETE');
  const changes = changeSet?.Changes;
  assert.ok(Array.isArray(changes), 'CHANGE_SET_CHANGES_INVALID');
  const expectedChanged = ROLE_IDS.filter(logicalId => !equal(current.Resources[logicalId], desired.Resources[logicalId]));
  const recoveryWriterUpgrade=isExactPostmergeRecoveryWriterUpgrade(current,desired);
  if (recoveryWriterUpgrade||isAllowedLegacyWriterCodeRecovery(current, desired)) expectedChanged.push(WRITER_FUNCTION_ID);
  assert.ok(expectedChanged.length >= 1 && expectedChanged.length <= ROLE_IDS.length + 1, 'CHANGE_SET_EXPECTED_ROLE_COUNT_INVALID');

  const writerChanged = expectedChanged.includes(WRITER_ROLE_ID);
  const writerFunctionChanged = expectedChanged.includes(WRITER_FUNCTION_ID);
  const dynamicDependencies = new Map([
    ['AutonomousLedgerWriterFunction', {
      resourceType: 'AWS::Lambda::Function',
      targetName: 'Role',
      causingEntity: 'AutonomousLedgerWriterRole.Arn',
    }],
    ['FinalizerRole', {
      resourceType: 'AWS::IAM::Role',
      targetName: 'Policies',
      causingEntity: 'AutonomousLedgerWriterFunction.Arn',
    }],
    ...APPROVAL_ROLE_IDS.map(logicalId => [logicalId, {
      resourceType: 'AWS::IAM::Role',
      targetName: 'Policies',
      causingEntity: 'AutonomousLedgerWriterFunction.Arn',
    }]),
  ]);

  const directObserved = new Set();
  const resourceObserved = new Set();
  for (const entry of changes) {
    const change = entry?.ResourceChange;
    assert.equal(change?.Action, 'Modify', 'CHANGE_SET_ACTION_INVALID');
    assert.ok(['False', false].includes(change?.Replacement), 'CHANGE_SET_REPLACEMENT_FORBIDDEN');
    assert.ok(!resourceObserved.has(change?.LogicalResourceId), 'CHANGE_SET_LOGICAL_ID_DUPLICATE');
    resourceObserved.add(change.LogicalResourceId);

    const details = change?.Details || [];
    assert.ok(details.length >= 1, 'CHANGE_SET_DETAILS_REQUIRED');
    for (const detail of details) {
      assert.equal(detail?.Target?.Attribute, 'Properties', 'CHANGE_SET_ATTRIBUTE_INVALID');
      if (detail?.ChangeSource === 'DirectModification') {
        assert.ok(expectedChanged.includes(change?.LogicalResourceId), 'CHANGE_SET_DIRECT_LOGICAL_ID_INVALID');
        if (change?.LogicalResourceId === WRITER_FUNCTION_ID) {
          assert.equal(change?.ResourceType, 'AWS::Lambda::Function', 'CHANGE_SET_DIRECT_RESOURCE_TYPE_INVALID');
          assert.ok((recoveryWriterUpgrade?['Code','Environment']:['Code']).includes(detail?.Target?.Name),'CHANGE_SET_DIRECT_PROPERTY_INVALID');
        } else {
          assert.equal(change?.ResourceType, 'AWS::IAM::Role', 'CHANGE_SET_DIRECT_RESOURCE_TYPE_INVALID');
          assert.equal(detail?.Target?.Name, 'Policies', 'CHANGE_SET_DIRECT_PROPERTY_INVALID');
        }
        directObserved.add(change.LogicalResourceId);
        continue;
      }

      assert.ok(writerChanged || writerFunctionChanged, 'CHANGE_SET_DYNAMIC_WITHOUT_WRITER_OR_FUNCTION_CHANGE');
      assert.equal(detail?.ChangeSource, 'ResourceAttribute', 'CHANGE_SET_SOURCE_INVALID');
      assert.equal(detail?.Evaluation, 'Dynamic', 'CHANGE_SET_DYNAMIC_EVALUATION_INVALID');
      const allowed = dynamicDependencies.get(change?.LogicalResourceId);
      assert.ok(allowed, 'CHANGE_SET_DYNAMIC_LOGICAL_ID_INVALID');
      assert.equal(change?.ResourceType, allowed.resourceType, 'CHANGE_SET_DYNAMIC_RESOURCE_TYPE_INVALID');
      assert.equal(detail?.Target?.Name, allowed.targetName, 'CHANGE_SET_DYNAMIC_PROPERTY_INVALID');
      assert.equal(detail?.CausingEntity, allowed.causingEntity, 'CHANGE_SET_DYNAMIC_CAUSE_INVALID');
    }
  }

  assert.deepEqual([...directObserved].sort(), [...expectedChanged].sort(), 'CHANGE_SET_DIRECT_ROLE_SET_INVALID');
}

const currentPath = value('--current');
const desiredPath = value('--desired');
const current = read(currentPath);
const desired = read(desiredPath);
const mode = validateTemplates(current, desired);
if (args.includes('--changeset')) {
  assert.equal(mode, 'CHANGE_REQUIRED', 'CHANGE_SET_NOT_ALLOWED_FOR_ALREADY_APPLIED_TEMPLATE');
  validateChangeSet(read(value('--changeset')), current, desired);
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  mode,
  allowed_logical_ids: ROLE_IDS,
  allowed_actions: ['dynamodb:Query', 'dynamodb:GetItem', 'kms:Decrypt'],
  allowed_kms_resource: 'AutonomousLedgerKey',
  writer_allowed_kms_action: 'kms:Decrypt',
  finalizer_allowed_kms_action: 'kms:Decrypt',
  allowed_legacy_recovery: 'VerifierApprovalRole:dynamodb:DescribeTable+dynamodb:Query',
  allowed_leading_key: 'AUTH#*',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
}));
