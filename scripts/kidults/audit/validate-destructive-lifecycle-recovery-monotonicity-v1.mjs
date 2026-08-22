import crypto from 'node:crypto';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function digestEvent(event) {
  const body = structuredClone(event);
  delete body.event_digest;
  return crypto.createHash('sha256').update(JSON.stringify(stable(body))).digest('hex');
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
    affected_objects: fields.affected_objects || []
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
      assert(Array.isArray(event.affected_objects) && event.affected_objects.length > 0, 'destructive event must declare affected objects');
    }
  }

  const consumed = new Set(ledger.consumed_destructive_event_ids);
  assert(consumed.size === ledger.consumed_destructive_event_ids.length, 'duplicate consumed destructive event id');
  assert(consumed.size === destructiveIds.size, 'durable consumed-event index drift');
  for (const id of destructiveIds) assert(consumed.has(id), `missing durable consumed destructive event id: ${id}`);

  const tombstoneKeys = new Set();
  for (const tombstone of ledger.tombstones) {
    assert(destructiveIds.has(tombstone.destructive_event_id), `orphan tombstone event ${tombstone.destructive_event_id}`);
    assert(typeof tombstone.object_id === 'string' && tombstone.object_id.length > 0, 'tombstone object id required');
    assert(tombstone.lineage_metadata_only === true, `tombstone must be lineage-only: ${tombstone.object_id}`);
    assert(tombstone.raw_content_retained === false, `tombstone retained prohibited raw content: ${tombstone.object_id}`);
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
  const event = makeEvent(ledger, fields);
  ledger.events.push(event);
  ledger.consumed_destructive_event_ids.push(fields.destructive_event_id);
  for (const objectId of event.affected_objects) {
    ledger.tombstones.push({
      destructive_event_id: fields.destructive_event_id,
      audit_event_id: event.audit_event_id,
      event_sequence: event.sequence_number,
      object_id: objectId,
      invalidated_state: invalidatedStates[objectId],
      lineage_metadata_only: true,
      raw_content_retained: false
    });
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
    affected_objects: []
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
  }
  for (const tombstone of ledger.tombstones) {
    if (tombstone.object_id in next.object_states) {
      assert(next.object_states[tombstone.object_id] !== 'ACTIVE', `revoked/deleted state resurrected: ${tombstone.object_id}`);
    }
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

// Rolling data back to a snapshot captured before deletion must not resurrect derived state.
const recovered = recoverDataSnapshot(preEventSnapshot, restored);
for (const [objectId, expected] of Object.entries(invalidatedStates)) {
  assert(recovered.object_states[objectId] === expected, `recovery did not reapply durable tombstone: ${objectId}`);
}

const mutations = [
  ['recovery_epoch_downgrade', ledger => { ledger.recovery_epoch = 6; }, { minimumRecoveryEpoch: 7 }],
  ['audit_sequence_gap', ledger => { ledger.events[1].sequence_number = 3; }, {}],
  ['previous_digest_mismatch', ledger => { ledger.events[1].previous_event_digest = 'forged'; ledger.events[1].event_digest = digestEvent(ledger.events[1]); }, {}],
  ['event_digest_mismatch', ledger => { ledger.events[0].result = 'FORGED'; }, {}],
  ['missing_consumed_destructive_id', ledger => { ledger.consumed_destructive_event_ids = []; }, {}],
  ['duplicate_consumed_destructive_id', ledger => { ledger.consumed_destructive_event_ids.push('destructive-delete-1'); }, {}],
  ['missing_durable_tombstone', ledger => { ledger.tombstones = ledger.tombstones.filter(t => t.object_id !== 'claim-1'); }, {}],
  ['raw_content_retained_in_tombstone', ledger => { ledger.tombstones[0].raw_content_retained = true; }, {}],
  ['stale_ledger_vs_snapshot', ledger => { ledger.events.pop(); }, { minimumSequence: 2 }]
];

for (const [id, mutate, requirements] of mutations) {
  const candidate = structuredClone(durable);
  mutate(candidate);
  expectFailure(id, () => validateLedger(candidate, requirements));
}

console.log(JSON.stringify({
  suite: 'KIDULTS_DESTRUCTIVE_LIFECYCLE_RECOVERY_MONOTONICITY_V1',
  governing_issue: 977,
  parent_pre_partner_gate: 881,
  result: 'PASS',
  durable_destructive_event_replay_index: true,
  fresh_process_duplicate_destructive_event_rejected: true,
  rollback_resurrection_prevented: true,
  durable_tombstones_reapplied_on_restore: true,
  recovery_epoch_monotonic: true,
  append_only_sequence_digest_chain_validated: true,
  mutation_cases_fail_closed: mutations.length,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
