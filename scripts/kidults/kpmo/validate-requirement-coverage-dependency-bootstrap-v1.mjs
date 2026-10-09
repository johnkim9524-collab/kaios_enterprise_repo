#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const WORKFLOW_PATH = '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
export const REQUIRED_INSTALL_COMMAND = 'run: npm ci --ignore-scripts --no-audit --no-fund';
export const PINNED_SETUP_NODE = 'uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';

function fail(code, detail = '') {
  throw new Error(`${code}${detail ? `:${detail}` : ''}`);
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

export function validateRequirementCoverageDependencyBootstrap(text) {
  if (typeof text !== 'string' || !text.length) fail('REQUIREMENT_COVERAGE_WORKFLOW_EMPTY');

  const setupToken = 'uses: actions/setup-node@';
  const installName = '- name: Install locked dependencies';
  const preflightName = '- name: Verify exact source and coverage syntax';
  const ajvConsumer = 'build-asi-requirement-adapter-coverage-v1.mjs';

  const setupNodeCount = count(text, setupToken);
  if (setupNodeCount < 1) fail('REQUIREMENT_COVERAGE_SETUP_NODE_REQUIRED');
  if (count(text, PINNED_SETUP_NODE) !== setupNodeCount) fail('REQUIREMENT_COVERAGE_SETUP_NODE_PINNING');
  if (count(text, installName) !== 1) fail('REQUIREMENT_COVERAGE_LOCKED_INSTALL_STEP_CARDINALITY');
  if (count(text, REQUIRED_INSTALL_COMMAND) !== 1) fail('REQUIREMENT_COVERAGE_LOCKED_INSTALL_COMMAND_CARDINALITY');
  if (count(text, preflightName) !== 1) fail('REQUIREMENT_COVERAGE_PREFLIGHT_CARDINALITY');
  if (!text.includes(ajvConsumer)) fail('REQUIREMENT_COVERAGE_DEPENDENCY_CONSUMER_MISSING');

  const setupIndex = text.indexOf(setupToken);
  const installNameIndex = text.indexOf(installName);
  const installCommandIndex = text.indexOf(REQUIRED_INSTALL_COMMAND);
  const preflightIndex = text.indexOf(preflightName);
  const firstConsumerIndex = text.indexOf(ajvConsumer);

  if (!(setupIndex < installNameIndex && installNameIndex < installCommandIndex && installCommandIndex < preflightIndex && preflightIndex < firstConsumerIndex)) {
    fail('REQUIREMENT_COVERAGE_LOCKED_INSTALL_ORDER_INVALID');
  }

  if (/\brun:\s*npm\s+install\b/.test(text) || /\brun:\s*npx\b/.test(text)) {
    fail('REQUIREMENT_COVERAGE_MUTABLE_RUNTIME_RESOLUTION_FORBIDDEN');
  }

  return {
    state: 'VERIFIED_PASS',
    workflow_path: WORKFLOW_PATH,
    locked_install_command: 'npm ci --ignore-scripts --no-audit --no-fund',
    locked_install_count: 1,
    pinned_setup_node_count: setupNodeCount,
    install_precedes_dependency_consumer: true,
    production_authorized: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  process.stdout.write(`${JSON.stringify(validateRequirementCoverageDependencyBootstrap(workflow), null, 2)}\n`);
}
