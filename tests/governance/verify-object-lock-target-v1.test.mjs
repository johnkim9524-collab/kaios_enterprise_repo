import assert from 'node:assert/strict';
import test from 'node:test';
import { awsEnvironment, unwrapAwsResponse,
  validateObjectLockTargetEvidence } from '../../scripts/governance/verify-object-lock-target-v1.mjs';

const kmsKeyArn = 'arn:aws:kms:ap-northeast-2:123456789012:key/example';
function fixture(overrides = {}) {
  return {
    bucket: 'kidults-recovery-example', region: 'ap-northeast-2', kmsKeyArn,
    providerFailureDomain: 'aws-recovery-account', administrativeDomain: 'recovery-custodian',
    objectLock: { ObjectLockEnabled: 'Enabled', Rule: { DefaultRetention: {
      Mode: 'COMPLIANCE', Years: 10 } } },
    versioning: { Status: 'Enabled' },
    encryption: { Rules: [{ ApplyServerSideEncryptionByDefault: {
      SSEAlgorithm: 'aws:kms', KMSMasterKeyID: kmsKeyArn } }] },
    publicAccess: { PublicAccessBlockConfiguration: { BlockPublicAcls: true,
      IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } },
    kms: { KeyMetadata: { Arn: kmsKeyArn, KeyState: 'Enabled', KeyUsage: 'ENCRYPT_DECRYPT' } },
    ...overrides,
  };
}

test('verifies an independent ten-year compliance target', () => {
  const result = validateObjectLockTargetEvidence(fixture());
  assert.equal(result.state, 'OBJECT_LOCK_TARGET_VERIFIED');
  assert.equal(result.uploadAuthorized, true);
  assert.deepEqual(result.failures, []);
});

test('holds governance mode, short retention, and disabled versioning', () => {
  const input = fixture();
  input.objectLock.Rule.DefaultRetention = { Mode: 'GOVERNANCE', Years: 2 };
  input.versioning.Status = 'Suspended';
  const result = validateObjectLockTargetEvidence(input);
  assert.equal(result.state, 'HOLD');
  assert.equal(result.uploadAuthorized, false);
  assert(result.failures.includes('COMPLIANCE_MODE_NOT_DEFAULT'));
  assert(result.failures.includes('TEN_YEAR_RETENTION_NOT_DEFAULT'));
  assert(result.failures.includes('VERSIONING_NOT_ENABLED'));
});

test('holds a public or incorrectly encrypted bucket', () => {
  const input = fixture();
  input.publicAccess.PublicAccessBlockConfiguration.RestrictPublicBuckets = false;
  input.encryption.Rules[0].ApplyServerSideEncryptionByDefault.KMSMasterKeyID = 'wrong-key';
  const result = validateObjectLockTargetEvidence(input);
  assert(result.failures.includes('PUBLIC_ACCESS_NOT_FULLY_BLOCKED'));
  assert(result.failures.includes('EXPECTED_KMS_ENCRYPTION_NOT_DEFAULT'));
});

test('holds same-provider or same-admin replicas', () => {
  const result = validateObjectLockTargetEvidence(fixture({
    providerFailureDomain: 'github', administrativeDomain: 'primary',
  }));
  assert(result.failures.includes('PROVIDER_DOMAIN_NOT_INDEPENDENT'));
  assert(result.failures.includes('ADMIN_DOMAIN_NOT_INDEPENDENT'));
});

test('rejects malformed evidence instead of producing partial success', () => {
  assert.throws(() => validateObjectLockTargetEvidence({ bucket: '../bad' }),
    /OBJECT_LOCK_TARGET_INPUT_INVALID/);
});

test('passes configured proxy variables to provider queries without leaking unrelated state', () => {
  const environment = awsEnvironment({ PATH: '/bin', HTTPS_PROXY: 'https://proxy.example',
    NO_PROXY: 'localhost', REQUESTS_CA_BUNDLE: '/trusted/ca.pem',
    SSL_CERT_FILE: '/trusted/ca.pem', UNRELATED_SECRET: 'not-forwarded' });
  assert.equal(environment.HTTPS_PROXY, 'https://proxy.example');
  assert.equal(environment.NO_PROXY, 'localhost');
  assert.equal(environment.REQUESTS_CA_BUNDLE, '/trusted/ca.pem');
  assert.equal(environment.SSL_CERT_FILE, '/trusted/ca.pem');
  assert.equal(environment.UNRELATED_SECRET, undefined);
  assert.equal(environment.LANG, 'C.UTF-8');
  assert.equal(environment.TZ, 'UTC');
});

test('unwraps current AWS CLI response envelopes and preserves legacy direct responses', () => {
  const objectLock = { ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled' } };
  const encryption = { ServerSideEncryptionConfiguration: { Rules: [] } };
  assert.deepEqual(unwrapAwsResponse(objectLock, 'ObjectLockConfiguration'),
    { ObjectLockEnabled: 'Enabled' });
  assert.deepEqual(unwrapAwsResponse(encryption, 'ServerSideEncryptionConfiguration'),
    { Rules: [] });
  assert.deepEqual(unwrapAwsResponse({ Status: 'Enabled' }, 'Missing'), { Status: 'Enabled' });
});
