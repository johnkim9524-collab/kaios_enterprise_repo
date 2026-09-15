import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildOperationsConsole, buildProviderOperationsRegistry, createIncident, detectOperationalDrift,
  transitionIncident, transitionProvider, verifyIncident
} from '../../../scripts/kidults/operations/provider-operations-capability-v1-lib.mjs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const contract = readJson('coordination/kidults/operations/provider-operations-capability-v1.json');
const sourceSha = 'a'.repeat(40);
const build = () => buildProviderOperationsRegistry(
  contract,
  readJson(contract.source_bindings.provider_registry),
  readJson(contract.source_bindings.rights_manifest),
  readJson(contract.source_bindings.adapter_manifest),
  readJson(contract.source_bindings.communication_evidence),
  { sourceSha, observedAt: '2026-09-08T00:00:00.000Z' }
);

test('unifies every canonical and adapter-only provider in one lifecycle registry', () => {
  const registry = build();
  assert.equal(registry.counts.providers, 21);
  assert.equal(registry.counts.canonical_registry_providers, 18);
  assert.equal(registry.counts.adapter_foundations, 6);
  assert.equal(registry.counts.adapter_only_discovery, 3);
  assert.equal(new Set(registry.providers.map(item => item.provider_id)).size, 21);
  assert.ok(registry.providers.every(item => contract.lifecycle.includes(item.lifecycle_state)));
});

test('tracks the complete operational state and blocks all incomplete activation', () => {
  const registry = build();
  for (const provider of registry.providers) {
    for (const field of ['identity', 'owner', 'lifecycle_state', 'rights', 'qualification', 'schema_version', 'health', 'risk', 'last_review', 'activation_status', 'evidence', 'current_sold']) assert.ok(field in provider);
    assert.equal(provider.activation_status.eligible, false);
    assert.equal(provider.current_sold.synthetic_promotion_allowed, false);
    assert.equal(provider.production, 'HOLD');
  }
  const ready = structuredClone(registry.providers[0]);
  ready.lifecycle_state = 'READY';
  assert.throws(() => transitionProvider(ready, 'ACTIVE', contract), /PROVIDER_OPS_ACTIVATION_BLOCKED:RIGHTS,QUALIFICATION,EVIDENCE,CURRENT_SOLD,OPERATIONAL_HEALTH/);
});

test('rejects live adapter activation and rights release without a valid receipt and expiry', () => {
  const providerRegistry = readJson(contract.source_bindings.provider_registry);
  const rightsManifest = readJson(contract.source_bindings.rights_manifest);
  const adapterManifest = readJson(contract.source_bindings.adapter_manifest);
  const communication = readJson(contract.source_bindings.communication_evidence);
  const released = structuredClone(rightsManifest);
  released.provider_field_classifications[0].release_status = 'RELEASED';
  const registry = buildProviderOperationsRegistry(contract, providerRegistry, released, adapterManifest, communication, { sourceSha });
  assert.equal(registry.providers.find(item => item.provider_id === 'EBAY_MARKETPLACE_INSIGHTS').rights.state, 'BLOCKED');
  const activated = structuredClone(adapterManifest);
  activated.activation_policy.live_connections_allowed = true;
  assert.throws(() => buildProviderOperationsRegistry(contract, providerRegistry, rightsManifest, activated, communication, { sourceSha }), /ADAPTER_ACTIVATION_BOUNDARY_BROKEN/);
});

test('rejects duplicate registry identities and unregistered communication providers', () => {
  const providerRegistry = readJson(contract.source_bindings.provider_registry);
  const rightsManifest = readJson(contract.source_bindings.rights_manifest);
  const adapterManifest = readJson(contract.source_bindings.adapter_manifest);
  const communication = readJson(contract.source_bindings.communication_evidence);
  const duplicate = structuredClone(providerRegistry);
  duplicate.providers.push(structuredClone(duplicate.providers[0]));
  assert.throws(() => buildProviderOperationsRegistry(contract, duplicate, rightsManifest, adapterManifest, communication, { sourceSha }), /DUPLICATE_CANONICAL_PROVIDER/);
  const orphan = structuredClone(communication);
  orphan.events.push({ provider_id: 'UNREGISTERED_PROVIDER' });
  assert.throws(() => buildProviderOperationsRegistry(contract, providerRegistry, rightsManifest, adapterManifest, orphan, { sourceSha }), /COMMUNICATION_PROVIDER_UNREGISTERED/);
});

test('supports the common lifecycle without provider-specific transition logic', () => {
  const record = structuredClone(build().providers.find(item => item.lifecycle_state === 'RIGHTS'));
  const event = transitionProvider(record, 'QUALIFICATION', contract, { observedAt: '2026-09-08T00:01:00.000Z', reason: 'CONTROL_TEST' });
  assert.equal(event.from, 'RIGHTS');
  assert.equal(event.to, 'QUALIFICATION');
  assert.match(event.event_digest, /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => transitionProvider(record, 'ACTIVE', contract), /PROVIDER_OPS_TRANSITION_NOT_ALLOWED/);
});

test('onboards, qualifies, activates, suspends, recovers and retires every provider through one process', () => {
  for (const provider of build().providers) {
    const record = structuredClone(provider);
    record.lifecycle_state = 'DISCOVERY';
    for (const target of ['EVALUATION', 'RIGHTS', 'QUALIFICATION', 'READY']) {
      const event = transitionProvider(record, target, contract);
      assert.equal(event.provider_id, provider.provider_id);
      record.lifecycle_state = target;
    }
    record.rights.state = 'PASS';
    record.qualification.state = 'PASS';
    record.evidence.state = 'PASS';
    record.current_sold.state = 'PASS';
    record.current_sold.synthetic_promotion_allowed = false;
    record.health.state = 'HEALTHY';
    assert.equal(transitionProvider(record, 'ACTIVE', contract).to, 'ACTIVE');
    record.lifecycle_state = 'ACTIVE';
    assert.equal(transitionProvider(record, 'SUSPENDED', contract).to, 'SUSPENDED');
    record.lifecycle_state = 'SUSPENDED';
    assert.equal(transitionProvider(record, 'ACTIVE', contract).to, 'ACTIVE');
    record.lifecycle_state = 'ACTIVE';
    assert.equal(transitionProvider(record, 'RETIRED', contract).to, 'RETIRED');
  }
});

test('creates an immutable incident evidence chain through audit', () => {
  let incident = createIncident({ incidentId: 'inc-001', providerId: 'PSA_PREMIUM', detectedAt: '2026-09-08T00:00:00.000Z', sourceSha });
  for (const [index, state] of contract.incident_lifecycle.slice(1).entries()) incident = transitionIncident(incident, { toState: state, occurredAt: `2026-09-08T00:0${index + 1}:00.000Z`, actor: 'TEST_OPERATOR' });
  assert.equal(incident.state, 'AUDITED');
  assert.equal(incident.events.length, 8);
  assert.equal(Object.isFrozen(incident.events), true);
  assert.equal(Object.isFrozen(incident.events[0]), true);
  assert.throws(() => incident.events.push({ state: 'CORRUPTED' }), TypeError);
  assert.equal(verifyIncident(incident, contract), true);
  assert.throws(() => transitionIncident(incident, { toState: 'DETECTED', occurredAt: '2026-09-08T01:00:00.000Z', actor: 'TEST_OPERATOR' }), /IMMUTABLE_AFTER_AUDIT/);
  const corrupted = structuredClone(incident); corrupted.events[2].actor = 'CORRUPTED';
  assert.throws(() => verifyIncident(corrupted, contract), /INCIDENT_CHAIN_INVALID/);
});

test('alerts only on meaningful provider state changes and suppresses duplicates', () => {
  const previous = structuredClone(build());
  const current = structuredClone(previous);
  previous.providers[0].lifecycle_state = 'ACTIVE'; current.providers[0].lifecycle_state = 'ACTIVE';
  previous.providers[0].rights.state = 'PASS'; current.providers[0].rights.state = 'BLOCKED';
  const first = detectOperationalDrift(current, previous, contract, { observedAt: '2026-09-08T00:10:00.000Z' });
  assert.equal(first.alerts.length, 1);
  assert.equal(first.alerts[0].dimension, 'RIGHTS_DRIFT');
  const duplicate = detectOperationalDrift(current, previous, contract, { priorAlertKeys: [first.alerts[0].alert_key] });
  assert.equal(duplicate.alerts.length, 0);
  assert.equal(duplicate.suppressed, 1);
  assert.equal(detectOperationalDrift(current, current, contract).alerts.length, 0);
});

test('renders an operator-only console without provider calls or business metrics', () => {
  const consoleSnapshot = buildOperationsConsole(build(), contract, { observedAt: '2026-09-08T00:20:00.000Z' });
  assert.equal(consoleSnapshot.audience, 'INTERNAL_OPERATOR');
  assert.equal(consoleSnapshot.provider_count, 21);
  assert.equal(consoleSnapshot.provider_calls, 0);
  assert.equal(consoleSnapshot.credentials, 0);
  assert.ok(consoleSnapshot.rows.every(row => row.portal === 'FROZEN_FAIL_CLOSED'));
});
