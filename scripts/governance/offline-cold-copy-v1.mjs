#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey,
  randomBytes, sign, verify } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync,
  writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const MAGIC = Buffer.from('KIDULTS-OFFLINE-COLD-COPY-V1\0', 'utf8');
const CONTROLS = Object.freeze(['OFFLINE_OR_AIR_GAPPED', 'SEPARATE_CUSTODIAN',
  'KEY_ESCROW_TESTED', 'MEDIA_REFRESH_SCHEDULED']);
function fail(code) { throw new Error(code); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function exactKeys(value, keys) {
  return value && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort())
    === JSON.stringify([...keys].sort());
}
function absoluteRegularFile(input, code) {
  if (!path.isAbsolute(input ?? '') || !existsSync(input)) fail(code);
  const resolved = path.resolve(input);
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(resolved) !== resolved) fail(code);
  return resolved;
}
function absoluteDirectory(input, code, create = false) {
  if (!path.isAbsolute(input ?? '')) fail(code);
  const resolved = path.resolve(input);
  if (create) mkdirSync(resolved, { recursive: true, mode: 0o700 });
  if (!existsSync(resolved)) fail(code);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(resolved) !== resolved) fail(code);
  return resolved;
}
function outside(child, parent, code) {
  if (child === parent || child.startsWith(`${parent}${path.sep}`)) fail(code);
}
function git(args, cwd = repositoryRoot) {
  try {
    return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8', timeout: 120000,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' } }).trim();
  } catch { fail('OFFLINE_RESTORE_GIT_FAILED'); }
}
function keyBytes(file) {
  const bytes = readFileSync(file);
  if (bytes.length !== 32) fail('OFFLINE_ENCRYPTION_KEY_INVALID');
  return bytes;
}
function encrypt(bytes, key) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.concat([MAGIC, salt]));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
}
function decrypt(bytes, key) {
  const minimum = MAGIC.length + 16 + 12 + 16;
  if (bytes.length <= minimum || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    fail('OFFLINE_CIPHERTEXT_INVALID');
  }
  let offset = MAGIC.length;
  const salt = bytes.subarray(offset, offset += 16);
  const iv = bytes.subarray(offset, offset += 12);
  const tag = bytes.subarray(offset, offset += 16);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.concat([MAGIC, salt]));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(bytes.subarray(offset)), decipher.final()]);
  } catch { fail('OFFLINE_DECRYPTION_FAILED'); }
}
function checkpoint(checkpointRoot, branch) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch) || branch.includes('..')) {
    fail('OFFLINE_BRANCH_INVALID');
  }
  const safe = branch.replaceAll('/', '--');
  const manifestFile = absoluteRegularFile(path.join(checkpointRoot, `${safe}.json`),
    'OFFLINE_CHECKPOINT_MANIFEST_MISSING');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const required = ['contractId', 'version', 'state', 'repository', 'branch', 'headSha',
    'bundleFile', 'bundleSha256', 'shallowCommits', 'createdAt', 'production', 'publicRelease',
    'g5', 'manifestDigest'];
  const { manifestDigest, ...unsigned } = manifest;
  if (!exactKeys(manifest, required) || manifest.contractId !== 'kidults-resilient-git-checkpoint-v1'
    || manifest.branch !== branch || !SHA.test(manifest.headSha)
    || manifestDigest !== `sha256:${sha256(Buffer.from(canonical(unsigned)))}`) {
    fail('OFFLINE_CHECKPOINT_MANIFEST_INVALID');
  }
  const bundleFile = absoluteRegularFile(path.join(checkpointRoot, manifest.bundleFile),
    'OFFLINE_CHECKPOINT_BUNDLE_MISSING');
  const bundle = readFileSync(bundleFile);
  if (`sha256:${sha256(bundle)}` !== manifest.bundleSha256) fail('OFFLINE_CHECKPOINT_DIGEST_MISMATCH');
  return { manifest, manifestFile, bundleFile, bundle };
}
function identity(input, createMedia) {
  const checkpointRoot = absoluteDirectory(input.checkpointRoot, 'OFFLINE_CHECKPOINT_ROOT_INVALID');
  const mediaRoot = absoluteDirectory(input.mediaRoot, 'OFFLINE_MEDIA_ROOT_INVALID', createMedia);
  const keyFile = absoluteRegularFile(input.keyFile, 'OFFLINE_ENCRYPTION_KEY_FILE_INVALID');
  const signingKeyFile = absoluteRegularFile(input.signingKeyFile, 'OFFLINE_SIGNING_KEY_FILE_INVALID');
  outside(keyFile, mediaRoot, 'OFFLINE_KEY_MUST_NOT_BE_ON_MEDIA');
  outside(signingKeyFile, mediaRoot, 'OFFLINE_SIGNING_KEY_MUST_NOT_BE_ON_MEDIA');
  outside(mediaRoot, checkpointRoot, 'OFFLINE_MEDIA_ISOLATION_REQUIRED');
  outside(checkpointRoot, mediaRoot, 'OFFLINE_MEDIA_ISOLATION_REQUIRED');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(input.custodianId ?? '')
    || input.custodianId === 'primary' || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(input.mediaId ?? '')) {
    fail('OFFLINE_CUSTODIAN_OR_MEDIA_ID_INVALID');
  }
  return { ...input, checkpointRoot, mediaRoot, keyFile, signingKeyFile };
}
function files(root, sourceSha) {
  const directory = path.join(root, 'KIDULTS-D10', sourceSha);
  return { directory, ciphertext: path.join(directory, 'source.bundle.aes256gcm'),
    manifest: path.join(directory, 'checkpoint-manifest.json'),
    receipt: path.join(directory, 'offline-receipt.json'),
    signature: path.join(directory, 'offline-receipt.ed25519') };
}
function receiptPayload({ manifest, sourceTree, input, ciphertext, observedAt, publicKey }) {
  return { contractId: 'kidults-offline-encrypted-cold-copy-receipt-v1', version: '1.0.0',
    state: 'WRITTEN_PENDING_INDEPENDENT_RESTORE', sourceSha: manifest.headSha, sourceTree,
    bundlePlaintextSha256: manifest.bundleSha256.slice(7), ciphertextSha256: sha256(ciphertext),
    encryption: { algorithm: 'AES-256-GCM', format: 'KIDULTS-OFFLINE-COLD-COPY-V1' },
    signature: { algorithm: 'ED25519', publicKeySha256: sha256(publicKey) },
    replica: { class: 'OFFLINE_ENCRYPTED_COLD_COPY', providerFailureDomain: 'offline-media',
      administrativeDomain: input.custodianId, mediaId: input.mediaId, offsite: true,
      offline: true, retentionYears: 10, controls: CONTROLS },
    writtenAt: observedAt, mediaRefreshDueAt: new Date(Date.parse(observedAt)
      + 365 * 24 * 60 * 60 * 1000).toISOString(), automaticPromotion: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' };
}

export function createOfflineColdCopy(rawInput) {
  const input = identity(rawInput, true);
  if (Number.isNaN(Date.parse(input.observedAt ?? ''))
    || new Date(input.observedAt).toISOString() !== input.observedAt) fail('OFFLINE_TIMESTAMP_INVALID');
  const source = checkpoint(input.checkpointRoot, input.branch);
  const sourceTree = git(['rev-parse', `${source.manifest.headSha}^{tree}`]);
  const target = files(input.mediaRoot, source.manifest.headSha);
  if (existsSync(target.directory)) fail('OFFLINE_GENERATION_ALREADY_EXISTS');
  mkdirSync(path.dirname(target.directory), { recursive: true, mode: 0o700 });
  mkdirSync(target.directory, { recursive: false, mode: 0o700 });
  try {
    const ciphertext = encrypt(source.bundle, keyBytes(input.keyFile));
    const privateKey = createPrivateKey(readFileSync(input.signingKeyFile));
    if (privateKey.asymmetricKeyType !== 'ed25519') fail('OFFLINE_SIGNING_KEY_INVALID');
    const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    const receipt = receiptPayload({ manifest: source.manifest, sourceTree, input, ciphertext,
      observedAt: input.observedAt, publicKey });
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    writeFileSync(target.ciphertext, ciphertext, { mode: 0o600, flag: 'wx' });
    writeFileSync(target.manifest, readFileSync(source.manifestFile), { mode: 0o600, flag: 'wx' });
    writeFileSync(target.receipt, receiptBytes, { mode: 0o600, flag: 'wx' });
    writeFileSync(target.signature, sign(null, receiptBytes, privateKey), { mode: 0o600, flag: 'wx' });
    return Object.freeze({ contractId: 'kidults-offline-cold-copy-result-v1', version: '1.0.0',
      state: 'OFFLINE_COPY_WRITTEN_PENDING_INDEPENDENT_RESTORE', sourceSha: source.manifest.headSha,
      sourceTree, mediaId: input.mediaId, ciphertextSha256: receipt.ciphertextSha256,
      automaticPromotion: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' });
  } catch (error) {
    rmSync(target.directory, { recursive: true, force: true });
    throw error;
  }
}

export function verifyOfflineColdCopy(rawInput) {
  const input = identity(rawInput, false);
  const source = checkpoint(input.checkpointRoot, input.branch);
  const target = files(input.mediaRoot, source.manifest.headSha);
  const receiptFile = absoluteRegularFile(target.receipt, 'OFFLINE_RECEIPT_MISSING');
  const signatureFile = absoluteRegularFile(target.signature, 'OFFLINE_SIGNATURE_MISSING');
  const ciphertextFile = absoluteRegularFile(target.ciphertext, 'OFFLINE_CIPHERTEXT_MISSING');
  const receiptBytes = readFileSync(receiptFile);
  const receipt = JSON.parse(receiptBytes);
  const privateKey = createPrivateKey(readFileSync(input.signingKeyFile));
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({ type: 'spki', format: 'der' });
  const ciphertext = readFileSync(ciphertextFile);
  if (!verify(null, receiptBytes, publicKey, readFileSync(signatureFile))
    || receipt.signature?.publicKeySha256 !== sha256(publicDer)
    || receipt.sourceSha !== source.manifest.headSha || receipt.replica?.mediaId !== input.mediaId
    || receipt.replica?.administrativeDomain !== input.custodianId
    || receipt.ciphertextSha256 !== sha256(ciphertext)) fail('OFFLINE_RECEIPT_OR_SIGNATURE_INVALID');
  const plaintext = decrypt(ciphertext, keyBytes(input.keyFile));
  if (sha256(plaintext) !== receipt.bundlePlaintextSha256) fail('OFFLINE_PLAINTEXT_DIGEST_MISMATCH');
  const temporary = path.join(os.tmpdir(), `kidults-offline-restore-${process.pid}-${Date.now()}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const bundle = path.join(temporary, 'source.bundle');
    const restored = path.join(temporary, 'restored');
    const verifier = path.join(temporary, 'verifier.git');
    writeFileSync(bundle, plaintext, { mode: 0o600, flag: 'wx' });
    git(['init', '--bare', '--quiet', verifier], temporary);
    git(['bundle', 'verify', bundle], verifier);
    git(['clone', '--quiet', bundle, restored], temporary);
    const sourceSha = git(['rev-parse', 'HEAD'], restored);
    const sourceTree = git(['rev-parse', 'HEAD^{tree}'], restored);
    if (sourceSha !== receipt.sourceSha || sourceTree !== receipt.sourceTree) {
      fail('OFFLINE_RESTORE_IDENTITY_MISMATCH');
    }
    const testFiles = ['tests/governance/decade-durability-v1.test.mjs',
      'tests/governance/resilient-git-checkpoint-v1.test.mjs',
      'tests/governance/run-decade-durability-batch-v1.test.mjs'];
    let output;
    try {
      output = execFileSync(process.execPath, ['--test', ...testFiles], { cwd: restored,
        encoding: 'utf8', timeout: 120000,
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' } });
    } catch { fail('OFFLINE_RESTORE_TESTS_FAILED'); }
    const testsPassed = Number(output.match(/(?:^|\n)(?:#|ℹ) tests (\d+)/)?.[1] ?? 0);
    if (testsPassed < 1) fail('OFFLINE_RESTORE_TEST_COUNT_MISSING');
    return Object.freeze({ contractId: 'kidults-offline-cold-copy-verification-v1',
      version: '1.0.0', state: 'OFFLINE_COPY_AND_ISOLATED_RESTORE_VERIFIED', sourceSha,
      sourceTree, testsPassed, isolated: true, independentCustodian: false,
      receiptDigest: sha256(receiptBytes), automaticPromotion: false,
      production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) fail('OFFLINE_ARGUMENTS_INVALID');
  return process.argv[index + 1];
}
function main() {
  const input = { checkpointRoot: argument('--checkpoint-root'), mediaRoot: argument('--media-root'),
    keyFile: argument('--key-file'), signingKeyFile: argument('--signing-key-file'),
    branch: argument('--branch'), custodianId: argument('--custodian-id'),
    mediaId: argument('--media-id'), observedAt: new Date().toISOString() };
  return process.argv[2] === 'create' ? createOfflineColdCopy(input)
    : process.argv[2] === 'verify' ? verifyOfflineColdCopy(input) : fail('OFFLINE_OPERATION_INVALID');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ contractId: 'kidults-offline-cold-copy-result-v1',
      state: 'HOLD', reason: /^[A-Z0-9_]+$/.test(error.message) ? error.message
        : 'OFFLINE_INTERNAL_ERROR', automaticPromotion: false, production: 'HOLD',
      publicRelease: 'HOLD', g5: 'HOLD' })}\n`);
    process.exitCode = 1;
  }
}
