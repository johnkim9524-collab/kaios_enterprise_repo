#!/usr/bin/env node
import fs from 'node:fs';
import { terminalFailureEnvironment, terminalFailureReceipt } from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-ephemeral-guard-v1.mjs';

const expected = {
  KPMO_EXECUTE_FULL_AUDIT: 'false',
  KPMO_ASSURANCE_TERMINAL_FAIL_CLOSED: 'true',
  KPMO_ASSURANCE_TERMINAL_FAIL_REASON: 'CORE_FOUR_PRODUCER_HEALTH_FAILED',
};
const actual = terminalFailureEnvironment('CORE_FOUR_PRODUCER_HEALTH_FAILED');
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('TERMINAL_FAILURE_ENVIRONMENT_MISMATCH');

let rejected = false;
try { terminalFailureEnvironment('bad reason'); } catch { rejected = true; }
if (!rejected) throw new Error('INVALID_TERMINAL_FAILURE_REASON_ACCEPTED');

const baseReceipt = {
  schema_version: '1.0.0',
  receipt_type: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',
  source: { expected_sha: '69f9c45c8371c4439649de0f811f4c6a7b2149d6' },
  states: { internal_control_state: 'VERIFIED_PASS', external_empirical_state: 'HOLD', release_state: 'HOLD', overall_state: 'HOLD', promotion_eligible: false },
  checks: [{ id: 'STATIC_CONTROL', required: true, state: 'VERIFIED_PASS' }],
  observed_at: '2026-09-08T00:00:00.000Z',
  receipt_digest: 'sha256:placeholder',
};
const red = terminalFailureReceipt(baseReceipt, 'CORE_FOUR_PRODUCER_HEALTH_FAILED', {
  GITHUB_RUN_ID: '34278814866',
  GITHUB_RUN_ATTEMPT: '1',
  KPMO_SOURCE_SHA: '69f9c45c8371c4439649de0f811f4c6a7b2149d6',
});
if (red.states.internal_control_state !== 'VERIFIED_FAIL' || red.states.overall_state !== 'RED' || red.states.release_state !== 'HOLD' || red.states.promotion_eligible !== false) throw new Error('TERMINAL_RECEIPT_NOT_FAIL_CLOSED');
if (red.fatal_error_code !== 'CORE_FOUR_PRODUCER_HEALTH_FAILED' || red.terminal_failure?.state !== 'VERIFIED_FAIL') throw new Error('TERMINAL_FAILURE_IDENTITY_MISSING');
if (!red.checks.some((check) => check.id === 'ASSURANCE_TERMINAL_CORE_FOUR_PRODUCER_HEALTH_FAILED' && check.state === 'VERIFIED_FAIL')) throw new Error('TERMINAL_FAILED_CHECK_MISSING');
if (!/^sha256:[a-f0-9]{64}$/.test(red.receipt_digest)) throw new Error('TERMINAL_RECEIPT_DIGEST_INVALID');
if (red.terminal_failure.public !== 'HOLD' || red.terminal_failure.production !== 'HOLD' || red.terminal_failure.g5 !== 'HOLD') throw new Error('TERMINAL_HOLD_BOUNDARY_INVALID');

const source = fs.readFileSync('scripts/kidults/kpmo/resolve-continuous-assurance-ephemeral-guard-v1.mjs', 'utf8');
for (const marker of [
  "containTerminalFailure(argv, env, 'EPHEMERAL_GUARD_CORE_FAILED')",
  "containTerminalFailure(argv, env, 'CORE_FOUR_PRODUCER_HEALTH_FAILED')",
  "KPMO_EXECUTE_FULL_AUDIT: 'false'",
  "KPMO_ASSURANCE_TERMINAL_FAIL_CLOSED: 'true'",
  'writeTerminalFailurePacket(argv, env, reason)',
]) {
  if (!source.includes(marker)) throw new Error(`TERMINAL_FAILURE_CONTAINMENT_WIRING_MISSING:${marker}`);
}

const coreFailure = source.indexOf("containTerminalFailure(argv, env, 'EPHEMERAL_GUARD_CORE_FAILED')");
const coreReturn = source.indexOf('return coreStatus;', coreFailure);
if (coreFailure < 0 || coreReturn < coreFailure) throw new Error('CORE_FAILURE_CONTAINMENT_ORDER_INVALID');
const healthFailure = source.indexOf("containTerminalFailure(argv, env, 'CORE_FOUR_PRODUCER_HEALTH_FAILED')");
const healthReturn = source.indexOf('return healthStatus || 1;', healthFailure);
if (healthFailure < 0 || healthReturn < healthFailure) throw new Error('HEALTH_FAILURE_CONTAINMENT_ORDER_INVALID');

console.log(JSON.stringify({
  suite: 'KIDULTS_CONTINUOUS_ASSURANCE_TERMINAL_FAILURE_CONTAINMENT_V1',
  positive: 9,
  negative: 1,
  state: 'VERIFIED_PASS',
  promotion_eligible: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
}));
