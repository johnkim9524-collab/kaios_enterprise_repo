import fs from 'node:fs';

const fail = (code, detail = null) => {
  const receipt = {
    id: 'kidults-cloudformation-drift-readback-v1',
    version: '1.0.0',
    state: 'VERIFIED_FAIL',
    failure_code: code,
    ...(detail === null ? {} : { detail }),
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  };
  process.stderr.write(`${JSON.stringify(receipt)}\n`);
  process.exit(1);
};

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith('--') || !value) fail('INVALID_ARGUMENTS');
  args.set(key.slice(2), value);
}

const readJson = (name, required = true) => {
  const path = args.get(name);
  if (!path) {
    if (required) fail('ARGUMENT_REQUIRED', name);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    fail('JSON_READ_FAILED', `${name}:${error.code || error.message}`);
  }
};

const drift = readJson('drift');
const stackStatus = args.get('stack-status');
if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(stackStatus)) {
  fail('STACK_STATUS_NOT_STABLE', stackStatus || 'MISSING');
}
if (drift.DetectionStatus !== 'DETECTION_COMPLETE') {
  fail('DRIFT_DETECTION_NOT_COMPLETE', {
    status: drift.DetectionStatus || 'MISSING',
    reason: drift.DetectionStatusReason || 'MISSING',
  });
}

if (drift.StackDriftStatus === 'IN_SYNC') {
  if (drift.DriftedStackResourceCount !== 0) {
    fail('IN_SYNC_COUNT_MISMATCH', drift.DriftedStackResourceCount);
  }
  process.stdout.write(`${JSON.stringify({
    id: 'kidults-cloudformation-drift-readback-v1',
    version: '1.0.0',
    state: 'VERIFIED_PASS',
    mode: 'IN_SYNC',
    drifted_resource_count: 0,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  })}\n`);
  process.exit(0);
}

if (drift.StackDriftStatus !== 'DRIFTED') {
  fail('UNKNOWN_STACK_DRIFT_STATUS', drift.StackDriftStatus || 'MISSING');
}

const resourceDrifts = readJson('resource-drifts');
if (!Array.isArray(resourceDrifts) || resourceDrifts.length === 0) {
  fail('DRIFTED_RESOURCES_REQUIRED');
}
if (drift.DriftedStackResourceCount !== resourceDrifts.length) {
  fail('DRIFT_COUNT_MISMATCH', {
    detected: drift.DriftedStackResourceCount,
    described: resourceDrifts.length,
  });
}

const allowedPaths = new Map([
  ['CloudTrailLogBucket', new Set(['/BucketEncryption', '/OwnershipControls', '/Tags'])],
  ['StagingAssuranceTrail', new Set(['/Tags'])],
]);
const observedPairs = [];
for (const resource of resourceDrifts) {
  if (resource.StackResourceDriftStatus !== 'MODIFIED') {
    fail('RESOURCE_DRIFT_STATUS_FORBIDDEN', {
      logical_resource_id: resource.LogicalResourceId,
      status: resource.StackResourceDriftStatus,
    });
  }
  const paths = allowedPaths.get(resource.LogicalResourceId);
  if (!paths) fail('UNKNOWN_DRIFT_RESOURCE', resource.LogicalResourceId || 'MISSING');
  if (!Array.isArray(resource.PropertyDifferences) || resource.PropertyDifferences.length === 0) {
    fail('PROPERTY_DIFFERENCES_REQUIRED', resource.LogicalResourceId);
  }
  for (const difference of resource.PropertyDifferences) {
    if (!paths.has(difference.PropertyPath)) {
      fail('UNKNOWN_DRIFT_PROPERTY', {
        logical_resource_id: resource.LogicalResourceId,
        property_path: difference.PropertyPath || 'MISSING',
      });
    }
    observedPairs.push(`${resource.LogicalResourceId}:${difference.PropertyPath}`);
  }
}

const encryption = readJson('encryption');
const ownership = readJson('ownership');
const bucketTags = readJson('bucket-tags');
const trailTags = readJson('trail-tags');

const rule = encryption?.ServerSideEncryptionConfiguration?.Rules?.[0];
if (rule?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm !== 'AES256') {
  fail('BUCKET_ENCRYPTION_MISMATCH');
}
// S3 bucket keys only affect SSE-KMS. CloudFormation/S3 may omit the field for
// AES256, so encryption correctness is established by the effective algorithm.
if (rule.BucketKeyEnabled !== undefined && typeof rule.BucketKeyEnabled !== 'boolean') {
  fail('BUCKET_KEY_READBACK_INVALID');
}
if (ownership?.OwnershipControls?.Rules?.[0]?.ObjectOwnership !== 'BucketOwnerEnforced') {
  fail('BUCKET_OWNERSHIP_MISMATCH');
}

const requiredTags = new Map([
  ['Environment', 'STAGING'],
  ['System', 'CloudTrailContinuousAssurance'],
  ['Production', 'HOLD'],
  ['Public', 'HOLD'],
  ['G5', 'HOLD'],
]);
const verifyTags = (entries, scope) => {
  if (!Array.isArray(entries)) fail('TAG_LIST_REQUIRED', scope);
  const actual = new Map(entries.map(({ Key, Value }) => [Key, Value]));
  for (const [key, value] of requiredTags) {
    if (actual.get(key) !== value) fail('REQUIRED_TAG_MISMATCH', { scope, key });
  }
};
verifyTags(bucketTags?.TagSet, 'BUCKET');
verifyTags(trailTags?.ResourceTagList?.[0]?.TagsList, 'TRAIL');

process.stdout.write(`${JSON.stringify({
  id: 'kidults-cloudformation-drift-readback-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  mode: 'KNOWN_PROVIDER_READBACK_GAP_DIRECT_API_PASS',
  drifted_resource_count: resourceDrifts.length,
  observed_pairs: observedPairs.sort(),
  bucket_encryption: 'AES256',
  bucket_ownership: 'BucketOwnerEnforced',
  required_tags_verified: [...requiredTags.keys()],
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
})}\n`);
