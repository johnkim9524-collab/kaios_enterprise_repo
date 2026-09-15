import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;

export const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
export const repositoryHead = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const requiredRecordFields = Object.freeze([
  'identity', 'owner', 'lifecycle_state', 'rights', 'qualification', 'schema_version',
  'health', 'risk', 'last_review', 'activation_status', 'evidence', 'current_sold'
]);

function assertObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
}

function uniqueFields(rightsManifest) {
  return [...new Set((rightsManifest.field_catalog ?? []).flatMap(item => item.fields ?? []))].sort();
}

function lifecycleFor(source, rights) {
  if (source.state === 'CLOSED') return 'RETIRED';
  if (!rights || rights.release_status !== 'RELEASED') return 'RIGHTS';
  return 'QUALIFICATION';
}

function block(reason, evidenceRefs = []) {
  return { state: 'BLOCKED', reason, evidence_refs: [...evidenceRefs] };
}

function buildRecord({ source, adapter, rights, fields, sourceSha, registryAsOf, adapterOnly = false }) {
  const lifecycleState = adapterOnly ? 'DISCOVERY' : lifecycleFor(source, rights);
  const evidenceRefs = [...new Set([
    ...(source.evidence_refs ?? []),
    'coordination/kidults/registry/provider/records/provider-operating-state-v1.json',
    ...(adapter ? ['coordination/kidults/synthetic/launch-cohort-provider-adapters-v1.json'] : [])
  ])];
  const rightsReleased = rights?.release_status === 'RELEASED'
    && typeof source.rights_receipt_id === 'string'
    && source.rights_receipt_id.length > 0
    && typeof source.rights_expiration === 'string'
    && Date.parse(source.rights_expiration) > Date.parse(registryAsOf);
  const schemaBound = Boolean(adapter && adapter.schema_mapper?.source_schema_version !== 'UNBOUND');
  const rightsOperations = {
    state: rightsReleased ? 'PASS' : 'BLOCKED',
    rights_receipt: rightsReleased ? (source.rights_receipt_id ?? null) : null,
    allowed_fields: rightsReleased ? fields : [],
    restricted_fields: rightsReleased ? [] : fields,
    retention: rights?.retention_rule ?? 'NO_ADMISSION_NO_RETENTION',
    derived_results: rights?.derived_result_policy ?? 'PROHIBITED_UNTIL_WRITTEN_RIGHTS',
    expiration: source.rights_expiration ?? null,
    revocation: rightsReleased ? 'NOT_REVOKED' : 'NOT_APPLICABLE_NO_ACTIVE_RIGHTS',
    source_state: source.rights_state ?? 'UNKNOWN_FAIL_CLOSED',
    evidence_refs: evidenceRefs
  };
  const qualification = {
    schema: schemaBound ? { state: 'PASS', version: adapter.schema_mapper.source_schema_version } : block('LIVE_SCHEMA_NOT_ACTIVATION_VERIFIED', evidenceRefs),
    evidence: block('EMPIRICAL_PROVIDER_EVIDENCE_NOT_ADMITTED', evidenceRefs),
    confidence: block('EMPIRICAL_CONFIDENCE_NOT_AVAILABLE', evidenceRefs),
    current_sold: block('EMPIRICAL_CURRENT_SOLD_NOT_ADMITTED', evidenceRefs),
    track_b: block('INDEPENDENT_PROVIDER_QUALIFICATION_NOT_VERIFIED', evidenceRefs),
    qualification: block('ACTIVATION_QUALIFICATION_NOT_VERIFIED', evidenceRefs),
    state: 'BLOCKED'
  };
  const evidence = {
    state: 'BLOCKED', empirical_record_count: 0, freshness: null, coverage: 0,
    integrity: 'NOT_EVALUATED_NO_EMPIRICAL_EVIDENCE', growth: null,
    quality: 'NOT_EVALUATED_NO_EMPIRICAL_EVIDENCE', drift: 'BASELINE_UNAVAILABLE',
    evidence_refs: evidenceRefs
  };
  const currentSold = {
    state: 'BLOCKED', empirical_record_count: 0, freshness: null, coverage: 0,
    latency: null, qualification: 'NOT_VERIFIED', health: 'FAIL_CLOSED',
    synthetic_promotion_allowed: false, evidence_refs: evidenceRefs
  };
  const failedControls = ['RIGHTS', 'QUALIFICATION', 'EVIDENCE', 'CURRENT_SOLD', 'OPERATIONAL_HEALTH'];
  const recordCore = {
    provider_id: source.provider_id,
    identity: {
      provider_id: source.provider_id,
      provider_name: source.provider_name ?? source.provider_id,
      aliases: source.aliases ?? [],
      source_layer: source.source_layer ?? 'VERTICAL_AUTHORITY',
      brands_or_verticals: source.brands_or_verticals ?? ['KIDULTS'],
      source_registry_kind: adapterOnly ? 'ADAPTER_FOUNDATION' : 'CANONICAL_PROVIDER_REGISTRY'
    },
    owner: source.owner ?? 'KPMO / Provider Lead',
    lifecycle_state: lifecycleState,
    rights: rightsOperations,
    qualification,
    schema_version: adapter?.schema_mapper?.source_schema_version ?? source.schema_state ?? 'UNBOUND',
    health: { state: 'BLOCKED_FAIL_CLOSED', reason: 'ACTIVATION_CONTROLS_INCOMPLETE', observed_at: registryAsOf },
    risk: { state: 'HIGH_UNQUALIFIED', failed_activation_controls: failedControls },
    last_review: source.evidence_date ?? registryAsOf,
    activation_status: { state: 'BLOCKED', eligible: false, failed_controls: failedControls },
    evidence,
    current_sold: currentSold,
    communication: source.communication ?? { state: 'NO_OUTREACH_RECORDED', automatic_followup_authorized: false },
    source_sha: sourceSha,
    evidence_refs: evidenceRefs,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD'
  };
  return deepFreeze({ ...recordCore, record_digest: digest(recordCore) });
}

export function buildProviderOperationsRegistry(contract, providerRegistry, rightsManifest, adapterManifest, communicationEvidence, { sourceSha = repositoryHead(), observedAt = new Date().toISOString() } = {}) {
  for (const [value, code] of [[contract, 'PROVIDER_OPS_CONTRACT_REQUIRED'], [providerRegistry, 'PROVIDER_REGISTRY_REQUIRED'], [rightsManifest, 'RIGHTS_MANIFEST_REQUIRED'], [adapterManifest, 'ADAPTER_MANIFEST_REQUIRED'], [communicationEvidence, 'COMMUNICATION_EVIDENCE_REQUIRED']]) assertObject(value, code);
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('PROVIDER_OPS_SOURCE_SHA_INVALID');
  if (contract.authority_boundary?.provider_activation_authorized !== false || contract.authority_boundary?.provider_network_calls_authorized !== false) throw new Error('PROVIDER_OPS_AUTHORITY_BOUNDARY_BROKEN');
  if (adapterManifest.activation_policy?.live_connections_allowed !== false || adapterManifest.activation_policy?.credentials_allowed !== false || adapterManifest.activation_policy?.provider_data_allowed !== false) throw new Error('PROVIDER_OPS_ADAPTER_ACTIVATION_BOUNDARY_BROKEN');
  if (rightsManifest.live_authorized_fields?.length !== 0) throw new Error('PROVIDER_OPS_UNEXPECTED_LIVE_FIELDS');

  const lifecycle = new Set(contract.lifecycle ?? []);
  const sourceProviders = new Map((providerRegistry.providers ?? []).map(item => [item.provider_id, item]));
  if (sourceProviders.size !== providerRegistry.providers?.length) throw new Error('PROVIDER_OPS_DUPLICATE_CANONICAL_PROVIDER');
  const rightsByProvider = new Map((rightsManifest.provider_field_classifications ?? []).map(item => [item.provider_id, item]));
  const adapterByCanonical = new Map();
  for (const adapter of adapterManifest.adapters ?? []) {
    const canonicalId = contract.adapter_identity_bindings?.[adapter.provider_id];
    if (!canonicalId) throw new Error(`PROVIDER_OPS_ADAPTER_IDENTITY_UNBOUND:${adapter.provider_id}`);
    if (adapterByCanonical.has(canonicalId)) throw new Error(`PROVIDER_OPS_DUPLICATE_ADAPTER_BINDING:${canonicalId}`);
    adapterByCanonical.set(canonicalId, adapter);
    if (!sourceProviders.has(canonicalId)) {
      sourceProviders.set(canonicalId, {
        provider_id: canonicalId, provider_name: canonicalId.replaceAll('_', ' '), aliases: [adapter.provider_id],
        source_layer: 'VERTICAL_AUTHORITY', brands_or_verticals: ['KIDULTS'], owner: 'KPMO / Provider Lead',
        state: 'DISCOVERY', evidence_date: providerRegistry.as_of?.slice(0, 10), rights_state: 'UNKNOWN_FAIL_CLOSED',
        evidence_refs: ['coordination/kidults/synthetic/launch-cohort-provider-adapters-v1.json'],
        communication: { state: 'NO_OUTREACH_RECORDED', automatic_followup_authorized: false }
      });
    }
  }
  const communicationProviders = new Set((communicationEvidence.events ?? []).map(item => item.provider_id));
  for (const providerId of communicationProviders) if (!sourceProviders.has(providerId)) throw new Error(`PROVIDER_OPS_COMMUNICATION_PROVIDER_UNREGISTERED:${providerId}`);

  const fields = uniqueFields(rightsManifest);
  const canonicalProviderCount = providerRegistry.providers.length;
  const records = [...sourceProviders.values()].sort((a, b) => a.provider_id.localeCompare(b.provider_id)).map(source => buildRecord({
    source,
    adapter: adapterByCanonical.get(source.provider_id),
    rights: rightsByProvider.get(source.provider_id),
    fields,
    sourceSha,
    registryAsOf: providerRegistry.as_of,
    adapterOnly: !providerRegistry.providers.some(item => item.provider_id === source.provider_id)
  }));
  for (const record of records) {
    if (!lifecycle.has(record.lifecycle_state)) throw new Error(`PROVIDER_OPS_LIFECYCLE_INVALID:${record.provider_id}`);
    for (const field of requiredRecordFields) if (!(field in record)) throw new Error(`PROVIDER_OPS_RECORD_FIELD_MISSING:${record.provider_id}:${field}`);
  }
  const counts = {
    providers: records.length,
    canonical_registry_providers: canonicalProviderCount,
    adapter_foundations: adapterManifest.adapters.length,
    adapter_only_discovery: records.filter(item => item.identity.source_registry_kind === 'ADAPTER_FOUNDATION').length,
    active: records.filter(item => item.lifecycle_state === 'ACTIVE').length,
    blocked: records.filter(item => item.activation_status.state === 'BLOCKED').length,
    empirical_records: records.reduce((sum, item) => sum + item.evidence.empirical_record_count, 0)
  };
  const core = {
    id: 'kidults-provider-operations-registry-v1', version: '1.0.0', source_sha: sourceSha,
    observed_at: observedAt, source_registry_as_of: providerRegistry.as_of,
    lifecycle: contract.lifecycle, counts, providers: records,
    provider_calls: 0, credentials: 0, synthetic_promotion_allowed: false,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD'
  };
  return deepFreeze({ ...core, registry_digest: digest(core) });
}

function activationControlStates(record) {
  return {
    RIGHTS: record.rights.state,
    QUALIFICATION: record.qualification.state,
    EVIDENCE: record.evidence.state,
    CURRENT_SOLD: record.current_sold.state,
    OPERATIONAL_HEALTH: record.health.state === 'HEALTHY' ? 'PASS' : 'BLOCKED'
  };
}

export function transitionProvider(record, targetState, contract, { observedAt = new Date().toISOString(), reason = 'OPERATOR_REQUEST' } = {}) {
  if (!contract.lifecycle.includes(targetState)) throw new Error('PROVIDER_OPS_TARGET_LIFECYCLE_INVALID');
  if (!(contract.transitions?.[record.lifecycle_state] ?? []).includes(targetState)) throw new Error('PROVIDER_OPS_TRANSITION_NOT_ALLOWED');
  const controls = activationControlStates(record);
  if (targetState === 'ACTIVE') {
    const failed = contract.activation_controls.filter(control => controls[control] !== 'PASS');
    if (failed.length) throw new Error(`PROVIDER_OPS_ACTIVATION_BLOCKED:${failed.join(',')}`);
    if (record.current_sold.synthetic_promotion_allowed !== false) throw new Error('PROVIDER_OPS_SYNTHETIC_PROMOTION_FORBIDDEN');
  }
  const eventCore = { provider_id: record.provider_id, from: record.lifecycle_state, to: targetState, reason, observed_at: observedAt, source_record_digest: record.record_digest };
  return deepFreeze({ ...eventCore, event_digest: digest(eventCore) });
}

const incidentTransitions = Object.freeze({
  DETECTED: 'CLASSIFIED', CLASSIFIED: 'ASSIGNED', ASSIGNED: 'MITIGATED', MITIGATED: 'RECOVERED',
  RECOVERED: 'VERIFIED', VERIFIED: 'CLOSED', CLOSED: 'AUDITED'
});

export function createIncident({ incidentId, providerId, classification = 'UNCLASSIFIED', detectedAt, sourceSha }) {
  if (!incidentId || !providerId || !detectedAt || !/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('PROVIDER_OPS_INCIDENT_INPUT_INVALID');
  const eventCore = { sequence: 1, state: 'DETECTED', occurred_at: detectedAt, actor: 'AUTOMATION', classification, previous_event_digest: null };
  const event = deepFreeze({ ...eventCore, event_digest: digest(eventCore) });
  const core = { incident_id: incidentId, provider_id: providerId, source_sha: sourceSha, state: 'DETECTED', events: [event] };
  return deepFreeze({ ...core, ledger_digest: digest(core) });
}

export function transitionIncident(incident, { toState, occurredAt, actor, note }) {
  if (incident.state === 'AUDITED') throw new Error('PROVIDER_OPS_INCIDENT_IMMUTABLE_AFTER_AUDIT');
  if (incidentTransitions[incident.state] !== toState) throw new Error('PROVIDER_OPS_INCIDENT_TRANSITION_INVALID');
  const previous = incident.events.at(-1);
  const eventCore = { sequence: incident.events.length + 1, state: toState, occurred_at: occurredAt, actor, note: note ?? null, previous_event_digest: previous.event_digest };
  const event = deepFreeze({ ...eventCore, event_digest: digest(eventCore) });
  const core = { incident_id: incident.incident_id, provider_id: incident.provider_id, source_sha: incident.source_sha, state: toState, events: [...incident.events, event] };
  return deepFreeze({ ...core, ledger_digest: digest(core) });
}

export function verifyIncident(incident, contract) {
  if (!contract.incident_lifecycle.includes(incident.state)) throw new Error('PROVIDER_OPS_INCIDENT_STATE_INVALID');
  let prior = null;
  for (const [index, event] of incident.events.entries()) {
    const { event_digest: claimed, ...core } = event;
    if (event.sequence !== index + 1 || event.previous_event_digest !== prior || digest(core) !== claimed) throw new Error('PROVIDER_OPS_INCIDENT_CHAIN_INVALID');
    prior = claimed;
  }
  const { ledger_digest: claimedLedger, ...ledgerCore } = incident;
  if (digest(ledgerCore) !== claimedLedger) throw new Error('PROVIDER_OPS_INCIDENT_LEDGER_INVALID');
  return true;
}

const operationalDimensions = Object.freeze({
  PROVIDER_HEALTH: record => record.health.state,
  SCHEMA_DRIFT: record => record.qualification.schema.state,
  RIGHTS_DRIFT: record => record.rights.state,
  EVIDENCE_DRIFT: record => record.evidence.state,
  QUALIFICATION_DRIFT: record => record.qualification.state,
  CURRENT_SOLD_DRIFT: record => record.current_sold.state
});

export function detectOperationalDrift(current, previous, contract, { observedAt = new Date().toISOString(), priorAlertKeys = [] } = {}) {
  if (!previous) return Object.freeze({ alerts: [], suppressed: 0, reason: 'BASELINE_ESTABLISHED_NO_ALERT' });
  const previousById = new Map(previous.providers.map(item => [item.provider_id, item]));
  const prior = new Set(priorAlertKeys);
  const alerts = [];
  let suppressed = 0;
  for (const record of current.providers) {
    const before = previousById.get(record.provider_id);
    if (!before || !['READY', 'ACTIVE', 'SUSPENDED'].includes(record.lifecycle_state)) continue;
    for (const dimension of contract.automation.dimensions) {
      const read = operationalDimensions[dimension];
      if (!read) throw new Error(`PROVIDER_OPS_AUTOMATION_DIMENSION_UNKNOWN:${dimension}`);
      const beforeState = read(before); const afterState = read(record);
      if (beforeState === afterState) continue;
      const alertKey = `${record.provider_id}:${dimension}:${afterState}`;
      if (prior.has(alertKey)) { suppressed += 1; continue; }
      const core = { alert_key: alertKey, provider_id: record.provider_id, dimension, from: beforeState, to: afterState, observed_at: observedAt, operationally_meaningful: true };
      alerts.push(deepFreeze({ ...core, alert_digest: digest(core) }));
    }
  }
  return deepFreeze({ alerts, suppressed, reason: alerts.length ? 'MEANINGFUL_STATE_CHANGE' : 'NO_MEANINGFUL_STATE_CHANGE' });
}

export function buildOperationsConsole(registry, contract, { observedAt = new Date().toISOString() } = {}) {
  const rows = registry.providers.map(record => ({
    provider_id: record.provider_id, owner: record.owner, lifecycle: record.lifecycle_state,
    provider_health: record.health.state, rights: record.rights.state,
    qualification: record.qualification.state, evidence: record.evidence.state,
    current_sold: record.current_sold.state, schema: record.qualification.schema.state,
    errors: record.activation_status.failed_controls,
    freshness: record.evidence.freshness, runtime: 'NO_PROVIDER_RUNTIME', portal: 'FROZEN_FAIL_CLOSED'
  }));
  const core = {
    id: 'kidults-provider-operations-console-v1', source_sha: registry.source_sha, observed_at: observedAt,
    audience: contract.console.audience, provider_count: rows.length, rows,
    runtime: 'CONTROL_PLANE_OPERATIONAL_NO_PROVIDER_RUNTIME', integration: 'FAIL_CLOSED',
    provider_calls: 0, credentials: 0, production: 'HOLD', public: 'HOLD', g5: 'HOLD'
  };
  return deepFreeze({ ...core, console_digest: digest(core) });
}
