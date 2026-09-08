#!/usr/bin/env node
import fs from 'node:fs';
import { terminalFailureEnvironment } from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-ephemeral-guard-v1.mjs';

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

const source = fs.readFileSync('scripts/kidults/kpmo/resolve-continuous-assurance-ephemeral-guard-v1.mjs', 'utf8');
for (const marker of [
  "containTerminalFailure(env, 'EPHEMERAL_GUARD_CORE_FAILED')",
  "containTerminalFailure(env, 'CORE_FOUR_PRODUCER_HEALTH_FAILED')",
  "KPMO_EXECUTE_FULL_AUDIT: 'false'",
  "KPMO_ASSURANCE_TERMINAL_FAIL_CLOSED: 'true'",
]) {
  if (!source.includes(marker)) throw new Error(`TERMINAL_FAILURE_CONTAINMENT_WIRING_MISSING:${marker}`);
}

const coreFailure = source.indexOf("containTerminalFailure(env, 'EPHEMERAL_GUARD_CORE_FAILED')");
const coreReturn = source.indexOf('return coreStatus;', coreFailure);
if (coreFailure < 0 || coreReturn < coreFailure) throw new Error('CORE_FAILURE_CONTAINMENT_ORDER_INVALID');
const healthFailure = source.indexOf("containTerminalFailure(env, 'CORE_FOUR_PRODUCER_HEALTH_FAILED')");
const healthReturn = source.indexOf('return healthStatus || 1;', healthFailure);
if (healthFailure < 0 || healthReturn < healthFailure) throw new Error('HEALTH_FAILURE_CONTAINMENT_ORDER_INVALID');

console.log(JSON.stringify({
  suite: 'KIDULTS_CONTINUOUS_ASSURANCE_TERMINAL_FAILURE_CONTAINMENT_V1',
  positive: 4,
  negative: 1,
  state: 'VERIFIED_PASS',
  promotion_eligible: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
}));
