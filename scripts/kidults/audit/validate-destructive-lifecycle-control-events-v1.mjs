import fs from 'node:fs';

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const control = readJson('coordination/kidults/audit/unified-audit-control-plane-v1.json');
const extension = readJson('coordination/kidults/audit/destructive-lifecycle-control-extension-v1.json');
const envelope = readJson('coordination/kidults/audit/destructive-lifecycle-control-events-v1.json');
const fixtures = readJson('coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json');

const allowedActions = new Set(extension.allowed_actions || []);
const familyIds = new Set((control.pre_partner_control_families || []).map(f => f.id));
const registryByObject = new Map((envelope.object_registry || []).map(item => [item.object_id, item]));
const eventsByObject = new Map();
for (const event of envelope.authorized_events || []) {
  if (!eventsByObject.has(event.object_id)) eventsByObject.set(event.object_id, []);
  eventsByObject.get(event.object_id).push(event);
}

function validateDestructiveEvent(record, event, registry, seenEventIds = new Set()) {
  const failures = [];
  const objectId = record?.identity?.source_record_id;
  if (!event) return ['authorization_missing'];
  if (!registry) return ['object_registry_binding_missing'];
  if (event.authenticated !== true) failures.push('actor_not_authenticated');
  if (!event.actor_id || typeof event.actor_id !== 'string') failures.push('actor_identity_missing');
  if (event.authorization_decision !== 'PASS') failures.push('authorization_not_pass');
  if (!allowedActions.has(event.action)) failures.push('unsupported_destructive_action');
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

assert(control.governing_issue === 881, 'base control plane must remain governed by #881');
assert(extension.governing_issue === 961 && extension.extends_governing_issue === 881, 'destructive lifecycle extension governance drift');
assert(extension.control_id === 'AUTHENTICATED_DESTRUCTIVE_LIFECYCLE_EVENT', 'destructive lifecycle control ID drift');
for (const family of extension.bound_control_families || []) assert(familyIds.has(family), `extension references unknown control family ${family}`);
assert((extension.required_controls || []).length >= 8, 'destructive lifecycle extension controls incomplete');
assert(envelope.governing_issue === 961 && envelope.extends_governing_issue === 881, 'authorization envelope governance drift');
assert(envelope.fixture_type === 'SYNTHETIC_NON_PROMOTABLE_CONTROL', 'authorization envelope must stay synthetic and non-promotable');
assert(envelope.truth_boundary?.empirical_gate_effect === 'NONE', 'authorization fixture cannot affect empirical gates');

const eventIds = (envelope.authorized_events || []).map(e => e.destructive_event_id);
assert(eventIds.length === new Set(eventIds).size, 'destructive event IDs must be unique');

const destructiveFixtures = (fixtures.fixtures || []).filter(f => f.record?.lifecycle?.deletion_requested === true);
assert(destructiveFixtures.length > 0, 'at least one destructive lifecycle fixture is required');
for (const fixture of destructiveFixtures) {
  const objectId = fixture.record?.identity?.source_record_id;
  const registry = registryByObject.get(objectId);
  const events = eventsByObject.get(objectId) || [];
  assert(events.length === 1, `exactly one authorization event required for destructive fixture ${fixture.id}`);
  const failures = validateDestructiveEvent(fixture.record, events[0], registry);
  assert(failures.length === 0, `destructive fixture ${fixture.id} authorization failed: ${failures.join(',')}`);
}

const baselineFixture = destructiveFixtures[0];
const baselineObjectId = baselineFixture.record.identity.source_record_id;
const baselineRegistry = registryByObject.get(baselineObjectId);
const baselineEvent = eventsByObject.get(baselineObjectId)[0];
const mutationCases = [
  { id: 'missing_authorization', event: null, registry: baselineRegistry, seen: new Set(), expected: 'authorization_missing' },
  { id: 'unauthenticated_actor', mutate: e => { e.authenticated = false; }, expected: 'actor_not_authenticated' },
  { id: 'spoofed_actor_owner', mutate: e => { e.actor_source_owner_id = 'spoofed-owner'; }, expected: 'actor_source_owner_mismatch' },
  { id: 'source_owner_mismatch', mutate: e => { e.source_owner_id = 'other-owner'; }, expected: 'source_owner_mismatch' },
  { id: 'namespace_mismatch', mutate: e => { e.source_namespace = 'other/namespace'; }, expected: 'source_namespace_mismatch' },
  { id: 'object_mismatch', mutate: e => { e.object_id = 'other-object'; }, expected: 'object_mismatch' },
  { id: 'unsupported_action', mutate: e => { e.action = 'PURGE_EVERYTHING'; }, expected: 'unsupported_destructive_action' },
  { id: 'authorization_not_pass', mutate: e => { e.authorization_decision = 'UNKNOWN'; }, expected: 'authorization_not_pass' },
  { id: 'audit_binding_missing', mutate: e => { e.append_only_audit_bound = false; }, expected: 'append_only_audit_binding_missing' },
  { id: 'explicit_replay', mutate: e => { e.replayed = true; }, expected: 'destructive_event_replay' },
  { id: 'seen_event_replay', mutate: () => {}, seen: new Set([baselineEvent.destructive_event_id]), expected: 'destructive_event_replay' }
];

for (const test of mutationCases) {
  const event = test.event === null ? null : structuredClone(baselineEvent);
  if (event && test.mutate) test.mutate(event);
  const failures = validateDestructiveEvent(baselineFixture.record, event, baselineRegistry, test.seen || new Set());
  assert(failures.includes(test.expected), `mutation ${test.id} failed closed check: ${failures.join(',')}`);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_DESTRUCTIVE_LIFECYCLE_CONTROL_EVENTS_V1',
  control_result: 'PASS',
  governing_issue: 961,
  extends_governing_issue: 881,
  bound_control_families: extension.bound_control_families.length,
  destructive_fixtures_authorized: destructiveFixtures.length,
  mutation_cases_fail_closed: mutationCases.length,
  authenticated_actor_required: true,
  exact_source_owner_namespace_object_binding: true,
  append_only_audit_binding_required: true,
  destructive_event_replay_rejected: true,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
