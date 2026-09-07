import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PINNED_SETUP_NODE,
  REQUIRED_INSTALL_COMMAND,
  WORKFLOW_PATH,
  validateRequirementCoverageDependencyBootstrap
} from '../../../scripts/kidults/kpmo/validate-requirement-coverage-dependency-bootstrap-v1.mjs';

const readWorkflow = () => fs.readFileSync(WORKFLOW_PATH, 'utf8');

function expectCode(text, code) {
  assert.throws(() => validateRequirementCoverageDependencyBootstrap(text), new RegExp(code));
}

test('current requirement coverage workflow has one locked dependency install and pinned Node in every Node consumer job', () => {
  const receipt = validateRequirementCoverageDependencyBootstrap(readWorkflow());
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.locked_install_count, 1);
  assert.equal(receipt.install_precedes_dependency_consumer, true);
  assert.equal(receipt.pinned_setup_node_count, 2);
  assert.equal(receipt.production_authorized, false);
});

test('missing or mutable setup-node fails closed across multiple Node consumer jobs', () => {
  const pristine = readWorkflow();
  expectCode(pristine.replace(PINNED_SETUP_NODE, 'uses: actions/setup-node@v7'), 'REQUIREMENT_COVERAGE_SETUP_NODE_PINNING');
  expectCode(pristine.replaceAll(PINNED_SETUP_NODE, 'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'), 'REQUIREMENT_COVERAGE_SETUP_NODE_REQUIRED');
});

test('removing or weakening the locked install fails closed', () => {
  const pristine = readWorkflow();
  expectCode(pristine.replace(REQUIRED_INSTALL_COMMAND, 'run: echo bootstrap-removed'), 'REQUIREMENT_COVERAGE_LOCKED_INSTALL_COMMAND_CARDINALITY');
  expectCode(pristine.replace('--ignore-scripts', ''), 'REQUIREMENT_COVERAGE_LOCKED_INSTALL_COMMAND_CARDINALITY');
  expectCode(pristine.replace('--no-audit', ''), 'REQUIREMENT_COVERAGE_LOCKED_INSTALL_COMMAND_CARDINALITY');
  expectCode(pristine.replace('--no-fund', ''), 'REQUIREMENT_COVERAGE_LOCKED_INSTALL_COMMAND_CARDINALITY');
});

test('moving dependency bootstrap after preflight fails closed', () => {
  const pristine = readWorkflow();
  const block = `      - name: Install locked dependencies\n        ${REQUIRED_INSTALL_COMMAND}\n`;
  const without = pristine.replace(block, '');
  const marker = '      - name: Validate requirement coverage registry and automatic continuation\n';
  assert.notEqual(without, pristine);
  assert.ok(without.includes(marker));
  expectCode(without.replace(marker, `${block}${marker}`), 'REQUIREMENT_COVERAGE_LOCKED_INSTALL_ORDER_INVALID');
});
