#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export * from './resolve-continuous-assurance-ephemeral-guard-core-v1.mjs';

const CORE_PATH = fileURLToPath(new URL('./resolve-continuous-assurance-ephemeral-guard-core-v1.mjs', import.meta.url));
const HEALTH_PATH = fileURLToPath(new URL('./resolve-continuous-assurance-sentinel-health-v1.mjs', import.meta.url));
const ASSURANCE_WORKFLOW = 'KIDULTS Platform Continuous Assurance V1';
const FULL_AUDIT_GUARD_STATES = new Set([
  'EPHEMERAL_CANONICAL_LEADER_SELECTED',
  'FULL_AUDIT_BYPASS_NON_ALIASABLE',
]);
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const FAILURE_REASON_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

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

function optionalArgumentValue(argv, name) {
  const indexes = [];
  for (let index = 0; index < argv.length; index += 1) if (argv[index] === name) indexes.push(index);
  if (indexes.length > 1) fail('INLINE_HEALTH_GATE_ARGUMENT_CARDINALITY', name);
  if (indexes.length === 0) return '';
  const value = argv[indexes[0] + 1];
  if (!value || value.startsWith('--')) fail('INLINE_HEALTH_GATE_ARGUMENT_VALUE', name);
  return value;
}

function appendEnvironment(values, env) {
  if (!env.GITHUB_ENV) return;
  fs.appendFileSync(env.GITHUB_ENV, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, 'utf8');
}

function atomicWriteJson(filePath, value) {
  const target = path.resolve(filePath);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
}

export function terminalFailureEnvironment(reason) {
  if (!FAILURE_REASON_PATTERN.test(reason || '')) fail('ASSURANCE_TERMINAL_FAILURE_REASON_INVALID');
  return {
    KPMO_EXECUTE_FULL_AUDIT: 'false',
    KPMO_ASSURANCE_TERMINAL_FAIL_CLOSED: 'true',
    KPMO_ASSURANCE_TERMINAL_FAIL_REASON: reason,
  };
}

export function terminalFailureReceipt(receipt, reason, env = process.env) {
  if (!FAILURE_REASON_PATTERN.test(reason || '')) fail('ASSURANCE_TERMINAL_FAILURE_REASON_INVALID');
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail('ASSURANCE_TERMINAL_RECEIPT_INVALID');
  const { observed_at: _observedAt, receipt_digest: _receiptDigest, ...base } = structuredClone(receipt);
  const checkId = `ASSURANCE_TERMINAL_${reason}`;
  const checks = (Array.isArray(base.checks) ? base.checks : []).filter((check) => check?.id !== checkId);
  checks.push({ id: checkId, required: true, state: 'VERIFIED_FAIL', failure_class: reason });
  const payload = {
    ...base,
    states: {
      ...(base.states || {}),
      internal_control_state: 'VERIFIED_FAIL',
      external_empirical_state: 'HOLD',
      release_state: 'HOLD',
      overall_state: 'RED',
      promotion_eligible: false,
    },
    checks,
    fatal_error_code: reason,
    terminal_failure: {
      state: 'VERIFIED_FAIL',
      reason,
      workflow_run_id: String(env.GITHUB_RUN_ID || 'UNKNOWN'),
      workflow_run_attempt: String(env.GITHUB_RUN_ATTEMPT || '1'),
      source_sha: String(env.KPMO_SOURCE_SHA || env.GITHUB_SHA || base.source?.expected_sha || 'UNAVAILABLE'),
      promotion_eligible: false,
      public: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD',
    },
  };
  return {
    ...payload,
    observed_at: new Date().toISOString(),
    receipt_digest: sha256(stableJson(payload)),
  };
}

function writeTerminalFailurePacket(argv, env, reason) {
  const auditOutput = optionalArgumentValue(argv, '--audit-output');
  const remediationOutput = optionalArgumentValue(argv, '--remediation-output');
  if (!auditOutput || !remediationOutput) return false;
  let current;
  try {
    current = JSON.parse(fs.readFileSync(auditOutput, 'utf8'));
  } catch {
    return false;
  }
  const receipt = terminalFailureReceipt(current, reason, env);
  const checkId = `ASSURANCE_TERMINAL_${reason}`;
  atomicWriteJson(auditOutput, receipt);
  atomicWriteJson(remediationOutput, {
    schema_version: '1.0.0',
    plan_type: 'KIDULTS_SAFE_REMEDIATION_PACKET',
    source_sha: receipt.terminal_failure.source_sha,
    source_receipt_digest: receipt.receipt_digest,
    disposition: 'CIRCUIT_OPEN_MANUAL_HOLD',
    failed_check_ids: [checkId],
    integrity_findings: [reason],
    persistent_fix_ids: [],
    activation_eligible: false,
    activation: { eligible: false },
    direct_main_write: false,
    auto_merge: false,
    promotion_eligible: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
  return true;
}

function containTerminalFailure(argv, env, reason) {
  writeTerminalFailurePacket(argv, env, reason);
  appendEnvironment(terminalFailureEnvironment(reason), env);
}

export function inlineProducerHealthRequired(env = process.env) {
  return env.GITHUB_WORKFLOW === ASSURANCE_WORKFLOW &&
    env.GITHUB_REF === 'refs/heads/main' &&
    ['push', 'schedule', 'workflow_dispatch', 'workflow_run'].includes(env.GITHUB_EVENT_NAME || '');
}

export function guardRequiresProducerHealth(guard) {
  return Boolean(guard && FULL_AUDIT_GUARD_STATES.has(guard.state));
}

function validateHealthReceipt(receipt, env) {
  const sourceSha = env.KPMO_SOURCE_SHA || env.GITHUB_SHA || '';
  if (!SHA_PATTERN.test(sourceSha)) fail('INLINE_HEALTH_GATE_SOURCE_SHA_INVALID');
  if (env.GITHUB_SHA !== sourceSha) fail('INLINE_HEALTH_GATE_SOURCE_SHA_DIVERGENCE');
  if (receipt?.receipt_id !== 'kpmo-continuous-assurance-sentinel-health-v1') fail('INLINE_HEALTH_GATE_RECEIPT_ID');
  if (receipt?.coverage_scope !== 'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM') fail('INLINE_HEALTH_GATE_SCOPE');
  if (receipt?.repository !== env.GITHUB_REPOSITORY || receipt?.source_sha !== sourceSha) fail('INLINE_HEALTH_GATE_SOURCE_BINDING');
  if (Number(receipt?.observer_run_id) !== Number(env.GITHUB_RUN_ID) || Number(receipt?.observer_run_attempt) !== Number(env.GITHUB_RUN_ATTEMPT)) fail('INLINE_HEALTH_GATE_OBSERVER_BINDING');
  if (!DIGEST_PATTERN.test(receipt?.receipt_digest || '')) fail('INLINE_HEALTH_GATE_DIGEST_FORMAT');
  const unsigned = structuredClone(receipt);
  delete unsigned.receipt_digest;
  if (receipt.receipt_digest !== sha256(stableJson(unsigned))) fail('INLINE_HEALTH_GATE_DIGEST_MISMATCH');
  if (receipt?.whole_platform_authority !== false || receipt?.promotion_eligible !== false || receipt?.provider_authority !== false || receipt?.database_authority !== false) fail('INLINE_HEALTH_GATE_AUTHORITY_BOUNDARY');
  if (receipt?.public !== 'HOLD' || receipt?.production !== 'HOLD' || receipt?.g5 !== 'HOLD') fail('INLINE_HEALTH_GATE_HOLD_BOUNDARY');
  if (!Array.isArray(receipt?.producers) || receipt.producers.length !== 4) fail('INLINE_HEALTH_GATE_PRODUCER_CARDINALITY');
  const ids = receipt.producers.map((producer) => producer?.id).sort();
  if (ids.join(',') !== 'CANONICAL_TRUTH,REQUIREMENT,RESERVE,SHADOW') fail('INLINE_HEALTH_GATE_PRODUCER_SET');
  return sourceSha;
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
  if (coreStatus !== 0) {
    containTerminalFailure(argv, env, 'EPHEMERAL_GUARD_CORE_FAILED');
    return coreStatus;
  }

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
  if (healthStatus !== 0 || !producerPass) {
    containTerminalFailure(argv, env, 'CORE_FOUR_PRODUCER_HEALTH_FAILED');
    return healthStatus || 1;
  }
  return 0;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) process.exitCode = runGuardCli();
