#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { awsEnvironment } from './verify-object-lock-target-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
function fail(code) { throw new Error(code); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function checksum(bytes) { return createHash('sha256').update(bytes).digest('base64'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function safeBranch(branch) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch) || branch.includes('..')) {
    fail('DURABILITY_BRANCH_INVALID');
  }
  return branch.replaceAll('/', '--');
}
function exactKeys(value, keys) {
  return value && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort())
    === JSON.stringify([...keys].sort());
}

export function parseNodeTestCount(output) {
  const normalized = Buffer.isBuffer(output) ? output.toString('utf8') : String(output ?? '');
  const match = normalized.match(/(?:^|\n)(?:#|ℹ) tests (\d+)(?=\r?\n|$)/);
  return match ? Number(match[1]) : 0;
}

export function validateBatchInput(input) {
  const kmsPattern = /^arn:aws:kms:([a-z0-9-]+):[0-9]{12}:key\/[A-Za-z0-9-]+$/;
  const encryptionKey = input?.kmsKeyArn?.match(kmsPattern);
  const signingKey = input?.signingKeyArn?.match(kmsPattern);
  if (!input || !path.isAbsolute(input.checkpointRoot ?? '') || !path.isAbsolute(input.receiptRoot ?? '')
    || typeof input.branch !== 'string'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(input.bucket ?? '')
    || !/^[a-z]{2}-[a-z]+-[0-9]$/.test(input.region ?? '')
    || !encryptionKey || !signingKey || encryptionKey[1] !== input.region
    || signingKey[1] !== input.region || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(input.providerDomain ?? '')
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(input.adminDomain ?? '')
    || input.providerDomain === 'github' || input.adminDomain === 'primary') {
    fail('DURABILITY_BATCH_INPUT_INVALID');
  }
  safeBranch(input.branch);
  return Object.freeze({ ...input });
}

export function objectKeys(sourceSha) {
  if (!SHA.test(sourceSha)) fail('DURABILITY_SOURCE_SHA_INVALID');
  const prefix = `recovery/git/${sourceSha}`;
  return Object.freeze({ bundle: `${prefix}/source.bundle`, manifest: `${prefix}/manifest.json`,
    receipt: `${prefix}/receipt.json`, restore: `${prefix}/restore-drills` });
}

export function selectCurrentObjectVersion(response, key) {
  if (!response || typeof key !== 'string' || key.length < 1
    || (response.Versions !== undefined && !Array.isArray(response.Versions))
    || (response.DeleteMarkers !== undefined && !Array.isArray(response.DeleteMarkers))) {
    fail('DURABILITY_OBJECT_VERSION_STATE_INVALID');
  }
  const versions = (response.Versions ?? []).filter(item => item?.Key === key);
  const deleteMarkers = (response.DeleteMarkers ?? []).filter(item => item?.Key === key);
  if (deleteMarkers.some(item => item.IsLatest === true)) {
    fail('DURABILITY_OBJECT_CURRENT_VERSION_DELETED');
  }
  const current = versions.filter(item => item.IsLatest === true);
  if (current.length > 1 || (current.length === 0 && versions.length > 0)) {
    fail('DURABILITY_OBJECT_VERSION_STATE_INVALID');
  }
  if (current.length === 0) return null;
  if (typeof current[0].VersionId !== 'string' || current[0].VersionId.length < 1) {
    fail('DURABILITY_VERSION_ID_MISSING');
  }
  return current[0].VersionId;
}

export function buildReplicaReceipt({ sourceSha, sourceTree, observedAt, target, objects,
  signingKeyArn }) {
  const observed = Date.parse(observedAt);
  const minimumRetention = observed + 3650 * 24 * 60 * 60 * 1000;
  if (!SHA.test(sourceSha) || !SHA.test(sourceTree) || Number.isNaN(Date.parse(observedAt))
    || !Array.isArray(objects) || objects.length !== 2
    || objects.some(item => typeof item.key !== 'string' || typeof item.versionId !== 'string'
      || item.versionId.length < 1 || !DIGEST.test(item.sha256)
      || item.readBackSha256 !== item.sha256 || typeof item.providerChecksumSHA256 !== 'string'
      || item.providerChecksumSHA256.length < 20 || item.objectLockMode !== 'COMPLIANCE'
      || Number.isNaN(Date.parse(item.retainUntil))
      || Date.parse(item.retainUntil) < minimumRetention)) fail('DURABILITY_RECEIPT_INPUT_INVALID');
  return {
    contractId: 'kidults-cross-provider-object-lock-receipt-v1', version: '1.0.0',
    state: 'VERIFIED', sourceSha, sourceTree, readBackAt: observedAt,
    replica: { class: 'CROSS_PROVIDER_OBJECT_LOCK', providerFailureDomain: target.providerDomain,
      administrativeDomain: target.adminDomain, bucket: target.bucket, region: target.region,
      offsite: true, worm: true, retentionYears: 10,
      controls: ['SEPARATE_PROVIDER', 'SEPARATE_ADMIN_DOMAIN', 'OBJECT_LOCK_COMPLIANCE_MODE',
        'RETENTION_LEGAL_HOLD_CAPABLE'] },
    objects,
    encryption: { algorithm: 'aws:kms', keyArn: target.kmsKeyArn },
    signature: { algorithm: 'ED25519_SHA_512', keyArn: signingKeyArn,
      state: 'VERIFIED', detached: true },
    automaticPromotion: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
}

function aws(args) {
  try {
    return JSON.parse(execFileSync('aws', [...args, '--output', 'json', '--no-cli-pager'], {
      encoding: 'utf8', timeout: 120000, env: awsEnvironment(),
    }));
  } catch { fail('DURABILITY_AWS_OPERATION_FAILED'); }
}
function git(args, cwd) {
  try {
    return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8', timeout: 120000,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' },
    }).trim();
  } catch { fail('DURABILITY_RESTORE_GIT_FAILED'); }
}
function manifestFor(input) {
  const location = path.join(input.checkpointRoot, `${safeBranch(input.branch)}.json`);
  if (!existsSync(location)) fail('DURABILITY_CHECKPOINT_MANIFEST_MISSING');
  const manifest = JSON.parse(readFileSync(location, 'utf8'));
  const required = ['contractId', 'version', 'state', 'repository', 'branch', 'headSha',
    'bundleFile', 'bundleSha256', 'shallowCommits', 'createdAt', 'production', 'publicRelease',
    'g5', 'manifestDigest'];
  const { manifestDigest, ...unsigned } = manifest;
  if (!exactKeys(manifest, required) || manifest.branch !== input.branch || !SHA.test(manifest.headSha)
    || !/^sha256:[0-9a-f]{64}$/.test(manifest.bundleSha256)
    || manifestDigest !== `sha256:${sha256(Buffer.from(canonical(unsigned)))}`) {
    fail('DURABILITY_CHECKPOINT_MANIFEST_INVALID');
  }
  const bundle = path.join(input.checkpointRoot, manifest.bundleFile);
  if (!existsSync(bundle) || sha256(readFileSync(bundle)) !== manifest.bundleSha256.slice(7)) {
    fail('DURABILITY_CHECKPOINT_BUNDLE_INVALID');
  }
  return { manifest, manifestLocation: location, bundle };
}
function preflight(input) {
  try {
    const output = execFileSync(process.execPath, [path.join(root,
      'scripts/governance/verify-object-lock-target-v1.mjs'), '--bucket', input.bucket,
    '--region', input.region, '--kms-key-arn', input.kmsKeyArn,
    '--provider-domain', input.providerDomain, '--admin-domain', input.adminDomain], {
      cwd: root, encoding: 'utf8', timeout: 120000, env: awsEnvironment(),
    });
    const result = JSON.parse(output);
    if (result.state !== 'OBJECT_LOCK_TARGET_VERIFIED' || result.uploadAuthorized !== true) {
      fail('DURABILITY_TARGET_NOT_VERIFIED');
    }
  } catch (error) {
    if (error.message === 'DURABILITY_TARGET_NOT_VERIFIED') throw error;
    fail('DURABILITY_TARGET_NOT_VERIFIED');
  }
}
function readBackVersion({ input, key, file, sourceSha, sourceTree, temporary, versionId,
  extraMetadata = [] }) {
  const bytes = readFileSync(file);
  const digest = sha256(bytes);
  const retentionResponse = aws(['s3api', 'get-object-retention', '--region', input.region,
    '--bucket', input.bucket, '--key', key, '--version-id', versionId]);
  const retention = retentionResponse.Retention;
  if (retention?.Mode !== 'COMPLIANCE' || Number.isNaN(Date.parse(retention.RetainUntilDate))) {
    fail('DURABILITY_OBJECT_RETENTION_INVALID');
  }
  const destination = path.join(temporary, `${versionId.replaceAll(/[^A-Za-z0-9._-]/g, '_')}-${path.basename(key)}`);
  const downloaded = aws(['s3api', 'get-object', '--region', input.region, '--bucket', input.bucket,
    '--key', key, '--version-id', versionId, '--checksum-mode', 'ENABLED', destination]);
  if (downloaded.ChecksumSHA256 !== checksum(bytes) || sha256(readFileSync(destination)) !== digest) {
    fail('DURABILITY_READBACK_DIGEST_MISMATCH');
  }
  const expectedMetadata = Object.fromEntries([`source-sha=${sourceSha}`,
    `source-tree=${sourceTree}`, `sha256=${digest}`, 'durability-class=D10_IRREPLACEABLE',
    ...extraMetadata].map(item => item.split(/=(.*)/s).slice(0, 2)));
  if (downloaded.ServerSideEncryption !== 'aws:kms' || downloaded.SSEKMSKeyId !== input.kmsKeyArn
    || Object.entries(expectedMetadata).some(([name, value]) => downloaded.Metadata?.[name] !== value)) {
    fail('DURABILITY_EXISTING_OBJECT_CONTROLS_MISMATCH');
  }
  return { key, versionId, sha256: digest,
    providerChecksumSHA256: downloaded.ChecksumSHA256, readBackSha256: digest,
    objectLockMode: retention.Mode, retainUntil: retention.RetainUntilDate,
    metadata: downloaded.Metadata ?? {}, file: destination };
}
function putOrReuseAndReadBack({ input, key, file, contentType, sourceSha, sourceTree, temporary,
  extraMetadata = [] }) {
  const listed = aws(['s3api', 'list-object-versions', '--region', input.region,
    '--bucket', input.bucket, '--prefix', key, '--max-keys', '10']);
  let versionId = selectCurrentObjectVersion(listed, key);
  if (versionId === null) {
    const bytes = readFileSync(file);
    const digest = sha256(bytes);
    const uploaded = aws(['s3api', 'put-object', '--region', input.region, '--bucket', input.bucket,
      '--key', key, '--body', file, '--content-type', contentType, '--server-side-encryption',
      'aws:kms', '--ssekms-key-id', input.kmsKeyArn, '--checksum-algorithm', 'SHA256',
      '--checksum-sha256', checksum(bytes), '--metadata',
      [`source-sha=${sourceSha}`, `source-tree=${sourceTree}`, `sha256=${digest}`,
        'durability-class=D10_IRREPLACEABLE', ...extraMetadata].join(',')]);
    if (typeof uploaded.VersionId !== 'string') fail('DURABILITY_VERSION_ID_MISSING');
    versionId = uploaded.VersionId;
  }
  return readBackVersion({ input, key, file, sourceSha, sourceTree, temporary, versionId,
    extraMetadata });
}
function sign(input, file) {
  const signed = aws(['kms', 'sign', '--region', input.region, '--key-id', input.signingKeyArn,
    '--message', `fileb://${file}`, '--message-type', 'RAW', '--signing-algorithm',
    'ED25519_SHA_512']);
  if (typeof signed.Signature !== 'string') fail('DURABILITY_SIGNATURE_MISSING');
  verifySignature(input, file, signed.Signature);
  return signed.Signature;
}
function verifySignature(input, file, signature) {
  const verified = aws(['kms', 'verify', '--region', input.region, '--key-id', input.signingKeyArn,
    '--message', `fileb://${file}`, '--message-type', 'RAW', '--signature', signature,
    '--signing-algorithm', 'ED25519_SHA_512']);
  if (verified.SignatureValid !== true) fail('DURABILITY_SIGNATURE_INVALID');
}
function restore(input, object, manifest, temporary) {
  const destination = path.join(temporary, 'restored');
  git(['clone', '--quiet', object.file, destination], temporary);
  const sourceSha = git(['rev-parse', 'HEAD'], destination);
  const sourceTree = git(['rev-parse', 'HEAD^{tree}'], destination);
  if (sourceSha !== manifest.headSha) fail('DURABILITY_RESTORE_SHA_MISMATCH');
  if (manifest.shallowCommits.length > 0) {
    const shallowPath = path.resolve(destination,
      git(['rev-parse', '--git-path', 'shallow'], destination));
    writeFileSync(shallowPath, `${manifest.shallowCommits.join('\n')}\n`, {
      mode: 0o600, flag: 'w',
    });
  }
  // Bundle clones can legitimately restore at a detached HEAD. Give tests that exercise
  // branch-bound checkpoint creation an isolated, non-authoritative branch without changing
  // the restored commit or tree.
  try { git(['symbolic-ref', '--quiet', 'HEAD'], destination); }
  catch { git(['switch', '--quiet', '-c', 'durability-isolated-restore'], destination); }
  if (git(['rev-parse', 'HEAD'], destination) !== sourceSha
    || git(['rev-parse', 'HEAD^{tree}'], destination) !== sourceTree) {
    fail('DURABILITY_RESTORE_IDENTITY_CHANGED');
  }
  const tests = readdirSync(path.join(destination, 'tests/governance'))
    .filter(name => name.endsWith('.test.mjs')).sort()
    .map(name => path.join(destination, 'tests/governance', name));
  let testOutput;
  try {
    testOutput = execFileSync(process.execPath, ['--test', ...tests], { cwd: destination, timeout: 120000,
      stdio: 'pipe', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' } });
  } catch { fail('DURABILITY_RESTORE_TESTS_FAILED'); }
  const total = parseNodeTestCount(testOutput);
  if (total < 1) fail('DURABILITY_RESTORE_TEST_COUNT_MISSING');
  return { sourceSha, sourceTree, testsPassed: total };
}

export function runDecadeDurabilityBatch(rawInput) {
  const input = validateBatchInput(rawInput);
  preflight(input);
  const { manifest, manifestLocation, bundle } = manifestFor(input);
  const sourceTree = git(['rev-parse', `${manifest.headSha}^{tree}`], root);
  const keys = objectKeys(manifest.headSha);
  const temporary = path.join(os.tmpdir(), `kidults-durability-${process.pid}-${Date.now()}`);
  mkdirSync(temporary, { recursive: false, mode: 0o700 });
  mkdirSync(input.receiptRoot, { recursive: true, mode: 0o700 });
  try {
    const bundleObject = putOrReuseAndReadBack({ input, key: keys.bundle, file: bundle,
      contentType: 'application/x-git-bundle', sourceSha: manifest.headSha, sourceTree, temporary });
    const manifestObject = putOrReuseAndReadBack({ input, key: keys.manifest, file: manifestLocation,
      contentType: 'application/json', sourceSha: manifest.headSha, sourceTree, temporary });
    const restored = restore(input, bundleObject, manifest, temporary);
    const receipt = buildReplicaReceipt({ sourceSha: manifest.headSha, sourceTree,
      observedAt: new Date().toISOString(), target: input,
      objects: [bundleObject, manifestObject].map(({ file: omitted, metadata: omittedMetadata,
        ...item }) => item),
      signingKeyArn: input.signingKeyArn });
    receipt.restoreDrill = { state: 'VERIFIED', completedAt: new Date().toISOString(),
      sourceSha: restored.sourceSha, sourceTree: restored.sourceTree, testsState: 'VERIFIED',
      testsPassed: restored.testsPassed, isolated: true, independentCustodian: false };
    const receiptFile = path.join(input.receiptRoot, `object-lock-${manifest.headSha}.json`);
    writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    const signature = sign(input, receiptFile);
    const receiptObject = putOrReuseAndReadBack({ input, key: keys.receipt, file: receiptFile,
      contentType: 'application/json', sourceSha: manifest.headSha, sourceTree, temporary,
      extraMetadata: [`kms-signature=${signature}`, 'signature-algorithm=ED25519_SHA_512',
        `signature-key-id=${input.signingKeyArn.split('/').at(-1)}`] });
    if (receiptObject.metadata['kms-signature'] !== signature
      || receiptObject.metadata['signature-algorithm'] !== 'ED25519_SHA_512') {
      fail('DURABILITY_RECEIPT_SIGNATURE_METADATA_INVALID');
    }
    verifySignature(input, receiptObject.file, signature);
    return Object.freeze({ contractId: 'kidults-decade-durability-batch-result-v1',
      version: '1.0.0', state: 'OBJECT_LOCK_REPLICA_AND_RESTORE_VERIFIED',
      sourceSha: manifest.headSha, sourceTree, receiptDigest: receiptObject.sha256,
      receiptVersionId: receiptObject.versionId, retentionUntil: receiptObject.retainUntil,
      testsPassed: restored.testsPassed, offlineColdCopy: 'HOLD', automaticPromotion: false,
      production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) fail('DURABILITY_BATCH_ARGUMENTS_INVALID');
  return process.argv[index + 1];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = runDecadeDurabilityBatch({ checkpointRoot: argument('--checkpoint-root'),
      receiptRoot: argument('--receipt-root'), branch: argument('--branch'),
      bucket: argument('--bucket'), region: argument('--region'),
      kmsKeyArn: argument('--kms-key-arn'), signingKeyArn: argument('--signing-key-arn'),
      providerDomain: argument('--provider-domain'), adminDomain: argument('--admin-domain') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ contractId: 'kidults-decade-durability-batch-result-v1',
      state: 'HOLD', reason: /^[A-Z0-9_]+$/.test(error.message) ? error.message
        : 'DURABILITY_BATCH_INTERNAL_ERROR', automaticPromotion: false, production: 'HOLD',
      publicRelease: 'HOLD', g5: 'HOLD' })}\n`);
    process.exitCode = 1;
  }
}
