#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const canonicalRemote = 'https://github.com/johnkim9524-collab/kaios_enterprise_repo.git';
const manifestPath = '.kidults-checkpoint/manifest.json';

function fail(code) { throw new Error(code); }
function git(repository, args) {
  const network = Object.fromEntries(['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy',
    'https_proxy', 'no_proxy'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  return execFileSync('/usr/bin/git', args, {
    cwd: repository, encoding: 'utf8', timeout: 30000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0', ...network },
  }).trim();
}

export function validateDurableCheckpointManifest(manifest, { currentSha, remoteSha,
  checkpointRef }) {
  const expectedKeys = ['automaticPromotion', 'baseMainSha', 'changedFileCount', 'contractId',
    'createdAt', 'g5', 'production', 'publicRelease', 'sourceBranch', 'sourceHead', 'state',
    'storage', 'version'];
  if (!manifest || Array.isArray(manifest)
    || JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedKeys)) {
    fail('DURABLE_CHECKPOINT_MANIFEST_INVALID');
  }
  const suffix = checkpointRef.match(/-([0-9a-f]{12})$/)?.[1];
  if (manifest.contractId !== 'kidults-durable-recovery-snapshot-v1'
    || manifest.version !== '1.0.0' || manifest.state !== 'DURABLE_CHECKPOINT_WRITTEN'
    || manifest.storage !== 'GITHUB_INDEPENDENT_REMOTE_REF'
    || manifest.sourceHead !== currentSha || suffix !== currentSha.slice(0, 12)
    || !/^[0-9a-f]{40}$/.test(remoteSha) || !/^[0-9a-f]{40}$/.test(manifest.baseMainSha)
    || !Number.isInteger(manifest.changedFileCount) || manifest.changedFileCount < 1
    || Number.isNaN(Date.parse(manifest.createdAt)) || manifest.automaticPromotion !== false
    || manifest.production !== 'HOLD' || manifest.publicRelease !== 'HOLD'
    || manifest.g5 !== 'HOLD') fail('DURABLE_CHECKPOINT_MANIFEST_INVALID');
  return manifest;
}

export function verifyDurableGitCheckpoint({ checkpointRef, repository = defaultRepository,
  remoteUrl = canonicalRemote, requireCanonical = true }) {
  if (!/^refs\/heads\/checkpoint-snapshots\/[A-Za-z0-9._-]+-[0-9a-f]{12}$/.test(
    checkpointRef ?? '')) fail('DURABLE_CHECKPOINT_REF_INVALID');
  if (requireCanonical && remoteUrl !== canonicalRemote) fail('DURABLE_CHECKPOINT_REMOTE_INVALID');
  const currentSha = git(repository, ['rev-parse', 'HEAD']);
  const branch = git(repository, ['symbolic-ref', '--short', 'HEAD']);
  let response;
  try {
    response = git(repository, ['ls-remote', '--exit-code', '--refs', remoteUrl, checkpointRef]);
  } catch { fail('DURABLE_CHECKPOINT_REMOTE_UNAVAILABLE'); }
  const [remoteSha, returnedRef, ...extra] = response.split(/\s+/);
  if (extra.length > 0 || returnedRef !== checkpointRef || !/^[0-9a-f]{40}$/.test(remoteSha)) {
    fail('DURABLE_CHECKPOINT_REMOTE_REF_INVALID');
  }
  try { git(repository, ['fetch', '--quiet', '--no-tags', remoteUrl, checkpointRef]); }
  catch { fail('DURABLE_CHECKPOINT_REMOTE_UNAVAILABLE'); }
  const fetchedSha = git(repository, ['rev-parse', 'FETCH_HEAD']);
  if (fetchedSha !== remoteSha) fail('DURABLE_CHECKPOINT_FETCH_MISMATCH');
  let manifest;
  try { manifest = JSON.parse(git(repository, ['show', `${remoteSha}:${manifestPath}`])); }
  catch { fail('DURABLE_CHECKPOINT_MANIFEST_INVALID'); }
  validateDurableCheckpointManifest(manifest, { currentSha, remoteSha, checkpointRef });
  const parents = git(repository, ['show', '--no-patch', '--format=%P', remoteSha]).split(' ');
  if (parents.length !== 1 || parents[0] !== manifest.baseMainSha) {
    fail('DURABLE_CHECKPOINT_BASE_PARENT_MISMATCH');
  }
  try {
    git(repository, ['diff', '--quiet', currentSha, remoteSha, '--', '.',
      `:(exclude)${manifestPath}`]);
  } catch { fail('DURABLE_CHECKPOINT_TREE_MISMATCH'); }
  return Object.freeze({
    contractId: 'kidults-durable-git-checkpoint-verification-v1', version: '1.0.0',
    state: 'VERIFIED_PASS', branch, currentSha, checkpointRef, remoteSha,
    changedFileCount: manifest.changedFileCount, automaticPromotion: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) fail('DURABLE_CHECKPOINT_ARGUMENTS_INVALID');
  return process.argv[index + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(verifyDurableGitCheckpoint({
      checkpointRef: argument('--checkpoint-ref'),
    }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      contractId: 'kidults-durable-git-checkpoint-verification-v1',
      state: 'HOLD', reason: /^[A-Z0-9_]+$/.test(error.message)
        ? error.message : 'DURABLE_CHECKPOINT_INTERNAL_ERROR', automaticPromotion: false,
      production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
    })}\n`);
    process.exitCode = 1;
  }
}
