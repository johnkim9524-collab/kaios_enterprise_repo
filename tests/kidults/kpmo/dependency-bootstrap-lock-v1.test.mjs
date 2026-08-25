import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { validateDependencyBootstrapEstate } from '../../../scripts/kidults/kpmo/validate-dependency-bootstrap-lock-v1.mjs';

const workflowDir = '.github/workflows';

function snapshot() {
  const workflows = {};
  for (const name of fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const file = path.posix.join(workflowDir, name);
    workflows[file] = fs.readFileSync(file, 'utf8');
  }
  const files = {};
  for (const file of [
    'package.json',
    'npm-shrinkwrap.json',
    'services/kidults-autonomous-intelligence/package.json',
    'services/kidults-autonomous-intelligence/package-lock.json',
    'tooling/kidults-portal-r001-browser-qa/package.json',
    'tooling/kidults-portal-r001-browser-qa/package-lock.json',
    'requirements-ci.in',
    'requirements-ci.lock.txt',
    'requirements-runtime.in',
    'requirements-runtime.lock.txt',
    'Dockerfile'
  ]) files[file] = fs.readFileSync(file, 'utf8');
  return {
    contract: fs.readFileSync('coordination/kidults/kpmo/dependency-bootstrap-lock-contract-v1.json', 'utf8'),
    workflows,
    files
  };
}

function expectMutation(code, mutate) {
  const input = snapshot();
  mutate(input);
  assert.throws(() => validateDependencyBootstrapEstate(input), new RegExp(code));
}

test('current dependency bootstrap estate is locked', () => {
  const result = validateDependencyBootstrapEstate(snapshot());
  assert.ok(result.npmCiCount > 0);
  assert.ok(result.pipInstallCount > 0);
  assert.ok(result.npmRegistryEntries > 0);
  assert.ok(result.pythonRequirementCount > 0);
  assert.equal(result.runtimeRequirementCount, 0);
  assert.equal(result.remainingNodeVersionAliases, 0);
  assert.equal(result.remainingPythonVersionAliases, 0);
});

test('rejects npm install and npx runtime resolution', () => {
  expectMutation('MUTABLE_NPM_INSTALL_FORBIDDEN', (input) => {
    input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'] = input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'].replace('npm ci', 'npm install');
  });
  expectMutation('NPX_RUNTIME_RESOLUTION_FORBIDDEN', (input) => {
    input.workflows['.github/workflows/kidults-runtime-remote-readonly-inventory.yml'] = input.workflows['.github/workflows/kidults-runtime-remote-readonly-inventory.yml'].replace('node node_modules/wrangler/bin/wrangler.js', 'npx wrangler');
  });
});

test('rejects weakened npm ci flags and lock integrity', () => {
  expectMutation('NPM_CI_HARDENING_FLAG_MISSING', (input) => {
    input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'] = input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'].replace(' --ignore-scripts', '');
  });
  expectMutation('NPM_REGISTRY_INTEGRITY_MISSING', (input) => {
    input.files['npm-shrinkwrap.json'] = input.files['npm-shrinkwrap.json'].replace(/"integrity": "sha512-[^"]+"/, '"integrity": ""');
  });
  expectMutation('NPM_PACKAGE_MANAGER_CONTRACT_DRIFT', (input) => {
    input.files['package.json'] = input.files['package.json'].replace('npm@11.17.0', 'npm@latest');
  });
  expectMutation('ESTATE_NODE_VERSION_ALIAS_OR_UNAPPROVED', (input) => {
    input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'] = input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'].replace("node-version: '24.19.0'", "node-version: '24'");
  });
});

test('rejects runtime aliases through block, flow, quoted, and escaped keys', () => {
  expectMutation('ESTATE_SETUP_NODE_VERSION_BINDING_DRIFT', (input) => {
    input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'] = input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'].replace(
      'node-version:',
      'runtime-version:'
    );
  });
  expectMutation('ESTATE_SETUP_PYTHON_VERSION_BINDING_DRIFT', (input) => {
    input.workflows['.github/workflows/ci-validation.yml'] = input.workflows['.github/workflows/ci-validation.yml'].replace(
      'python-version:',
      'runtime-version:'
    );
  });
  expectMutation('ESTATE_NODE_VERSION_ALIAS_OR_UNAPPROVED', (input) => {
    input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'] = input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'].replace(
      "node-version: '24.19.0'",
      "'node-version': '24'"
    );
  });
  expectMutation('ESTATE_NODE_VERSION_ALIAS_OR_UNAPPROVED', (input) => {
    input.workflows['.github/workflows/kidults-runtime-remote-readonly-inventory.yml'] = input.workflows['.github/workflows/kidults-runtime-remote-readonly-inventory.yml'].replace(
      "{node-version: '24.19.0'}",
      "{\"node-version\": '24'}"
    );
  });
  expectMutation('ESTATE_NODE_VERSION_ALIAS_OR_UNAPPROVED', (input) => {
    input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'] = input.workflows['.github/workflows/kidults-a15-autonomous-policy.yml'].replace(
      "node-version: '24.19.0'",
      "\"node\\u002dversion\": '24'"
    );
  });
  expectMutation('ESTATE_PYTHON_VERSION_ALIAS_OR_UNAPPROVED', (input) => {
    input.workflows['.github/workflows/ci-validation.yml'] = input.workflows['.github/workflows/ci-validation.yml'].replace(
      'python-version: "3.11.16"',
      '"python\\x2dversion": "3.11"'
    );
  });
});

test('rejects unhashed Python installs and requirements', () => {
  expectMutation('PIP_HASH_ENFORCEMENT_FLAG_MISSING', (input) => {
    input.workflows['.github/workflows/ci-validation.yml'] = input.workflows['.github/workflows/ci-validation.yml'].replace('--require-hashes', '--no-compile');
  });
  expectMutation('PYTHON_REQUIREMENT_HASH_MISSING', (input) => {
    input.files['requirements-ci.lock.txt'] = input.files['requirements-ci.lock.txt'].replace(/\s+\\\n\s+--hash=sha256:[a-f0-9]{64}\s+\\\n\s+--hash=sha256:[a-f0-9]{64}/, '');
  });
  expectMutation('PIP_HASH_ENFORCEMENT_FLAG_MISSING', (input) => {
    input.workflows['.github/workflows/ci-validation.yml'] = input.workflows['.github/workflows/ci-validation.yml'].replace(
      'python -m pip install \\\n',
      'python -m pip install -r requirements-ci.lock.txt\n          python -m pip install \\\n'
    );
  });
  expectMutation('PIP_HASH_ENFORCEMENT_FLAG_MISSING', (input) => {
    input.workflows['.github/workflows/ci-validation.yml'] = input.workflows['.github/workflows/ci-validation.yml'].replace(
      'python -m pip install \\\n',
      'python -m pip install -r requirements-ci.lock.txt | echo \\\n'
    );
  });
  expectMutation('ESTATE_PYTHON_VERSION_ALIAS_OR_UNAPPROVED', (input) => {
    input.workflows['.github/workflows/ci-validation.yml'] = input.workflows['.github/workflows/ci-validation.yml'].replace('python-version: "3.11.16"', 'python-version: "3.11"');
  });
  expectMutation('PYTHON_RUNTIME_LOCK_NOT_EMPTY', (input) => {
    input.files['requirements-runtime.lock.txt'] += `\npytest==9.1.1 --hash=sha256:${'0'.repeat(64)}\n`;
  });
});

test('rejects mutable or changed Docker bases', () => {
  expectMutation('DOCKER_BASE_DIGEST_DRIFT', (input) => {
    input.files.Dockerfile = input.files.Dockerfile.replace(/@sha256:[a-f0-9]{64}/, '');
  });
  expectMutation('DOCKER_BASE_DIGEST_DRIFT', (input) => {
    input.files.Dockerfile = input.files.Dockerfile.replace(/sha256:[a-f0-9]{64}/, `sha256:${'0'.repeat(64)}`);
  });
  expectMutation('DOCKER_BASE_DIGEST_DRIFT', (input) => {
    input.files.Dockerfile = input.files.Dockerfile.replace('3.11.16-slim-bookworm', '3.11-slim-bookworm');
  });
  expectMutation('CONTRACT_DOCKER_EXACT_TAG_DRIFT', (input) => {
    input.contract = input.contract.replace('python:3.11.16-slim-bookworm', 'python:3.11-slim-bookworm');
  });
  expectMutation('CONTRACT_DOCKER_INDEX_DIGEST_DRIFT', (input) => {
    input.contract = input.contract.replace(/sha256:[a-f0-9]{64}/, `sha256:${'0'.repeat(64)}`);
  });
  expectMutation('DOCKER_RUNTIME_PYTHON_LOCK_COPY_MISSING', (input) => {
    input.files.Dockerfile = input.files.Dockerfile.replaceAll('requirements-runtime.lock.txt', 'requirements-ci.lock.txt');
  });
});
