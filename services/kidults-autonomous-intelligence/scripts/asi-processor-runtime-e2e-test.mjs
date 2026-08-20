import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(serviceRoot, '../..');
const sourceRoot = resolve(serviceRoot, 'src', 'asi');
const migrationRoot = resolve(serviceRoot, 'migrations');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-asi-runtime-e2e-'));
const normalizeClock = (value) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('ASI_E2E_TEST_CLOCK_INVALID');
  return new Date(parsed).toISOString();
};
const testClock = normalizeClock(process.env.KAIOS_ASI_TEST_CLOCK || '2025-01-15T12:00:00.000Z');
const eventAt = new Date(Date.parse(testClock) - 2 * 60 * 60 * 1000).toISOString();

function installEvaluationClock(sqlite) {
  sqlite.exec(`
    DROP VIEW asi_source_pool_evaluation_clock;
    CREATE VIEW asi_source_pool_evaluation_clock AS
    SELECT julianday('${testClock}') AS now_julianday;
  `);
}

function compileRuntimeModules() {
  const names = ['event','registry','processors','processor-runtime','runtime'];
  for (const name of names) {
    const input = readFileSync(resolve(sourceRoot,`${name}.ts`),'utf8');
    const transpiled = ts.transpileModule(input,{
      fileName:`${name}.ts`,
      reportDiagnostics:true,
      compilerOptions:{
        module:ts.ModuleKind.ES2022,
        target:ts.ScriptTarget.ES2022,
        importsNotUsedAsValues:ts.ImportsNotUsedAsValues.Remove,
      },
    });
    const errors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
      throw new Error(`ASI_E2E_TYPESCRIPT_TRANSPILE_FAILED:${errors.map((item) => item.messageText).join('|')}`);
    }
    const output = transpiled.outputText.replace(
      /(from\s+['"]|import\s*\(\s*['"])(\.\/[a-z0-9-]+)(['"]\s*\)?)/gi,
      (_match,prefix,specifier,suffix) => `${prefix}${specifier}.mjs${suffix}`,
    );
    writeFileSync(resolve(compiledRoot,`${name}.mjs`),output,'utf8');
  }
}

class MemoryD1PreparedStatement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new MemoryD1PreparedStatement(this.database,this.sql,params);
  }

  _run() {
    const result = this.database.sqlite.prepare(this.sql).run(...this.params);
    return {
      success:true,
      results:[],
      meta:{changes:Number(result.changes || 0),last_row_id:Number(result.lastInsertRowid || 0)},
    };
  }

  async run() {
    return this._run();
  }

  async first(columnName) {
    const value = this.database.sqlite.prepare(this.sql).get(...this.params) ?? null;
    return columnName && value ? value[columnName] : value;
  }

  async all() {
    return {success:true,results:this.database.sqlite.prepare(this.sql).all(...this.params),meta:{}};
  }

  async raw(options = {}) {
    const statement = this.database.sqlite.prepare(this.sql);
    const columns = statement.columns().map((column) => column.name);
    const values = statement.all(...this.params).map((item) => columns.map((column) => item[column]));
    return options.columnNames ? [columns,...values] : values;
  }
}

class MemoryD1Database {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys=ON;');
    for (const migration of [
      '0001_canonical_foundation.sql',
      '0002_autonomous_orchestration.sql',
      '0003_asi_market_funnel_shadow.sql',
      '0004_asi_processor_shadow.sql',
      '0005_asi_runtime_recovery_fairness_shadow.sql',
      '0006_asi_task_lease_atomic_fencing_shadow.sql',
    ]) this.sqlite.exec(readFileSync(resolve(migrationRoot,migration),'utf8'));
    installEvaluationClock(this.sqlite);
  }

  prepare(sql) {
    return new MemoryD1PreparedStatement(this,sql);
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const results = statements.map((statement) => statement._run());
      this.sqlite.exec('COMMIT;');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK;');
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}

class QueueMessage {
  constructor(id, body) {
    this.id = id;
    this.body = structuredClone(body);
    this.timestamp = new Date(testClock);
    this.attempts = 1;
    this.state = 'PENDING';
    this.retryOptions = null;
  }

  ack() {
    if (this.state === 'PENDING') this.state = 'ACK';
  }

  retry(options = {}) {
    if (this.state === 'PENDING') {
      this.state = 'RETRY';
      this.retryOptions = options;
    }
  }
}

class DeterministicQueueMesh {
  constructor() {
    this.pending = [];
    this.deliveries = [];
    this.sequence = 0;
  }

  binding(queueName) {
    return {
      send: async (body) => {
        this.pending.push({queue:queueName,body:structuredClone(body)});
      },
      sendBatch: async (batch) => {
        for (const item of batch) this.pending.push({queue:queueName,body:structuredClone(item.body)});
      },
    };
  }

  async deliver(runtime, item, id = null) {
    const message = new QueueMessage(id || `message-${++this.sequence}`,item.body);
    const batch = {
      queue:item.queue,
      messages:[message],
      ackAll:() => message.ack(),
      retryAll:(options) => message.retry(options),
    };
    await runtime.consumeAsiBatch(batch,this.env);
    this.deliveries.push({
      queue:item.queue,
      fleet:item.body.target_fleet,
      correlation_id:item.body.event.correlation_id,
      outbox_id:item.body.outbox_id,
      task:structuredClone(item.body),
      state:message.state,
      retry_options:message.retryOptions,
    });
    return message;
  }

  async drain(runtime, maximum = 1000) {
    let processed = 0;
    while (this.pending.length > 0) {
      if (++processed > maximum) throw new Error('ASI_E2E_QUEUE_DRAIN_LIMIT_EXCEEDED');
      const item = this.pending.shift();
      const message = await this.deliver(runtime,item);
      if (message.state !== 'ACK') {
        throw new Error(`ASI_E2E_UNEXPECTED_QUEUE_${message.state}:${item.queue}:${message.retryOptions?.delaySeconds || 0}`);
      }
    }
    return processed;
  }
}

const queryOne = (db, sql, ...params) => db.sqlite.prepare(sql).get(...params) ?? null;
const queryAll = (db, sql, ...params) => db.sqlite.prepare(sql).all(...params);
const count = (db, table) => Number(queryOne(db,`SELECT COUNT(*) AS n FROM ${table}`).n);

const classificationTypes = [
  'CANONICAL_HOST','OWNER_LINEAGE','PROVENANCE','RELEVANCE','SCOPE_ROLE','REGION_LANGUAGE','MARKET_SEMANTICS',
];
const qualificationTypes = [
  'UTILITY_VALUE','COLLECT','STORE','TRANSFORM','RETENTION','ROBOTS','RATE_LIMIT','SCHEMA','COVERAGE_BIAS',
  'INDEPENDENCE_REDUNDANCY','FRESHNESS','COST_ROI',
];
const rightsTypes = new Set(['COLLECT','STORE','TRANSFORM','RETENTION','ROBOTS']);
const discoveryRoutes = [
  ['COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX','DISCOVERY_COMMON_CRAWL_WDC'],
  ['OVERTURE_MAPS_PLACES_WEBSITE_METADATA','DISCOVERY_OVERTURE_MAPS'],
  ['WIKIDATA_OFFICIAL_WEBSITE_GRAPH','DISCOVERY_WIKIDATA'],
  ['OPENSTREETMAP_WEBSITE_TAG_GRAPH','DISCOVERY_OPENSTREETMAP'],
  ['GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA','DISCOVERY_GITHUB_HOMEPAGE'],
  ['DATACITE_AND_OPEN_RESEARCH_LANDING_METADATA','DISCOVERY_DATACITE_OPEN_RESEARCH'],
  ['GLOBAL_NEWS_AND_EVENT_DOMAIN_DISCOVERY','DISCOVERY_GLOBAL_NEWS_EVENTS'],
  ['PUBLIC_GOVERNMENT_AND_REGIONAL_DATA_CATALOGS','DISCOVERY_GOVERNMENT_REGIONAL_CATALOGS'],
  ['ICANN_AND_PUBLIC_ZONE_DISCOVERY','DISCOVERY_ICANN_PUBLIC_ZONES'],
  ['INTERNET_ARCHIVE_HISTORICAL_DOMAIN_CONTINUITY','DISCOVERY_INTERNET_ARCHIVE_CONTINUITY'],
  ['APPROVED_DIRECTORY_ASSOCIATION_AND_OUTBOUND_LINK_FRONTIER','DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER'],
  ['OPTIONAL_LICENSED_SEARCH_OR_DATA_PROVIDER','DISCOVERY_OPTIONAL_LICENSED_GAP_FILL'],
];

function assertionInputs(sourceId, holdRights) {
  return Object.fromEntries([...classificationTypes,...qualificationTypes].map((type) => [type,{
    decision:'PASS',
    rights_state:rightsTypes.has(type) ? holdRights && type === 'COLLECT' ? 'UNKNOWN' : 'ALLOW' : 'NOT_APPLICABLE',
    evidence_refs:[`evidence:${sourceId}:${type}`],
    facts:{source_id:sourceId,assertion_type:type,observed:true},
  }]));
}

async function discoveryRequest(processors, sourceId, holdRights = false) {
  const canonicalHost = `${sourceId}.example`;
  const canonicalHostDigest = createHash('sha256').update(canonicalHost).digest('hex');
  const canonicalHostHash = `sha256:${canonicalHostDigest}`;
  const payload = {
    source_id:sourceId,
    discovery_seed:{
      source_id:sourceId,
      canonical_site_id:`site-${canonicalHostDigest.slice(0,32)}`,
      canonical_host:canonicalHost,
      seed_ref:`frontier:${sourceId}`,
      discovery_rights_state:'ALLOW',
    },
    assertion_inputs:assertionInputs(sourceId,holdRights),
  };
  const payloadHash = await processors.sha256Ref(payload);
  return {
    event_id:`request-${sourceId}`,
    event_type:'SOURCE_DISCOVERY_REQUESTED',
    event_version:'1.0.0',
    occurred_at:eventAt,
    observed_at:eventAt,
    producer_engine:'GLOBAL_SOURCE_FRONTIER_SCHEDULER',
    producer_version:'shadow-e2e-1.0.0',
    correlation_id:`correlation-${sourceId}`,
    causation_id:null,
    idempotency_key:`request:${sourceId}:v1`,
    partition:{
      channel:'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',
      region:'GLOBAL',
      language:'en',
      scope_id:`scope-${sourceId}`,
      source_role:'SOLD_TRANSACTION',
      canonical_host_hash:canonicalHostHash,
    },
    input_snapshot_ref:`snapshot:${sourceId}:v1`,
    payload_hash:payloadHash,
    rights_state:'ALLOW',
    freshness_state:'CURRENT',
    assertion_purpose:'BOUNDED_SHADOW_ACQUISITION',
    decision:'PASS',
    reason_codes:[],
    trace_refs:[`frontier:${sourceId}`],
    payload,
  };
}

let testCount = 0;
function test(name, body) {
  body();
  testCount += 1;
  process.stdout.write(`ok ${testCount} - ${name}\n`);
}

compileRuntimeModules();
const runtime = await import(pathToFileURL(resolve(compiledRoot,'runtime.mjs')).href);
const eventModel = await import(pathToFileURL(resolve(compiledRoot,'event.mjs')).href);
const registry = await import(pathToFileURL(resolve(compiledRoot,'registry.mjs')).href);
const processors = await import(pathToFileURL(resolve(compiledRoot,'processors.mjs')).href);
const bootstrapCompiler = await import(pathToFileURL(resolve(
  repositoryRoot,'scripts','kidults','source-intelligence','compile-global-pool-r1-bootstrap-capture-v1.mjs',
)).href);
const db = new MemoryD1Database();
const mesh = new DeterministicQueueMesh();
const env = {DB:db};
for (const fleet of registry.ASI_FLEETS) env[fleet.binding] = mesh.binding(fleet.queue);
mesh.env = env;

const originalFetch = globalThis.fetch;
let networkAttempts = 0;
globalThis.fetch = async () => {
  networkAttempts += 1;
  throw new Error('ASI_E2E_EXTERNAL_NETWORK_FORBIDDEN');
};

try {
  test('isolated physical Queue namespaces resolve to the same logical fleet', () => {
    const canonical = registry.ASI_FLEETS[0];
    for (const namespace of ['shadow','dev','staging']) {
      const physicalQueue = canonical.queue.replace('kidults-asi-shadow-',`kidults-asi-${namespace}-`);
      assert.equal(registry.asiFleetForQueue(physicalQueue)?.id,canonical.id);
      assert.equal(registry.asiQueueNamesEquivalent(canonical.queue,physicalQueue),true);
    }
    assert.equal(registry.asiFleetForQueue('kidults-asi-production-discovery-common-crawl-wdc'),undefined);
    assert.equal(registry.asiQueueNamesEquivalent(
      'kidults-asi-dev-discovery-common-crawl-wdc',
      'kidults-asi-dev-discovery-wikidata',
    ),false);
    assert.equal(registry.isAsiDeadLetterQueue('kidults-asi-dev-dead-letter'),true);
    assert.equal(registry.isAsiDeadLetterQueue('kidults-asi-production-dead-letter'),false);
  });

  test('partition tuple encoding prevents delimiter-based grain collisions', () => {
    const common = {
      channel:'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',
      scope_id:'scope-collision-test',
      source_role:'SOLD_TRANSACTION',
      canonical_host_hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };
    const left = eventModel.partitionKey({...common,region:'A|B',language:'C'});
    const right = eventModel.partitionKey({...common,region:'A',language:'B|C'});
    assert.notEqual(left,right);
    assert.match(left,/^partition:v1:/);
    assert.match(right,/^partition:v1:/);
  });

  const passRequest = await discoveryRequest(processors,'source-pass',false);
  const passEnqueue = await runtime.enqueueAsiEvent(env,passRequest);
  test('discovery request is durably dispatched to exactly one channel fleet', () => {
    assert.equal(passEnqueue.state,'DISPATCHED');
    assert.deepEqual(passEnqueue.fleets,['DISCOVERY_WIKIDATA']);
    assert.equal(mesh.pending.length,1);
  });

  const discoveryCoverage = [{
    channel:'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',
    fleetId:'DISCOVERY_WIKIDATA',
    request:passRequest,
    enqueue:passEnqueue,
  }];
  for (const [channel,fleetId] of discoveryRoutes) {
    if (fleetId === 'DISCOVERY_WIKIDATA') continue;
    const sourceId = `route-${fleetId.toLowerCase().replaceAll('_','-')}`;
    const request = await discoveryRequest(processors,sourceId,false);
    request.partition.channel = channel;
    const enqueue = await runtime.enqueueAsiEvent(env,request);
    discoveryCoverage.push({channel,fleetId,request,enqueue});
  }
  test('all 12 discovery channels are durably routed through outbox to independent Queues', () => {
    assert.equal(discoveryCoverage.length,12);
    for (const item of discoveryCoverage) {
      assert.equal(item.enqueue.state,'DISPATCHED');
      assert.deepEqual(item.enqueue.fleets,[item.fleetId]);
      const outbox = queryOne(db,`
        SELECT engine_fleet,queue_name,status FROM asi_outbox WHERE event_id=?
      `,item.request.event_id);
      assert.equal(outbox.engine_fleet,item.fleetId);
      assert.equal(outbox.status,'DISPATCHED');
      assert.equal(outbox.queue_name,registry.ASI_FLEET_BY_ID.get(item.fleetId).queue);
    }
    assert.equal(mesh.pending.length,12);
  });

  const denyEnvelopeAllowSeed = await discoveryRequest(processors,'adversarial-envelope-deny',false);
  denyEnvelopeAllowSeed.rights_state = 'DENY';
  const denyEnvelopeResult = await processors.processAsiFleet({
    fleet_id:'DISCOVERY_WIKIDATA',
    event:denyEnvelopeAllowSeed,
  });
  test('discovery seed ALLOW cannot override envelope DENY', () => {
    assert.equal(denyEnvelopeAllowSeed.payload.discovery_seed.discovery_rights_state,'ALLOW');
    assert.equal(denyEnvelopeResult.output_event.decision,'REJECT');
    assert.equal(denyEnvelopeResult.output_event.rights_state,'DENY');
    assert.ok(denyEnvelopeResult.output_event.reason_codes.includes('DISCOVERY_ENVELOPE_RIGHTS_DENIED'));
  });

  const rejectEnvelopeAllowSeed = await discoveryRequest(processors,'adversarial-envelope-reject',false);
  rejectEnvelopeAllowSeed.decision = 'REJECT';
  const rejectEnvelopeResult = await processors.processAsiFleet({
    fleet_id:'DISCOVERY_WIKIDATA',
    event:rejectEnvelopeAllowSeed,
  });
  test('discovery seed ALLOW cannot override envelope REJECT', () => {
    assert.equal(rejectEnvelopeAllowSeed.payload.discovery_seed.discovery_rights_state,'ALLOW');
    assert.equal(rejectEnvelopeResult.output_event.decision,'REJECT');
    assert.equal(rejectEnvelopeResult.output_event.rights_state,'DENY');
    assert.ok(rejectEnvelopeResult.output_event.reason_codes.includes('DISCOVERY_ENVELOPE_DECISION_REJECTED'));
  });

  const allDiscoveryRouteProcessed = await mesh.drain(runtime);
  test('all 12 discovery Queues consume through D1 and complete independent 14-processor funnels', () => {
    assert.equal(allDiscoveryRouteProcessed,12 * 14);
    for (const item of discoveryCoverage) {
      const delivered = mesh.deliveries.filter((delivery) => delivery.correlation_id === item.request.correlation_id);
      assert.equal(delivered.length,14);
      assert.equal(delivered[0].fleet,item.fleetId);
      assert.ok(delivered.every((delivery) => delivery.state === 'ACK'));
      assert.equal(queryOne(db,`SELECT COUNT(*) AS n FROM asi_source_candidates WHERE source_id=?`,item.request.payload.source_id).n,1);
      const effective = queryOne(db,`
        SELECT effective_pool_state,effective_usable FROM asi_source_pool_effective WHERE source_id=?
      `,item.request.payload.source_id);
      assert.equal(effective.effective_pool_state,'QUALIFIED_INTERNAL_SHADOW');
      assert.equal(Number(effective.effective_usable),1);
    }
  });

  test('PASS path executes discovery + 4 classifiers + 7 qualifiers + 2 decisions', () => {
    const delivered = mesh.deliveries.filter((item) => item.correlation_id === passRequest.correlation_id);
    assert.equal(delivered.length,14);
    const stages = delivered.map((item) => registry.ASI_FLEET_BY_ID.get(item.fleet).stage);
    assert.deepEqual(stages,[
      'DISCOVERY',
      'CLASSIFICATION','CLASSIFICATION','CLASSIFICATION','CLASSIFICATION',
      'QUALIFICATION','QUALIFICATION','QUALIFICATION','QUALIFICATION','QUALIFICATION','QUALIFICATION','QUALIFICATION',
      'DECISION','DECISION',
    ]);
    assert.equal(new Set(delivered.map((item) => item.fleet)).size,14);
  });

  test('PASS path materializes local 4/4 and 7/7 READY fan-ins', () => {
    const fanIns = queryAll(db,`
      SELECT stage,required_fleet_count,satisfied_fleet_count,readiness_state
      FROM asi_processor_fan_in_readiness WHERE source_id=? ORDER BY stage
    `,'source-pass');
    assert.deepEqual(fanIns.map((item) => ({
      stage:item.stage,
      required:Number(item.required_fleet_count),
      satisfied:Number(item.satisfied_fleet_count),
      state:item.readiness_state,
    })),[
      {stage:'CLASSIFICATION',required:4,satisfied:4,state:'READY'},
      {stage:'QUALIFICATION',required:7,satisfied:7,state:'READY'},
    ]);
  });

  test('PASS admission is complete and source pool promotion is internal SHADOW only', () => {
    const admission = queryOne(db,`
      SELECT decision,rights_state,required_assertion_count,satisfied_assertion_count
      FROM asi_purpose_admissions WHERE source_id=?
    `,'source-pass');
    assert.deepEqual({
      decision:admission.decision,
      rights:admission.rights_state,
      required:Number(admission.required_assertion_count),
      satisfied:Number(admission.satisfied_assertion_count),
    },{decision:'PASS',rights:'ALLOW',required:9,satisfied:9});
    const pool = queryOne(db,`SELECT * FROM asi_source_pool_effective WHERE source_id=?`,'source-pass');
    assert.equal(pool.pool_state,'QUALIFIED_INTERNAL_SHADOW');
    assert.equal(pool.effective_pool_state,'QUALIFIED_INTERNAL_SHADOW');
    assert.equal(Number(pool.effective_usable),1);
    assert.equal(pool.acquisition_mode,'PLAN_ONLY');
    assert.equal(Number(pool.content_collection_authorized),0);
    assert.equal(Number(pool.market_claim_authorized),0);
    assert.equal(Number(pool.commercial_projection_authorized),0);
    assert.equal(Number(pool.production_eligible),0);
    assert.equal(pool.production_state,'HOLD');
  });

  test('event lineage contains every materialized stage and both decision outputs', () => {
    const counts = Object.fromEntries(queryAll(db,`
      SELECT event_type,COUNT(*) AS n FROM asi_event_log WHERE correlation_id=? GROUP BY event_type
    `,passRequest.correlation_id).map((item) => [item.event_type,Number(item.n)]));
    assert.deepEqual(counts,{
      ACQUISITION_PLANNED:1,
      SOURCE_CLASSIFICATION_ASSERTED:4,
      SOURCE_DISCOVERED:1,
      SOURCE_DISCOVERY_REQUESTED:1,
      SOURCE_IDENTIFIED:1,
      SOURCE_POOL_DECIDED:1,
      SOURCE_PURPOSE_ADMISSION_DECIDED:1,
      SOURCE_QUALIFICATION_ASSERTED:7,
    });
    const decisionPayloads = queryAll(db,`
      SELECT event_type,payload_json FROM asi_event_log
      WHERE correlation_id=? AND event_type IN ('ACQUISITION_PLANNED','SOURCE_POOL_DECIDED')
    `,passRequest.correlation_id).map((item) => ({type:item.event_type,payload:JSON.parse(item.payload_json)}));
    for (const item of decisionPayloads) {
      assert.equal(item.payload.public_projection_authorized,false);
      assert.equal(item.payload.production_authorized,false);
      assert.equal(item.type === 'ACQUISITION_PLANNED'
        ? item.payload.external_collection_execution_authorized
        : item.payload.acquisition_execution_authorized,false);
    }
  });

  const beforeReplay = {
    events:count(db,'asi_event_log'),
    assertions:count(db,'asi_processor_assertions'),
    admissions:count(db,'asi_purpose_admissions'),
    pool:count(db,'asi_source_pool_decisions'),
    processed:count(db,'asi_processed_messages'),
  };
  const passDiscoveryDelivery = mesh.deliveries.find((item) =>
    item.correlation_id === passRequest.correlation_id && item.fleet === 'DISCOVERY_WIKIDATA');
  const replayMessage = await mesh.deliver(runtime,{queue:passDiscoveryDelivery.queue,body:passDiscoveryDelivery.task},'message-replay-pass');
  test('duplicate Queue delivery ACKs idempotently without new materialization', () => {
    assert.equal(replayMessage.state,'ACK');
    assert.deepEqual({
      events:count(db,'asi_event_log'),
      assertions:count(db,'asi_processor_assertions'),
      admissions:count(db,'asi_purpose_admissions'),
      pool:count(db,'asi_source_pool_decisions'),
      processed:count(db,'asi_processed_messages'),
    },beforeReplay);
  });

  const duplicateEnqueue = await runtime.enqueueAsiEvent(env,passRequest);
  test('duplicate ingress event/outbox is immutable and not redispatched', () => {
    assert.equal(duplicateEnqueue.state,'DISPATCHED');
    assert.equal(mesh.pending.length,0);
    assert.equal(count(db,'asi_event_log'),beforeReplay.events);
  });

  const forgedPayloadRequest = structuredClone(passRequest);
  forgedPayloadRequest.event_id = 'request-source-pass-forged-payload';
  forgedPayloadRequest.idempotency_key = 'request:source-pass:forged-payload';
  forgedPayloadRequest.payload.forged = true;
  let forgedPayloadError = null;
  try { await runtime.enqueueAsiEvent(env,forgedPayloadRequest); } catch (error) { forgedPayloadError = error; }
  test('declared payload SHA-256 is recomputed before event or outbox persistence', () => {
    assert.match(String(forgedPayloadError?.message),/ASI_EVENT_PAYLOAD_HASH_MISMATCH/);
    assert.equal(queryOne(db,`SELECT COUNT(*) AS n FROM asi_event_log WHERE event_id=?`,forgedPayloadRequest.event_id).n,0);
  });

  const beforeForgery = {
    events:count(db,'asi_event_log'),
    assertions:count(db,'asi_processor_assertions'),
    admissions:count(db,'asi_purpose_admissions'),
    pool:count(db,'asi_source_pool_decisions'),
  };
  const forgedTask = structuredClone(passDiscoveryDelivery.task);
  forgedTask.outbox_id = 'outbox_forged_without_provenance';
  const forgedMessage = await mesh.deliver(runtime,{queue:passDiscoveryDelivery.queue,body:forgedTask},'message-forged-pass');
  test('forged outbox provenance retries fail-closed and creates no processor output', () => {
    assert.equal(forgedMessage.state,'RETRY');
    assert.equal(forgedMessage.retryOptions.delaySeconds,15);
    assert.deepEqual({
      events:count(db,'asi_event_log'),
      assertions:count(db,'asi_processor_assertions'),
      admissions:count(db,'asi_purpose_admissions'),
      pool:count(db,'asi_source_pool_decisions'),
    },beforeForgery);
    const failure = queryOne(db,`
      SELECT status,last_error FROM asi_processed_messages WHERE outbox_id='outbox_forged_without_provenance'
    `);
    assert.equal(failure.status,'FAILED');
    assert.equal(failure.last_error,'ASI_QUEUE_TASK_OUTBOX_PROVENANCE_MISMATCH');
  });

  const holdRequest = await discoveryRequest(processors,'source-hold',true);
  await runtime.enqueueAsiEvent(env,holdRequest);
  const holdProcessed = await mesh.drain(runtime);
  test('UNKNOWN collection rights completes local work but keeps admission and pool on HOLD', () => {
    assert.equal(holdProcessed,14);
    const passQualification = queryOne(db,`
      SELECT readiness_state FROM asi_processor_fan_in_readiness
      WHERE source_id='source-pass' AND stage='QUALIFICATION'
    `);
    const holdQualification = queryOne(db,`
      SELECT readiness_state,unknown_rights_count FROM asi_processor_fan_in_readiness
      WHERE source_id='source-hold' AND stage='QUALIFICATION'
    `);
    assert.equal(passQualification.readiness_state,'READY');
    assert.equal(holdQualification.readiness_state,'HOLD');
    assert.equal(Number(holdQualification.unknown_rights_count),1);
    const admission = queryOne(db,`
      SELECT decision,rights_state,required_assertion_count,satisfied_assertion_count
      FROM asi_purpose_admissions WHERE source_id='source-hold'
    `);
    assert.equal(admission.decision,'HOLD');
    assert.equal(admission.rights_state,'UNKNOWN');
    assert.equal(Number(admission.required_assertion_count),9);
    assert.equal(Number(admission.satisfied_assertion_count),8);
    const pool = queryOne(db,`SELECT * FROM asi_source_pool_effective WHERE source_id='source-hold'`);
    assert.equal(pool.pool_state,'HOLD');
    assert.equal(pool.effective_pool_state,'HOLD');
    assert.equal(Number(pool.effective_usable),0);
    assert.equal(pool.acquisition_mode,'NONE');
    assert.equal(Number(pool.content_collection_authorized),0);
    assert.equal(Number(pool.market_claim_authorized),0);
    assert.equal(Number(pool.commercial_projection_authorized),0);
    assert.equal(Number(pool.production_eligible),0);
    assert.equal(pool.production_state,'HOLD');
  });

  test('fan-in and decisions stay partition-local across simultaneous PASS/HOLD sources', () => {
    const rows = queryAll(db,`
      SELECT source_id,stage,readiness_state FROM asi_processor_fan_in_readiness
      WHERE source_id IN ('source-pass','source-hold') ORDER BY source_id,stage
    `).map((item) => [item.source_id,item.stage,item.readiness_state]);
    assert.deepEqual(rows,[
      ['source-hold','CLASSIFICATION','READY'],
      ['source-hold','QUALIFICATION','HOLD'],
      ['source-pass','CLASSIFICATION','READY'],
      ['source-pass','QUALIFICATION','READY'],
    ]);
    assert.deepEqual(queryAll(db,`
      SELECT source_id,pool_state FROM asi_source_pool_current
      WHERE source_id IN ('source-pass','source-hold') ORDER BY source_id
    `).map((item) => [item.source_id,item.pool_state]),[
      ['source-hold','HOLD'],
      ['source-pass','QUALIFIED_INTERNAL_SHADOW'],
    ]);
  });

  const bootstrap = bootstrapCompiler.compileGlobalPoolR1BootstrapCapture(
    bootstrapCompiler.loadGlobalPoolR1BootstrapInputs(),
  );
  const bootstrapDb = new MemoryD1Database();
  const bootstrapMesh = new DeterministicQueueMesh();
  const bootstrapEnv = {DB:bootstrapDb};
  for (const fleet of registry.ASI_FLEETS) bootstrapEnv[fleet.binding] = bootstrapMesh.binding(fleet.queue);
  bootstrapMesh.env = bootstrapEnv;
  const bootstrapEventBaseline = count(bootstrapDb,'asi_event_log');
  const bootstrapOutboxBaseline = count(bootstrapDb,'asi_outbox');
  for (const event of bootstrap.queue_seed_events) await runtime.enqueueAsiEvent(bootstrapEnv,event);
  test('all real registered-endpoint bootstrap seeds enter the canonical discovery Queue without eligibility inflation', () => {
    assert.equal(bootstrap.queue_seed_events.length,264);
    assert.equal(count(bootstrapDb,'asi_event_log') - bootstrapEventBaseline,264);
    assert.equal(count(bootstrapDb,'asi_outbox') - bootstrapOutboxBaseline,264);
    assert.equal(bootstrapMesh.pending.length,264);
    assert.equal(queryOne(bootstrapDb,`SELECT COUNT(*) AS n FROM asi_outbox WHERE engine_fleet='DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER'`).n,264);
    assert.equal(count(bootstrapDb,'asi_source_candidates'),0);
    assert.equal(count(bootstrapDb,'asi_source_pool_decisions'),0);
  });
  bootstrapDb.close();

  const bootstrapSampleDb = new MemoryD1Database();
  const bootstrapSampleMesh = new DeterministicQueueMesh();
  const bootstrapSampleEnv = {DB:bootstrapSampleDb};
  for (const fleet of registry.ASI_FLEETS) bootstrapSampleEnv[fleet.binding] = bootstrapSampleMesh.binding(fleet.queue);
  bootstrapSampleMesh.env = bootstrapSampleEnv;
  const bootstrapSample = bootstrap.queue_seed_events[0];
  await runtime.enqueueAsiEvent(bootstrapSampleEnv,bootstrapSample);
  const bootstrapSampleProcessed = await bootstrapSampleMesh.drain(runtime);
  test('DISCOVERY_METADATA_INDEX bootstrap executes discovery + local 4+7 analysis and then stops fail-closed', () => {
    assert.equal(bootstrapSampleProcessed,12);
    assert.equal(queryOne(bootstrapSampleDb,`SELECT candidate_state,rights_state FROM asi_source_candidates`).candidate_state,'HOLD');
    assert.equal(queryOne(bootstrapSampleDb,`SELECT rights_state FROM asi_source_candidates`).rights_state,'UNKNOWN');
    assert.deepEqual(queryAll(bootstrapSampleDb,`SELECT stage,satisfied_fleet_count FROM asi_processor_fan_in_readiness ORDER BY stage`).map((row) => [row.stage,Number(row.satisfied_fleet_count)]),[
      ['CLASSIFICATION',4],['QUALIFICATION',7],
    ]);
    assert.equal(queryOne(bootstrapSampleDb,`SELECT COUNT(*) AS n FROM asi_purpose_admissions WHERE source_id=?`,bootstrapSample.payload.source_id).n,0);
    assert.equal(queryOne(bootstrapSampleDb,`SELECT COUNT(*) AS n FROM asi_source_pool_decisions WHERE source_id=?`,bootstrapSample.payload.source_id).n,0);
  });
  bootstrapSampleDb.close();

  test('all 25 processors are registered and exercised without a network call', () => {
    assert.equal(processors.asiProcessorInventory().length,25);
    const exercised = new Set([
      ...mesh.deliveries.filter((item) => item.state === 'ACK').map((item) => item.fleet),
    ]);
    assert.equal(exercised.size,25);
    assert.equal(queryOne(db,`SELECT COUNT(*) AS n FROM asi_engine_health`).n,25);
    assert.equal(queryOne(db,`SELECT SUM(processed_count) AS n FROM asi_engine_health`).n,13 * 14);
    assert.equal(networkAttempts,0);
    assert.deepEqual(queryAll(db,`PRAGMA foreign_key_check`),[]);
  });

  test('runtime task leases release cleanly and durable grains remain unique with no orphan rows', () => {
    assert.equal(queryOne(db,`
      SELECT COUNT(*) AS n FROM asi_task_leases
      WHERE released_at IS NULL AND datetime(expires_at)>datetime('now')
    `).n,0);
    assert.equal(queryOne(db,`
      SELECT COUNT(*) AS n FROM asi_task_leases
      WHERE released_at IS NULL AND datetime(expires_at)<=datetime('now')
    `).n,0);
    assert.equal(queryOne(db,`
      SELECT COUNT(*) AS n FROM (
        SELECT event_id,engine_fleet,queue_binding,COUNT(*) AS copies
        FROM asi_outbox GROUP BY event_id,engine_fleet,queue_binding HAVING COUNT(*)>1
      )
    `).n,0);
    assert.equal(queryOne(db,`
      SELECT COUNT(*) AS n FROM (
        SELECT replay_id,attempt_number,COUNT(*) AS copies
        FROM asi_replay_attempts GROUP BY replay_id,attempt_number HAVING COUNT(*)>1
      )
    `).n,0);
    assert.deepEqual(queryAll(db,`PRAGMA foreign_key_check`),[]);
  });

  process.stdout.write(JSON.stringify({
    status:'PASS',
    mode:'SHADOW',
    tests:testCount,
    processors_registered:processors.asiProcessorInventory().length,
    processors_exercised:25,
    processors_exercised_per_source:14,
    discovery_fleets_queue_d1_exercised:12,
    full_queue_d1_processor_deliveries:13 * 14,
    global_pool_bootstrap_seed_events:bootstrap.queue_seed_events.length,
    global_pool_bootstrap_sample_processors_exercised:bootstrapSampleProcessed,
    pass_pool_state:'QUALIFIED_INTERNAL_SHADOW',
    hold_pool_state:'HOLD',
    network_requests:networkAttempts,
    public_projection_authorized:false,
    production:'HOLD',
  })+'\n');
} finally {
  globalThis.fetch = originalFetch;
  db.close();
  rmSync(compiledRoot,{recursive:true,force:true});
}
