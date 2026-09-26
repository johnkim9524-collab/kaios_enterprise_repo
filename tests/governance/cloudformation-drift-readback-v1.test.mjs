import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = 'scripts/governance/validate-cloudformation-drift-readback-v1.mjs';
const base = {
  drift: { DetectionStatus: 'DETECTION_COMPLETE', StackDriftStatus: 'DRIFTED', DriftedStackResourceCount: 1 },
  resourceDrifts: [{ LogicalResourceId: 'CloudTrailLogBucket', StackResourceDriftStatus: 'MODIFIED', PropertyDifferences: [{ PropertyPath: '/BucketEncryption', ActualValue: 'null', DifferenceType: 'REMOVE' }] }],
  encryption: { ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] } },
  ownership: { OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] } },
  bucketTags: { TagSet: [] },
  trailTags: { ResourceTagList: [{ TagsList: [] }] },
};
const requiredTags = [
  { Key: 'Environment', Value: 'STAGING' },
  { Key: 'System', Value: 'CloudTrailContinuousAssurance' },
  { Key: 'Production', Value: 'HOLD' },
  { Key: 'Public', Value: 'HOLD' },
  { Key: 'G5', Value: 'HOLD' },
];
base.bucketTags.TagSet = requiredTags;
base.trailTags.ResourceTagList[0].TagsList = requiredTags;

const run = (overrides = {}) => {
  const fixture = structuredClone(base);
  Object.assign(fixture, overrides);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-drift-'));
  const args = [];
  for (const [name, value] of Object.entries(fixture)) {
    const file = path.join(dir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(value));
    args.push(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, file);
  }
  args.push('--stack-status', 'UPDATE_COMPLETE');
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
};

test('accepts a bounded provider readback gap only after direct API proof', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).mode, 'KNOWN_PROVIDER_READBACK_GAP_DIRECT_API_PASS');
});

test('accepts a clean stack without direct readback fixtures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-drift-'));
  const file = path.join(dir, 'drift.json');
  fs.writeFileSync(file, JSON.stringify({ DetectionStatus: 'DETECTION_COMPLETE', StackDriftStatus: 'IN_SYNC', DriftedStackResourceCount: 0 }));
  const result = spawnSync(process.execPath, [script, '--drift', file, '--stack-status', 'UPDATE_COMPLETE'], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).mode, 'IN_SYNC');
});

test('rejects unknown resources and properties', () => {
  let result = run({ resourceDrifts: [{ LogicalResourceId: 'Unknown', StackResourceDriftStatus: 'MODIFIED', PropertyDifferences: [{ PropertyPath: '/Tags' }] }] });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).failure_code, 'UNKNOWN_DRIFT_RESOURCE');
  result = run({ resourceDrifts: [{ LogicalResourceId: 'CloudTrailLogBucket', StackResourceDriftStatus: 'MODIFIED', PropertyDifferences: [{ PropertyPath: '/PublicAccessBlockConfiguration' }] }] });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).failure_code, 'UNKNOWN_DRIFT_PROPERTY');
});

test('rejects deleted resources, count mismatches, and missing HOLD tags', () => {
  let result = run({ resourceDrifts: [{ ...base.resourceDrifts[0], StackResourceDriftStatus: 'DELETED' }] });
  assert.equal(JSON.parse(result.stderr).failure_code, 'RESOURCE_DRIFT_STATUS_FORBIDDEN');
  result = run({ drift: { ...base.drift, DriftedStackResourceCount: 2 } });
  assert.equal(JSON.parse(result.stderr).failure_code, 'DRIFT_COUNT_MISMATCH');
  result = run({ bucketTags: { TagSet: requiredTags.filter(({ Key }) => Key !== 'Production') } });
  assert.equal(JSON.parse(result.stderr).failure_code, 'REQUIRED_TAG_MISMATCH');
});

test('rejects encryption and ownership mismatches', () => {
  let result = run({ encryption: { ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' } }] } } });
  assert.equal(JSON.parse(result.stderr).failure_code, 'BUCKET_ENCRYPTION_MISMATCH');
  result = run({ ownership: { OwnershipControls: { Rules: [{ ObjectOwnership: 'ObjectWriter' }] } } });
  assert.equal(JSON.parse(result.stderr).failure_code, 'BUCKET_OWNERSHIP_MISMATCH');
});

test('preserves the provider reason when drift detection itself fails', () => {
  const result = run({
    drift: {
      DetectionStatus: 'DETECTION_FAILED',
      DetectionStatusReason: 'User is not authorized to perform a required read action',
    },
  });
  assert.equal(result.status, 1);
  const receipt = JSON.parse(result.stderr);
  assert.equal(receipt.failure_code, 'DRIFT_DETECTION_NOT_COMPLETE');
  assert.deepEqual(receipt.detail, {
    status: 'DETECTION_FAILED',
    reason: 'User is not authorized to perform a required read action',
  });
});
