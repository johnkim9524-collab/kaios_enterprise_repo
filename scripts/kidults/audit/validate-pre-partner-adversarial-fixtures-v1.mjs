import fs from 'node:fs';
import { parseRfc3339Millis } from './rfc3339-v1.mjs';

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const contract = readJson('coordination/kidults/audit/unified-audit-control-plane-v1.json');
const pack = readJson('coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json');
const lifecycleExtension = readJson('coordination/kidults/audit/destructive-lifecycle-control-extension-v1.json');
const lifecycleEnvelope = readJson('coordination/kidults/audit/destructive-lifecycle-control-events-v1.json');

const ALLOWED_CURRENCIES = new Set(['USD','EUR','GBP','JPY','KRW','CHF','HKD','SGD','AUD','CAD']);
const ALLOWED_UNITS = new Set(['ITEM','LOT']);
const ALLOWED_DESTRUCTIVE_ACTIONS = new Set(lifecycleExtension.allowed_actions || []);
const registryByObject = new Map((lifecycleEnvelope.object_registry || []).map(item => [item.object_id, item]));
const eventsByObject = new Map();
for (const event of lifecycleEnvelope.authorized_events || []) {
  if (!eventsByObject.has(event.object_id)) eventsByObject.set(event.object_id, []);
  eventsByObject.get(event.object_id).push(event);
}

function rightsTemporalStatus(rights, asOf) {
  try {
    const asOfMs = parseRfc3339Millis(asOf, 'record.as_of');
    if (rights?.expires_at === null || rights?.expires_at === undefined) return { valid: true, expired: false };
    const expiresMs = parseRfc3339Millis(rights.expires_at, 'rights.expires_at');
    return { valid: true, expired: expiresMs <= asOfMs };
  } catch (error) {
    return { valid: false, expired: false, reason: error.message };
  }
}

function destructiveAuthorizationFailures(record, options = {}) {
  const objectId = record?.identity?.source_record_id;
  const registry = Object.prototype.hasOwnProperty.call(options, 'registryOverride')
    ? options.registryOverride
    : registryByObject.get(objectId);
  const defaultEvents = eventsByObject.get(objectId) || [];
  const event = Object.prototype.hasOwnProperty.call(options, 'eventOverride')
    ? options.eventOverride
    : (defaultEvents.length === 1 ? defaultEvents[0] : null);
  const seenEventIds = options.seenEventIds || new Set();
  const failures = [];

  if (!registry) return ['object_registry_binding_missing'];
  if (!event) return ['authorization_missing'];
  if (defaultEvents.length > 1 && !Object.prototype.hasOwnProperty.call(options, 'eventOverride')) failures.push('ambiguous_authorization_event');
  if (event.authenticated !== true) failures.push('actor_not_authenticated');
  if (!event.actor_id || typeof event.actor_id !== 'string') failures.push('actor_identity_missing');
  if (event.authorization_decision !== 'PASS') failures.push('authorization_not_pass');
  if (!ALLOWED_DESTRUCTIVE_ACTIONS.has(event.action)) failures.push('unsupported_destructive_action');
  if (event.object_type !== registry.object_type) failures.push('object_type_mismatch');
  if (event.object_id !== objectId || event.object_id !== registry.object_id) failures.push('object_mismatch');
  if (event.source_id !== registry.source_id) failures.push('source_id_mismatch');
  if (event.source_owner_id !== registry.source_owner_id) failures.push('source_owner_mismatch');
  if (event.actor_source_owner_id !== registry.source_owner_id) failures.push('actor_source_owner_mismatch');
  if (event.source_namespace !== registry.source_namespace) failures.push('source_namespace_mismatch');
  if (event.append_only_audit_bound !== true || !event.audit_event_id) failures.push('append_only_audit_binding_missing');
  if (!event.destructive_event_id) failures.push('destructive_event_id_missing');
  if (event.replayed === true || seenEventIds.has(event.destructive_event_id)) failures.push('destructive_event_replay');
  return failures;
}

function evaluateRecord(record, options = {}) {
  const triggers = [];
  const lifecycle = record.lifecycle || {};
  const transport = record.transport || {};
  const replay = record.replay || {};
  const provider = record.provider || {};
  const rights = record.rights || {};
  const schema = record.schema || {};
  const semantics = record.semantics || {};
  const identity = record.identity || {};
  const lineage = record.lineage || {};
  const quality = record.quality || {};

  // Withdrawal/deletion remains possible after rights cease, but destructive control events
  // must themselves be authenticated, source-owner/object-bound and append-only audited.
  if (lifecycle.deletion_requested === true) {
    triggers.push('deletion_requested');
    if (!['PROMOTED','SUPERSEDED','WITHDRAWN'].includes(lifecycle.current_state)) {
      return { disposition: 'QUARANTINED_OR_REJECTED', triggers: [...triggers, 'invalid_deletion_state'] };
    }
    const failures = destructiveAuthorizationFailures(record, options);
    if (failures.length) {
      return { disposition: 'QUARANTINED_OR_REJECTED', triggers: [...triggers, ...failures.map(f => `destructive_control_${f}`)] };
    }
    return { disposition: 'WITHDRAWN_OR_DELETED', triggers: [...triggers, 'destructive_control_authorized'] };
  }

  if (transport.http_status === 429 || transport.http_status >= 500 || transport.retries_exhausted === true) {
    triggers.push(`transport_${transport.http_status || 'retries_exhausted'}`);
    return { disposition: 'NO_PROMOTION_RETRY_OR_DLQ', triggers };
  }

  const temporal = rightsTemporalStatus(rights, record.as_of);
  if (!temporal.valid) return { disposition: 'REJECTED', triggers: ['rights_temporal_invalid'] };
  if (rights.present !== true || rights.status !== 'PASS' || temporal.expired) {
    if (rights.present !== true) triggers.push('rights_missing');
    if (rights.status !== 'PASS') triggers.push('rights_not_pass');
    if (temporal.expired) triggers.push('rights_expired');
    return { disposition: 'REJECTED', triggers };
  }

  if (provider.substitution === true) {
    triggers.push('provider_substitution');
    const revalidated = provider.adapter_validated === true && provider.rights_revalidated === true && provider.identity_revalidated === true && provider.lineage_revalidated === true;
    if (!revalidated) return { disposition: 'REVALIDATE_RIGHTS_SCHEMA_IDENTITY_LINEAGE', triggers };
  }

  if (schema.received_version !== schema.expected_version || schema.required_fields_present !== true) triggers.push('schema_integrity');
  if (!ALLOWED_CURRENCIES.has(semantics.currency) || !ALLOWED_UNITS.has(semantics.unit) || semantics.timezone_valid !== true) triggers.push('semantic_integrity');
  if (identity.duplicate_of || identity.relisted_from || identity.contradiction === true) triggers.push('identity_resolution');
  if (lineage.complete !== true) triggers.push('lineage_incomplete');
  if (quality.outlier === true || quality.impossible_value === true) triggers.push('quality_anomaly');
  if (quality.batch_complete !== true || quality.batch_expected_count !== quality.batch_received_count) triggers.push('batch_incomplete');
  if (triggers.length) return { disposition: 'QUARANTINED_OR_REJECTED', triggers };

  if (replay.is_replay === true) {
    triggers.push('replay');
    if (replay.same_digest === true && replay.idempotency_key_match === true) return { disposition: 'IDEMPOTENT_REPLAY_WITH_AUDIT_TRACE', triggers };
    return { disposition: 'QUARANTINED_OR_REJECTED', triggers: [...triggers, 'replay_identity_mismatch'] };
  }
  return { disposition: 'CONTROL_ONLY_EVIDENCE_ELIGIBLE', triggers: ['all_control_checks_pass'] };
}

if (pack.governing_issue !== 881) throw new Error('fixture pack must be governed by #881');
if (pack.fixture_type !== 'SYNTHETIC_NON_PROMOTABLE_CONTROL') throw new Error('fixture pack must be synthetic/non-promotable');
if (pack.empirical_gate_effect !== 'NONE') throw new Error('fixture pack may not affect empirical gates');
if (lifecycleExtension.governing_issue !== 961 || lifecycleExtension.extends_governing_issue !== 881) throw new Error('destructive lifecycle extension governance drift');
if (lifecycleEnvelope.governing_issue !== 961 || lifecycleEnvelope.extends_governing_issue !== 881) throw new Error('destructive lifecycle envelope governance drift');

const baseline = pack.baseline_control;
if (!baseline?.synthetic || baseline.promotable !== false) throw new Error('baseline control must be synthetic and non-promotable');
const baselineEval = evaluateRecord(baseline.record);
if (baselineEval.disposition !== baseline.expected_disposition || baselineEval.disposition !== 'CONTROL_ONLY_EVIDENCE_ELIGIBLE') throw new Error(`baseline control failed: ${baselineEval.disposition}`);

const temporalMutationCases = [
  { id: 'malformed_expiry', mutate: r => { r.rights.expires_at = 'not-a-date'; } },
  { id: 'timezone_less_expiry', mutate: r => { r.rights.expires_at = '2099-01-01T00:00:00'; } },
  { id: 'invalid_calendar_expiry', mutate: r => { r.rights.expires_at = '2099-02-30T00:00:00Z'; } },
  { id: 'malformed_as_of', mutate: r => { r.as_of = 'invalid'; } }
];
for (const test of temporalMutationCases) {
  const mutated = structuredClone(baseline.record);
  test.mutate(mutated);
  const actual = evaluateRecord(mutated);
  if (actual.disposition !== 'REJECTED' || !actual.triggers.includes('rights_temporal_invalid')) throw new Error(`temporal mutation ${test.id} failed closed check: ${actual.disposition}/${actual.triggers.join(',')}`);
}

const replayFailClosedMutationCases = [
  { id: 'replay_expired_rights', mutate: r => { r.rights.expires_at = '2026-08-20T00:00:00Z'; }, expected: 'REJECTED' },
  { id: 'replay_missing_rights', mutate: r => { r.rights.present = false; r.rights.status = 'UNKNOWN'; }, expected: 'REJECTED' },
  { id: 'replay_malformed_expiry', mutate: r => { r.rights.expires_at = 'not-a-date'; }, expected: 'REJECTED' },
  { id: 'replay_invalid_as_of', mutate: r => { r.as_of = 'invalid'; }, expected: 'REJECTED' },
  { id: 'replay_schema_drift', mutate: r => { r.schema.received_version = 'partner-sale-v2-unknown'; }, expected: 'QUARANTINED_OR_REJECTED' },
  { id: 'replay_unvalidated_provider_substitution', mutate: r => { r.provider.substitution = true; r.provider.adapter_validated = false; r.provider.rights_revalidated = false; r.provider.identity_revalidated = false; r.provider.lineage_revalidated = false; }, expected: 'REVALIDATE_RIGHTS_SCHEMA_IDENTITY_LINEAGE' }
];
for (const test of replayFailClosedMutationCases) {
  const mutated = structuredClone(baseline.record);
  mutated.replay = { is_replay: true, same_digest: true, idempotency_key_match: true };
  test.mutate(mutated);
  const actual = evaluateRecord(mutated);
  if (actual.disposition !== test.expected || actual.disposition === 'IDEMPOTENT_REPLAY_WITH_AUDIT_TRACE') throw new Error(`replay mutation ${test.id} failed closed check: expected=${test.expected} actual=${actual.disposition}/${actual.triggers.join(',')}`);
}

const deletionFixture = (pack.fixtures || []).find(f => f.id === 'deletion_request');
if (!deletionFixture) throw new Error('deletion_request fixture missing');
const deletionObjectId = deletionFixture.record.identity.source_record_id;
const deletionRegistry = registryByObject.get(deletionObjectId);
const deletionEvents = eventsByObject.get(deletionObjectId) || [];
if (!deletionRegistry || deletionEvents.length !== 1) throw new Error('deletion fixture requires exactly one registry binding and one authorization event');
const deletionEvent = deletionEvents[0];
const destructiveMutationCases = [
  { id: 'missing_authorization', event: null, expected: 'destructive_control_authorization_missing' },
  { id: 'unauthenticated_actor', mutate: e => { e.authenticated = false; }, expected: 'destructive_control_actor_not_authenticated' },
  { id: 'spoofed_actor_owner', mutate: e => { e.actor_source_owner_id = 'spoofed-owner'; }, expected: 'destructive_control_actor_source_owner_mismatch' },
  { id: 'source_owner_mismatch', mutate: e => { e.source_owner_id = 'other-owner'; }, expected: 'destructive_control_source_owner_mismatch' },
  { id: 'namespace_mismatch', mutate: e => { e.source_namespace = 'other/namespace'; }, expected: 'destructive_control_source_namespace_mismatch' },
  { id: 'object_mismatch', mutate: e => { e.object_id = 'other-object'; }, expected: 'destructive_control_object_mismatch' },
  { id: 'unsupported_action', mutate: e => { e.action = 'PURGE_EVERYTHING'; }, expected: 'destructive_control_unsupported_destructive_action' },
  { id: 'authorization_not_pass', mutate: e => { e.authorization_decision = 'UNKNOWN'; }, expected: 'destructive_control_authorization_not_pass' },
  { id: 'audit_binding_missing', mutate: e => { e.append_only_audit_bound = false; }, expected: 'destructive_control_append_only_audit_binding_missing' },
  { id: 'explicit_replay', mutate: e => { e.replayed = true; }, expected: 'destructive_control_destructive_event_replay' },
  { id: 'seen_event_replay', mutate: () => {}, seen: new Set([deletionEvent.destructive_event_id]), expected: 'destructive_control_destructive_event_replay' }
];
for (const test of destructiveMutationCases) {
  const event = test.event === null ? null : structuredClone(deletionEvent);
  if (event && test.mutate) test.mutate(event);
  const actual = evaluateRecord(structuredClone(deletionFixture.record), { eventOverride: event, registryOverride: deletionRegistry, seenEventIds: test.seen || new Set() });
  if (actual.disposition !== 'QUARANTINED_OR_REJECTED' || !actual.triggers.includes(test.expected)) throw new Error(`destructive mutation ${test.id} failed closed check: ${actual.disposition}/${actual.triggers.join(',')}`);
}

const contractFixtures = new Map((contract.adversarial_fixtures || []).map(f => [f.id, f.expected_disposition]));
const packFixtures = pack.fixtures || [];
if (packFixtures.length !== 12) throw new Error(`expected 12 executable #881 adversarial fixtures, got ${packFixtures.length}`);
if (contractFixtures.size !== 12) throw new Error(`contract must declare exactly 12 #881 adversarial fixtures, got ${contractFixtures.size}`);

const results = [];
for (const fixture of packFixtures) {
  if (fixture.synthetic !== true || fixture.promotable !== false) throw new Error(`fixture ${fixture.id} must be synthetic and non-promotable`);
  const contractExpected = contractFixtures.get(fixture.id);
  if (!contractExpected) throw new Error(`fixture ${fixture.id} missing from control-plane contract`);
  if (contractExpected !== fixture.expected_disposition) throw new Error(`fixture ${fixture.id} contract/pack disposition drift`);
  const actual = evaluateRecord(fixture.record);
  if (actual.disposition !== fixture.expected_disposition) throw new Error(`fixture ${fixture.id} expected=${fixture.expected_disposition} actual=${actual.disposition} triggers=${actual.triggers.join(',')}`);
  if (!actual.triggers.length || actual.triggers[0] === 'all_control_checks_pass') throw new Error(`fixture ${fixture.id} did not exercise an adversarial control`);
  const renamed = evaluateRecord(structuredClone(fixture.record));
  if (renamed.disposition !== actual.disposition) throw new Error(`fixture ${fixture.id} result is not payload-deterministic`);
  results.push({ id: fixture.id, disposition: actual.disposition, triggers: actual.triggers, promotable: false });
}

for (const id of contractFixtures.keys()) if (!packFixtures.some(f => f.id === id)) throw new Error(`contract fixture has no executable payload: ${id}`);
if (results.some(r => r.promotable)) throw new Error('synthetic adversarial fixture may not be promotable');
if (results.some(r => r.disposition === 'PROMOTED')) throw new Error('adversarial fixture may never directly promote');
if (contract.truth_boundary?.synthetic_fixture_effect !== 'CONTROL_VALIDATION_ONLY') throw new Error('synthetic fixture truth boundary drift');
if (contract.truth_boundary?.empirical_gate_effect !== 'NONE') throw new Error('fixture harness cannot promote empirical readiness');
if (contract.truth_boundary?.external_partner_data_ingestion !== 'HOLD') throw new Error('partner data ingestion must remain HOLD');

console.log(JSON.stringify({
  suite: 'PRE_PARTNER_ADVERSARIAL_FIXTURES_V2',
  control_layer_result: 'PASS',
  executable_payload_fixtures_passed: results.length,
  temporal_fail_closed_mutation_cases: temporalMutationCases.length,
  replay_cross_control_fail_closed_mutation_cases: replayFailClosedMutationCases.length,
  destructive_control_authorization_fail_closed_mutation_cases: destructiveMutationCases.length,
  destructive_control_requires_authenticated_source_owner_bound_append_only_event: true,
  destructive_control_replay_rejected: true,
  replay_requires_current_rights_and_control_revalidation: true,
  baseline_control: baselineEval.disposition,
  behavior_driven_evaluation: true,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
