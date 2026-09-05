#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const POLICY_PATH = 'coordination/kidults/kpmo/governed-bootstrap-control-policy-v1.json';
const SHA = /^[0-9a-f]{40}$/;
const BLOB = /^[0-9a-f]{40}$/;
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/;

export class BootstrapValidationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BootstrapValidationError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, detail = '') => { throw new BootstrapValidationError(code, detail); };

export function assertSafeRepositoryPath(value) {
  if (typeof value !== 'string' || !value || !SAFE_PATH.test(value) || value.includes('\\')) {
    fail('BOOTSTRAP_PATH_INVALID', String(value));
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith('../') || path.posix.isAbsolute(value)) {
    fail('BOOTSTRAP_PATH_INVALID', value);
  }
  return value;
}

export function assertUnique(values, code) {
  if (!Array.isArray(values) || values.length === 0) fail(code, 'EMPTY');
  if (new Set(values).size !== values.length) fail(code, 'DUPLICATE');
  return values;
}

export function validateEventBinding(binding, policy) {
  const requiredStrings = ['repository', 'eventRepository', 'baseRepository', 'headRepository', 'baseRef'];
  for (const key of requiredStrings) if (typeof binding?.[key] !== 'string' || !binding[key]) fail('BOOTSTRAP_EVENT_BINDING_MISSING', key);
  if (binding.repository !== policy.repository || binding.eventRepository !== policy.repository
      || binding.baseRepository !== policy.repository || binding.headRepository !== policy.repository) {
    fail('BOOTSTRAP_REPOSITORY_BINDING_MISMATCH');
  }
  if (binding.baseRef !== policy.base_branch) fail('BOOTSTRAP_BASE_REF_MISMATCH', binding.baseRef);
  if (!SHA.test(binding.baseSha || '')) fail('BOOTSTRAP_BASE_SHA_INVALID');
  if (!SHA.test(binding.headSha || '')) fail('BOOTSTRAP_HEAD_SHA_INVALID');
  if (binding.baseSha === binding.headSha) fail('BOOTSTRAP_ZERO_DIFF_SHA');
  if (!/^\d+$/.test(String(binding.pullRequestNumber || ''))) fail('BOOTSTRAP_PULL_REQUEST_NUMBER_INVALID');
  return binding;
}

const runGit = (root, args, {allowFailure = false, encoding = 'utf8'} = {}) => {
  const result = spawnSync('git', ['-C', root, ...args], {encoding, maxBuffer: 8 * 1024 * 1024});
  if (result.error) fail('BOOTSTRAP_GIT_EXECUTION_FAILED', result.error.message);
  if (result.status !== 0 && !allowFailure) {
    fail('BOOTSTRAP_GIT_COMMAND_FAILED', `${args.join(' ')}:${String(result.stderr || '').trim()}`);
  }
  return result;
};

const readPolicy = trustedRoot => {
  const absolute = path.join(trustedRoot, POLICY_PATH);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('BOOTSTRAP_POLICY_REGULAR_FILE_REQUIRED');
  let policy;
  try { policy = JSON.parse(fs.readFileSync(absolute, 'utf8')); }
  catch (error) { fail('BOOTSTRAP_POLICY_INVALID_JSON', error.message); }
  if (policy.id !== 'kidults-governed-bootstrap-control-policy-v1' || policy.version !== '1.0.0') {
    fail('BOOTSTRAP_POLICY_ID_VERSION_INVALID');
  }
  if (policy.workflow_event !== 'pull_request_target' || policy.candidate_executable_authority !== false) {
    fail('BOOTSTRAP_POLICY_AUTHORITY_INVALID');
  }
  const protectedPaths = assertUnique((policy.trusted_stage_a_paths || []).map(assertSafeRepositoryPath), 'BOOTSTRAP_PROTECTED_PATH_SET_INVALID');
  const entries = policy.stage_b_allowed_paths;
  if (!Array.isArray(entries) || entries.length === 0) fail('BOOTSTRAP_ALLOWLIST_INVALID', 'EMPTY');
  const allowedPaths = entries.map(entry => assertSafeRepositoryPath(entry?.path));
  assertUnique(allowedPaths, 'BOOTSTRAP_ALLOWLIST_INVALID');
  if (protectedPaths.some(item => allowedPaths.includes(item))) fail('BOOTSTRAP_PROTECTED_ALLOWLIST_OVERLAP');
  for (const entry of entries) {
    if (!['PRESENT', 'ABSENT'].includes(entry.base_state)) fail('BOOTSTRAP_BASE_STATE_INVALID', entry.path);
    if (entry.base_state === 'PRESENT' && !BLOB.test(entry.base_blob_sha1 || '')) fail('BOOTSTRAP_BASE_DIGEST_INVALID', entry.path);
    if (entry.base_state === 'ABSENT' && entry.base_blob_sha1 !== null) fail('BOOTSTRAP_ABSENT_DIGEST_MUST_BE_NULL', entry.path);
  }
  if (!Number.isInteger(policy.maximum_changed_files) || policy.maximum_changed_files < 1 || policy.maximum_changed_files > 64) {
    fail('BOOTSTRAP_CHANGED_FILE_BOUND_INVALID');
  }
  return {policy, protectedPaths, entries, allowedPaths};
};

const parseChangedFiles = raw => {
  const fields = String(raw).split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2 !== 0) fail('BOOTSTRAP_DIFF_SHAPE_INVALID');
  const output = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const filename = assertSafeRepositoryPath(fields[index + 1]);
    if (!['A', 'M'].includes(status)) fail('BOOTSTRAP_DIFF_STATUS_FORBIDDEN', `${status}:${filename}`);
    output.push({status, filename});
  }
  const changedPaths = output.map(item => item.filename);
  if (new Set(changedPaths).size !== changedPaths.length) fail('BOOTSTRAP_DIFF_PATH_SET_INVALID', 'DUPLICATE');
  return output;
};

const assertNoUnsafeIndexEntries = candidateRoot => {
  const result = runGit(candidateRoot, ['ls-files', '-s', '-z']);
  for (const record of String(result.stdout).split('\0').filter(Boolean)) {
    const match = /^(\d{6}) [0-9a-f]{40} \d+\t(.+)$/.exec(record);
    if (!match) fail('BOOTSTRAP_INDEX_RECORD_INVALID');
    const filename = assertSafeRepositoryPath(match[2]);
    if (match[1] === '120000') fail('BOOTSTRAP_SYMLINK_FORBIDDEN', filename);
    if (match[1] === '160000') fail('BOOTSTRAP_SUBMODULE_FORBIDDEN', filename);
  }
};

const blobAt = (candidateRoot, ref, filename) => {
  const result = runGit(candidateRoot, ['rev-parse', `${ref}:${filename}`], {allowFailure: true});
  return result.status === 0 ? String(result.stdout).trim() : null;
};

const sha256File = filename => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')}`;

export function validateGovernedBootstrapCandidate({trustedRoot, candidateRoot, binding}) {
  const trusted = path.resolve(trustedRoot);
  const candidate = path.resolve(candidateRoot);
  const {policy, protectedPaths, entries, allowedPaths} = readPolicy(trusted);
  validateEventBinding(binding, policy);

  const trustedHead = String(runGit(trusted, ['rev-parse', 'HEAD']).stdout).trim();
  const candidateHead = String(runGit(candidate, ['rev-parse', 'HEAD']).stdout).trim();
  if (trustedHead !== binding.baseSha) fail('BOOTSTRAP_TRUSTED_CHECKOUT_SHA_MISMATCH', trustedHead);
  if (candidateHead !== binding.headSha) fail('BOOTSTRAP_CANDIDATE_CHECKOUT_SHA_MISMATCH', candidateHead);
  const ancestor = runGit(candidate, ['merge-base', '--is-ancestor', binding.baseSha, binding.headSha], {allowFailure: true});
  if (ancestor.status !== 0) fail('BOOTSTRAP_BASE_NOT_ANCESTOR_OF_HEAD');

  assertNoUnsafeIndexEntries(candidate);

  for (const entry of entries) {
    const actual = blobAt(candidate, binding.baseSha, entry.path);
    if (entry.base_state === 'ABSENT' && actual !== null) fail('BOOTSTRAP_EXPECTED_BASE_ABSENCE_DRIFT', entry.path);
    if (entry.base_state === 'PRESENT' && actual !== entry.base_blob_sha1) {
      fail('BOOTSTRAP_BASE_DIGEST_DRIFT', `${entry.path}:${actual || 'missing'}`);
    }
  }

  const diff = runGit(candidate, ['diff', '--name-status', '--no-renames', '-z', `${binding.baseSha}...${binding.headSha}`]);
  const changed = parseChangedFiles(diff.stdout);
  if (changed.length === 0) fail('BOOTSTRAP_ZERO_COVERAGE');
  if (changed.length > policy.maximum_changed_files) fail('BOOTSTRAP_CHANGED_FILE_BOUND_EXCEEDED', String(changed.length));
  const changedPaths = changed.map(item => item.filename);
  const protectedChanges = changedPaths.filter(filename => protectedPaths.includes(filename));
  if (protectedChanges.length) fail('BOOTSTRAP_TRUSTED_STAGE_A_MUTATION_FORBIDDEN', protectedChanges.join(','));
  const outside = changedPaths.filter(filename => !allowedPaths.includes(filename));
  if (outside.length) fail('BOOTSTRAP_STAGE_B_ZERO_COVERAGE', outside.join(','));

  const candidateDigests = changed.map(item => {
    const absolute = path.resolve(candidate, item.filename);
    if (!absolute.startsWith(`${candidate}${path.sep}`)) fail('BOOTSTRAP_PATH_ESCAPE', item.filename);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('BOOTSTRAP_CANDIDATE_REGULAR_FILE_REQUIRED', item.filename);
    if (stat.size > policy.maximum_candidate_file_bytes) fail('BOOTSTRAP_CANDIDATE_FILE_TOO_LARGE', item.filename);
    return {path: item.filename, status: item.status, bytes: stat.size, sha256: sha256File(absolute)};
  });

  return {
    id: 'kidults-governed-bootstrap-control-validation-receipt-v1',
    version: '1.0.0',
    state: 'VERIFIED_PASS',
    repository: binding.repository,
    pull_request: Number(binding.pullRequestNumber),
    exact_base_sha: binding.baseSha,
    exact_head_sha: binding.headSha,
    trusted_base_only_validator: true,
    candidate_executable_used_as_authority: false,
    changed_file_count: changed.length,
    candidate_file_digests: candidateDigests,
    native_ruleset_changed: false,
    external_mutation_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

const defaultRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const parseArgs = argv => {
  const values = {trustedRoot: defaultRoot(), candidateRoot: process.cwd()};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!value) fail('BOOTSTRAP_ARGUMENT_VALUE_MISSING', name);
    if (name === '--trusted-root') values.trustedRoot = value;
    else if (name === '--candidate-root') values.candidateRoot = value;
    else fail('BOOTSTRAP_ARGUMENT_INVALID', name);
  }
  return values;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const binding = {
      repository: process.env.EXPECTED_REPOSITORY,
      eventRepository: process.env.EVENT_REPOSITORY,
      baseRepository: process.env.EVENT_BASE_REPOSITORY,
      headRepository: process.env.EVENT_HEAD_REPOSITORY,
      baseRef: process.env.EVENT_BASE_REF,
      baseSha: process.env.EXPECTED_BASE_SHA,
      headSha: process.env.EXPECTED_HEAD_SHA,
      pullRequestNumber: process.env.PR_NUMBER,
    };
    console.log(JSON.stringify(validateGovernedBootstrapCandidate({...options, binding}), null, 2));
  } catch (error) {
    const code = error?.code || 'BOOTSTRAP_UNEXPECTED_FAILURE';
    console.error(`FAIL ${code}${error?.detail ? `: ${error.detail}` : ''}`);
    process.exit(1);
  }
}
