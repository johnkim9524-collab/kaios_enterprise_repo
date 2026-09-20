#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync,
  rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'repository', 'branch', 'headSha', 'bundleFile',
  'bundleSha256', 'shallowCommits', 'createdAt', 'production', 'publicRelease', 'g5',
  'manifestDigest',
]);

function fail(code) { throw new Error(code); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value) { return `sha256:${sha256(Buffer.from(canonical(value)))}`; }
function git(args, options = {}, repository = repositoryRoot) {
  return execFileSync('/usr/bin/git', args, {
    cwd: repository, encoding: 'utf8', timeout: 30000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0' }, ...options,
  }).trim();
}
function requireCheckpointRoot(input, repository) {
  if (!path.isAbsolute(input ?? '')) fail('CHECKPOINT_ABSOLUTE_PATH_REQUIRED');
  const resolved = path.resolve(input);
  for (const forbidden of [repository, git(['rev-parse', '--git-common-dir'], {}, repository)]) {
    const absolute = path.resolve(repository, forbidden);
    if (resolved === absolute || resolved.startsWith(`${absolute}${path.sep}`)
      || absolute.startsWith(`${resolved}${path.sep}`)) fail('CHECKPOINT_ISOLATION_REQUIRED');
  }
  mkdirSync(resolved, { recursive: true, mode: 0o700 });
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(resolved) !== resolved) {
    fail('CHECKPOINT_ROOT_INVALID');
  }
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    fail('CHECKPOINT_PERMISSIONS_INVALID');
  }
  return resolved;
}
function safeBranch(branch) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch) || branch.includes('..')) {
    fail('CHECKPOINT_BRANCH_INVALID');
  }
  return branch.replaceAll('/', '--');
}
function manifestPath(root, branch) { return path.join(root, `${safeBranch(branch)}.json`); }
function importBundlePack(bundle, destination, ref, sha) {
  const bytes = readFileSync(bundle);
  const separator = bytes.indexOf(Buffer.from('\n\n'));
  if (separator < 0 || bytes.subarray(separator + 2, separator + 6).toString() !== 'PACK') {
    fail('CHECKPOINT_BUNDLE_INVALID');
  }
  execFileSync('/usr/bin/git', ['index-pack', '--stdin'], {
    cwd: destination, input: bytes.subarray(separator + 2), timeout: 30000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  });
  git(['cat-file', '-e', `${sha}^{commit}`], {}, destination);
  git(['update-ref', ref, sha], {}, destination);
}
function verifyIndependentBundle(bundle, headSha, shallowCommits) {
  const temporary = path.join(os.tmpdir(), `kidults-bundle-verify-${process.pid}-${Date.now()}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    execFileSync('/usr/bin/git', ['init', '--bare', '--quiet', temporary]);
    if (shallowCommits.length > 0) {
      writeFileSync(path.join(temporary, 'shallow'), `${shallowCommits.join('\n')}\n`,
        { mode: 0o600, flag: 'wx' });
    }
    importBundlePack(bundle, temporary, 'refs/checkpoint/verified', headSha);
    const reachable = git(['rev-list', '--objects', '--missing=print', headSha], {}, temporary);
    if (reachable.split('\n').some(line => line.startsWith('?'))) {
      fail('CHECKPOINT_BUNDLE_NOT_INDEPENDENT');
    }
  } catch { fail('CHECKPOINT_BUNDLE_NOT_INDEPENDENT'); }
  finally { rmSync(temporary, { recursive: true, force: true }); }
}
function verifyManifest(input) {
  if (!input || Array.isArray(input)
    || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify([...MANIFEST_KEYS].sort())) {
    fail('CHECKPOINT_MANIFEST_INVALID');
  }
  const { manifestDigest, ...unsigned } = input;
  if (input.contractId !== 'kidults-resilient-git-checkpoint-v1' || input.version !== '1.0.0'
    || input.state !== 'CHECKPOINT_WRITTEN' || !/^[0-9a-f]{40}$/.test(input.headSha)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,240}\.bundle$/.test(input.bundleFile)
    || !/^sha256:[0-9a-f]{64}$/.test(input.bundleSha256)
    || !Array.isArray(input.shallowCommits)
    || input.shallowCommits.some(sha => !/^[0-9a-f]{40}$/.test(sha))
    || manifestDigest !== digest(unsigned) || input.production !== 'HOLD'
    || input.publicRelease !== 'HOLD' || input.g5 !== 'HOLD') {
    fail('CHECKPOINT_MANIFEST_INVALID');
  }
  return input;
}

export function classifyCheckpointContinuity({ currentSha, checkpointSha, currentContainsCheckpoint,
  checkpointContainsCurrent }) {
  if (currentSha === checkpointSha || currentContainsCheckpoint) return 'CONTINUITY_VERIFIED';
  if (checkpointContainsCurrent) return 'ROLLBACK_DETECTED_HOLD';
  return 'DIVERGENCE_DETECTED_HOLD';
}

export function createResilientGitCheckpoint({ checkpointRoot, createdAt,
  repository = repositoryRoot }) {
  if (Number.isNaN(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) {
    fail('CHECKPOINT_TIMESTAMP_INVALID');
  }
  const source = path.resolve(repository);
  const root = requireCheckpointRoot(checkpointRoot, source);
  const headSha = git(['rev-parse', 'HEAD'], {}, source);
  const branch = git(['symbolic-ref', '--short', 'HEAD'], {}, source);
  const origin = git(['config', '--get', 'remote.origin.url'], {}, source);
  const shallowLocation = git(['rev-parse', '--git-path', 'shallow'], {}, source);
  const shallowFile = path.resolve(source, shallowLocation);
  const shallowCommits = existsSync(shallowFile)
    ? readFileSync(shallowFile, 'utf8').trim().split('\n').filter(Boolean).sort() : [];
  const name = safeBranch(branch);
  const bundleFile = `${name}-${headSha}.bundle`;
  const finalBundle = path.join(root, bundleFile);
  const tempBundle = path.join(root, `.${bundleFile}.${process.pid}.tmp`);
  const tempManifest = path.join(root, `.${name}.${process.pid}.json.tmp`);
  try {
    git(['bundle', 'create', tempBundle, 'HEAD'], {}, source);
    execFileSync('/usr/bin/git', ['bundle', 'verify', tempBundle], {
      encoding: 'utf8', timeout: 30000,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    verifyIndependentBundle(tempBundle, headSha, shallowCommits);
    chmodSync(tempBundle, 0o600);
    renameSync(tempBundle, finalBundle);
    const unsigned = {
      contractId: 'kidults-resilient-git-checkpoint-v1', version: '1.0.0',
      state: 'CHECKPOINT_WRITTEN', repository: origin, branch, headSha, bundleFile,
      bundleSha256: `sha256:${sha256(readFileSync(finalBundle))}`, shallowCommits, createdAt,
      production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
    };
    const manifest = { ...unsigned, manifestDigest: digest(unsigned) };
    writeFileSync(tempManifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(tempManifest, manifestPath(root, branch));
    return manifest;
  } finally {
    rmSync(tempBundle, { force: true });
    rmSync(tempManifest, { force: true });
  }
}

export function inspectResilientGitCheckpoint({ checkpointRoot, repository = repositoryRoot }) {
  const source = path.resolve(repository);
  const root = requireCheckpointRoot(checkpointRoot, source);
  const currentSha = git(['rev-parse', 'HEAD'], {}, source);
  const branch = git(['symbolic-ref', '--short', 'HEAD'], {}, source);
  const origin = git(['config', '--get', 'remote.origin.url'], {}, source);
  const manifest = verifyManifest(JSON.parse(readFileSync(manifestPath(root, branch), 'utf8')));
  if (manifest.branch !== branch || manifest.repository !== origin) {
    fail('CHECKPOINT_IDENTITY_MISMATCH');
  }
  const bundle = path.join(root, manifest.bundleFile);
  const stat = lstatSync(bundle);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(bundle) !== bundle
    || `sha256:${sha256(readFileSync(bundle))}` !== manifest.bundleSha256) {
    fail('CHECKPOINT_BUNDLE_INVALID');
  }
  try {
    execFileSync('/usr/bin/git', ['bundle', 'verify', bundle], {
      encoding: 'utf8', timeout: 30000,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    });
  } catch { fail('CHECKPOINT_BUNDLE_INVALID'); }
  const temporary = path.join(os.tmpdir(), `kidults-checkpoint-${process.pid}-${Date.now()}`);
  const currentBundle = path.join(temporary, 'current.bundle');
  mkdirSync(temporary, { mode: 0o700 });
  try {
    execFileSync('/usr/bin/git', ['init', '--bare', '--quiet', temporary]);
    if (manifest.shallowCommits.length > 0) {
      writeFileSync(path.join(temporary, 'shallow'), `${manifest.shallowCommits.join('\n')}\n`,
        { mode: 0o600, flag: 'wx' });
    }
    importBundlePack(bundle, temporary, 'refs/checkpoint/saved', manifest.headSha);
    git(['bundle', 'create', currentBundle, 'HEAD'], {}, source);
    importBundlePack(currentBundle, temporary, 'refs/checkpoint/current', currentSha);
    const relation = (ancestor, descendant) => {
      try {
        git(['merge-base', '--is-ancestor', ancestor, descendant], {}, temporary);
        return true;
      } catch { return false; }
    };
    return Object.freeze({
      contractId: 'kidults-resilient-git-checkpoint-inspection-v1', version: '1.0.0',
      state: classifyCheckpointContinuity({ currentSha, checkpointSha: manifest.headSha,
        currentContainsCheckpoint: relation(manifest.headSha, currentSha),
        checkpointContainsCurrent: relation(currentSha, manifest.headSha) }),
      branch, currentSha, checkpointSha: manifest.headSha,
      recoveryCommand: `git fetch ${JSON.stringify(bundle)} ${manifest.headSha}`,
      automaticRecoveryPerformed: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
    });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) fail('CHECKPOINT_ARGUMENTS_INVALID');
  return process.argv[index + 1];
}
function main() {
  const operation = process.argv[2];
  const checkpointRoot = argument('--checkpoint-root');
  const result = operation === 'create'
    ? createResilientGitCheckpoint({ checkpointRoot, createdAt: argument('--created-at') })
    : operation === 'inspect' ? inspectResilientGitCheckpoint({ checkpointRoot })
      : fail('CHECKPOINT_OPERATION_INVALID');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result?.state?.endsWith('_HOLD')) process.exitCode = 1;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`${JSON.stringify({ contractId: 'kidults-resilient-git-checkpoint-v1',
      state: 'CHECKPOINT_FAIL_CLOSED', reason: /^[A-Z0-9_]+$/.test(error.message)
        ? error.message : 'CHECKPOINT_INTERNAL_ERROR', production: 'HOLD',
      publicRelease: 'HOLD', g5: 'HOLD' })}\n`);
    process.exitCode = 1;
  }
}
