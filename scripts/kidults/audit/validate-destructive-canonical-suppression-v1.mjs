import crypto from 'node:crypto';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ALLOWED_ACTIONS = new Set(['WITHDRAW', 'DELETE']);
const SUPPRESSION_STATE = 'SUPPRESSED_NO_REINGESTION';

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
  for (const [name, value] of Object.entries({ sourceOwnerId, sourceNamespace, canonicalSourceObjectId })) {
    assert(typeof value === 'string' && value.length > 0, `missing suppression key component: ${name}`);
  }
  return `${sourceOwnerId}::${sourceNamespace}::${canonicalSourceObjectId}`;
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

function makeLedger() {
  return {
    synthetic: true,
    promotable: false,
    empirical_gate_effect: 'NONE',
    events: [],
    suppression_tombstones: []
  };
}

function appendSuppression(ledger, fields) {
  validateLedger(ledger);
  assert(ALLOWED_ACTIONS.has(fields.action), 'suppression requires WITHDRAW/DELETE');
  assert(fields.authorized === true, 'suppression requires authorized destructive event');
  assert(fields.append_only_audit_bound === true, 'suppression requires append-only audit binding');

  const key = suppressionKey(fields.source_owner_id, fields.source_namespace, fields.canonical_source_object_id);
  assert(!ledger.suppression_tombstones.some(t => t.suppression_key === key), `canonical suppression already exists: ${key}`);

  const previous = ledger.events.at(-1)?.event_digest || 'GENESIS';
  const event = {
    audit_event_id: fields.audit_event_id,
    destructive_event_id: fields.destructive_event_id,
    sequence_number: ledger.events.length + 1,
    previous_event_digest: previous,
    action: fields.action,
    authorized: true,
    append_only_audit_bound: true,
    source_owner_id: fields.source_owner_id,
    source_namespace: fields.source_namespace,
    source_record_id: fields.source_record_id,
    canonical_source_object_id: fields.canonical_source_object_id,
    suppression_key: key,
    suppression_state: SUPPRESSION_STATE
  };
  event.event_digest = digestEvent(event);
  ledger.events.push(event);

  const tombstone = {
    destructive_event_id: event.destructive_event_id,
    audit_event_id: event.audit_event_id,
    event_sequence: event.sequence_number,
    source_owner_id: event.source_owner_id,
    source_namespace: event.source_namespace,
    canonical_source_object_id: event.canonical_source_object_id,
    suppression_key: event.suppression_key,
    suppression_state: SUPPRESSION_STATE,
    lineage_metadata_only: true,
    raw_content_retained: false
  };
  tombstone.tombstone_digest = digestTombstone(tombstone);
  ledger.suppression_tombstones.push(tombstone);
  validateLedger(ledger);
  return tombstone;
}

function validateLedger(ledger) {
  assert(ledger?.synthetic === true, 'suppression proof must be synthetic');
  assert(ledger?.promotable === false, 'suppression proof must be non-promotable');
  assert(ledger?.empirical_gate_effect === 'NONE', 'suppression proof cannot affect empirical gates');
  assert(Array.isArray(ledger.events), 'events array required');
  assert(Array.isArray(ledger.suppression_tombstones), 'suppression tombstones array required');

  const eventsById = new Map();
  let previous = 'GENESIS';
  for (let index = 0; index < ledger.events.length; index += 1) {
    const event = ledger.events[index];
    assert(event.sequence_number === index + 1, `event sequence drift: ${event.audit_event_id}`);
    assert(event.previous_event_digest === previous, `event previous digest drift: ${event.audit_event_id}`);
    assert(event.event_digest === digestEvent(event), `event digest mismatch: ${event.audit_event_id}`);
    assert(ALLOWED_ACTIONS.has(event.action), `invalid suppression action: ${event.action}`);
    assert(event.authorized === true && event.append_only_audit_bound === true, 'unauthorized suppression event');
    const expectedKey = suppressionKey(event.source_owner_id, event.source_namespace, event.canonical_source_object_id);
    assert(event.suppression_key === expectedKey, `event suppression key drift: ${event.audit_event_id}`);
    assert(event.suppression_state === SUPPRESSION_STATE, `event suppression state drift: ${event.audit_event_id}`);
    assert(!eventsById.has(event.destructive_event_id), `duplicate destructive event id: ${event.destructive_event_id}`);
    eventsById.set(event.destructive_event_id, event);
    previous = event.event_digest;
  }

  const keys = new Set();
  for (const tombstone of ledger.suppression_tombstones) {
    const event = eventsById.get(tombstone.destructive_event_id);
    assert(event, `orphan canonical suppression tombstone: ${tombstone.destructive_event_id}`);
    assert(tombstone.audit_event_id === event.audit_event_id, `suppression audit event mismatch: ${tombstone.suppression_key}`);
    assert(tombstone.event_sequence === event.sequence_number, `suppression event sequence mismatch: ${tombstone.suppression_key}`);
    assert(tombstone.source_owner_id === event.source_owner_id, `suppression owner mismatch: ${tombstone.suppression_key}`);
    assert(tombstone.source_namespace === event.source_namespace, `suppression namespace mismatch: ${tombstone.suppression_key}`);
    assert(tombstone.canonical_source_object_id === event.canonical_source_object_id, `suppression canonical identity mismatch: ${tombstone.suppression_key}`);
    assert(tombstone.suppression_key === event.suppression_key, `suppression key not audit-bound: ${tombstone.suppression_key}`);
    assert(tombstone.suppression_state === SUPPRESSION_STATE, `suppression state not fail-closed: ${tombstone.suppression_key}`);
    assert(tombstone.lineage_metadata_only === true, `suppression tombstone must be lineage-only: ${tombstone.suppression_key}`);
    assert(tombstone.raw_content_retained === false, `suppression tombstone retained raw content: ${tombstone.suppression_key}`);
    assert(tombstone.tombstone_digest === digestTombstone(tombstone), `suppression tombstone digest mismatch: ${tombstone.suppression_key}`);
    assert(!keys.has(tombstone.suppression_key), `duplicate canonical suppression key: ${tombstone.suppression_key}`);
    keys.add(tombstone.suppression_key);
  }

  assert(keys.size === eventsById.size, 'suppression event/tombstone cardinality drift');
  return true;
}

function resolveTrustedCanonicalIdentity(record, trustedResolution) {
  assert(record?.identity && typeof record.identity.source_record_id === 'string', 'source record identity required');
  assert(typeof record.source_owner_id === 'string' && record.source_owner_id.length > 0, 'source owner required');
  assert(typeof record.source_namespace === 'string' && record.source_namespace.length > 0, 'source namespace required');
  assert(trustedResolution && trustedResolution.status === 'RESOLVED_UNAMBIGUOUS', 'canonical source identity must be trusted and unambiguous');
  assert(trustedResolution.source_record_id === record.identity.source_record_id, 'trusted identity resolution source-record mismatch');
  assert(trustedResolution.source_owner_id === record.source_owner_id, 'trusted identity resolution owner mismatch');
  assert(trustedResolution.source_namespace === record.source_namespace, 'trusted identity resolution namespace mismatch');
  assert(typeof trustedResolution.canonical_source_object_id === 'string' && trustedResolution.canonical_source_object_id.length > 0, 'trusted canonical source object id required');
  if (record.identity.claimed_canonical_source_object_id !== undefined) {
    assert(record.identity.claimed_canonical_source_object_id === trustedResolution.canonical_source_object_id, 'partner-claimed canonical identity disagrees with trusted resolution');
  }
  return trustedResolution.canonical_source_object_id;
}

function evaluateAdmission(record, trustedResolution, ledger) {
  validateLedger(ledger);
  const canonicalId = resolveTrustedCanonicalIdentity(record, trustedResolution);
  const key = suppressionKey(record.source_owner_id, record.source_namespace, canonicalId);
  if (ledger.suppression_tombstones.some(t => t.suppression_key === key)) {
    return { disposition: 'REJECTED_CANONICAL_OBJECT_SUPPRESSED', suppression_key: key };
  }
  if (record.provider_substitution === true && record.source_specific_rights_revalidated !== true) {
    return { disposition: 'REVALIDATE_SOURCE_SPECIFIC_RIGHTS_IDENTITY', suppression_key: key };
  }
  return { disposition: 'CONTROL_ONLY_EVIDENCE_ELIGIBLE', suppression_key: key };
}

function expectFailure(id, fn) {
  let failed = false;
  try { fn(); } catch { failed = true; }
  assert(failed, `mutation did not fail closed: ${id}`);
}

const ledger = makeLedger();
appendSuppression(ledger, {
  audit_event_id: 'audit-delete-1',
  destructive_event_id: 'destructive-delete-1',
  action: 'DELETE',
  authorized: true,
  append_only_audit_bound: true,
  source_owner_id: 'owner-1',
  source_namespace: 'partner-a',
  source_record_id: 'record-old-001',
  canonical_source_object_id: 'canonical-sale-777'
});

const rekeyedRecord = {
  source_owner_id: 'owner-1',
  source_namespace: 'partner-a',
  identity: {
    source_record_id: 'record-new-999',
    claimed_canonical_source_object_id: 'canonical-sale-777'
  },
  provider_substitution: false,
  source_specific_rights_revalidated: true
};
const rekeyResolution = {
  status: 'RESOLVED_UNAMBIGUOUS',
  source_owner_id: 'owner-1',
  source_namespace: 'partner-a',
  source_record_id: 'record-new-999',
  canonical_source_object_id: 'canonical-sale-777'
};
assert(
  evaluateAdmission(rekeyedRecord, rekeyResolution, ledger).disposition === 'REJECTED_CANONICAL_OBJECT_SUPPRESSED',
  'rekeyed alias resurrected a deleted/withdrawn canonical source object'
);

const independentSourceRecord = structuredClone(rekeyedRecord);
independentSourceRecord.source_owner_id = 'owner-2';
independentSourceRecord.source_namespace = 'partner-b';
independentSourceRecord.provider_substitution = true;
independentSourceRecord.source_specific_rights_revalidated = false;
const independentResolution = {
  status: 'RESOLVED_UNAMBIGUOUS',
  source_owner_id: 'owner-2',
  source_namespace: 'partner-b',
  source_record_id: 'record-new-999',
  canonical_source_object_id: 'canonical-sale-777'
};
assert(
  evaluateAdmission(independentSourceRecord, independentResolution, ledger).disposition === 'REVALIDATE_SOURCE_SPECIFIC_RIGHTS_IDENTITY',
  'independent source owner must remain separately rights-gated rather than globally suppressed'
);

const mutations = [
  ['missing_canonical_resolution', () => {
    const r = structuredClone(rekeyResolution);
    delete r.canonical_source_object_id;
    evaluateAdmission(rekeyedRecord, r, ledger);
  }],
  ['ambiguous_canonical_resolution', () => {
    const r = structuredClone(rekeyResolution);
    r.status = 'AMBIGUOUS';
    evaluateAdmission(rekeyedRecord, r, ledger);
  }],
  ['resolver_record_id_mismatch', () => {
    const r = structuredClone(rekeyResolution);
    r.source_record_id = 'other-record';
    evaluateAdmission(rekeyedRecord, r, ledger);
  }],
  ['resolver_owner_rebinding', () => {
    const r = structuredClone(rekeyResolution);
    r.source_owner_id = 'owner-2';
    evaluateAdmission(rekeyedRecord, r, ledger);
  }],
  ['resolver_namespace_rebinding', () => {
    const r = structuredClone(rekeyResolution);
    r.source_namespace = 'partner-b';
    evaluateAdmission(rekeyedRecord, r, ledger);
  }],
  ['partner_claimed_canonical_alias_tamper', () => {
    const record = structuredClone(rekeyedRecord);
    record.identity.claimed_canonical_source_object_id = 'fresh-canonical-id';
    evaluateAdmission(record, rekeyResolution, ledger);
  }],
  ['suppression_tombstone_digest_tamper', () => {
    const bad = structuredClone(ledger);
    bad.suppression_tombstones[0].canonical_source_object_id = 'forged-canonical';
    validateLedger(bad);
  }],
  ['suppression_event_key_tamper', () => {
    const bad = structuredClone(ledger);
    bad.events[0].suppression_key = 'forged-key';
    bad.events[0].event_digest = digestEvent(bad.events[0]);
    validateLedger(bad);
  }],
  ['suppression_tombstone_state_promotion', () => {
    const bad = structuredClone(ledger);
    bad.suppression_tombstones[0].suppression_state = 'ACTIVE';
    bad.suppression_tombstones[0].tombstone_digest = digestTombstone(bad.suppression_tombstones[0]);
    validateLedger(bad);
  }],
  ['raw_content_retained', () => {
    const bad = structuredClone(ledger);
    bad.suppression_tombstones[0].raw_content_retained = true;
    bad.suppression_tombstones[0].tombstone_digest = digestTombstone(bad.suppression_tombstones[0]);
    validateLedger(bad);
  }]
];
for (const [id, fn] of mutations) expectFailure(id, fn);

console.log(JSON.stringify({
  suite: 'KIDULTS_DESTRUCTIVE_CANONICAL_SUPPRESSION_V1',
  governing_issue: 983,
  parent_pre_partner_gate: 881,
  result: 'PASS',
  canonical_suppression_scope: 'SOURCE_OWNER_NAMESPACE_CANONICAL_SOURCE_OBJECT',
  rekeyed_alias_reingestion: 'FAIL_CLOSED',
  trusted_identity_resolution_required: true,
  independent_source_owner_behavior: 'SEPARATE_RIGHTS_GATE_NOT_GLOBAL_SUPPRESSION',
  durable_digest_bound_suppression_tombstone: true,
  mutation_cases_fail_closed: mutations.length,
  synthetic: true,
  promotable: false,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
