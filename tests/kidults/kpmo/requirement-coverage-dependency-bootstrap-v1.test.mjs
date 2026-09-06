import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  REQUIRED_INSTALL_COMMAND,
  WORKFLOW_PATH,
  validateRequirementCoverageDependencyBootstrap
} from '../../../scripts/kidults/kpmo/validate-requirement-coverage-dependency-bootstrap-v1.mjs';

const readWorkflow = () => fs.readFileSync(WORKFLOW_PATH, 'utf8');

function expectCode(text, code) {
  assert.throws(() => validateRequirementCoverageDependencyBootstrap(text), new RegExp(code));
}

test('current requirement coverage workflow has one locked dependency bootstrap before runtime consumers', () => {
  const receipt = validateRequirementCoverageDependencyBootstrap(readWorkflow());
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.locked_install_count, 1);
  assert.equal(receipt.install_precedes_dependency_consumer, true);
  assert.equal(receipt.production_authorized, false);
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
