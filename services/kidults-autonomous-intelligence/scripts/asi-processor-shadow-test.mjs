import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = (name) => resolve(serviceRoot, 'migrations', name);
const migrationNames = [
  '0001_canonical_foundation.sql',
  '0002_autonomous_orchestration.sql',
  '0003_asi_market_funnel_shadow.sql',
  '0004_asi_processor_shadow.sql',
];

const normalizeClock = (value) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('ASI_SHADOW_TEST_CLOCK_INVALID');
  return new Date(parsed).toISOString();
};
const testClock = normalizeClock(process.env.KAIOS_ASI_TEST_CLOCK || '2025-01-15T12:00:00.000Z');
const offsetIso = (milliseconds) => new Date(Date.parse(testClock) + milliseconds).toISOString();
const at = offsetIso(-2 * 60 * 60 * 1000);
const reviewDue = offsetIso(7 * 24 * 60 * 60 * 1000);
const expiredReviewDue = offsetIso(-60 * 60 * 1000);
const revokedAt = offsetIso(-30 * 60 * 1000);
const laterDeniedObservedAt = offsetIso(-60 * 60 * 1000);

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
for (const name of migrationNames) db.exec(readFileSync(migrationPath(name), 'utf8'));
db.exec(`
  DROP VIEW asi_source_pool_evaluation_clock;
  CREATE VIEW asi_source_pool_evaluation_clock AS
  SELECT julianday('${testClock}') AS now_julianday;
`);

const classificationFleets = [
  'SOURCE_SITE_IDENTITY_OWNER_LINEAGE',
  'SOURCE_SCOPE_ROLE_CLASSIFICATION',
  'SOURCE_REGION_LANGUAGE_CLASSIFICATION',
  'SOURCE_MARKET_SEMANTICS_CLASSIFICATION',
];
const qualificationFleets = [
  'SOURCE_UTILITY_VALUE_ANALYSIS',
  'SOURCE_RIGHTS_COMPLIANCE_ANALYSIS',
  'SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS',
  'SOURCE_COVERAGE_BIAS_ANALYSIS',
  'SOURCE_INDEPENDENCE_REDUNDANCY_ANALYSIS',
  'SOURCE_FRESHNESS_STABILITY_ANALYSIS',
  'SOURCE_COST_ROI_ANALYSIS',
];
const purpose = 'BOUNDED_SHADOW_ACQUISITION';
const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const row = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

let testCount = 0;
const test = (name, body) => {
  body();
  testCount += 1;
  process.stdout.write(`ok ${testCount} - ${name}\n`);
};
const expectThrows = (body, pattern) => {
  assert.throws(body, (error) => {
    assert.match(String(error?.message || error), pattern);
    return true;
  });
};

const partitionFor = (suffix) => ({
  channel: 'OPEN_MARKET',
  region: 'GLOBAL',
  language: 'en',
  scope_id: `scope-${suffix}`,
  source_role: 'SOLD_TRANSACTION',
  canonical_host_hash: `host-hash-${suffix}`,
});
const partitionKey = (partition) => [
  partition.channel,
  partition.region,
  partition.language,
  partition.scope_id,
  partition.source_role,
  partition.canonical_host_hash,
].join('|');

function insertEvent({
  eventId,
  eventType,
  producer,
  correlationId,
  partition,
  snapshot,
  payloadHash,
  rights = 'NOT_APPLICABLE',
  freshness = 'CURRENT',
  decision = null,
  causationId = null,
  payloadJson = '{}',
  eventAt = at,
}) {
  run(`
    INSERT INTO asi_event_log (
      event_id,event_type,event_version,producer_engine,producer_version,correlation_id,causation_id,idempotency_key,
      partition_key,input_snapshot_ref,payload_hash,rights_state,freshness_state,assertion_purpose,decision,
      reason_codes_json,trace_refs_json,payload_json,occurred_at,observed_at,received_at
    ) VALUES (?,?, '1.0.0',?,'shadow-test-1.0.0',?,?,?,?,?,?,?,?,?,?, '[]','[]',?,?,?,?)
  `,
    eventId,eventType,producer,correlationId,causationId,`idem:${eventId}`,partitionKey(partition),snapshot,payloadHash,
    rights,freshness,purpose,decision,payloadJson,eventAt,eventAt,eventAt,
  );
}

function insertOutbox({ outboxId, eventId, fleet }) {
  run(`
    INSERT INTO asi_outbox (
      id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,created_at,updated_at
    ) VALUES (?,?,?,?,?,'{}','DISPATCHED',?,?)
  `,outboxId,eventId,fleet,`TEST_${fleet}_QUEUE`, `test-${fleet.toLowerCase().replaceAll('_','-')}`,at,at);
}

function seedSource(suffix, rights = 'ALLOW', candidateState = rights === 'ALLOW' ? 'DISCOVERED' : 'HOLD') {
  const sourceId = `source-${suffix}`;
  const eventId = `event-discovery-${suffix}`;
  const correlationId = `correlation-${suffix}`;
  const partition = partitionFor(suffix);
  const partitionValue = partitionKey(partition);
  const snapshot = `snapshot:${suffix}:discovery`;
  const payloadHash = sha(`${suffix}:discovery`);
  insertEvent({
    eventId,
    eventType:'SOURCE_DISCOVERED',
    producer:'DISCOVERY_WIKIDATA',
    correlationId,
    partition,
    snapshot,
    payloadHash,
    rights,
    decision:rights === 'ALLOW' ? 'PASS' : rights === 'DENY' ? 'REJECT' : 'HOLD',
    payloadJson:JSON.stringify({
      source_id:sourceId,
      discovery_seed:{
        source_id:sourceId,
        canonical_site_id:`site-${suffix}`,
        canonical_host:`${suffix}.example`,
      },
    }),
  });
  run(`
    INSERT INTO asi_source_candidates (
      source_id,canonical_site_id,canonical_host,canonical_host_hash,purpose,partition_key,channel,region,language,scope_id,source_role,
      discovery_engine_fleet,discovery_event_id,input_snapshot_ref,payload_hash,rights_state,freshness_state,
      candidate_state,idempotency_key,first_seen_at,last_seen_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'CURRENT',?,?,?,?,?,?)
  `,
    sourceId,`site-${suffix}`,`${suffix}.example`,partition.canonical_host_hash,purpose,partitionValue,partition.channel,partition.region,
    partition.language,partition.scope_id,partition.source_role,'DISCOVERY_WIKIDATA',eventId,snapshot,payloadHash,rights,
    candidateState,`idem:candidate:${suffix}`,at,at,at,at,
  );
  run(`
    INSERT INTO asi_source_candidate_observations (
      observation_id,source_id,discovery_event_id,discovery_engine_fleet,discovery_channel,input_snapshot_ref,payload_hash,
      rights_state,freshness_state,provenance_json,idempotency_key,observed_at,recorded_at
    ) VALUES (?,?,?,?,?,?,?,?,?,'{"kind":"public_metadata_discovery"}',?,?,?)
  `,
    `observation-${suffix}`,sourceId,eventId,'DISCOVERY_WIKIDATA','WIKIDATA_OFFICIAL_WEBSITE_GRAPH',snapshot,payloadHash,
    rights,'CURRENT',`idem:observation:${suffix}`,at,at,
  );
  return {sourceId,eventId,correlationId,partition,partitionValue,snapshot};
}

function appendDiscoveryObservation({source,suffix,rights,freshness,decision,observedAt}) {
  const candidate = row(`
    SELECT canonical_site_id,canonical_host FROM asi_source_candidates WHERE source_id=?
  `,source.sourceId);
  const eventId = `event-discovery-${suffix}`;
  const payloadHash = sha(`${suffix}:discovery`);
  insertEvent({
    eventId,
    eventType:'SOURCE_DISCOVERED',
    producer:'DISCOVERY_WIKIDATA',
    correlationId:source.correlationId,
    partition:source.partition,
    snapshot:source.snapshot,
    payloadHash,
    rights,
    freshness,
    decision,
    eventAt:observedAt,
    causationId:source.eventId,
    payloadJson:JSON.stringify({
      source_id:source.sourceId,
      discovery_seed:{
        source_id:source.sourceId,
        canonical_site_id:candidate.canonical_site_id,
        canonical_host:candidate.canonical_host,
      },
    }),
  });
  run(`
    INSERT INTO asi_source_candidate_observations (
      observation_id,source_id,discovery_event_id,discovery_engine_fleet,discovery_channel,input_snapshot_ref,payload_hash,
      rights_state,freshness_state,provenance_json,idempotency_key,observed_at,recorded_at
    ) VALUES (?,?,?,?,?,?,?,?,?,'{"kind":"subsequent_discovery_reassessment"}',?,?,?)
  `,`observation-${suffix}`,source.sourceId,eventId,'DISCOVERY_WIKIDATA',source.partition.channel,source.snapshot,payloadHash,
    rights,freshness,`idem:observation:${suffix}`,observedAt,observedAt);
}

function insertFanIn({ source, stage, snapshot }) {
  const groupId = `fanin-${source.sourceId}-${stage.toLowerCase()}-${snapshot.split(':').at(-1)}`;
  run(`
    INSERT INTO asi_processor_fan_in_groups (
      group_id,source_id,purpose,partition_key,stage,correlation_id,input_snapshot_ref,idempotency_key,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?)
  `,groupId,source.sourceId,purpose,source.partitionValue,stage,source.correlationId,snapshot,`idem:${groupId}`,at);
  return groupId;
}

function insertCauseEvent({ source, eventId, eventType, producer, snapshot }) {
  insertEvent({
    eventId,eventType,producer,correlationId:source.correlationId,partition:source.partition,snapshot,
    payloadHash:sha(eventId),rights:'NOT_APPLICABLE',decision:'PASS',causationId:source.eventId,
  });
  return eventId;
}

function addAssertion({ source, groupId, stage, fleet, snapshot, causeEventId, rights, decision = 'PASS' }) {
  const discriminator = `${source.sourceId}:${stage}:${fleet}:${snapshot}`;
  const eventId = `event-${createHash('sha1').update(discriminator).digest('hex')}`;
  const assertionId = `assertion-${createHash('sha1').update(discriminator).digest('hex')}`;
  const outboxId = `outbox-${createHash('sha1').update(`${causeEventId}:${fleet}`).digest('hex')}`;
  const payloadHash = sha(`result:${discriminator}:${rights}:${decision}`);
  insertOutbox({outboxId,eventId:causeEventId,fleet});
  insertEvent({
    eventId,
    eventType:stage === 'CLASSIFICATION' ? 'SOURCE_CLASSIFICATION_ASSERTED' : 'SOURCE_QUALIFICATION_ASSERTED',
    producer:fleet,
    correlationId:source.correlationId,
    partition:source.partition,
    snapshot,
    payloadHash,
    rights,
    decision,
    causationId:causeEventId,
    payloadJson:JSON.stringify({assertions:[{assertion_payload_hash:payloadHash}]}),
  });
  run(`
    INSERT INTO asi_processor_assertions (
      assertion_id,source_id,purpose,partition_key,stage,engine_fleet,assertion_type,decision,rights_state,freshness_state,
      event_id,causation_event_id,source_outbox_id,source_message_id,correlation_id,input_snapshot_ref,payload_hash,
      assertion_payload_hash,result_json,reason_codes_json,engine_version,idempotency_key,observed_at,recorded_at
    ) VALUES (?,?,?,?,?,?,?,?,?,'CURRENT',?,?,?,?,?,?,?,?,?, '[]','shadow-test-1.0.0',?,?,?)
  `,
    assertionId,source.sourceId,purpose,source.partitionValue,stage,fleet,`${stage}_${fleet}`,decision,rights,eventId,
    causeEventId,outboxId,`message:${assertionId}`,source.correlationId,snapshot,payloadHash,
    payloadHash,JSON.stringify({processor:fleet,shadow:true}),`idem:${assertionId}`,at,at,
  );
  run(`INSERT INTO asi_processor_fan_in_members(group_id,engine_fleet,assertion_id,linked_at) VALUES (?,?,?,?)`,
    groupId,fleet,assertionId,at);
  return {assertionId,eventId,outboxId};
}

function insertAdmission({ source, admissionId, sourceEventId }) {
  run(`
    INSERT INTO asi_purpose_admissions (
      admission_id,source_id,purpose,evidence_class,output_class,region,decision,rights_state,policy_version,
      input_snapshot_ref,reason_codes_json,required_assertion_count,satisfied_assertion_count,source_event_id,decided_at,review_due_at
    ) VALUES (?,?,?,'SHADOW_SOURCE_QUALIFICATION','INTERNAL_SHADOW','GLOBAL','PASS','ALLOW',?,?,'[]',9,9,?,?,?)
  `,admissionId,source.sourceId,purpose,'kidults-asi-purpose-specific-admission-policy-v1@1.0.0',
    source.snapshot,sourceEventId,at,reviewDue);
}

function preparePoolDecision({ source, suffix, snapshot, rights = 'ALLOW', eventDecision = 'PASS' }) {
  const causeEventId = `event-pool-input-${suffix}`;
  insertEvent({
    eventId:causeEventId,eventType:'SOURCE_PURPOSE_ADMISSION_DECIDED',producer:'PURPOSE_ADMISSION_MATERIALIZER',
    correlationId:source.correlationId,partition:source.partition,snapshot,payloadHash:sha(causeEventId),rights,
    decision:eventDecision,causationId:source.eventId,
  });
  const outboxId = `outbox-pool-${suffix}`;
  insertOutbox({outboxId,eventId:causeEventId,fleet:'SOURCE_POOL_EVOLUTION'});
  const decisionEventId = `event-pool-decision-${suffix}`;
  insertEvent({
    eventId:decisionEventId,eventType:'SOURCE_POOL_DECIDED',producer:'SOURCE_POOL_EVOLUTION',
    correlationId:source.correlationId,partition:source.partition,snapshot,payloadHash:sha(decisionEventId),rights,
    decision:eventDecision,causationId:causeEventId,
  });
  return {causeEventId,outboxId,decisionEventId};
}

function insertPoolDecision({
  source,
  suffix,
  snapshot,
  poolState,
  classificationGroupId = null,
  qualificationGroupId = null,
  admissionId = null,
  rights = 'ALLOW',
  productionEligible = 0,
}) {
  const eventDecision = poolState === 'QUALIFIED_INTERNAL_SHADOW' ? 'PASS' : poolState === 'REJECTED' ? 'REJECT' : 'HOLD';
  const provenance = preparePoolDecision({source,suffix,snapshot,rights,eventDecision});
  run(`
    INSERT INTO asi_source_pool_decisions (
      decision_id,source_id,purpose,partition_key,pool_state,rights_state,classification_group_id,qualification_group_id,
      admission_id,decision_engine_fleet,decision_event_id,causation_event_id,source_outbox_id,source_message_id,
      correlation_id,policy_version,input_snapshot_ref,reason_codes_json,acquisition_mode,production_eligible,
      idempotency_key,decided_at,review_due_at
    ) VALUES (?,?,?,?,?,?,?,?,?,'SOURCE_POOL_EVOLUTION',?,?,?,?,?,?,?,'[]','PLAN_ONLY',?,?,?,?)
  `,
    `pool-decision-${suffix}`,source.sourceId,purpose,source.partitionValue,poolState,rights,classificationGroupId,
    qualificationGroupId,admissionId,provenance.decisionEventId,provenance.causeEventId,provenance.outboxId,
    `message:pool:${suffix}`,source.correlationId,'kidults-asi-purpose-specific-admission-policy-v1@1.0.0',snapshot,
    productionEligible,`idem:pool:${suffix}`,at,reviewDue,
  );
}

test('all four migrations apply to a fresh SQLite database', () => {
  assert.equal(row(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'asi_%'`).n >= 18,true);
  assert.deepEqual(all(`PRAGMA foreign_key_check`),[]);
});

test('migration 0004 is replay-safe', () => {
  db.exec(readFileSync(migrationPath('0004_asi_processor_shadow.sql'),'utf8'));
});

const sourceA = seedSource('a');
const snapshotA = sourceA.snapshot;
const classificationA = insertFanIn({source:sourceA,stage:'CLASSIFICATION',snapshot:snapshotA});
const qualificationA = insertFanIn({source:sourceA,stage:'QUALIFICATION',snapshot:snapshotA});

test('database seeds the exact canonical 4+7 fan-in requirements', () => {
  assert.equal(row(`SELECT COUNT(*) AS n FROM asi_processor_fan_in_requirements WHERE group_id=?`,classificationA).n,4);
  assert.equal(row(`SELECT COUNT(*) AS n FROM asi_processor_fan_in_requirements WHERE group_id=?`,qualificationA).n,7);
  assert.deepEqual(
    all(`SELECT engine_fleet FROM asi_processor_fan_in_requirements WHERE group_id=? ORDER BY engine_fleet`,classificationA)
      .map((item) => item.engine_fleet),
    [...classificationFleets].sort(),
  );
});

const identityCauseA = insertCauseEvent({
  source:sourceA,eventId:'event-identity-a',eventType:'SOURCE_IDENTIFIED',producer:'FAN_IN_MATERIALIZER',snapshot:snapshotA,
});

for (const fleet of classificationFleets.slice(0,3)) addAssertion({
  source:sourceA,groupId:classificationA,stage:'CLASSIFICATION',fleet,snapshot:snapshotA,
  causeEventId:sourceA.eventId,rights:'NOT_APPLICABLE',
});

test('missing one local classification assertion remains fail-closed', () => {
  const readiness = row(`SELECT * FROM asi_processor_fan_in_readiness WHERE group_id=?`,classificationA);
  assert.equal(readiness.required_fleet_count,4);
  assert.equal(readiness.satisfied_fleet_count,3);
  assert.equal(readiness.readiness_state,'HOLD_MISSING_ASSERTION');
  expectThrows(() => insertPoolDecision({
    source:sourceA,suffix:'a-missing',snapshot:snapshotA,poolState:'QUALIFIED_INTERNAL_SHADOW',
    classificationGroupId:classificationA,qualificationGroupId:qualificationA,
  }),/ASI_SOURCE_POOL_CLASSIFICATION_FAN_IN_NOT_READY/);
});

const lastClassificationA = addAssertion({
  source:sourceA,groupId:classificationA,stage:'CLASSIFICATION',fleet:classificationFleets.at(-1),snapshot:snapshotA,
  causeEventId:sourceA.eventId,rights:'NOT_APPLICABLE',
});
for (const fleet of qualificationFleets) addAssertion({
  source:sourceA,groupId:qualificationA,stage:'QUALIFICATION',fleet,snapshot:snapshotA,causeEventId:identityCauseA,
  rights:fleet === 'SOURCE_RIGHTS_COMPLIANCE_ANALYSIS' ? 'UNKNOWN' : 'NOT_APPLICABLE',
});

test('UNKNOWN rights holds only the affected source-purpose-partition', () => {
  assert.equal(row(`SELECT readiness_state FROM asi_processor_fan_in_readiness WHERE group_id=?`,classificationA).readiness_state,'READY');
  const readiness = row(`SELECT * FROM asi_processor_fan_in_readiness WHERE group_id=?`,qualificationA);
  assert.equal(readiness.satisfied_fleet_count,7);
  assert.equal(readiness.unknown_rights_count,1);
  assert.equal(readiness.readiness_state,'HOLD');
  expectThrows(() => insertPoolDecision({
    source:sourceA,suffix:'a-unknown',snapshot:snapshotA,poolState:'QUALIFIED_INTERNAL_SHADOW',
    classificationGroupId:classificationA,qualificationGroupId:qualificationA,
  }),/ASI_SOURCE_POOL_QUALIFICATION_FAN_IN_NOT_READY/);
});

const sourceC = seedSource('c','UNKNOWN','HOLD');
test('a discovery candidate on HOLD cannot be promoted by forged downstream PASS inputs', () => {
  expectThrows(() => insertPoolDecision({
    source:sourceC,suffix:'c-discovery-hold',snapshot:sourceC.snapshot,poolState:'QUALIFIED_INTERNAL_SHADOW',
    rights:'ALLOW',
  }),/ASI_SOURCE_POOL_DISCOVERY_CANDIDATE_NOT_READY/);
});

test('assertions and fan-in membership are append-only', () => {
  expectThrows(() => run(`UPDATE asi_processor_assertions SET result_json='{}' WHERE assertion_id=?`,lastClassificationA.assertionId),
    /ASI_PROCESSOR_ASSERTION_IMMUTABLE_USE_SUPERSESSION/);
  expectThrows(() => run(`DELETE FROM asi_processor_fan_in_members WHERE assertion_id=?`,lastClassificationA.assertionId),
    /ASI_FAN_IN_MEMBER_DELETE_FORBIDDEN/);
});

test('outbox mismatch cannot be laundered into processor evidence', () => {
  expectThrows(() => run(`
    INSERT INTO asi_processor_assertions (
      assertion_id,source_id,purpose,partition_key,stage,engine_fleet,assertion_type,decision,rights_state,freshness_state,
      event_id,causation_event_id,source_outbox_id,source_message_id,correlation_id,input_snapshot_ref,payload_hash,
      assertion_payload_hash,result_json,reason_codes_json,engine_version,idempotency_key,observed_at,recorded_at
    ) SELECT 'assertion-forged',source_id,purpose,partition_key,stage,engine_fleet,'FORGED',decision,rights_state,freshness_state,
      event_id,causation_event_id,?, 'message:forged',correlation_id,input_snapshot_ref,payload_hash,
      assertion_payload_hash,result_json,reason_codes_json,engine_version,'idem:assertion:forged',observed_at,recorded_at
    FROM asi_processor_assertions WHERE assertion_id=?
  `,qualificationFleets.length ? lastClassificationA.outboxId.replace(/.$/,'0') : 'missing',lastClassificationA.assertionId),
  /FOREIGN KEY constraint failed|ASI_PROCESSOR_ASSERTION_EVENT_OR_OUTBOX_PROVENANCE_MISMATCH/);
});

test('exact discovery observation replay is idempotent but payload mutation conflicts', () => {
  const before = row(`SELECT COUNT(*) AS n FROM asi_source_candidate_observations WHERE source_id=?`,sourceA.sourceId).n;
  run(`
    INSERT OR IGNORE INTO asi_source_candidate_observations
    SELECT * FROM asi_source_candidate_observations WHERE observation_id='observation-a'
  `);
  assert.equal(row(`SELECT COUNT(*) AS n FROM asi_source_candidate_observations WHERE source_id=?`,sourceA.sourceId).n,before);
  expectThrows(() => run(`
    INSERT INTO asi_source_candidate_observations (
      observation_id,source_id,discovery_event_id,discovery_engine_fleet,discovery_channel,input_snapshot_ref,payload_hash,
      rights_state,freshness_state,provenance_json,idempotency_key,observed_at,recorded_at
    ) SELECT 'observation-a-mutated',source_id,discovery_event_id,discovery_engine_fleet,discovery_channel,
      input_snapshot_ref,payload_hash,rights_state,freshness_state,'{"mutated":true}',idempotency_key,observed_at,recorded_at
      FROM asi_source_candidate_observations WHERE observation_id='observation-a'
  `),/UNIQUE constraint failed: asi_source_candidate_observations\.(?:idempotency_key|source_id)/);
});

const sourceB = seedSource('b');
const snapshotB = sourceB.snapshot;
const classificationB = insertFanIn({source:sourceB,stage:'CLASSIFICATION',snapshot:snapshotB});
const qualificationB = insertFanIn({source:sourceB,stage:'QUALIFICATION',snapshot:snapshotB});
const identityCauseB = insertCauseEvent({
  source:sourceB,eventId:'event-identity-b',eventType:'SOURCE_IDENTIFIED',producer:'FAN_IN_MATERIALIZER',snapshot:snapshotB,
});
for (const fleet of classificationFleets) addAssertion({
  source:sourceB,groupId:classificationB,stage:'CLASSIFICATION',fleet,snapshot:snapshotB,
  causeEventId:sourceB.eventId,rights:'NOT_APPLICABLE',
});
for (const fleet of qualificationFleets) addAssertion({
  source:sourceB,groupId:qualificationB,stage:'QUALIFICATION',fleet,snapshot:snapshotB,causeEventId:identityCauseB,
  rights:fleet === 'SOURCE_RIGHTS_COMPLIANCE_ANALYSIS' ? 'ALLOW' : 'NOT_APPLICABLE',
});

test('fan-in is local: source B becomes ready while source A remains held', () => {
  assert.equal(row(`SELECT readiness_state FROM asi_processor_fan_in_readiness WHERE group_id=?`,qualificationA).readiness_state,'HOLD');
  assert.equal(row(`SELECT readiness_state FROM asi_processor_fan_in_readiness WHERE group_id=?`,classificationB).readiness_state,'READY');
  assert.equal(row(`SELECT readiness_state FROM asi_processor_fan_in_readiness WHERE group_id=?`,qualificationB).readiness_state,'READY');
});

const poolPreludeB = preparePoolDecision({source:sourceB,suffix:'b-no-admission',snapshot:snapshotB});
test('complete processor fan-in still cannot bypass purpose admission', () => {
  expectThrows(() => run(`
    INSERT INTO asi_source_pool_decisions (
      decision_id,source_id,purpose,partition_key,pool_state,rights_state,classification_group_id,qualification_group_id,
      admission_id,decision_engine_fleet,decision_event_id,causation_event_id,source_outbox_id,source_message_id,
      correlation_id,policy_version,input_snapshot_ref,reason_codes_json,idempotency_key,decided_at,review_due_at
    ) VALUES (?,?,?,?, 'QUALIFIED_INTERNAL_SHADOW','ALLOW',?,?,NULL,'SOURCE_POOL_EVOLUTION',?,?,?,?,?,?,?,'[]',?,?,?)
  `,'pool-decision-b-no-admission',sourceB.sourceId,purpose,sourceB.partitionValue,classificationB,qualificationB,
    poolPreludeB.decisionEventId,poolPreludeB.causeEventId,poolPreludeB.outboxId,'message:b-no-admission',sourceB.correlationId,
    'kidults-asi-purpose-specific-admission-policy-v1@1.0.0',snapshotB,'idem:pool:b-no-admission',at,reviewDue),
  /ASI_SOURCE_POOL_PURPOSE_ADMISSION_NOT_CURRENT_OR_COMPLETE/);
});

insertAdmission({source:sourceB,admissionId:'admission-b',sourceEventId:poolPreludeB.decisionEventId});

test('only the complete PASS/ALLOW path reaches QUALIFIED_INTERNAL_SHADOW', () => {
  insertPoolDecision({
    source:sourceB,suffix:'b-qualified',snapshot:snapshotB,poolState:'QUALIFIED_INTERNAL_SHADOW',
    classificationGroupId:classificationB,qualificationGroupId:qualificationB,admissionId:'admission-b',rights:'ALLOW',
  });
  const decision = row(`SELECT * FROM asi_source_pool_current WHERE source_id=?`,sourceB.sourceId);
  assert.equal(decision.pool_state,'QUALIFIED_INTERNAL_SHADOW');
  assert.equal(decision.acquisition_mode,'PLAN_ONLY');
  assert.equal(decision.content_collection_authorized,0);
  assert.equal(decision.market_claim_authorized,0);
  assert.equal(decision.commercial_projection_authorized,0);
  assert.equal(decision.production_eligible,0);
  assert.equal(decision.production_state,'HOLD');
  const effective = row(`SELECT effective_pool_state,effective_usable,effective_reason_code FROM asi_source_pool_effective WHERE source_id=?`,sourceB.sourceId);
  assert.deepEqual({...effective},{
    effective_pool_state:'QUALIFIED_INTERNAL_SHADOW',
    effective_usable:1,
    effective_reason_code:'EFFECTIVE_QUALIFIED_INTERNAL_SHADOW',
  });
});

test('expired linked admission makes a recorded qualification effectively unusable', () => {
  run(`UPDATE asi_purpose_admissions SET review_due_at=? WHERE admission_id='admission-b'`,expiredReviewDue);
  const current = row(`SELECT pool_state,recorded_pool_state,effective_usable,effective_reason_code FROM asi_source_pool_current WHERE source_id=?`,sourceB.sourceId);
  assert.deepEqual({...current},{
    pool_state:'HOLD',
    recorded_pool_state:'QUALIFIED_INTERNAL_SHADOW',
    effective_usable:0,
    effective_reason_code:'LINKED_ADMISSION_EXPIRED',
  });
});

test('revoked linked admission makes a recorded qualification effectively revoked', () => {
  run(`UPDATE asi_purpose_admissions SET revoked_at=? WHERE admission_id='admission-b'`,revokedAt);
  const current = row(`SELECT pool_state,recorded_pool_state,effective_usable,effective_reason_code FROM asi_source_pool_current WHERE source_id=?`,sourceB.sourceId);
  assert.deepEqual({...current},{
    pool_state:'REVOKED',
    recorded_pool_state:'QUALIFIED_INTERNAL_SHADOW',
    effective_usable:0,
    effective_reason_code:'LINKED_ADMISSION_REVOKED',
  });
});

appendDiscoveryObservation({
  source:sourceB,
  suffix:'b-later-denied',
  rights:'DENY',
  freshness:'CURRENT',
  decision:'REJECT',
  observedAt:laterDeniedObservedAt,
});

test('later denied discovery observation makes current fail closed without rewriting audit history', () => {
  const recorded = row(`SELECT pool_state FROM asi_source_pool_latest_decision_audit WHERE source_id=?`,sourceB.sourceId);
  const current = row(`SELECT pool_state,recorded_pool_state,effective_usable,effective_reason_code FROM asi_source_pool_current WHERE source_id=?`,sourceB.sourceId);
  assert.equal(recorded.pool_state,'QUALIFIED_INTERNAL_SHADOW');
  assert.deepEqual({...current},{
    pool_state:'REJECTED',
    recorded_pool_state:'QUALIFIED_INTERNAL_SHADOW',
    effective_usable:0,
    effective_reason_code:'LATEST_DISCOVERY_DENIED_OR_REJECTED',
  });
});

test('storage constraints reject any production or publication authorization', () => {
  expectThrows(() => insertPoolDecision({
    source:sourceA,suffix:'a-production-forged',snapshot:snapshotA,poolState:'HOLD',rights:'UNKNOWN',productionEligible:1,
  }),/CHECK constraint failed/);
  expectThrows(() => run(`UPDATE asi_source_pool_decisions SET market_claim_authorized=1 WHERE decision_id='pool-decision-b-qualified'`),
    /ASI_SOURCE_POOL_DECISION_IMMUTABLE_USE_SUPERSESSION/);
});

test('candidate identity cannot be mutated or deleted', () => {
  expectThrows(() => run(`UPDATE asi_source_candidates SET canonical_host='attacker.example' WHERE source_id=?`,sourceB.sourceId),
    /ASI_SOURCE_CANDIDATE_IMMUTABLE_APPEND_OBSERVATION/);
  expectThrows(() => run(`DELETE FROM asi_source_candidates WHERE source_id=?`,sourceB.sourceId),
    /ASI_SOURCE_CANDIDATE_DELETE_FORBIDDEN/);
});

test('the resulting database has no foreign-key violations', () => {
  assert.deepEqual(all(`PRAGMA foreign_key_check`),[]);
});

process.stdout.write(JSON.stringify({
  status:'PASS',
  mode:'SHADOW',
  tests:testCount,
  classification_required:classificationFleets.length,
  qualification_required:qualificationFleets.length,
  production:'HOLD',
})+'\n');
