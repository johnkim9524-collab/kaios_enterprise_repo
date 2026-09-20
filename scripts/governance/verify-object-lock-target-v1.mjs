#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function fail(code) { throw new Error(code); }
function exactObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

export function validateObjectLockTargetEvidence(evidence) {
  if (!exactObject(evidence) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(evidence.bucket ?? '')
    || typeof evidence.region !== 'string' || evidence.region.length < 3
    || typeof evidence.kmsKeyArn !== 'string' || !evidence.kmsKeyArn.startsWith('arn:')
    || typeof evidence.providerFailureDomain !== 'string'
    || typeof evidence.administrativeDomain !== 'string') fail('OBJECT_LOCK_TARGET_INPUT_INVALID');
  const failures = [];
  const rule = evidence.objectLock?.Rule?.DefaultRetention;
  if (evidence.objectLock?.ObjectLockEnabled !== 'Enabled') failures.push('OBJECT_LOCK_NOT_ENABLED');
  if (rule?.Mode !== 'COMPLIANCE') failures.push('COMPLIANCE_MODE_NOT_DEFAULT');
  if (!Number.isInteger(rule?.Years) || rule.Years < 10) failures.push('TEN_YEAR_RETENTION_NOT_DEFAULT');
  if (evidence.versioning?.Status !== 'Enabled') failures.push('VERSIONING_NOT_ENABLED');
  const encryption = evidence.encryption?.Rules?.[0]?.ApplyServerSideEncryptionByDefault;
  if (encryption?.SSEAlgorithm !== 'aws:kms'
    || encryption.KMSMasterKeyID !== evidence.kmsKeyArn) failures.push('EXPECTED_KMS_ENCRYPTION_NOT_DEFAULT');
  const publicBlock = evidence.publicAccess?.PublicAccessBlockConfiguration;
  if (!publicBlock || ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy',
    'RestrictPublicBuckets'].some(key => publicBlock[key] !== true)) failures.push('PUBLIC_ACCESS_NOT_FULLY_BLOCKED');
  const key = evidence.kms?.KeyMetadata;
  if (key?.Arn !== evidence.kmsKeyArn || key.KeyState !== 'Enabled'
    || key.KeyUsage !== 'ENCRYPT_DECRYPT') failures.push('KMS_KEY_NOT_USABLE');
  if (evidence.providerFailureDomain === 'github') failures.push('PROVIDER_DOMAIN_NOT_INDEPENDENT');
  if (evidence.administrativeDomain === 'primary') failures.push('ADMIN_DOMAIN_NOT_INDEPENDENT');
  return Object.freeze({
    contractId: 'kidults-object-lock-target-verification-v1', version: '1.0.0',
    state: failures.length === 0 ? 'OBJECT_LOCK_TARGET_VERIFIED' : 'HOLD',
    bucket: evidence.bucket, region: evidence.region,
    providerFailureDomain: evidence.providerFailureDomain,
    administrativeDomain: evidence.administrativeDomain, failures,
    uploadAuthorized: failures.length === 0, automaticPromotion: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) fail('OBJECT_LOCK_ARGUMENTS_INVALID');
  return process.argv[index + 1];
}
export function awsEnvironment(source = process.env) {
  return {
    PATH: source.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
    AWS_ACCESS_KEY_ID: source.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: source.AWS_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN: source.AWS_SESSION_TOKEN,
    AWS_PROFILE: source.AWS_PROFILE,
    AWS_CONFIG_FILE: source.AWS_CONFIG_FILE,
    AWS_SHARED_CREDENTIALS_FILE: source.AWS_SHARED_CREDENTIALS_FILE,
    HTTPS_PROXY: source.HTTPS_PROXY,
    https_proxy: source.https_proxy,
    HTTP_PROXY: source.HTTP_PROXY,
    http_proxy: source.http_proxy,
    NO_PROXY: source.NO_PROXY,
    no_proxy: source.no_proxy,
    REQUESTS_CA_BUNDLE: source.REQUESTS_CA_BUNDLE,
    SSL_CERT_FILE: source.SSL_CERT_FILE,
  };
}
export function unwrapAwsResponse(response, wrapper) {
  return exactObject(response?.[wrapper]) ? response[wrapper] : response;
}
function aws(args) {
  try {
    return JSON.parse(execFileSync('aws', [...args, '--output', 'json', '--no-cli-pager'], {
      encoding: 'utf8', timeout: 30000,
      env: awsEnvironment(),
    }));
  } catch { fail('OBJECT_LOCK_PROVIDER_QUERY_FAILED'); }
}

function main() {
  const bucket = argument('--bucket');
  const region = argument('--region');
  const kmsKeyArn = argument('--kms-key-arn');
  const common = ['--bucket', bucket, '--region', region];
  const objectLock = aws(['s3api', 'get-object-lock-configuration', ...common]);
  const encryption = aws(['s3api', 'get-bucket-encryption', ...common]);
  const evidence = {
    bucket, region, kmsKeyArn,
    providerFailureDomain: argument('--provider-domain'),
    administrativeDomain: argument('--admin-domain'),
    objectLock: unwrapAwsResponse(objectLock, 'ObjectLockConfiguration'),
    versioning: aws(['s3api', 'get-bucket-versioning', ...common]),
    encryption: unwrapAwsResponse(encryption, 'ServerSideEncryptionConfiguration'),
    publicAccess: aws(['s3api', 'get-public-access-block', ...common]),
    kms: aws(['kms', 'describe-key', '--key-id', kmsKeyArn, '--region', region]),
  };
  const result = validateObjectLockTargetEvidence(evidence);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.state !== 'OBJECT_LOCK_TARGET_VERIFIED') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`${JSON.stringify({
      contractId: 'kidults-object-lock-target-verification-v1', state: 'HOLD',
      reason: /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'OBJECT_LOCK_INTERNAL_ERROR',
      uploadAuthorized: false, automaticPromotion: false, production: 'HOLD',
      publicRelease: 'HOLD', g5: 'HOLD',
    })}\n`);
    process.exitCode = 1;
  }
}
