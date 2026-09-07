import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildOperationalDashboard, DISASTER_SCENARIOS, MONITORS, PROVIDERS, runOperationalSimulation } from '../../../scripts/kidults/operations/d-day-operations-readiness-v1-lib.mjs';

const adapters = JSON.parse(fs.readFileSync('coordination/kidults/synthetic/launch-cohort-provider-adapters-v1.json', 'utf8'));
const sourceSha = 'a'.repeat(40);
test('runs every provider through one isolated operational pipeline', () => {
  const receipt = runOperationalSimulation(adapters, { sourceSha, observedAt: '2026-09-07T00:00:00.000Z' });
  assert.deepEqual(receipt.provider_paths.map(item => item.provider), PROVIDERS);
  assert.ok(receipt.provider_paths.every(item => item.stages.length === 9 && item.decision === 'SYNTHETIC' && item.action === 'NONE'));
  assert.equal(receipt.provider_calls, 0); assert.equal(receipt.credentials, 0); assert.equal(receipt.empirical_records, 0);
});
test('fails closed for every disaster scenario', () => {
  const receipt = runOperationalSimulation(adapters, { sourceSha });
  assert.deepEqual(receipt.disasters.map(item => item.scenario), DISASTER_SCENARIOS);
  assert.ok(receipt.disasters.every(item => item.verification === 'FAIL_CLOSED' && item.production === 'HOLD'));
});
test('builds a runtime-timestamped complete observability snapshot', () => {
  const receipt = runOperationalSimulation(adapters, { sourceSha });
  const dashboard = buildOperationalDashboard(receipt, { observedAt: '2026-09-07T01:00:00.000Z' });
  assert.deepEqual(Object.keys(dashboard.statuses), MONITORS);
  assert.ok(Object.values(dashboard.statuses).every(item => item.observed_at === '2026-09-07T01:00:00.000Z' && item.fail_closed));
});
test('rejects provider activation and provider-set mutations', () => {
  assert.throws(() => runOperationalSimulation({ ...adapters, activation_policy: { ...adapters.activation_policy, live_connections_allowed: true } }, { sourceSha }), /ACTIVATION_BOUNDARY/);
  assert.throws(() => runOperationalSimulation({ ...adapters, adapters: adapters.adapters.slice(1) }, { sourceSha }), /PROVIDER_SET_MISMATCH/);
});
