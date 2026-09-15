#!/usr/bin/env node
import fs from 'node:fs';
import {
  buildOperationsConsole, buildProviderOperationsRegistry, createIncident, detectOperationalDrift,
  repositoryHead, transitionIncident, transitionProvider, verifyIncident
} from './provider-operations-capability-v1-lib.mjs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const contract = readJson('coordination/kidults/operations/provider-operations-capability-v1.json');
const head = repositoryHead();
const registry = buildProviderOperationsRegistry(
  contract,
  readJson(contract.source_bindings.provider_registry),
  readJson(contract.source_bindings.rights_manifest),
  readJson(contract.source_bindings.adapter_manifest),
  readJson(contract.source_bindings.communication_evidence),
  { sourceSha: head }
);
if (registry.counts.providers !== 21 || registry.counts.canonical_registry_providers !== 18 || registry.counts.adapter_foundations !== 6 || registry.counts.adapter_only_discovery !== 3) throw new Error('PROVIDER_OPS_INVENTORY_INCOMPLETE');
if (registry.counts.active !== 0 || registry.counts.blocked !== 21 || registry.counts.empirical_records !== 0) throw new Error('PROVIDER_OPS_FAIL_CLOSED_INVENTORY_INVALID');
if (registry.providers.some(item => item.production !== 'HOLD' || item.public !== 'HOLD' || item.g5 !== 'HOLD')) throw new Error('PROVIDER_OPS_HOLD_BROKEN');
for (const provider of registry.providers) {
  if (!provider.activation_status.failed_controls.every(control => contract.activation_controls.includes(control))) throw new Error(`PROVIDER_OPS_ACTIVATION_CONTROL_DRIFT:${provider.provider_id}`);
  if ((contract.transitions[provider.lifecycle_state] ?? []).includes('ACTIVE')) {
    try { transitionProvider(provider, 'ACTIVE', contract); throw new Error('PROVIDER_OPS_FALSE_GREEN_ACTIVATION'); }
    catch (error) { if (!String(error.message).startsWith('PROVIDER_OPS_ACTIVATION_BLOCKED:')) throw error; }
  }
}
let incident = createIncident({ incidentId: 'provider-ops-validation-incident', providerId: 'PSA_PREMIUM', classification: 'CONTROL_VALIDATION', detectedAt: '2026-09-08T00:00:00.000Z', sourceSha: head });
for (const [index, state] of contract.incident_lifecycle.slice(1).entries()) incident = transitionIncident(incident, { toState: state, occurredAt: `2026-09-08T00:0${index + 1}:00.000Z`, actor: 'KPMO_CONTROL_VALIDATOR' });
if (!verifyIncident(incident, contract) || incident.state !== 'AUDITED') throw new Error('PROVIDER_OPS_INCIDENT_AUDIT_INVALID');
const automation = detectOperationalDrift(registry, null, contract);
if (automation.alerts.length !== 0 || automation.reason !== 'BASELINE_ESTABLISHED_NO_ALERT') throw new Error('PROVIDER_OPS_NOISY_BASELINE_ALERT');
const consoleSnapshot = buildOperationsConsole(registry, contract);
if (consoleSnapshot.provider_count !== 21 || consoleSnapshot.rows.some(row => row.portal !== 'FROZEN_FAIL_CLOSED')) throw new Error('PROVIDER_OPS_CONSOLE_INVALID');
console.log(JSON.stringify({
  validator: 'KIDULTS_PROVIDER_OPERATIONS_CAPABILITY_V1', state: 'VERIFIED_PASS', source_sha: head,
  provider_lifecycle: contract.lifecycle, provider_count: registry.counts.providers,
  canonical_registry_providers: registry.counts.canonical_registry_providers,
  adapter_foundations: registry.counts.adapter_foundations, adapter_only_discovery: registry.counts.adapter_only_discovery,
  rights_operations: 'FAIL_CLOSED', qualification_operations: 'FAIL_CLOSED', evidence_operations: 'FAIL_CLOSED',
  current_sold_operations: 'FAIL_CLOSED', operations_console_rows: consoleSnapshot.provider_count,
  incident_lifecycle_states: incident.events.length, incident_audit: incident.state,
  observability_dimensions: contract.observability.length, automation_dimensions: contract.automation.dimensions.length,
  baseline_alerts: automation.alerts.length, provider_calls: registry.provider_calls, credentials: registry.credentials,
  empirical_records: registry.counts.empirical_records, production: registry.production, public: registry.public, g5: registry.g5,
  registry_digest: registry.registry_digest, console_digest: consoleSnapshot.console_digest,
  incident_ledger_digest: incident.ledger_digest
}, null, 2));
