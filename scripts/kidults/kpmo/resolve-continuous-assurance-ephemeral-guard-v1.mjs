#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateHealthReceipt } from './sentinel-health-receipt-contract-v1.mjs';

export * from './resolve-continuous-assurance-ephemeral-guard-core-v1.mjs';

const CORE_PATH = fileURLToPath(new URL('./resolve-continuous-assurance-ephemeral-guard-core-v1.mjs', import.meta.url));
const HEALTH_PATH = fileURLToPath(new URL('./resolve-continuous-assurance-sentinel-health-v1.mjs', import.meta.url));
const ASSURANCE_WORKFLOW = 'KIDULTS Platform Continuous Assurance V1';
const FULL_AUDIT_GUARD_STATES = new Set([
  'EPHEMERAL_CANONICAL_LEADER_SELECTED',
  'FULL_AUDIT_BYPASS_NON_ALIASABLE',
]);
function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    fail(code);
  }
}

function argumentValue(argv, name) {
  const indexes = [];
  for (let index = 0; index < argv.length; index += 1) if (argv[index] === name) indexes.push(index);
  if (indexes.length !== 1) fail('INLINE_HEALTH_GATE_ARGUMENT_CARDINALITY', name);
  const value = argv[indexes[0] + 1];
  if (!value || value.startsWith('--')) fail('INLINE_HEALTH_GATE_ARGUMENT_VALUE', name);
  return value;
}

function appendEnvironment(values, env) {
  if (!env.GITHUB_ENV) return;
  fs.appendFileSync(env.GITHUB_ENV, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, 'utf8');
}

export function inlineProducerHealthRequired(env = process.env) {
  // A protected-main push starts before workflow_run-only producers can exist, and
  // validation-only push producers intentionally publish no terminal artifact.
  // Their exact terminal bindings are observed by observe-core-producer-content.
  return env.GITHUB_WORKFLOW === ASSURANCE_WORKFLOW &&
    env.GITHUB_REF === 'refs/heads/main' &&
    ['schedule', 'workflow_dispatch', 'workflow_run'].includes(env.GITHUB_EVENT_NAME || '');
}

export function guardRequiresProducerHealth(guard) {
  return Boolean(guard && FULL_AUDIT_GUARD_STATES.has(guard.state));
}

function runChild(filePath, args, env) {
  const result = spawnSync(process.execPath, [filePath, ...args], {
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) fail('INLINE_HEALTH_GATE_CHILD_EXECUTION', result.error.code || result.error.message);
  return Number.isInteger(result.status) ? result.status : 1;
}

export function runGuardCli(argv = process.argv.slice(2), env = process.env) {
  const coreStatus = runChild(CORE_PATH, argv, env);
  if (coreStatus !== 0) return coreStatus;

  const guardOutput = argumentValue(argv, '--output');
  const guard = readJson(guardOutput, 'INLINE_HEALTH_GATE_GUARD_RECEIPT_INVALID');
  if (!inlineProducerHealthRequired(env) || !guardRequiresProducerHealth(guard)) return 0;

  const runnerTemp = path.resolve(env.RUNNER_TEMP || '');
  const packetDir = path.resolve(path.dirname(guardOutput));
  if (!runnerTemp || packetDir === runnerTemp || !packetDir.startsWith(`${runnerTemp}${path.sep}`)) fail('INLINE_HEALTH_GATE_PACKET_PATH_OUTSIDE_RUNNER_TEMP');

  const healthOutput = path.join(packetDir, 'core-four-producer-health-v1.json');
  const healthEnv = { ...env, KPMO_INLINE_ASSURANCE_HEALTH_GATE: 'true' };
  const healthStatus = runChild(HEALTH_PATH, ['--output', healthOutput], healthEnv);
  const receipt = readJson(healthOutput, 'INLINE_HEALTH_GATE_HEALTH_RECEIPT_INVALID');
  validateHealthReceipt(receipt, env);

  appendEnvironment({
    KPMO_CORE_FOUR_HEALTH_REQUIRED: 'true',
    KPMO_CORE_FOUR_HEALTH_STATE: String(receipt.state || 'UNKNOWN'),
    KPMO_CORE_FOUR_HEALTH_RECEIPT_DIGEST: String(receipt.receipt_digest || ''),
  }, env);

  const producerPass = receipt.state === 'VERIFIED_PASS' &&
    receipt.semantic_content_verified === true &&
    receipt.producers.every((producer) => producer?.state === 'VERIFIED_PASS' && producer?.artifact_transport_verified === true && producer?.artifact_content_validated === true);
  if (healthStatus !== 0 || !producerPass) return healthStatus || 1;
  return 0;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) process.exitCode = runGuardCli();
