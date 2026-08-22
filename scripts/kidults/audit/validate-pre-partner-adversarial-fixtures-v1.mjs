import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseRfc3339Millis } from './rfc3339-v1.mjs';

const contract = JSON.parse(fs.readFileSync('coordination/kidults/audit/unified-audit-control-plane-v1.json', 'utf8'));
const pack = JSON.parse(fs.readFileSync('coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json', 'utf8'));

const ALLOWED_CURRENCIES = new Set(['USD','EUR','GBP','JPY','KRW','CHF','HKD','SGD','AUD','CAD']);
const ALLOWED_UNITS = new Set(['ITEM','LOT']);
const ALLOWED_DESTRUCTIVE_ACTIONS = new Set(['WITHDRAW','DELETE']);
const SUPPRESSION_STATE = 'SUPPRESSED_NO_REINGESTION';
const TRUSTED_DESTRUCTIVE_EVENT_SOURCE = 'CONTROL_PLANE';
const TRUSTED_SUPPRESSION_CHECKPOINT_SOURCE = 'CONTROL_PLANE';
const SUPPRESSION_SNAPSHOT_STATE = 'LOADED';
const SUPPRESSION_FENCE_STATE = 'CURRENT_AT_ADMISSION_COMMIT';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function suppressionKey(sourceOwnerId, sourceNamespace, canonicalSourceObjectId) {
  if (typeof sourceOwnerId !== 'string' || !sourceOwnerId) return null;
  if (typeof sourceNamespace !== 'string' || !sourceNamespace) return null;
  if (typeof canonicalSourceObjectId !== 'string' || !canonicalSourceObjectId) return null;
  return `${sourceOwnerId}::${sourceNamespace}::${canonicalSourceObjectId}`;
}

function digestSuppressionEvent(event) {
  const body = structuredClone(event);
  delete body.event_digest;
  return sha256(body);
}

function digestSuppressionTombstone(tombstone) {
  const body = structuredClone(tombstone);
  delete body.tombstone_digest;
  return sha256(body);
}

function digestSuppressionSnapshot(snapshot) {
  const body = structuredClone(snapshot);
  delete body.snapshot_digest;
  return sha256(body);
}

function digestTrustedDestructiveEvent(event) {
  const body = structuredClone(event);
  delete body.event_digest;
  return sha256(body);
}

function digestTrustedSuppressionCheckpoint(checkpoint) {
  const body = structuredClone(checkpoint);
  delete body.checkpoint_digest;
  return sha256(body);
}

function digestAdmissionSuppressionFence(fence) {
  const body = structuredClone(fence);
  delete body.fence_digest;
  return sha256(body);
}

function buildSuppressionSnapshot(events, tombstones, epoch = 1) {
  const snapshot = {
    state: SUPPRESSION_SNAPSHOT_STATE,
    epoch,
    event_count: events.length,
    tombstone_count: tombstones.length,
    last_event_digest: events.length ? events[events.length - 1].event_digest : 'GENESIS'
  };
  snapshot.snapshot_digest = digestSuppressionSnapshot(snapshot);
  return snapshot;
}

function buildTrustedSuppressionCheckpoint(snapshot) {
  const checkpoint = {
    trusted_source: TRUSTED_SUPPRESSION_CHECKPOINT_SOURCE,
    epoch: snapshot.epoch,
    event_count: snapshot.event_count,
    tombstone_count: snapshot.tombstone_count,
    last_event_digest: snapshot.last_event_digest,
    snapshot_digest: snapshot.snapshot_digest
  };
  checkpoint.checkpoint_digest = digestTrustedSuppressionCheckpoint(checkpoint);
  return checkpoint;
}

function buildAdmissionSuppressionFence(checkpoint) {
  const fence = {
    trusted_source: TRUSTED_SUPPRESSION_CHECKPOINT_SOURCE,
    state: SUPPRESSION_FENCE_STATE,
    checkpoint_digest: checkpoint.checkpoint_digest,
    epoch: checkpoint.epoch,
    snapshot_digest: checkpoint.snapshot_digest
  };
  fence.fence_digest = digestAdmissionSuppressionFence(fence);
  return fence;
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

function normalizeTrustedContext(raw = {}) {
  return {
    persisted_object_id: raw.persisted_object_id,
    persisted_source_owner_id: raw.persisted_source_owner_id,
    persisted_source_namespace: raw.persisted_source_namespace,
    seen_destructive_event_ids: raw.seen_destructive_event_ids instanceof Set
      ? raw.seen_destructive_event_ids
      : new Set(Array.isArray(raw.seen_destructive_event_ids) ? raw.seen_destructive_event_ids : []),
    trusted_destructive_control_event: raw.trusted_destructive_control_event
      ? structuredClone(raw.trusted_destructive_control_event)
      : null,
    canonical_suppression_snapshot: raw.canonical_suppression_snapshot
      ? structuredClone(raw.canonical_suppression_snapshot)
      : null,
    trusted_canonical_suppression_checkpoint: raw.trusted_canonical_suppression_checkpoint
      ? structuredClone(raw.trusted_canonical_suppression_checkpoint)
      : null,
    trusted_admission_suppression_fence: raw.trusted_admission_suppression_fence
      ? structuredClone(raw.trusted_admission_suppression_fence)
      : null,
    canonical_suppression_events: Array.isArray(raw.canonical_suppression_events)
      ? structuredClone(raw.canonical_suppression_events)
      : [],
    canonical_suppression_tombstones: Array.isArray(raw.canonical_suppression_tombstones)
      ? structuredClone(raw.canonical_suppression_tombstones)
      : [],
    trusted_canonical_resolution: raw.trusted_canonical_resolution
      ? structuredClone(raw.trusted_canonical_resolution)
      : null
  };
}

function validateCanonicalSuppressionLedger(context) {
  const snapshot = context.canonical_suppression_snapshot;
  const checkpoint = context.trusted_canonical_suppression_checkpoint;
  const fence = context.trusted_admission_suppression_fence;
  const events = context.canonical_suppression_events;
  const tombstones = context.canonical_suppression_tombstones;
  const failures = [];

  // Absence of negative-state evidence is not evidence of absence. Every admission/replay path
  // must prove that the canonical suppression store was authoritatively hydrated, even when empty.
  if (!snapshot || typeof snapshot !== 'object') {
    failures.push('canonical_suppression_snapshot_missing');
  } else {
    if (snapshot.state !== SUPPRESSION_SNAPSHOT_STATE) failures.push('canonical_suppression_snapshot_not_loaded');
    if (!Number.isInteger(snapshot.epoch) || snapshot.epoch < 1) failures.push('canonical_suppression_snapshot_epoch_invalid');
    if (snapshot.event_count !== events.length) failures.push('canonical_suppression_snapshot_event_count_drift');
    if (snapshot.tombstone_count !== tombstones.length) failures.push('canonical_suppression_snapshot_tombstone_count_drift');
    const expectedLastDigest = events.length ? events[events.length - 1]?.event_digest : 'GENESIS';
    if (snapshot.last_event_digest !== expectedLastDigest) failures.push('canonical_suppression_snapshot_last_digest_drift');
    if (snapshot.snapshot_digest !== digestSuppressionSnapshot(snapshot)) failures.push('canonical_suppression_snapshot_digest_mismatch');
  }

  // P0 #1003: a self-consistent hydrated snapshot is not proof that it is the current authoritative
  // head. Bind every decision to an independently trusted control-plane checkpoint and a commit fence.
  if (!checkpoint || typeof checkpoint !== 'object') {
    failures.push('canonical_suppression_checkpoint_missing');
  } else {
    if (checkpoint.trusted_source !== TRUSTED_SUPPRESSION_CHECKPOINT_SOURCE) failures.push('canonical_suppression_checkpoint_untrusted_source');
    if (!Number.isInteger(checkpoint.epoch) || checkpoint.epoch < 1) failures.push('canonical_suppression_checkpoint_epoch_invalid');
    if (checkpoint.checkpoint_digest !== digestTrustedSuppressionCheckpoint(checkpoint)) failures.push('canonical_suppression_checkpoint_digest_mismatch');
    if (snapshot && typeof snapshot === 'object') {
      if (checkpoint.epoch !== snapshot.epoch) failures.push('canonical_suppression_checkpoint_epoch_mismatch');
      if (checkpoint.event_count !== snapshot.event_count) failures.push('canonical_suppression_checkpoint_event_count_mismatch');
      if (checkpoint.tombstone_count !== snapshot.tombstone_count) failures.push('canonical_suppression_checkpoint_tombstone_count_mismatch');
      if (checkpoint.last_event_digest !== snapshot.last_event_digest) failures.push('canonical_suppression_checkpoint_last_digest_mismatch');
      if (checkpoint.snapshot_digest !== snapshot.snapshot_digest) failures.push('canonical_suppression_checkpoint_snapshot_digest_mismatch');
    }
  }

  if (!fence || typeof fence !== 'object') {
    failures.push('canonical_suppression_admission_fence_missing');
  } else {
    if (fence.trusted_source !== TRUSTED_SUPPRESSION_CHECKPOINT_SOURCE) failures.push('canonical_suppression_admission_fence_untrusted_source');
    if (fence.state !== SUPPRESSION_FENCE_STATE) failures.push('canonical_suppression_admission_fence_state_invalid');
    if (fence.fence_digest !== digestAdmissionSuppressionFence(fence)) failures.push('canonical_suppression_admission_fence_digest_mismatch');
    if (checkpoint && typeof checkpoint === 'object') {
      if (fence.checkpoint_digest !== checkpoint.checkpoint_digest) failures.push('canonical_suppression_admission_fence_checkpoint_mismatch');
      if (fence.epoch !== checkpoint.epoch) failures.push('canonical_suppression_admission_fence_epoch_mismatch');
      if (fence.snapshot_digest !== checkpoint.snapshot_digest) failures.push('canonical_suppression_admission_fence_snapshot_mismatch');
    }
  }

  if (!events.length && !tombstones.length) return [...new Set(failures)];
  if (!events.length || !tombstones.length) failures.push('canonical_suppression_event_tombstone_cardinality_drift');

  const eventsById = new Map();
  let previous = 'GENESIS';
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || typeof event !== 'object') {
      failures.push('canonical_suppression_event_invalid');
      continue;
    }
    if (event.sequence_number !== index + 1) failures.push('canonical_suppression_event_sequence_drift');
    if (event.previous_event_digest !== previous) failures.push('canonical_suppression_previous_digest_drift');
    if (event.event_digest !== digestSuppressionEvent(event)) failures.push('canonical_suppression_event_digest_mismatch');
    if (!ALLOWED_DESTRUCTIVE_ACTIONS.has(event.action)) failures.push('canonical_suppression_event_action_invalid');
    if (event.authorized !== true || event.append_only_audit_bound !== true) failures.push('canonical_suppression_event_not_authorized_audit_bound');
    const expectedKey = suppressionKey(event.source_owner_id, event.source_namespace, event.canonical_source_object_id);
    if (!expectedKey || event.suppression_key !== expectedKey) failures.push('canonical_suppression_event_key_drift');
    if (event.suppression_state !== SUPPRESSION_STATE) failures.push('canonical_suppression_event_state_invalid');
    if (!event.destructive_event_id || !event.audit_event_id) failures.push('canonical_suppression_event_identity_missing');
    if (event.destructive_event_id && eventsById.has(event.destructive_event_id)) failures.push('canonical_suppression_duplicate_destructive_event');
    if (event.destructive_event_id) eventsById.set(event.destructive_event_id, event);
    previous = event.event_digest;
  }

  const keys = new Set();
  for (const tombstone of tombstones) {
    if (!tombstone || typeof tombstone !== 'object') {
      failures.push('canonical_suppression_tombstone_invalid');
      continue;
    }
    const event = eventsById.get(tombstone.destructive_event_id);
    if (!event) {
      failures.push('canonical_suppression_orphan_tombstone');
      continue;
    }
    if (tombstone.audit_event_id !== event.audit_event_id) failures.push('canonical_suppression_tombstone_audit_rebinding');
    if (tombstone.event_sequence !== event.sequence_number) failures.push('canonical_suppression_tombstone_sequence_rebinding');
    if (tombstone.source_owner_id !== event.source_owner_id) failures.push('canonical_suppression_tombstone_owner_rebinding');
    if (tombstone.source_namespace !== event.source_namespace) failures.push('canonical_suppression_tombstone_namespace_rebinding');
    if (tombstone.canonical_source_object_id !== event.canonical_source_object_id) failures.push('canonical_suppression_tombstone_object_rebinding');
    if (tombstone.suppression_key !== event.suppression_key) failures.push('canonical_suppression_tombstone_key_rebinding');
    if (tombstone.suppression_state !== SUPPRESSION_STATE) failures.push('canonical_suppression_state_invalid');
    if (tombstone.lineage_metadata_only !== true || tombstone.raw_content_retained !== false) failures.push('canonical_suppression_tombstone_content_boundary_invalid');
    if (tombstone.tombstone_digest !== digestSuppressionTombstone(tombstone)) failures.push('canonical_suppression_tombstone_digest_mismatch');
    if (!tombstone.suppression_key || keys.has(tombstone.suppression_key)) failures.push('canonical_suppression_duplicate_or_missing_key');
    if (tombstone.suppression_key) keys.add(tombstone.suppression_key);
  }

  if (events.length !== tombstones.length || keys.size !== eventsById.size) failures.push('canonical_suppression_event_tombstone_cardinality_drift');
  return [...new Set(failures)];
}

function canonicalSuppressionDisposition(record, rawContext) {
  const context = normalizeTrustedContext(rawContext);
  const failures = validateCanonicalSuppressionLedger(context);
  const resolution = context.trusted_canonical_resolution || {};
  const identity = record.identity || {};

  // Canonical identity is a universal admission prerequisite. A clean/empty suppression ledger
  // is useful only if the candidate itself is unambiguously resolved into the same trust domain.
  if (resolution.status !== 'RESOLVED_UNAMBIGUOUS') failures.push('canonical_suppression_resolution_not_trusted_unambiguous');
  if (!resolution.source_record_id || resolution.source_record_id !== identity.source_record_id) failures.push('canonical_suppression_record_binding_mismatch');
  if (!resolution.source_owner_id || typeof resolution.source_owner_id !== 'string') failures.push('canonical_suppression_owner_missing');
  if (!resolution.source_namespace || typeof resolution.source_namespace !== 'string') failures.push('canonical_suppression_namespace_missing');
  if (!resolution.canonical_source_object_id || typeof resolution.canonical_source_object_id !== 'string') failures.push('canonical_suppression_object_missing');

  if (failures.length) return { disposition: 'QUARANTINED_OR_REJECTED', triggers: [...new Set(failures)] };

  const key = suppressionKey(resolution.source_owner_id, resolution.source_namespace, resolution.canonical_source_object_id);
  const suppressed = context.canonical_suppression_tombstones.some(tombstone => tombstone.suppression_key === key);
  if (suppressed) {
    return {
      disposition: 'REJECTED_CANONICAL_OBJECT_SUPPRESSED',
      triggers: ['canonical_source_object_suppressed_after_destructive_event']
    };
  }
  return null;
}

function authorizeDestructiveLifecycle(record, rawContext) {
  const lifecycle = record.lifecycle || {};
  const identity = record.identity || {};
  const payloadEvent = lifecycle.control_event || null;
  const context = normalizeTrustedContext(rawContext);
  const event = context.trusted_destructive_control_event || {};
  const failures = [];

  if (!context.persisted_object_id || !context.persisted_source_owner_id || !context.persisted_source_namespace) failures.push('missing_trusted_persisted_context');
  if (!context.trusted_destructive_control_event) failures.push('missing_trusted_destructive_control_event');
  if (!payloadEvent || typeof payloadEvent !== 'object') failures.push('destructive_payload_control_event_missing');
  if (event.trusted_source !== TRUSTED_DESTRUCTIVE_EVENT_SOURCE) failures.push('destructive_event_untrusted_source');
  if (!Number.isInteger(event.sequence_number) || event.sequence_number < 1) failures.push('destructive_event_sequence_invalid');
  if (typeof event.previous_event_digest !== 'string' || !event.previous_event_digest) failures.push('destructive_event_previous_digest_missing');
  if (!event.audit_event_id || typeof event.audit_event_id !== 'string') failures.push('destructive_audit_event_id_missing');
  if (event.event_digest !== digestTrustedDestructiveEvent(event)) failures.push('destructive_event_digest_mismatch');
  if (!event.event_id || typeof event.event_id !== 'string') failures.push('missing_destructive_event_id');
  if (event.authenticated !== true) failures.push('destructive_actor_not_authenticated');
  if (event.authorized !== true) failures.push('destructive_actor_not_authorized');
  if (event.actor_type !== 'SOURCE_OWNER') failures.push('destructive_actor_type_invalid');
  if (event.actor_id !== context.persisted_source_owner_id) failures.push('destructive_actor_owner_mismatch');
  if (event.source_owner_id !== context.persisted_source_owner_id) failures.push('destructive_source_owner_mismatch');
  if (event.source_namespace !== context.persisted_source_namespace) failures.push('destructive_namespace_mismatch');
  if (event.object_id !== context.persisted_object_id) failures.push('destructive_object_mismatch');
  if (identity.source_record_id !== context.persisted_object_id) failures.push('record_object_persisted_binding_mismatch');
  if (!ALLOWED_DESTRUCTIVE_ACTIONS.has(event.action)) failures.push('destructive_action_not_allowed');
  if (event.append_only_audit_bound !== true) failures.push('destructive_event_not_append_only_audit_bound');
  if (event.event_id && context.seen_destructive_event_ids.has(event.event_id)) failures.push('destructive_event_replay');

  if (payloadEvent && typeof payloadEvent === 'object') {
    const claimFields = ['event_id','authenticated','authorized','actor_type','actor_id','action','source_owner_id','source_namespace','object_id','append_only_audit_bound'];
    if (claimFields.some(field => payloadEvent[field] !== event[field])) failures.push('destructive_payload_control_event_mismatch');
  }

  const stateAllowsAction = event.action === 'WITHDRAW'
    ? lifecycle.current_state === 'PROMOTED'
    : ['PROMOTED','SUPERSEDED','WITHDRAWN'].includes(lifecycle.current_state);
  if (!stateAllowsAction) failures.push('invalid_deletion_state');

  if (failures.length) return { authorized: false, failures: [...new Set(failures)], context };
  context.seen_destructive_event_ids.add(event.event_id);
  return { authorized: true, failures: [], context };
}

function evaluateRecord(record, trustedContext = {}) {
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

  // Mandatory negative-state hydration + canonical resolution runs before every normal, replay,
  // provider-substitution, transport or destructive disposition. Missing suppression state fails closed.
  const suppression = canonicalSuppressionDisposition(record, trustedContext);
  if (suppression) return suppression;

  if (lifecycle.deletion_requested === true) {
    triggers.push('deletion_requested');
    const auth = authorizeDestructiveLifecycle(record, trustedContext);
    if (!auth.authorized) return { disposition: 'QUARANTINED_OR_REJECTED', triggers: [...triggers, ...auth.failures] };
    return { disposition: 'WITHDRAWN_OR_DELETED', triggers: [...triggers, 'destructive_event_authorized'] };
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

function buildCleanAdmissionContext(record, options = {}) {
  const sourceRecordId = record?.identity?.source_record_id;
  const owner = options.source_owner_id || 'fixture-owner';
  const namespace = options.source_namespace || 'fixture-default';
  const canonical = options.canonical_source_object_id || sourceRecordId;
  const events = [];
  const tombstones = [];
  const snapshot = buildSuppressionSnapshot(events, tombstones, options.epoch || 1);
  const checkpoint = buildTrustedSuppressionCheckpoint(snapshot);
  return {
    canonical_suppression_snapshot: snapshot,
    trusted_canonical_suppression_checkpoint: checkpoint,
    trusted_admission_suppression_fence: buildAdmissionSuppressionFence(checkpoint),
    canonical_suppression_events: events,
    canonical_suppression_tombstones: tombstones,
    trusted_canonical_resolution: {
      status: 'RESOLVED_UNAMBIGUOUS',
      source_record_id: sourceRecordId,
      source_owner_id: owner,
      source_namespace: namespace,
      canonical_source_object_id: canonical
    }
  };
}

if (pack.governing_issue !== 881) throw new Error('fixture pack must be governed by #881');
if (pack.fixture_type !== 'SYNTHETIC_NON_PROMOTABLE_CONTROL') throw new Error('fixture pack must be synthetic and non-promotable');
if (pack.empirical_gate_effect !== 'NONE') throw new Error('fixture pack may not affect empirical gates');
if (contract.destructive_lifecycle_control?.authorization_required !== true) throw new Error('destructive lifecycle authorization contract required');
if (contract.destructive_lifecycle_control?.replay_protection !== 'UNIQUE_EVENT_ID_FAIL_CLOSED') throw new Error('destructive lifecycle replay protection contract required');

const baseline = pack.baseline_control;
if (!baseline?.synthetic || baseline.promotable !== false) throw new Error('baseline control must be synthetic and non-promotable');
const baselineContext = buildCleanAdmissionContext(baseline.record, { source_namespace: 'baseline' });
const baselineEval = evaluateRecord(baseline.record, baselineContext);
if (baselineEval.disposition !== baseline.expected_disposition || baselineEval.disposition !== 'CONTROL_ONLY_EVIDENCE_ELIGIBLE') {
  throw new Error(`baseline control failed: ${baselineEval.disposition}`);
}

// P0 #995 regression: omission is not a clean ledger. Both ordinary and replay candidates must
// fail before any eligible/idempotent disposition when suppression hydration or canonical identity is absent.
const missingContext = evaluateRecord(structuredClone(baseline.record), {});
if (missingContext.disposition !== 'QUARANTINED_OR_REJECTED' || !missingContext.triggers.includes('canonical_suppression_snapshot_missing')) {
  throw new Error(`missing suppression context failed open: ${missingContext.disposition}/${missingContext.triggers.join(',')}`);
}
const missingContextReplayRecord = structuredClone(baseline.record);
missingContextReplayRecord.replay = { is_replay: true, same_digest: true, idempotency_key_match: true };
const missingContextReplay = evaluateRecord(missingContextReplayRecord, {});
if (missingContextReplay.disposition !== 'QUARANTINED_OR_REJECTED' || missingContextReplay.disposition === 'IDEMPOTENT_REPLAY_WITH_AUDIT_TRACE') {
  throw new Error(`replay without suppression hydration failed open: ${missingContextReplay.disposition}/${missingContextReplay.triggers.join(',')}`);
}

const cleanContextMutationCases = [
  ['missing_snapshot', c => { delete c.canonical_suppression_snapshot; }],
  ['snapshot_not_loaded', c => { c.canonical_suppression_snapshot.state = 'NOT_LOADED'; c.canonical_suppression_snapshot.snapshot_digest = digestSuppressionSnapshot(c.canonical_suppression_snapshot); }],
  ['snapshot_epoch_invalid', c => { c.canonical_suppression_snapshot.epoch = 0; c.canonical_suppression_snapshot.snapshot_digest = digestSuppressionSnapshot(c.canonical_suppression_snapshot); }],
  ['snapshot_event_count_drift', c => { c.canonical_suppression_snapshot.event_count = 1; c.canonical_suppression_snapshot.snapshot_digest = digestSuppressionSnapshot(c.canonical_suppression_snapshot); }],
  ['snapshot_last_digest_drift', c => { c.canonical_suppression_snapshot.last_event_digest = 'forged'; c.canonical_suppression_snapshot.snapshot_digest = digestSuppressionSnapshot(c.canonical_suppression_snapshot); }],
  ['snapshot_digest_tamper', c => { c.canonical_suppression_snapshot.snapshot_digest = 'forged'; }],
  ['missing_checkpoint', c => { delete c.trusted_canonical_suppression_checkpoint; }],
  ['checkpoint_untrusted_source', c => { c.trusted_canonical_suppression_checkpoint.trusted_source = 'CALLER'; c.trusted_canonical_suppression_checkpoint.checkpoint_digest = digestTrustedSuppressionCheckpoint(c.trusted_canonical_suppression_checkpoint); }],
  ['checkpoint_epoch_rebinding_resigned', c => { c.trusted_canonical_suppression_checkpoint.epoch += 1; c.trusted_canonical_suppression_checkpoint.checkpoint_digest = digestTrustedSuppressionCheckpoint(c.trusted_canonical_suppression_checkpoint); }],
  ['checkpoint_snapshot_rebinding_resigned', c => { c.trusted_canonical_suppression_checkpoint.snapshot_digest = 'other-snapshot'; c.trusted_canonical_suppression_checkpoint.checkpoint_digest = digestTrustedSuppressionCheckpoint(c.trusted_canonical_suppression_checkpoint); }],
  ['checkpoint_digest_tamper', c => { c.trusted_canonical_suppression_checkpoint.checkpoint_digest = 'forged'; }],
  ['missing_admission_fence', c => { delete c.trusted_admission_suppression_fence; }],
  ['admission_fence_untrusted_source', c => { c.trusted_admission_suppression_fence.trusted_source = 'CALLER'; c.trusted_admission_suppression_fence.fence_digest = digestAdmissionSuppressionFence(c.trusted_admission_suppression_fence); }],
  ['admission_fence_state_invalid', c => { c.trusted_admission_suppression_fence.state = 'STALE'; c.trusted_admission_suppression_fence.fence_digest = digestAdmissionSuppressionFence(c.trusted_admission_suppression_fence); }],
  ['admission_fence_checkpoint_rebinding_resigned', c => { c.trusted_admission_suppression_fence.checkpoint_digest = 'other-checkpoint'; c.trusted_admission_suppression_fence.fence_digest = digestAdmissionSuppressionFence(c.trusted_admission_suppression_fence); }],
  ['admission_fence_epoch_rebinding_resigned', c => { c.trusted_admission_suppression_fence.epoch += 1; c.trusted_admission_suppression_fence.fence_digest = digestAdmissionSuppressionFence(c.trusted_admission_suppression_fence); }],
  ['admission_fence_digest_tamper', c => { c.trusted_admission_suppression_fence.fence_digest = 'forged'; }],
  ['missing_resolution_on_empty_ledger', c => { delete c.trusted_canonical_resolution; }],
  ['ambiguous_resolution_on_empty_ledger', c => { c.trusted_canonical_resolution.status = 'AMBIGUOUS'; }],
  ['record_rebinding_on_empty_ledger', c => { c.trusted_canonical_resolution.source_record_id = 'other-record'; }]
];
for (const [id, mutate] of cleanContextMutationCases) {
  const context = structuredClone(baselineContext);
  mutate(context);
  const actual = evaluateRecord(structuredClone(baseline.record), context);
  if (actual.disposition !== 'QUARANTINED_OR_REJECTED') {
    throw new Error(`clean suppression hydration mutation ${id} failed closed: ${actual.disposition}/${actual.triggers.join(',')}`);
  }
}

const temporalMutationCases = [
  ['malformed_expiry', r => { r.rights.expires_at = 'not-a-date'; }],
  ['timezone_less_expiry', r => { r.rights.expires_at = '2099-01-01T00:00:00'; }],
  ['invalid_calendar_expiry', r => { r.rights.expires_at = '2099-02-30T00:00:00Z'; }],
  ['malformed_as_of', r => { r.as_of = 'invalid'; }]
];
for (const [id, mutate] of temporalMutationCases) {
  const mutated = structuredClone(baseline.record);
  mutate(mutated);
  const actual = evaluateRecord(mutated, structuredClone(baselineContext));
  if (actual.disposition !== 'REJECTED' || !actual.triggers.includes('rights_temporal_invalid')) {
    throw new Error(`temporal mutation ${id} failed closed: ${actual.disposition}/${actual.triggers.join(',')}`);
  }
}

const replayFailClosedMutationCases = [
  ['replay_expired_rights', r => { r.rights.expires_at = '2026-08-20T00:00:00Z'; }, 'REJECTED'],
  ['replay_missing_rights', r => { r.rights.present = false; r.rights.status = 'UNKNOWN'; }, 'REJECTED'],
  ['replay_malformed_expiry', r => { r.rights.expires_at = 'not-a-date'; }, 'REJECTED'],
  ['replay_invalid_as_of', r => { r.as_of = 'invalid'; }, 'REJECTED'],
  ['replay_schema_drift', r => { r.schema.received_version = 'partner-sale-v2-unknown'; }, 'QUARANTINED_OR_REJECTED'],
  ['replay_unvalidated_provider_substitution', r => {
    r.provider.substitution = true;
    r.provider.adapter_validated = false;
    r.provider.rights_revalidated = false;
    r.provider.identity_revalidated = false;
    r.provider.lineage_revalidated = false;
  }, 'REVALIDATE_RIGHTS_SCHEMA_IDENTITY_LINEAGE']
];
for (const [id, mutate, expected] of replayFailClosedMutationCases) {
  const mutated = structuredClone(baseline.record);
  mutated.replay = { is_replay: true, same_digest: true, idempotency_key_match: true };
  mutate(mutated);
  const actual = evaluateRecord(mutated, structuredClone(baselineContext));
  if (actual.disposition !== expected || actual.disposition === 'IDEMPOTENT_REPLAY_WITH_AUDIT_TRACE') {
    throw new Error(`replay mutation ${id} failed closed: expected=${expected} actual=${actual.disposition}/${actual.triggers.join(',')}`);
  }
}

const deletionFixture = (pack.fixtures || []).find(f => f.id === 'deletion_request');
if (!deletionFixture?.trusted_context) throw new Error('deletion fixture must carry trusted persisted context');

function buildTrustedDeletionContext(fixture) {
  const persisted = structuredClone(fixture.trusted_context || {});
  const context = {
    ...buildCleanAdmissionContext(fixture.record, {
      source_owner_id: persisted.persisted_source_owner_id,
      source_namespace: persisted.persisted_source_namespace,
      canonical_source_object_id: 'canonical-delete-001'
    }),
    ...persisted
  };
  const payloadEvent = structuredClone(fixture.record?.lifecycle?.control_event || {});
  const trustedEvent = {
    ...payloadEvent,
    audit_event_id: 'audit-destructive-delete-001',
    sequence_number: 1,
    previous_event_digest: 'GENESIS',
    trusted_source: TRUSTED_DESTRUCTIVE_EVENT_SOURCE
  };
  trustedEvent.event_digest = digestTrustedDestructiveEvent(trustedEvent);
  context.trusted_destructive_control_event = trustedEvent;
  return context;
}

function fixtureTrustedContext(fixture) {
  if (fixture.id === 'deletion_request') return buildTrustedDeletionContext(fixture);
  const context = buildCleanAdmissionContext(fixture.record, { source_namespace: `fixture-${fixture.id}` });
  return { ...context, ...(fixture.trusted_context ? structuredClone(fixture.trusted_context) : {}) };
}

const validDeletionContext = buildTrustedDeletionContext(deletionFixture);
const validDeletion = evaluateRecord(structuredClone(deletionFixture.record), validDeletionContext);
if (validDeletion.disposition !== 'WITHDRAWN_OR_DELETED' || !validDeletion.triggers.includes('destructive_event_authorized')) {
  throw new Error(`authorized deletion fixture failed: ${validDeletion.disposition}/${validDeletion.triggers.join(',')}`);
}

{
  const context = buildCleanAdmissionContext(deletionFixture.record, {
    source_owner_id: deletionFixture.trusted_context.persisted_source_owner_id,
    source_namespace: deletionFixture.trusted_context.persisted_source_namespace,
    canonical_source_object_id: 'canonical-delete-001'
  });
  Object.assign(context, structuredClone(deletionFixture.trusted_context));
  const actual = evaluateRecord(structuredClone(deletionFixture.record), context);
  if (actual.disposition !== 'QUARANTINED_OR_REJECTED' || !actual.triggers.includes('missing_trusted_destructive_control_event')) {
    throw new Error(`payload-only destructive self-assertion did not fail closed: ${actual.disposition}/${actual.triggers.join(',')}`);
  }
}

const destructiveMutationCases = [
  ['missing_control_event_claim', (r, c) => { delete r.lifecycle.control_event; }],
  ['unauthenticated_payload_claim', (r, c) => { r.lifecycle.control_event.authenticated = false; }],
  ['unauthorized_payload_claim', (r, c) => { r.lifecycle.control_event.authorized = false; }],
  ['payload_actor_owner_mismatch', (r, c) => { r.lifecycle.control_event.actor_id = 'forged-owner'; }],
  ['payload_source_owner_mismatch', (r, c) => { r.lifecycle.control_event.source_owner_id = 'forged-owner'; }],
  ['payload_namespace_mismatch', (r, c) => { r.lifecycle.control_event.source_namespace = 'forged-namespace'; }],
  ['payload_object_mismatch', (r, c) => { r.lifecycle.control_event.object_id = 'other-object'; }],
  ['persisted_object_binding_mismatch', (r, c) => { c.persisted_object_id = 'other-object'; }],
  ['payload_unsupported_destructive_action', (r, c) => { r.lifecycle.control_event.action = 'PURGE_ALL'; }],
  ['payload_missing_append_only_audit_binding', (r, c) => { r.lifecycle.control_event.append_only_audit_bound = false; }],
  ['missing_trusted_context', (r, c) => { delete c.persisted_source_owner_id; delete c.persisted_source_namespace; }],
  ['missing_trusted_destructive_event', (r, c) => { delete c.trusted_destructive_control_event; }],
  ['trusted_event_untrusted_source', (r, c) => { c.trusted_destructive_control_event.trusted_source = 'PARTNER_PAYLOAD'; }],
  ['trusted_event_sequence_invalid', (r, c) => { c.trusted_destructive_control_event.sequence_number = 0; }],
  ['trusted_event_digest_tamper', (r, c) => { c.trusted_destructive_control_event.event_digest = 'forged'; }],
  ['trusted_event_owner_rebinding_resigned', (r, c) => { c.trusted_destructive_control_event.source_owner_id = 'forged-owner'; c.trusted_destructive_control_event.event_digest = digestTrustedDestructiveEvent(c.trusted_destructive_control_event); }],
  ['trusted_event_object_rebinding_resigned', (r, c) => { c.trusted_destructive_control_event.object_id = 'other-object'; c.trusted_destructive_control_event.event_digest = digestTrustedDestructiveEvent(c.trusted_destructive_control_event); }],
  ['trusted_event_action_rebinding_resigned', (r, c) => { c.trusted_destructive_control_event.action = 'WITHDRAW'; c.trusted_destructive_control_event.event_digest = digestTrustedDestructiveEvent(c.trusted_destructive_control_event); }]
];
for (const [id, mutate] of destructiveMutationCases) {
  const record = structuredClone(deletionFixture.record);
  const context = buildTrustedDeletionContext(deletionFixture);
  mutate(record, context);
  const actual = evaluateRecord(record, context);
  if (actual.disposition !== 'QUARANTINED_OR_REJECTED' || actual.disposition === 'WITHDRAWN_OR_DELETED') {
    throw new Error(`destructive mutation ${id} failed closed: ${actual.disposition}/${actual.triggers.join(',')}`);
  }
}

{
  const record = structuredClone(deletionFixture.record);
  const context = normalizeTrustedContext(buildTrustedDeletionContext(deletionFixture));
  const first = evaluateRecord(record, context);
  if (first.disposition !== 'WITHDRAWN_OR_DELETED') throw new Error('destructive replay setup did not authorize first event');
  const second = evaluateRecord(record, context);
  if (second.disposition !== 'QUARANTINED_OR_REJECTED' || !second.triggers.includes('destructive_event_replay')) {
    throw new Error(`destructive event replay did not fail closed: ${second.disposition}/${second.triggers.join(',')}`);
  }
}

const deletionEvent = validDeletionContext.trusted_destructive_control_event;
const canonicalSuppressionKey = suppressionKey(deletionEvent.source_owner_id, deletionEvent.source_namespace, 'canonical-delete-001');
const canonicalSuppressionEvent = {
  audit_event_id: 'audit-delete-001',
  destructive_event_id: deletionEvent.event_id,
  sequence_number: 1,
  previous_event_digest: 'GENESIS',
  action: deletionEvent.action,
  authorized: true,
  append_only_audit_bound: true,
  source_owner_id: deletionEvent.source_owner_id,
  source_namespace: deletionEvent.source_namespace,
  source_record_id: deletionFixture.record.identity.source_record_id,
  canonical_source_object_id: 'canonical-delete-001',
  suppression_key: canonicalSuppressionKey,
  suppression_state: SUPPRESSION_STATE
};
canonicalSuppressionEvent.event_digest = digestSuppressionEvent(canonicalSuppressionEvent);
const canonicalSuppressionTombstone = {
  destructive_event_id: canonicalSuppressionEvent.destructive_event_id,
  audit_event_id: canonicalSuppressionEvent.audit_event_id,
  event_sequence: canonicalSuppressionEvent.sequence_number,
  source_owner_id: canonicalSuppressionEvent.source_owner_id,
  source_namespace: canonicalSuppressionEvent.source_namespace,
  canonical_source_object_id: canonicalSuppressionEvent.canonical_source_object_id,
  suppression_key: canonicalSuppressionEvent.suppression_key,
  suppression_state: SUPPRESSION_STATE,
  lineage_metadata_only: true,
  raw_content_retained: false
};
canonicalSuppressionTombstone.tombstone_digest = digestSuppressionTombstone(canonicalSuppressionTombstone);
const canonicalSuppressionSnapshot = buildSuppressionSnapshot([canonicalSuppressionEvent], [canonicalSuppressionTombstone], 2);
const canonicalSuppressionCheckpoint = buildTrustedSuppressionCheckpoint(canonicalSuppressionSnapshot);
const canonicalSuppressionContext = {
  canonical_suppression_events: [canonicalSuppressionEvent],
  canonical_suppression_tombstones: [canonicalSuppressionTombstone],
  canonical_suppression_snapshot: canonicalSuppressionSnapshot,
  trusted_canonical_suppression_checkpoint: canonicalSuppressionCheckpoint,
  trusted_admission_suppression_fence: buildAdmissionSuppressionFence(canonicalSuppressionCheckpoint),
  trusted_canonical_resolution: {
    status: 'RESOLVED_UNAMBIGUOUS',
    source_record_id: 'delete-001-rekeyed',
    source_owner_id: deletionEvent.source_owner_id,
    source_namespace: deletionEvent.source_namespace,
    canonical_source_object_id: 'canonical-delete-001'
  }
};
const rekeyedAfterDelete = structuredClone(baseline.record);
rekeyedAfterDelete.identity.source_record_id = 'delete-001-rekeyed';
const rekeyedDisposition = evaluateRecord(rekeyedAfterDelete, canonicalSuppressionContext);
if (rekeyedDisposition.disposition !== 'REJECTED_CANONICAL_OBJECT_SUPPRESSED') {
  throw new Error(`post-delete canonical alias re-entered admission: ${rekeyedDisposition.disposition}/${rekeyedDisposition.triggers.join(',')}`);
}
const rekeyedReplay = structuredClone(rekeyedAfterDelete);
rekeyedReplay.replay = { is_replay: true, same_digest: true, idempotency_key_match: true };
const rekeyedReplayDisposition = evaluateRecord(rekeyedReplay, canonicalSuppressionContext);
if (rekeyedReplayDisposition.disposition !== 'REJECTED_CANONICAL_OBJECT_SUPPRESSED') {
  throw new Error(`post-delete canonical alias replay bypassed suppression: ${rekeyedReplayDisposition.disposition}/${rekeyedReplayDisposition.triggers.join(',')}`);
}

// P0 #1003 regression: an older self-consistent clean snapshot cannot override a newer trusted
// destructive checkpoint. This covers stale read, rollback image, replica lag and replay paths.
const staleCleanContext = buildCleanAdmissionContext(rekeyedAfterDelete, {
  source_owner_id: deletionEvent.source_owner_id,
  source_namespace: deletionEvent.source_namespace,
  canonical_source_object_id: 'canonical-delete-001',
  epoch: 1
});
staleCleanContext.trusted_canonical_suppression_checkpoint = structuredClone(canonicalSuppressionCheckpoint);
staleCleanContext.trusted_admission_suppression_fence = buildAdmissionSuppressionFence(staleCleanContext.trusted_canonical_suppression_checkpoint);
const staleNormalDisposition = evaluateRecord(structuredClone(rekeyedAfterDelete), staleCleanContext);
if (staleNormalDisposition.disposition !== 'QUARANTINED_OR_REJECTED' || !staleNormalDisposition.triggers.includes('canonical_suppression_checkpoint_epoch_mismatch')) {
  throw new Error(`stale clean suppression snapshot failed open: ${staleNormalDisposition.disposition}/${staleNormalDisposition.triggers.join(',')}`);
}
const staleReplayRecord = structuredClone(rekeyedAfterDelete);
staleReplayRecord.replay = { is_replay: true, same_digest: true, idempotency_key_match: true };
const staleReplayDisposition = evaluateRecord(staleReplayRecord, staleCleanContext);
if (staleReplayDisposition.disposition !== 'QUARANTINED_OR_REJECTED' || staleReplayDisposition.disposition === 'IDEMPOTENT_REPLAY_WITH_AUDIT_TRACE') {
  throw new Error(`stale suppression replay failed open: ${staleReplayDisposition.disposition}/${staleReplayDisposition.triggers.join(',')}`);
}

const independentSourceContext = structuredClone(canonicalSuppressionContext);
independentSourceContext.trusted_canonical_resolution.source_owner_id = 'independent-owner';
independentSourceContext.trusted_canonical_resolution.source_namespace = 'independent-source';
const independentSourceDisposition = evaluateRecord(rekeyedAfterDelete, independentSourceContext);
if (independentSourceDisposition.disposition !== 'CONTROL_ONLY_EVIDENCE_ELIGIBLE') {
  throw new Error(`independent source owner was globally suppressed: ${independentSourceDisposition.disposition}/${independentSourceDisposition.triggers.join(',')}`);
}

const canonicalSuppressionMutationCases = [
  ['missing_snapshot', c => { delete c.canonical_suppression_snapshot; }],
  ['snapshot_not_loaded', c => { c.canonical_suppression_snapshot.state = 'NOT_LOADED'; c.canonical_suppression_snapshot.snapshot_digest = digestSuppressionSnapshot(c.canonical_suppression_snapshot); }],
  ['snapshot_count_drift', c => { c.canonical_suppression_snapshot.event_count = 0; c.canonical_suppression_snapshot.snapshot_digest = digestSuppressionSnapshot(c.canonical_suppression_snapshot); }],
  ['snapshot_last_digest_drift', c => { c.canonical_suppression_snapshot.last_event_digest = 'forged'; c.canonical_suppression_snapshot.snapshot_digest = digestSuppressionSnapshot(c.canonical_suppression_snapshot); }],
  ['snapshot_digest_tamper', c => { c.canonical_suppression_snapshot.snapshot_digest = 'forged'; }],
  ['missing_checkpoint', c => { delete c.trusted_canonical_suppression_checkpoint; }],
  ['checkpoint_epoch_rebinding_resigned', c => { c.trusted_canonical_suppression_checkpoint.epoch += 1; c.trusted_canonical_suppression_checkpoint.checkpoint_digest = digestTrustedSuppressionCheckpoint(c.trusted_canonical_suppression_checkpoint); }],
  ['checkpoint_last_digest_rebinding_resigned', c => { c.trusted_canonical_suppression_checkpoint.last_event_digest = 'other-head'; c.trusted_canonical_suppression_checkpoint.checkpoint_digest = digestTrustedSuppressionCheckpoint(c.trusted_canonical_suppression_checkpoint); }],
  ['missing_admission_fence', c => { delete c.trusted_admission_suppression_fence; }],
  ['admission_fence_checkpoint_rebinding_resigned', c => { c.trusted_admission_suppression_fence.checkpoint_digest = 'other-checkpoint'; c.trusted_admission_suppression_fence.fence_digest = digestAdmissionSuppressionFence(c.trusted_admission_suppression_fence); }],
  ['missing_resolution', c => { delete c.trusted_canonical_resolution; }],
  ['ambiguous_resolution', c => { c.trusted_canonical_resolution.status = 'AMBIGUOUS'; }],
  ['resolver_record_rebinding', c => { c.trusted_canonical_resolution.source_record_id = 'other-record'; }],
  ['missing_event_chain', c => { c.canonical_suppression_events = []; }],
  ['event_digest_tamper', c => { c.canonical_suppression_events[0].event_digest = 'forged'; }],
  ['previous_digest_tamper_resigned', c => { c.canonical_suppression_events[0].previous_event_digest = 'forged-previous'; c.canonical_suppression_events[0].event_digest = digestSuppressionEvent(c.canonical_suppression_events[0]); }],
  ['tombstone_digest_tamper', c => { c.canonical_suppression_tombstones[0].tombstone_digest = 'forged'; }],
  ['tombstone_event_rebinding_resigned', c => { c.canonical_suppression_tombstones[0].audit_event_id = 'other-audit'; c.canonical_suppression_tombstones[0].tombstone_digest = digestSuppressionTombstone(c.canonical_suppression_tombstones[0]); }],
  ['suppression_key_recomputed_malicious_object', c => {
    c.canonical_suppression_tombstones[0].canonical_source_object_id = 'other-canonical';
    c.canonical_suppression_tombstones[0].suppression_key = suppressionKey(c.canonical_suppression_tombstones[0].source_owner_id, c.canonical_suppression_tombstones[0].source_namespace, c.canonical_suppression_tombstones[0].canonical_source_object_id);
    c.canonical_suppression_tombstones[0].tombstone_digest = digestSuppressionTombstone(c.canonical_suppression_tombstones[0]);
  }],
  ['suppression_state_promotion_resigned', c => { c.canonical_suppression_tombstones[0].suppression_state = 'ACTIVE'; c.canonical_suppression_tombstones[0].tombstone_digest = digestSuppressionTombstone(c.canonical_suppression_tombstones[0]); }],
  ['suppression_raw_content_retained_resigned', c => { c.canonical_suppression_tombstones[0].raw_content_retained = true; c.canonical_suppression_tombstones[0].tombstone_digest = digestSuppressionTombstone(c.canonical_suppression_tombstones[0]); }],
  ['extra_orphan_tombstone', c => { const extra = structuredClone(c.canonical_suppression_tombstones[0]); extra.destructive_event_id = 'orphan-destructive'; extra.suppression_key = 'orphan::source::object'; extra.tombstone_digest = digestSuppressionTombstone(extra); c.canonical_suppression_tombstones.push(extra); }]
];
for (const [id, mutate] of canonicalSuppressionMutationCases) {
  const context = structuredClone(canonicalSuppressionContext);
  mutate(context);
  const actual = evaluateRecord(structuredClone(rekeyedAfterDelete), context);
  if (actual.disposition !== 'QUARANTINED_OR_REJECTED') {
    throw new Error(`canonical suppression mutation ${id} failed closed: ${actual.disposition}/${actual.triggers.join(',')}`);
  }
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
  const actual = evaluateRecord(structuredClone(fixture.record), fixtureTrustedContext(fixture));
  if (actual.disposition !== fixture.expected_disposition) {
    throw new Error(`fixture ${fixture.id} expected=${fixture.expected_disposition} actual=${actual.disposition} triggers=${actual.triggers.join(',')}`);
  }
  if (!actual.triggers.length || actual.triggers[0] === 'all_control_checks_pass') throw new Error(`fixture ${fixture.id} did not exercise an adversarial control`);
  const renamed = evaluateRecord(structuredClone(fixture.record), fixtureTrustedContext(fixture));
  if (renamed.disposition !== actual.disposition) throw new Error(`fixture ${fixture.id} result is not payload-deterministic`);
  results.push({ id: fixture.id, disposition: actual.disposition, triggers: actual.triggers, promotable: false });
}

for (const id of contractFixtures.keys()) {
  if (!packFixtures.some(f => f.id === id)) throw new Error(`contract fixture has no executable payload: ${id}`);
}
if (results.some(r => r.promotable || r.disposition === 'PROMOTED')) throw new Error('synthetic adversarial fixture may never promote');
if (contract.truth_boundary?.synthetic_fixture_effect !== 'CONTROL_VALIDATION_ONLY') throw new Error('synthetic fixture truth boundary drift');
if (contract.truth_boundary?.empirical_gate_effect !== 'NONE') throw new Error('fixture harness cannot promote empirical readiness');
if (contract.truth_boundary?.external_partner_data_ingestion !== 'HOLD') throw new Error('partner data ingestion must remain HOLD');

console.log(JSON.stringify({
  suite: 'PRE_PARTNER_ADVERSARIAL_FIXTURES_V2',
  control_layer_result: 'PASS',
  executable_payload_fixtures_passed: results.length,
  temporal_fail_closed_mutation_cases: temporalMutationCases.length,
  replay_cross_control_fail_closed_mutation_cases: replayFailClosedMutationCases.length,
  canonical_suppression_hydration_mandatory: true,
  canonical_suppression_authoritative_checkpoint_mandatory: true,
  canonical_suppression_admission_commit_fence_mandatory: true,
  stale_suppression_snapshot_fail_closed: true,
  stale_suppression_replay_fail_closed: true,
  canonical_resolution_mandatory_even_for_empty_ledger: true,
  omitted_suppression_context_fail_closed: true,
  replay_without_suppression_context_fail_closed: true,
  clean_suppression_snapshot_fail_closed_mutation_cases: cleanContextMutationCases.length,
  destructive_lifecycle_authorization_fail_closed_mutation_cases: destructiveMutationCases.length + 2,
  destructive_lifecycle_requires_trusted_control_plane_event: true,
  destructive_payload_self_assertion_rejected: true,
  destructive_trusted_event_digest_bound: true,
  canonical_suppression_consumer_binding: true,
  canonical_suppression_consumer_cryptographic_ledger_validation: true,
  canonical_suppression_snapshot_digest_bound: true,
  canonical_rekey_reingestion_fail_closed: true,
  canonical_rekey_replay_fail_closed: true,
  canonical_suppression_fail_closed_mutation_cases: canonicalSuppressionMutationCases.length,
  independent_source_owner_not_globally_suppressed: true,
  destructive_lifecycle_requires_trusted_persisted_binding: true,
  destructive_event_replay_protection: true,
  replay_requires_current_rights_and_control_revalidation: true,
  baseline_control: baselineEval.disposition,
  behavior_driven_evaluation: true,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
