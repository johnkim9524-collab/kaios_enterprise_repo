import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_MANIFEST_PATH,
  TrustedControlFreezeError,
  validateTrustedControlFreeze,
} from '../../../scripts/kidults/kpmo/validate-trusted-governed-control-freeze-v1.mjs';
import {resolveScopeRequirements} from '../../../scripts/kidults/kpmo/lib/governed-landing-native-gates-v1.mjs';

const validatorPath = 'scripts/kidults/kpmo/validate-trusted-governed-control-freeze-v1.mjs';

function write(root, relative, content) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
}

function fixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-trusted-freeze-'));
  const trusted = path.join(parent, 'trusted');
  const candidate = path.join(parent, 'candidate');
  const manifest = {
    id: 'kidults-trusted-governed-control-freeze-v1',
    version: '1.0.0',
    comparison: 'EXACT_BYTES_FROM_TRUSTED_BASE',
    update_path: 'OWNER_GOVERNED_BOOTSTRAP_EXCEPTION_ONLY',
    immutable_paths: [DEFAULT_MANIFEST_PATH, validatorPath, '.github/workflows/control.yml'],
  };
  write(trusted, DEFAULT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  write(trusted, validatorPath, 'trusted validator bytes\n');
  write(trusted, '.github/workflows/control.yml', 'name: trusted control\n');
  fs.cpSync(trusted, candidate, {recursive: true});
  return {
    trusted,
    candidate,
    trustedRoot: trusted,
    candidateRoot: candidate,
    manifest,
    cleanup: () => fs.rmSync(parent, {recursive: true, force: true}),
  };
}

function expectCode(callback, expected) {
  assert.throws(callback, error => {
    assert.ok(error instanceof TrustedControlFreezeError, String(error));
    assert.equal(error.code, expected);
    return true;
  });
}

test('repository trust root validates locally without a distinct base checkout', () => {
  const receipt = validateTrustedControlFreeze({trustedRoot: process.cwd(), candidateRoot: process.cwd()});
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.comparison, 'EXACT_BYTES_FROM_TRUSTED_BASE');
  assert.equal(receipt.candidate_executable_used_as_authority, false);
  assert.ok(receipt.immutable_path_count >= 20);
  assert.match(receipt.immutable_path_set_sha256, /^sha256:[a-f0-9]{64}$/);
});

test('documented immutable set contains the control validators, policies and every protected producer workflow', () => {
  const manifest = JSON.parse(fs.readFileSync(DEFAULT_MANIFEST_PATH, 'utf8'));
  const immutable = new Set(manifest.immutable_paths);
  for (const expected of [
    DEFAULT_MANIFEST_PATH,
    validatorPath,
    'scripts/kidults/kpmo/validate-governed-landing-coverage-v1.mjs',
    'scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs',
    'coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json',
    'coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json',
    '.github/workflows/kidults-postgres-d1-boundary-v1.yml',
    '.github/workflows/kidults-governed-landing-authorization-v1.yml',
    '.github/workflows/kidults-scope-aware-authoritative-status-v1.yml',
    '.github/workflows/kidults-atomic-governed-landing-v1.yml',
    '.github/workflows/solo-owner-preflight.yml',
    '.github/workflows/ci-validation.yml',
    '.github/workflows/kpmo-cf-kidults-14501ac-01-preflight.yml',
    '.github/workflows/kidults-cloudflare-pages-staging-governance-validation-v1.yml',
    '.github/workflows/kidults-shared-portal-evidence-integrity-v1.yml',
    '.github/workflows/kidults-postgres-one-shot-authorization-boundary-v1.yml',
    '.github/workflows/kidults-runtime-control-baseline-r1.yml',
    '.github/workflows/kidults-met-vam-candidate-r2-boundary-v1.yml',
  ]) assert.ok(immutable.has(expected), expected);
  const producerPolicy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  for (const producer of Object.values(producerPolicy.required_context_producers || {})) {
    assert.ok(immutable.has(producer.workflow_path), producer.workflow_path);
  }
  assert.equal(manifest.ordinary_pull_request_update_allowed, false);
  assert.equal(manifest.bootstrap_exception.must_be_explicitly_authorized_by_program_owner, true);
  assert.equal(manifest.bootstrap_exception.does_not_authorize_production_public_or_g5, true);
});

test('exact candidate bytes pass and one-byte workflow weakening fails closed', () => {
  const value = fixture();
  try {
    assert.equal(validateTrustedControlFreeze(value).result, 'PASS');
    write(value.candidate, '.github/workflows/control.yml', 'name: trusted controL\n');
    expectCode(() => validateTrustedControlFreeze(value), 'TRUSTED_CONTROL_FREEZE_EXACT_BYTES_MISMATCH');
  } finally {
    value.cleanup();
  }
});

test('candidate cannot weaken the immutable set by changing its manifest', () => {
  const value = fixture();
  try {
    const candidateManifest = {...value.manifest, immutable_paths: value.manifest.immutable_paths.slice(0, 2)};
    write(value.candidate, DEFAULT_MANIFEST_PATH, `${JSON.stringify(candidateManifest, null, 2)}\n`);
    expectCode(() => validateTrustedControlFreeze(value), 'TRUSTED_CONTROL_FREEZE_EXACT_BYTES_MISMATCH');
  } finally {
    value.cleanup();
  }
});

test('missing, symlinked and non-regular candidate controls fail closed', () => {
  for (const mutation of ['missing', 'symlink', 'directory']) {
    const value = fixture();
    try {
      const target = path.join(value.candidate, '.github/workflows/control.yml');
      fs.rmSync(target);
      if (mutation === 'symlink') fs.symlinkSync('../../../scripts/kidults/kpmo/validate-trusted-governed-control-freeze-v1.mjs', target);
      if (mutation === 'directory') fs.mkdirSync(target);
      expectCode(
        () => validateTrustedControlFreeze(value),
        mutation === 'missing'
          ? 'TRUSTED_CONTROL_FREEZE_FILE_MISSING'
          : mutation === 'symlink'
            ? 'TRUSTED_CONTROL_FREEZE_SYMLINK_FORBIDDEN'
            : 'TRUSTED_CONTROL_FREEZE_REGULAR_FILE_REQUIRED',
      );
    } finally {
      value.cleanup();
    }
  }
});

test('trusted manifest rejects duplicate, escaping and non-self-frozen path sets', () => {
  for (const [mutation, expected] of [
    [manifest => manifest.immutable_paths.push(validatorPath), 'TRUSTED_CONTROL_FREEZE_DUPLICATE_PATH'],
    [manifest => manifest.immutable_paths.push('../escape.yml'), 'TRUSTED_CONTROL_FREEZE_PATH_INVALID'],
    [manifest => { manifest.immutable_paths = manifest.immutable_paths.filter(value => value !== DEFAULT_MANIFEST_PATH); }, 'TRUSTED_CONTROL_FREEZE_MANIFEST_NOT_SELF_FROZEN'],
    [manifest => { manifest.immutable_paths = manifest.immutable_paths.filter(value => value !== validatorPath); }, 'TRUSTED_CONTROL_FREEZE_VALIDATOR_NOT_SELF_FROZEN'],
  ]) {
    const value = fixture();
    try {
      mutation(value.manifest);
      write(value.trusted, DEFAULT_MANIFEST_PATH, `${JSON.stringify(value.manifest, null, 2)}\n`);
      expectCode(() => validateTrustedControlFreeze(value), expected);
    } finally {
      value.cleanup();
    }
  }
});

test('pull_request_target workflow pins exact base/head and runs only the trusted freeze implementation', () => {
  const workflow = fs.readFileSync('.github/workflows/kidults-postgres-d1-boundary-v1.yml', 'utf8');
  for (const marker of [
    'ref: ${{ github.event.pull_request.base.sha }}',
    'EXPECTED_BASE_SHA: ${{ github.event.pull_request.base.sha }}',
    'test "$(git -C trusted-control rev-parse HEAD)" = "$EXPECTED_BASE_SHA"',
    'node ../trusted-control/scripts/kidults/kpmo/validate-trusted-governed-control-freeze-v1.mjs',
    '--trusted-root ../trusted-control',
    '--candidate-root .',
  ]) assert.ok(workflow.includes(marker), marker);
  const validatorBlock = workflow.split('      - name: Run only trusted-base repository governance validators against candidate')[1]
    ?.split(/^      - name:/m)[0] || '';
  const nodeLines = validatorBlock.split('\n').filter(line => /\bnode\b/.test(line));
  assert.ok(nodeLines.length >= 3);
  assert.ok(nodeLines.every(line => line.includes('node ../trusted-control/')), nodeLines.join('\n'));
});

test('all freeze authority surfaces require the native trusted-control context', () => {
  const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  assert.equal(policy.version, '1.6.0');
  for (const filename of [
    DEFAULT_MANIFEST_PATH,
    validatorPath,
    'tests/kidults/kpmo/trusted-governed-control-freeze-v1.test.mjs',
  ]) {
    const result = resolveScopeRequirements(
      [{filename, status: 'modified'}],
      {commits: 1, changed_files: 1},
      policy,
    );
    assert.ok(
      result.required_contexts.includes('KIDULTS Governed Landing Control Validation V1'),
      filename,
    );
  }
});
