import crypto from 'node:crypto';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const FAIL_CLOSED_INVALIDATION_STATES = new Set([
  'DELETED',
  'WITHDRAWN',
  'TOMBSTONED',
  'INVALIDATED',
  'HOLD_RECOMPUTE_REQUIRED'
]);

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

function digestEvent(event) {
  const body = structuredClone(event);
  delete body.event_digest;
  return sha256(body);
}

function digestTombstone(tombstone) {
  const body = structuredClone(tombstone);
  delete body.tombstone_digest;
  return sha256(body);
}

function makeLedger(recoveryEpoch = 7) {
  return {
    synthetic: true,
    promotable: false,
    empirical_gate_effect: 'NONE',
    recovery_epoch: recoveryEpoch,
    events: [],
    consumed_destructive_event_ids: [],
    tombstones: []
  };
}

function normalizeInvalidationManifest(affectedObjects, invalidatedStates) {
  assert(Array.isArray(affectedObjects) && affectedObjects.length > 0, 'destructive event must declare affected objects');
  assert(new Set(affectedObjects).size === affectedObjects.length, 'duplicate affected object');
  return affectedObjects.map(objectId => {
    const invalidatedState = invalidatedStates?.[objectId];
    assert(typeof invalidatedState === 'string' && invalidatedState.length > 0, `missing invalidation state for ${objectId}`);
    assert(FAIL_CLOSED_INVALIDATION_STATES.has(invalidatedState), `non-fail-closed invalidation state for ${objectId}: ${invalidatedState}`);
    return {
      object_id: objectId,
      invalidated_state: invalidatedState
    };
  });
}

function makeEvent(ledger, fields) {
  const last = ledger.events.at(-1);
  const event = {
    audit_event_id: fields.audit_event_id,
    destructive_event_id: fields.destructive_event_id || null,
    event_time: fields.event_time || '2026-08-22T01:40:00Z',
    sequence_number: ledger.events.length + 1,
    previous_event_digest: last?.event_digest || 'GENESIS',
    actor_type: fields.actor_type || 'SOURCE_OWNER',
    actor_id: fields.actor_id || 'source-owner-1',
    action: fields.action,
    object_type: fields.object_type || 'SOURCE_RECORD',
    object_id: fields.object_id || 'source-1',
    source_owner_id: fields.source_owner_id || 'source-owner-1',
    source_namespace: fields.source_namespace || 'partner-1',
    decision: fields.decision || 'AUTHORIZED',
    result: fields.result || 'APPLIED',
    correlation_id: fields.correlation_id || 'corr-1',
    affected_objects: fields.affected_objects || [],
    invalidation_manifest: fields.invalidation_manifest || []
  };
  event.event_digest = digestEvent(event);
  return event;
}

function validateLedger(ledger, { minimumRecoveryEpoch = 0, minimumSequence = 0 } = {}) {
  assert(ledger?.synthetic === true, 'durable replay proof must be synthetic');
  assert(ledger?.promotable === false, 'durable replay proof must remain non-promotable');
  assert(ledger?.empirical_gate_effect === 'NONE', 'durable replay proof cannot affect empirical gates');
  assert(Number.isInteger(ledger.recovery_epoch) && ledger.recovery_epoch >= minimumRecoveryEpoch, 'recovery epoch rollback detected');
  assert(Array.isArray(ledger.events), 'events array required');
  assert(Array.isArray(ledger.consumed_destructive_event_ids), 'consumed destructive event IDs required');
  assert(Array.isArray(ledger.tombstones), 'tombstones required');
  assert(ledger.events.length >= minimumSequence, 'durable audit ledger is older than recovered data snapshot');

  const auditIds = new Set();
  const destructiveIds = new Set();
  const destructiveEvents = new Map();
  let previous = 'GENESIS';

  for (let index = 0; index < ledger.events.length; index += 1) {
    const event = ledger.events[index];
    assert(event.sequence_number === index + 1, `audit sequence gap at ${event.audit_event_id}`);
    assert(event.previous_event_digest === previous, `previous digest mismatch at ${event.audit_event_id}`);
    assert(event.event_digest === digestEvent(event), `event digest mismatch at ${event.audit_event_id}`);
    assert(!auditIds.has(event.audit_event_id), `duplicate audit event id ${event.audit_event_id}`);
    auditIds.add(event.audit_event_id);
    previous = event.event_digest;

    if (['WITHDRAW', 'DELETE'].includes(event.action)) {
      assert(typeof event.destructive_event_id === 'string' && event.destructive_event_id.length > 0, 'destructive event id required');
      assert(!destructiveIds.has(event.destructive_event_id), `destructive event replay in durable ledger: ${event.destructive_event_id}`);
      destructiveIds.add(event.destructive_event_id);
      destructiveEvents.set(event.destructive_event_id, event);

      assert(Array.isArray(event.affected_objects) && event.affected_objects.length > 0, 'destructive event must declare affected objects');
      assert(new Set(event.affected_objects).size === event.affected_objects.length, `duplicate affected object at ${event.audit_event_id}`);
      assert(Array.isArray(event.invalidation_manifest), `invalidation manifest required at ${event.audit_event_id}`);
      assert(event.invalidation_manifest.length === event.affected_objects.length, `invalidation manifest cardinality mismatch at ${event.audit_event_id}`);

      const manifestObjects = new Set();
      for (const entry of event.invalidation_manifest) {
        assert(entry && typeof entry === 'object', `invalid invalidation manifest entry at ${event.audit_event_id}`);
        assert(typeof entry.object_id === 'string' && entry.object_id.length > 0, `invalidation manifest object id required at ${event.audit_event_id}`);
        assert(!manifestObjects.has(entry.object_id), `duplicate invalidation manifest object ${entry.object_id}`);
        manifestObjects.add(entry.object_id);
        assert(event.affected_objects.includes(entry.object_id), `invalidation manifest object not affected: ${entry.object_id}`);
        assert(FAIL_CLOSED_INVALIDATION_STATES.has(entry.invalidated_state), `non-fail-closed invalidation state in audit event: ${entry.object_id}:${entry.invalidated_state}`);
      }
      for (const objectId of event.affected_objects) {
        assert(manifestObjects.has(objectId), `affected object missing from invalidation manifest: ${objectId}`);
      }
    } else {
      assert(Array.isArray(event.invalidation_manifest) && event.invalidation_manifest.length === 0, `benign event cannot carry invalidation manifest: ${event.audit_event_id}`);
    }
  }

  const consumed = new Set(ledger.consumed_destructive_event_ids);
  assert(consumed.size === ledger.consumed_destructive_event_ids.length, 'duplicate consumed destructive event id');
  assert(consumed.size === destructiveIds.size, 'durable consumed-event index drift');
  for (const id of destructiveIds) assert(consumed.has(id), `missing durable consumed destructive event id: ${id}`);

  const tombstoneKeys = new Set();
  for (const tombstone of ledger.tombstones) {
    const event = destructiveEvents.get(tombstone.destructive_event_id);
    assert(event, `orphan tombstone event ${tombstone.destructive_event_id}`);
    assert(typeof tombstone.object_id === 'string' && tombstone.object_id.length > 0, 'tombstone object id required');
    assert(event.affected_objects.includes(tombstone.object_id), `tombstone object was not affected by event: ${tombstone.object_id}`);
    assert(tombstone.audit_event_id === event.audit_event_id, `tombstone audit event mismatch: ${tombstone.object_id}`);
    assert(tombstone.event_sequence === event.sequence_number, `tombstone event sequence mismatch: ${tombstone.object_id}`);
    assert(tombstone.lineage_metadata_only === true, `tombstone must be lineage-only: ${tombstone.object_id}`);
    assert(tombstone.raw_content_retained === false, `tombstone retained prohibited raw content: ${tombstone.object_id}`);
    assert(tombstone.tombstone_digest === digestTombstone(tombstone), `tombstone digest mismatch: ${tombstone.object_id}`);

    const manifestEntry = event.invalidation_manifest.find(entry => entry.object_id === tombstone.object_id);
    assert(manifestEntry, `tombstone missing digest-bound invalidation manifest entry: ${tombstone.object_id}`);
    assert(tombstone.invalidated_state === manifestEntry.invalidated_state, `tombstone invalidation state not authorized by audit event: ${tombstone.object_id}`);
    assert(FAIL_CLOSED_INVALIDATION_STATES.has(tombstone.invalidated_state), `non-fail-closed tombstone state: ${tombstone.object_id}:${tombstone.invalidated_state}`);

    const key = `${tombstone.destructive_event_id}:${tombstone.object_id}`;
    assert(!tombstoneKeys.has(key), `duplicate tombstone ${key}`);
    tombstoneKeys.add(key);
  }

  for (const event of ledger.events.filter(e => ['WITHDRAW', 'DELETE'].includes(e.action))) {
    for (const objectId of event.affected_objects) {
      assert(tombstoneKeys.has(`${event.destructive_event_id}:${objectId}`), `missing durable tombstone for ${event.destructive_event_id}:${objectId}`);
    }
  }
  return true;
}

function appendDestructiveEvent(ledger, fields, invalidatedStates) {
  validateLedger(ledger);
  assert(!ledger.consumed_destructive_event_ids.includes(fields.destructive_event_id), `destructive event replay: ${fields.destructive_event_id}`);

  const invalidationManifest = normalizeInvalidationManifest(fields.affected_objects, invalidatedStates);
  const event = makeEvent(ledger, {
    ...fields,
    invalidation_manifest: invalidationManifest
  });

  ledger.events.push(event);
  ledger.consumed_destructive_event_ids.push(fields.destructive_event_id);

  for (const entry of invalidationManifest) {
    const tombstone = {
      destructive_event_id: fields.destructive_event_id,
      audit_event_id: event.audit_event_id,
      event_sequence: event.sequence_number,
      object_id: entry.object_id,
      invalidated_state: entry.invalidated_state,
      lineage_metadata_only: true,
      raw_content_retained: false
    };
    tombstone.tombstone_digest = digestTombstone(tombstone);
    ledger.tombstones.push(tombstone);
  }

  validateLedger(ledger);
  return event;
}

function appendBenignAuditEvent(ledger, fields = {}) {
  validateLedger(ledger);
  const event = makeEvent(ledger, {
    audit_event_id: fields.audit_event_id || `audit-${ledger.events.length + 1}`,
    action: fields.action || 'RECOVERY_CHECKPOINT',
    decision: 'RECORDED',
    result: 'PASS',
    affected_objects: [],
    invalidation_manifest: []
  });
  ledger.events.push(event);
  validateLedger(ledger);
  return event;
}

function serializeLedger(ledger) {
  validateLedger(ledger);
  return JSON.stringify(ledger);
}

function restoreLedger(serialized, requirements = {}) {
  const restored = JSON.parse(serialized);
  validateLedger(restored, requirements);
  return restored;
}

function recoverDataSnapshot(snapshot, ledger) {
  validateLedger(ledger, {
    minimumRecoveryEpoch: snapshot.minimum_recovery_epoch,
    minimumSequence: snapshot.ledger_sequence_at_capture
  });
  const next = structuredClone(snapshot);
  for (const tombstone of ledger.tombstones) {
    if (!(tombstone.object_id in next.object_states)) continue;
    next.object_states[tombstone.object_id] = tombstone.invalidated_state;
    assert(
      next.object_states[tombstone.object_id] === tombstone.invalidated_state,
      `recovery did not apply exact authorized invalidation state: ${tombstone.object_id}`
    );
  }
  next.recovered_through_ledger_sequence = ledger.events.length;
  next.recovery_epoch = ledger.recovery_epoch;
  return next;
}

function expectFailure(id, fn) {
  let failed = false;
  try { fn(); } catch { failed = true; }
  assert(failed, `mutation did not fail closed: ${id}`);
}

function resignEventChain(ledger, fromIndex = 0) {
  let previous = fromIndex === 0 ? 'GENESIS' : ledger.events[fromIndex - 1].event_digest;
  for (let index = fromIndex; index < ledger.events.length; index += 1) {
    ledger.events[index].previous_event_digest = previous;
    ledger.events[index].event_digest = digestEvent(ledger.events[index]);
    previous = ledger.events[index].event_digest;
  }
}

const invalidatedStates = {
  'source-1': 'DELETED',
  'evidence-1': 'TOMBSTONED',
  'claim-1': 'INVALIDATED',
  'snapshot-1': 'HOLD_RECOMPUTE_REQUIRED',
  'projection-1': 'HOLD_RECOMPUTE_REQUIRED',
  'portal-eos-1': 'HOLD_RECOMPUTE_REQUIRED'
};

const preEventSnapshot = {
  synthetic: true,
  promotable: false,
  minimum_recovery_epoch: 7,
  ledger_sequence_at_capture: 0,
  object_states: Object.fromEntries(Object.keys(invalidatedStates).map(id => [id, 'ACTIVE']))
};

const durable = makeLedger(7);
appendDestructiveEvent(durable, {
  audit_event_id: 'audit-delete-1',
  destructive_event_id: 'destructive-delete-1',
  action: 'DELETE',
  affected_objects: Object.keys(invalidatedStates)
}, invalidatedStates);
appendBenignAuditEvent(durable, { audit_event_id: 'audit-recovery-checkpoint-2' });

// Fresh-process restore must retain the destructive replay index and tombstones.
const restored = restoreLedger(serializeLedger(durable), { minimumRecoveryEpoch: 7, minimumSequence: 2 });
expectFailure('fresh_process_duplicate_destructive_event', () => {
  appendDestructiveEvent(restored, {
    audit_event_id: 'audit-delete-replay-3',
    destructive_event_id: 'destructive-delete-1',
    action: 'DELETE',
    affected_objects: Object.keys(invalidatedStates)
  }, invalidatedStates);
});

// Rolling data back to a snapshot captured before deletion must restore the exact audit-authorized invalidation states.
const recovered = recoverDataSnapshot(preEventSnapshot, restored);
for (const [objectId, expected] of Object.entries(invalidatedStates)) {
  assert(recovered.object_states[objectId] === expected, `recovery did not reapply durable tombstone: ${objectId}`);
}

const mutations = [
  ['recovery_epoch_downgrade', ledger => { ledger.recovery_epoch = 6; }, { minimumRecoveryEpoch: 7 }],
  ['audit_sequence_gap', ledger => { ledger.events[1].sequence_number = 3; }, {}],
  ['previous_digest_mismatch', ledger => {
    ledger.events[1].previous_event_digest = 'forged';
    ledger.events[1].event_digest = digestEvent(ledger.events[1]);
  }, {}],
  ['event_digest_mismatch', ledger => { ledger.events[0].result = 'FORGED'; }, {}],
  ['missing_consumed_destructive_id', ledger => { ledger.consumed_destructive_event_ids = []; }, {}],
  ['duplicate_consumed_destructive_id', ledger => { ledger.consumed_destructive_event_ids.push('destructive-delete-1'); }, {}],
  ['missing_durable_tombstone', ledger => {
    ledger.tombstones = ledger.tombstones.filter(t => t.object_id !== 'claim-1');
  }, {}],
  ['raw_content_retained_in_tombstone', ledger => {
    ledger.tombstones[0].raw_content_retained = true;
    ledger.tombstones[0].tombstone_digest = digestTombstone(ledger.tombstones[0]);
  }, {}],
  ['stale_ledger_vs_snapshot', ledger => { ledger.events.pop(); }, { minimumSequence: 2 }],
  ['tombstone_state_promoted', ledger => {
    const tombstone = ledger.tombstones.find(t => t.object_id === 'claim-1');
    tombstone.invalidated_state = 'APPROVED';
    tombstone.tombstone_digest = digestTombstone(tombstone);
  }, {}],
  ['tombstone_audit_event_rebound', ledger => {
    const tombstone = ledger.tombstones.find(t => t.object_id === 'claim-1');
    tombstone.audit_event_id = 'audit-recovery-checkpoint-2';
    tombstone.tombstone_digest = digestTombstone(tombstone);
  }, {}],
  ['tombstone_event_sequence_rebound', ledger => {
    const tombstone = ledger.tombstones.find(t => t.object_id === 'claim-1');
    tombstone.event_sequence = 2;
    tombstone.tombstone_digest = digestTombstone(tombstone);
  }, {}],
  ['digest_consistent_manifest_state_promotion', ledger => {
    const event = ledger.events[0];
    const entry = event.invalidation_manifest.find(item => item.object_id === 'claim-1');
    entry.invalidated_state = 'APPROVED';
    resignEventChain(ledger, 0);
    const tombstone = ledger.tombstones.find(t => t.object_id === 'claim-1');
    tombstone.invalidated_state = 'APPROVED';
    tombstone.tombstone_digest = digestTombstone(tombstone);
  }, {}],
  ['unaffected_object_tombstone', ledger => {
    const event = ledger.events[0];
    const tombstone = {
      destructive_event_id: event.destructive_event_id,
      audit_event_id: event.audit_event_id,
      event_sequence: event.sequence_number,
      object_id: 'unaffected-rogue-object',
      invalidated_state: 'HOLD_RECOMPUTE_REQUIRED',
      lineage_metadata_only: true,
      raw_content_retained: false
    };
    tombstone.tombstone_digest = digestTombstone(tombstone);
    ledger.tombstones.push(tombstone);
  }, {}],
  ['manifest_affected_object_divergence', ledger => {
    const event = ledger.events[0];
    event.affected_objects = event.affected_objects.filter(id => id !== 'claim-1');
    resignEventChain(ledger, 0);
  }, {}]
];

for (const [id, mutate, requirements] of mutations) {
  const candidate = structuredClone(durable);
  mutate(candidate);
  expectFailure(id, () => validateLedger(candidate, requirements));
}

console.log(JSON.stringify({
  suite: 'KIDULTS_DESTRUCTIVE_LIFECYCLE_RECOVERY_MONOTONICITY_V1',
  governing_issue: 979,
  predecessor_issue: 977,
  parent_pre_partner_gate: 881,
  result: 'PASS',
  durable_destructive_event_replay_index: true,
  fresh_process_duplicate_destructive_event_rejected: true,
  rollback_resurrection_prevented: true,
  durable_tombstones_reapplied_on_restore: true,
  tombstone_state_cryptographically_bound_to_audit_event: true,
  tombstone_audit_sequence_binding_validated: true,
  promotable_invalidation_state_fail_closed: true,
  recovery_epoch_monotonic: true,
  append_only_sequence_digest_chain_validated: true,
  mutation_cases_fail_closed: mutations.length,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
