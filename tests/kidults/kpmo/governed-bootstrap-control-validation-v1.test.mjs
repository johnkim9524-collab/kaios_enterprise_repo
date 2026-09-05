import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  BootstrapValidationError,
  assertUnique,
  validateEventBinding,
  validateGovernedBootstrapCandidate,
} from '../../../scripts/kidults/kpmo/validate-governed-bootstrap-candidate-v1.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const policyPath = path.join(repositoryRoot, 'coordination/kidults/kpmo/governed-bootstrap-control-policy-v1.json');
const workflowPath = path.join(repositoryRoot, '.github/workflows/kidults-governed-bootstrap-control-validation-v1.yml');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const code = (fn, expected) => assert.throws(fn, error => error instanceof BootstrapValidationError && error.code === expected);
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();

const write = (root, filename, content) => {
  const absolute = path.join(root, filename);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
};

const fixture = ({change = 'allowed.txt', mode = 'regular'} = {}) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-governed-bootstrap-'));
  const trusted = path.join(temp, 'trusted');
  const candidate = path.join(temp, 'candidate');
  fs.mkdirSync(trusted);
  git(trusted, 'init');
  git(trusted, 'config', 'user.email', 'test@example.invalid');
  git(trusted, 'config', 'user.name', 'KIDULTS Test');
  write(trusted, 'allowed.txt', 'base\n');
  write(trusted, 'stage-a.txt', 'immutable\n');
  const allowedBlob = git(trusted, 'hash-object', 'allowed.txt');
  write(trusted, 'coordination/kidults/kpmo/governed-bootstrap-control-policy-v1.json', JSON.stringify({
    id: 'kidults-governed-bootstrap-control-policy-v1',
    version: '1.0.0',
    repository: 'owner/repo',
    base_branch: 'main',
    workflow_event: 'pull_request_target',
    candidate_executable_authority: false,
    maximum_changed_files: 4,
    maximum_candidate_file_bytes: 4096,
    trusted_stage_a_paths: ['stage-a.txt'],
    stage_b_allowed_paths: [
      {path: 'allowed.txt', base_state: 'PRESENT', base_blob_sha1: allowedBlob},
      {path: 'new.txt', base_state: 'ABSENT', base_blob_sha1: null},
    ],
  }, null, 2));
  git(trusted, 'add', '.');
  git(trusted, 'commit', '-m', 'base');
  git(temp, 'clone', trusted, candidate);
  git(candidate, 'config', 'user.email', 'test@example.invalid');
  git(candidate, 'config', 'user.name', 'KIDULTS Test');
  const baseSha = git(trusted, 'rev-parse', 'HEAD');
  if (mode === 'empty') {
    git(candidate, 'commit', '--allow-empty', '-m', 'empty');
  } else if (mode === 'symlink') {
    fs.rmSync(path.join(candidate, 'allowed.txt'));
    fs.symlinkSync('stage-a.txt', path.join(candidate, 'allowed.txt'));
    git(candidate, 'add', 'allowed.txt');
    git(candidate, 'commit', '-m', 'symlink');
  } else if (mode === 'submodule') {
    git(candidate, 'rm', 'allowed.txt');
    execFileSync('git', ['-C', candidate, 'update-index', '--add', '--cacheinfo', `160000,${baseSha},allowed.txt`]);
    git(candidate, 'commit', '-m', 'submodule');
  } else {
    write(candidate, change, 'candidate inert data; this content is never executed\n');
    git(candidate, 'add', change);
    git(candidate, 'commit', '-m', 'candidate');
  }
  const headSha = git(candidate, 'rev-parse', 'HEAD');
  return {
    temp,
    trusted,
    candidate,
    binding: {
      repository: 'owner/repo',
      eventRepository: 'owner/repo',
      baseRepository: 'owner/repo',
      headRepository: 'owner/repo',
      baseRef: 'main',
      baseSha,
      headSha,
      pullRequestNumber: '7',
    },
  };
};

test('Stage-A workflow is read-only PRT and never executes candidate code', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /contents: read\n  pull-requests: read/);
  assert.doesNotMatch(workflow, /statuses: write|contents: write|pull-requests: write|id-token: write/);
  assert.match(workflow, /node trusted-base\/scripts\/kidults\/kpmo\/validate-governed-bootstrap-candidate-v1\.mjs/);
  assert.doesNotMatch(workflow, /node candidate\/|npm\s+(?:install|ci)|working-directory:\s*candidate/);
  assert.match(workflow, /name: KIDULTS Governed Bootstrap Control Validation V1/);
});

test('workflow trigger paths exactly match protected Stage-A and allowed Stage-B paths', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const block = workflow.split('# KIDULTS_STAGE_B_PATHS_START')[1].split('# KIDULTS_STAGE_B_PATHS_END')[0];
  const paths = [...block.matchAll(/^\s+-\s+"([^"]+)"\s*$/gm)].map(match => match[1]).sort();
  const expected = [...policy.trusted_stage_a_paths, ...policy.stage_b_allowed_paths.map(entry => entry.path)].sort();
  assert.deepEqual(paths, expected);
  assert.equal(new Set(paths).size, paths.length);
});

test('policy preserves bootstrap and authority boundaries', () => {
  assert.equal(policy.approval_receipt.comment_id, 5465472511);
  assert.equal(policy.approval_receipt.operation_specific_merge_or_external_mutation_token, false);
  assert.equal(policy.pre_native_binding_acceptance.governed_landing_exact_head_status, 'PENDING');
  assert.equal(policy.pre_native_binding_acceptance.scope_aware_exact_head_status, 'SUCCESS');
  assert.equal(policy.native_binding_boundary.preserve_existing_native_context_count, 3);
  assert.equal(policy.native_binding_boundary.strict_required_status_policy, true);
  assert.equal(policy.native_binding_boundary.bypass_actor_count, 0);
  assert.equal(policy.authority_boundary.production, 'HOLD');
  assert.equal(policy.authority_boundary.g5, 'HOLD');
});

test('event binding rejects wrong repository and wrong head', () => {
  const binding = {
    repository: policy.repository,
    eventRepository: policy.repository,
    baseRepository: policy.repository,
    headRepository: policy.repository,
    baseRef: 'main',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    pullRequestNumber: '7',
  };
  assert.equal(validateEventBinding(binding, policy), binding);
  code(() => validateEventBinding({...binding, headRepository: 'fork/repo'}, policy), 'BOOTSTRAP_REPOSITORY_BINDING_MISMATCH');
  code(() => validateEventBinding({...binding, headSha: 'bad'}, policy), 'BOOTSTRAP_HEAD_SHA_INVALID');
});

test('duplicate path sets fail closed', () => {
  code(() => assertUnique(['x', 'x'], 'BOOTSTRAP_TEST_DUPLICATE'), 'BOOTSTRAP_TEST_DUPLICATE');
});

test('trusted-base validator accepts one allowlisted inert regular-file change', () => {
  const value = fixture();
  try {
    const receipt = validateGovernedBootstrapCandidate({trustedRoot: value.trusted, candidateRoot: value.candidate, binding: value.binding});
    assert.equal(receipt.state, 'VERIFIED_PASS');
    assert.equal(receipt.changed_file_count, 1);
    assert.equal(receipt.candidate_executable_used_as_authority, false);
    assert.match(receipt.candidate_file_digests[0].sha256, /^sha256:[0-9a-f]{64}$/);
  } finally { fs.rmSync(value.temp, {recursive: true, force: true}); }
});

test('zero coverage and paths outside Stage-B allowlist fail closed', () => {
  const empty = fixture({mode: 'empty'});
  try { code(() => validateGovernedBootstrapCandidate({trustedRoot: empty.trusted, candidateRoot: empty.candidate, binding: empty.binding}), 'BOOTSTRAP_ZERO_COVERAGE'); }
  finally { fs.rmSync(empty.temp, {recursive: true, force: true}); }
  const outside = fixture({change: 'outside.txt'});
  try { code(() => validateGovernedBootstrapCandidate({trustedRoot: outside.trusted, candidateRoot: outside.candidate, binding: outside.binding}), 'BOOTSTRAP_STAGE_B_ZERO_COVERAGE'); }
  finally { fs.rmSync(outside.temp, {recursive: true, force: true}); }
});

test('Stage-A mutation, symlink and submodule each fail closed', () => {
  const protectedChange = fixture({change: 'stage-a.txt'});
  try { code(() => validateGovernedBootstrapCandidate({trustedRoot: protectedChange.trusted, candidateRoot: protectedChange.candidate, binding: protectedChange.binding}), 'BOOTSTRAP_TRUSTED_STAGE_A_MUTATION_FORBIDDEN'); }
  finally { fs.rmSync(protectedChange.temp, {recursive: true, force: true}); }
  const symlink = fixture({mode: 'symlink'});
  try { code(() => validateGovernedBootstrapCandidate({trustedRoot: symlink.trusted, candidateRoot: symlink.candidate, binding: symlink.binding}), 'BOOTSTRAP_SYMLINK_FORBIDDEN'); }
  finally { fs.rmSync(symlink.temp, {recursive: true, force: true}); }
  const submodule = fixture({mode: 'submodule'});
  try { code(() => validateGovernedBootstrapCandidate({trustedRoot: submodule.trusted, candidateRoot: submodule.candidate, binding: submodule.binding}), 'BOOTSTRAP_SUBMODULE_FORBIDDEN'); }
  finally { fs.rmSync(submodule.temp, {recursive: true, force: true}); }
});

test('wrong expected head and non-ancestor base fail closed', () => {
  const value = fixture();
  try {
    code(() => validateGovernedBootstrapCandidate({
      trustedRoot: value.trusted,
      candidateRoot: value.candidate,
      binding: {...value.binding, headSha: 'c'.repeat(40)},
    }), 'BOOTSTRAP_CANDIDATE_CHECKOUT_SHA_MISMATCH');
    code(() => validateGovernedBootstrapCandidate({
      trustedRoot: value.trusted,
      candidateRoot: value.candidate,
      binding: {...value.binding, baseSha: 'd'.repeat(40)},
    }), 'BOOTSTRAP_TRUSTED_CHECKOUT_SHA_MISMATCH');
  } finally { fs.rmSync(value.temp, {recursive: true, force: true}); }
});
