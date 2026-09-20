import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import { evaluateAdmission, verifyDecision, verifyManifest } from '../src/common-control/admission-v1.mjs';
import { executeShadowBroker } from '../src/common-control/shadow-broker-v1.mjs';

const instant = value => new Date(value);
const digest = value => digestObject({ value });

function sourceRequest(overrides = {}) {
  return {
    requestId: 'request-001', taskId: 'task-001', sourceId: 'fixture-source-001',
    sourceFamilyId: 'fixture-family-001', providerId: null,
    purpose: 'INTERNAL_CONTROL_VALIDATION', scope: 'SYNTHETIC_FIXTURE',
    dataClass: 'NON_PERSONAL_SYNTHETIC', region: 'GLOBAL',
    requestedMode: 'SYNTHETIC_SHADOW', synthetic: true,
    endpointFingerprint: digest('fixture-endpoint'), ...overrides,
  };
}

function controlState(overrides = {}) {
  return {
    policyRevision: 1, policyDigest: digest('policy-v1'),
    registryRevision: 1, registryDigest: digest('registry-v1'), killEpoch: 1,
    globalKill: false, killedSourceFamilies: [], killedSources: [],
    externalEgress: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
    ...overrides,
  };
}

function admitted(options = {}) {
  const source = sourceRequest(options.source);
  const state = controlState(options.state);
  const evaluated = evaluateAdmission({
    sourceRequest: source, controlState: state,
    now: instant('2026-09-19T00:00:00.000Z'), ttlSeconds: 60,
  });
  return { source, state, ...evaluated };
}

function brokerRequest(manifest, overrides = {}) {
  return {
    requestId: 'request-001', taskId: 'task-001', manifestId: manifest.manifestId,
    endpointFingerprint: digest('fixture-endpoint'), attempt: 1, ...overrides,
  };
}

function execute({ source, state, decision, manifest }, overrides = {}) {
  return executeShadowBroker({
    sourceRequest: source, decision, manifest,
    brokerRequest: brokerRequest(manifest, overrides.broker),
    controlState: overrides.state ?? state,
    now: overrides.now ?? instant('2026-09-19T00:00:30.000Z'),
  });
}

test('synthetic shadow request receives a digest-bound manifest and a no-egress receipt', () => {
  const result = admitted();
  assert.equal(result.decision.verdict, 'SHADOW_ELIGIBLE');
  assert.equal(result.manifest.allowedMode, 'SHADOW_NO_FETCH');
  const receipt = execute(result);
  assert.equal(receipt.state, 'SHADOW_NO_FETCH_RECORDED');
  assert.equal(receipt.egressAttempted, false);
  assert.equal(receipt.bytesReceived, 0);
  assert.equal(receipt.credentialResolved, false);
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.publicRelease, 'HOLD');
  assert.equal(receipt.g5, 'HOLD');
});

test('same input and clock replay to the same decision, manifest and receipt digests', () => {
  const left = admitted();
  const right = admitted();
  assert.deepEqual(left.decision, right.decision);
  assert.deepEqual(left.manifest, right.manifest);
  assert.deepEqual(execute(left), execute(right));
});

for (const [mode, reason] of [
  ['EXTERNAL_FETCH', 'OPS_EXTERNAL_EGRESS_DISABLED'],
  ['CREDENTIAL_ACCESS', 'PRD_OWNER_APPROVAL_REQUIRED'],
  ['PRODUCTION', 'PRD_PRODUCTION_HOLD'],
  ['PUBLIC', 'PRD_PUBLIC_USE_HOLD'],
  ['G5', 'PRD_G5_HOLD'],
]) {
  test(`${mode} is denied without issuing a manifest`, () => {
    const { decision, manifest } = evaluateAdmission({
      sourceRequest: sourceRequest({ requestedMode: mode, synthetic: false }),
      controlState: controlState(), now: instant('2026-09-19T00:00:00.000Z'),
    });
    assert.equal(decision.verdict, 'DENY');
    assert.equal(decision.primaryReason, reason);
    assert.equal(manifest, null);
  });
}

test('unknown request mode fails closed before a decision is issued', () => {
  assert.throws(() => evaluateAdmission({
    sourceRequest: sourceRequest({ requestedMode: 'UNREGISTERED_MODE' }),
    controlState: controlState(), now: instant('2026-09-19T00:00:00.000Z'),
  }), /SOURCE_REQUEST_MODE_UNKNOWN/);
});

for (const [name, state, reason] of [
  ['global kill', { globalKill: true }, 'OPS_GLOBAL_KILL_ENGAGED'],
  ['source-family kill', { killedSourceFamilies: ['fixture-family-001'] }, 'OPS_SOURCE_FAMILY_KILL_ENGAGED'],
  ['source kill', { killedSources: ['fixture-source-001'] }, 'OPS_SOURCE_KILL_ENGAGED'],
]) {
  test(`${name} prevents manifest issuance`, () => {
    const { decision, manifest } = evaluateAdmission({
      sourceRequest: sourceRequest(), controlState: controlState(state),
      now: instant('2026-09-19T00:00:00.000Z'),
    });
    assert.equal(decision.primaryReason, reason);
    assert.equal(manifest, null);
  });
}

test('kill engaged after manifest issuance denies the broker attempt', () => {
  const result = admitted();
  const receipt = execute(result, { state: controlState({ globalKill: true, killEpoch: 2 }) });
  assert.equal(receipt.state, 'DENIED');
  assert.equal(receipt.primaryReason, 'OPS_GLOBAL_KILL_ENGAGED');
  assert.equal(receipt.egressAttempted, false);
});

for (const [name, state, reason] of [
  ['policy revision', { policyRevision: 2, policyDigest: digest('policy-v2') }, 'OPS_POLICY_REVISION_CHANGED'],
  ['registry revision', { registryRevision: 2, registryDigest: digest('registry-v2') }, 'OPS_REGISTRY_REVISION_CHANGED'],
  ['kill epoch', { killEpoch: 2 }, 'OPS_KILL_EPOCH_CHANGED'],
]) {
  test(`${name} change invalidates the issued manifest`, () => {
    const result = admitted();
    const receipt = execute(result, { state: controlState(state) });
    assert.equal(receipt.state, 'DENIED');
    assert.equal(receipt.primaryReason, reason);
  });
}

test('expired manifest is denied without an egress attempt', () => {
  const result = admitted();
  const receipt = execute(result, { now: instant('2026-09-19T00:01:00.000Z') });
  assert.equal(receipt.state, 'DENIED');
  assert.equal(receipt.primaryReason, 'DECISION_EXPIRED');
  assert.equal(receipt.egressAttempted, false);
});

test('retry beyond the manifest attempt fence is denied', () => {
  const result = admitted();
  const receipt = execute(result, { broker: { attempt: 2 } });
  assert.equal(receipt.state, 'DENIED');
  assert.equal(receipt.primaryReason, 'OPS_ATTEMPT_LIMIT_EXCEEDED');
});

test('endpoint substitution is denied', () => {
  const result = admitted();
  const receipt = execute(result, { broker: { endpointFingerprint: digest('redirected-endpoint') } });
  assert.equal(receipt.state, 'DENIED');
  assert.equal(receipt.primaryReason, 'OPS_ENDPOINT_FINGERPRINT_MISMATCH');
});

test('task or request substitution is denied', () => {
  const result = admitted();
  const receipt = execute(result, { broker: { taskId: 'task-002' } });
  assert.equal(receipt.state, 'DENIED');
  assert.equal(receipt.primaryReason, 'OPS_BROKER_REQUEST_BINDING_MISMATCH');
});

test('decision tampering fails integrity validation', () => {
  const result = admitted();
  result.decision.allowedMode = 'EXTERNAL_FETCH';
  assert.throws(() => execute(result), /DECISION_DIGEST_INVALID/);
});

test('manifest tampering fails integrity validation', () => {
  const result = admitted();
  result.manifest.externalEgress = true;
  assert.throws(() => execute(result), /MANIFEST_DIGEST_INVALID/);
});

test('decision and manifest reject unregistered envelope fields', () => {
  const result = admitted();
  assert.throws(() => verifyDecision({ ...result.decision, unexpected: true }), /DECISION_SHAPE_INVALID/);
  assert.throws(() => verifyManifest({ ...result.manifest, unexpected: true }), /MANIFEST_SHAPE_INVALID/);
});

test('unsafe control state cannot enable egress or protected environments', () => {
  assert.throws(() => evaluateAdmission({
    sourceRequest: sourceRequest(), controlState: controlState({ externalEgress: true }),
    now: instant('2026-09-19T00:00:00.000Z'),
  }), /CONTROL_STATE_SAFETY_INVALID/);
  assert.throws(() => evaluateAdmission({
    sourceRequest: sourceRequest(), controlState: controlState({ production: 'ACTIVE' }),
    now: instant('2026-09-19T00:00:00.000Z'),
  }), /CONTROL_STATE_PROTECTED_GATE_INVALID/);
});
