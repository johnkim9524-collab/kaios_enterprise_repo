import assert from 'node:assert/strict';
import test from 'node:test';
import { idFrom } from '../../../scripts/kidults/staging-operations/lib/canonical-v1.mjs';
import { ProviderControl, ShadowFetchBroker } from '../../../scripts/kidults/staging-operations/lib/provider-control-v1.mjs';

const nowMs = Date.parse('2026-09-21T16:00:00.000Z');
const approval = (role, taskId, approverId) => ({
  approval_id: idFrom('approval', { role, taskId, approverId }), approver_id: approverId,
  role, task_id: taskId, expires_at: '2026-09-21T17:00:00.000Z',
});
const request = (overrides = {}) => {
  const taskId = overrides.task_id ?? 'provider-positive';
  return {
    task_id: taskId, provider_id: 'fixture-open-metadata', policy_version: 'provider-control-staging-v1',
    rights: { snapshot_id: `rights:${taskId}`, expires_at: '2026-09-22T16:00:00.000Z' },
    approval_a: approval('TRACK_A', taskId, 'track-a-1'), approval_z: approval('TRACK_Z', taskId, 'track-z-1'),
    environment: 'STAGING', production: 'HOLD', public: 'HOLD', g5: 'HOLD', ...overrides,
  };
};
const control = providers => new ProviderControl({ now: () => nowMs, providers });

test('valid dual-key rights request is admitted only to shadow', () => {
  assert.equal(control([{ provider_id: 'fixture-open-metadata', kill_switch: false }]).decide(request()).decision, 'ALLOW_SHADOW');
});

test('one-sided approval is denied', () => {
  assert.equal(control([{ provider_id: 'fixture-open-metadata', kill_switch: false }]).decide(request({ approval_z: null })).reason, 'DUAL_APPROVAL_REQUIRED');
});

test('same actor cannot satisfy A/Z separation', () => {
  const value = request();
  value.approval_z.approver_id = value.approval_a.approver_id;
  assert.equal(control([{ provider_id: 'fixture-open-metadata', kill_switch: false }]).decide(value).reason, 'APPROVAL_SEPARATION_INVALID');
});

test('expired rights are quarantined', () => {
  assert.equal(control([{ provider_id: 'fixture-open-metadata', kill_switch: false }]).decide(request({ rights: { snapshot_id: 'rights:old', expires_at: '2026-09-20T00:00:00.000Z' } })).decision, 'QUARANTINE');
});

test('approval consumption is single-use', () => {
  const instance = control([{ provider_id: 'fixture-open-metadata', kill_switch: false }]);
  const value = request();
  assert.equal(instance.decide(value).decision, 'ALLOW_SHADOW');
  assert.equal(instance.decide(value).reason, 'APPROVAL_REPLAY');
});

test('provider kill switch produces zero broker fetches', () => {
  const verdict = control([{ provider_id: 'fixture-open-metadata', kill_switch: true }]).decide(request());
  const broker = new ShadowFetchBroker({ fixture: { id: 1 } });
  assert.equal(verdict.decision, 'DENY');
  assert.equal(broker.calls, 0);
});

test('Production, Public or G5 boundary weakening is denied', () => {
  for (const field of ['production', 'public', 'g5']) {
    assert.equal(control([{ provider_id: 'fixture-open-metadata', kill_switch: false }]).decide(request({ [field]: 'OPEN' })).reason, 'PROTECTED_BOUNDARY');
  }
});

test('broker uses deterministic fixture without external network', () => {
  const verdict = control([{ provider_id: 'fixture-open-metadata', kill_switch: false }]).decide(request());
  const broker = new ShadowFetchBroker({ fixture: { id: 'fixture' } });
  const result = broker.fetch({ decision: verdict });
  assert.equal(result.external_requests, 0);
  assert.equal(broker.externalCalls, 0);
});

test('broker rejects caller-controlled network configuration and direct-network arguments', () => {
  assert.throws(
    () => new ShadowFetchBroker({ fixture: { id: 'fixture' }, network: () => {} }),
    /BROKER_EXTERNAL_NETWORK_CONFIGURATION_FORBIDDEN/,
  );
  const verdict = control([{ provider_id: 'fixture-open-metadata', kill_switch: false }]).decide(request({ task_id: 'direct-network-negative' }));
  const broker = new ShadowFetchBroker({ fixture: { id: 'fixture' } });
  assert.throws(() => broker.fetch({ decision: verdict, directNetwork: true }), /BROKER_EXTERNAL_NETWORK_ARGUMENT_FORBIDDEN/);
  assert.equal(broker.externalCalls, 0);
});

test('literal ALLOW_SHADOW strings cannot drive the broker', () => {
  const broker = new ShadowFetchBroker({ fixture: { id: 'fixture' } });
  assert.throws(() => broker.fetch({ decision: 'ALLOW_SHADOW' }), /BROKER_DECISION_NOT_ALLOWED/);
  assert.equal(broker.calls, 0);
  assert.equal(broker.externalCalls, 0);
});
