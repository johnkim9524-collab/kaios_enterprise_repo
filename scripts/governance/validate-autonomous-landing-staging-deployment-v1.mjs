#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROLE_IDS = ['TrackApprovalRole', 'KpmoApprovalRole', 'VerifierApprovalRole'];
const QUERY_STATEMENT = {
  Effect: 'Allow',
  Action: ['dynamodb:Query'],
  Resource: {'Fn::GetAtt': ['AutonomousLandingLedger', 'Arn']},
  Condition: {'ForAllValues:StringLike': {'dynamodb:LeadingKeys': ['AUTH#*']}},
};

const args = process.argv.slice(2);
const value = flag => {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error(`ARGUMENT_REQUIRED:${flag}`);
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
  for (const logicalId of ROLE_IDS) {
    const role = desired?.Resources?.[logicalId];
    assert.equal(role?.Type, 'AWS::IAM::Role', `ROLE_TYPE_INVALID:${logicalId}`);
    const statements = role?.Properties?.Policies?.[0]?.PolicyDocument?.Statement;
    assert.ok(Array.isArray(statements), `ROLE_POLICY_STATEMENTS_INVALID:${logicalId}`);
    assert.equal(statements.filter(statement => equal(statement, QUERY_STATEMENT)).length, 1,
      `BOUNDED_QUERY_STATEMENT_INVALID:${logicalId}`);
    const source = JSON.stringify(role);
    for (const forbidden of ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:BatchWriteItem']) {
      assert.ok(!source.includes(forbidden), `DYNAMODB_WRITE_FORBIDDEN:${logicalId}:${forbidden}`);
    }
  }
}

function withoutBoundedQuery(template) {
  const copy = structuredClone(template);
  for (const logicalId of ROLE_IDS) {
    const statements = copy.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement;
    copy.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement =
      statements.filter(statement => !equal(statement, QUERY_STATEMENT));
  }
  return copy;
}

function validateTemplates(current, desired) {
  assertDesiredBoundary(desired);
  if (equal(current, desired)) return 'ALREADY_APPLIED';
  assert.ok(equal(current, withoutBoundedQuery(desired)), 'TEMPLATE_DELTA_EXCEEDS_BOUNDED_LEDGER_QUERY');
  for (const logicalId of ROLE_IDS) {
    const statements = current.Resources[logicalId].Properties.Policies[0].PolicyDocument.Statement;
    assert.equal(statements.filter(statement => equal(statement, QUERY_STATEMENT)).length, 0,
      `CURRENT_TEMPLATE_ALREADY_CONTAINS_PARTIAL_QUERY:${logicalId}`);
  }
  return 'CHANGE_REQUIRED';
}

function validateChangeSet(changeSet) {
  assert.equal(changeSet?.Status, 'CREATE_COMPLETE', 'CHANGE_SET_NOT_CREATE_COMPLETE');
  const changes = changeSet?.Changes;
  assert.ok(Array.isArray(changes), 'CHANGE_SET_CHANGES_INVALID');
  assert.equal(changes.length, ROLE_IDS.length, 'CHANGE_SET_RESOURCE_COUNT_INVALID');
  const observed = new Set();
  for (const entry of changes) {
    const change = entry?.ResourceChange;
    assert.equal(change?.Action, 'Modify', 'CHANGE_SET_ACTION_INVALID');
    assert.equal(change?.ResourceType, 'AWS::IAM::Role', 'CHANGE_SET_RESOURCE_TYPE_INVALID');
    assert.ok(ROLE_IDS.includes(change?.LogicalResourceId), 'CHANGE_SET_LOGICAL_ID_INVALID');
    assert.ok(!observed.has(change.LogicalResourceId), 'CHANGE_SET_LOGICAL_ID_DUPLICATE');
    observed.add(change.LogicalResourceId);
    assert.ok(['False', false].includes(change?.Replacement), 'CHANGE_SET_REPLACEMENT_FORBIDDEN');
    for (const detail of change?.Details || []) {
      assert.equal(detail?.Target?.Attribute, 'Properties', 'CHANGE_SET_ATTRIBUTE_INVALID');
      assert.equal(detail?.Target?.Name, 'Policies', 'CHANGE_SET_PROPERTY_INVALID');
      assert.equal(detail?.ChangeSource, 'DirectModification', 'CHANGE_SET_SOURCE_INVALID');
    }
  }
  assert.deepEqual([...observed].sort(), [...ROLE_IDS].sort(), 'CHANGE_SET_ROLE_SET_INVALID');
}

const currentPath = value('--current');
const desiredPath = value('--desired');
const mode = validateTemplates(read(currentPath), read(desiredPath));
if (args.includes('--changeset')) {
  assert.equal(mode, 'CHANGE_REQUIRED', 'CHANGE_SET_NOT_ALLOWED_FOR_ALREADY_APPLIED_TEMPLATE');
  validateChangeSet(read(value('--changeset')));
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  mode,
  allowed_logical_ids: ROLE_IDS,
  allowed_action: 'dynamodb:Query',
  allowed_leading_key: 'AUTH#*',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
}));
