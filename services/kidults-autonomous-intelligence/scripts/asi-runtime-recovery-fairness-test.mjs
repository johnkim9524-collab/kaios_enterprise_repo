import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(serviceRoot, 'src', 'asi');
const migrationRoot = resolve(serviceRoot, 'migrations');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-asi-recovery-fairness-'));
const now = new Date();
const nowIso = now.toISOString();

function compileRuntimeModules() {
  for (const name of ['event','registry','processors','processor-runtime','runtime']) {
    const transpiled = ts.transpileModule(readFileSync(resolve(sourceRoot,`${name}.ts`),'utf8'),{
      fileName:`${name}.ts`,
      reportDiagnostics:true,
      compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022},
    });
    const errors = (transpiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(`ASI_RECOVERY_TEST_TRANSPILE_FAILED:${errors.map((item) => item.messageText).join('|')}`);
    writeFileSync(resolve(compiledRoot,`${name}.mjs`),transpiled.outputText.replace(
      /(from\s+['"]|import\s*\(\s*['"])(\.\/[a-z0-9-]+)(['"]\s*\)?)/gi,
      (_match,prefix,specifier,suffix) => `${prefix}${specifier}.mjs${suffix}`,
    ));
  }
}

class MemoryD1PreparedStatement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) { return new MemoryD1PreparedStatement(this.database,this.sql,params); }
  _run() {
    const result = this.database.sqlite.prepare(this.sql).run(...this.params);
    return {success:true,results:[],meta:{changes:Number(result.changes || 0),last_row_id:Number(result.lastInsertRowid || 0)}};
  }
  async run() { return this._run(); }
  async first(columnName) {
    const value = this.database.sqlite.prepare(this.sql).get(...this.params) ?? null;
    if (this.database.taskLeaseFenceReadsBeforeSteal > 0 &&
      this.sql.includes('SELECT 1 AS active FROM asi_task_leases') && value?.active) {
      this.database.taskLeaseFenceReadsBeforeSteal -= 1;
      if (this.database.taskLeaseFenceReadsBeforeSteal === 0) {
        this.database.sqlite.prepare(`
          UPDATE asi_task_leases SET lease_owner='replacement-task-owner',attempt_count=attempt_count+1,
            acquired_at=datetime('now'),expires_at=datetime('now','+1 hour')
          WHERE released_at IS NULL
        `).run();
      }
    }
    if (this.database.stealReplayLeaseAfterFenceRead && this.sql.includes('SELECT 1 AS active FROM asi_replay_requests') && value?.active) {
      this.database.stealReplayLeaseAfterFenceRead = false;
      this.database.sqlite.prepare(`
        UPDATE asi_replay_requests SET lease_owner='replacement-replay-owner',lease_expires_at=datetime('now','+1 hour')
        WHERE status='RUNNING'
      `).run();
    }
    return columnName && value ? value[columnName] : value;
  }
  async all() { return {success:true,results:this.database.sqlite.prepare(this.sql).all(...this.params),meta:{}}; }
  async raw(options = {}) {
    const statement = this.database.sqlite.prepare(this.sql);
    const columns = statement.columns().map((column) => column.name);
    const rows = statement.all(...this.params).map((row) => columns.map((column) => row[column]));
    return options.columnNames ? [columns,...rows] : rows;
  }
}

class MemoryD1Database {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys=ON;');
    for (const migration of [
      '0001_canonical_foundation.sql','0002_autonomous_orchestration.sql','0003_asi_market_funnel_shadow.sql',
      '0004_asi_processor_shadow.sql','0005_asi_runtime_recovery_fairness_shadow.sql',
      '0006_asi_task_lease_atomic_fencing_shadow.sql',
    ]) this.sqlite.exec(readFileSync(resolve(migrationRoot,migration),'utf8'));
    this.failNextBatch = false;
    this.taskLeaseFenceReadsBeforeSteal = 0;
    this.stealReplayLeaseAfterFenceRead = false;
    this.stealReplayLeaseAfterClaimBatch = false;
  }
  prepare(sql) { return new MemoryD1PreparedStatement(this,sql); }
  async batch(statements) {
    if (this.failNextBatch) {
      this.failNextBatch = false;
      throw new Error('ASI_TEST_INJECTED_D1_BATCH_FAILURE');
    }
    this.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const results = statements.map((statement) => statement._run());
      this.sqlite.exec('COMMIT;');
      if (this.stealReplayLeaseAfterClaimBatch && statements.some((statement) =>
        statement.sql.includes("UPDATE asi_replay_requests SET status='RUNNING'"))) {
        this.stealReplayLeaseAfterClaimBatch = false;
        this.sqlite.prepare(`
          UPDATE asi_replay_requests SET lease_owner='replacement-replay-owner',lease_expires_at=datetime('now','+1 hour')
          WHERE status='RUNNING'
        `).run();
      }
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK;');
      throw error;
    }
  }
  close() { this.sqlite.close(); }
}

class QueueMessage {
  constructor(id, body, attempts = 1) {
    this.id = id;
    this.body = structuredClone(body);
    this.timestamp = new Date();
    this.attempts = attempts;
    this.state = 'PENDING';
    this.retryOptions = null;
  }
  ack() { if (this.state === 'PENDING') this.state = 'ACK'; }
  retry(options = {}) {
    if (this.state === 'PENDING') {
      this.state = 'RETRY';
      this.retryOptions = options;
    }
  }
}

class QueueMesh {
  constructor() {
    this.sent = [];
    this.failedFleets = new Set();
    this.beforeSend = null;
  }
  binding(fleet) {
    return {
      send: async (body) => {
        if (this.beforeSend) await this.beforeSend(fleet,body);
        if (this.failedFleets.has(fleet.id)) throw new Error('ASI_TEST_QUEUE_SEND_FAILURE');
        this.sent.push({fleet:fleet.id,task:structuredClone(body)});
        return {metadata:{metrics:{backlogCount:0,backlogBytes:0}}};
      },
      sendBatch: async (items) => {
        for (const item of items) await this.binding(fleet).send(item.body);
        return {metadata:{metrics:{backlogCount:0,backlogBytes:0}}};
      },
    };
  }
}

const queryOne = (db, sql, ...params) => db.sqlite.prepare(sql).get(...params) ?? null;
const queryAll = (db, sql, ...params) => db.sqlite.prepare(sql).all(...params);

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

const legacyDb = new DatabaseSync(':memory:');
legacyDb.exec('PRAGMA foreign_keys=ON;');
for (const migration of [
  '0001_canonical_foundation.sql','0002_autonomous_orchestration.sql','0003_asi_market_funnel_shadow.sql',
  '0004_asi_processor_shadow.sql',
]) legacyDb.exec(readFileSync(resolve(migrationRoot,migration),'utf8'));
const legacyPartition = {
  channel:'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',region:'LEGACY-REGION',language:'en',scope_id:'legacy-scope',
  source_role:'SOLD_TRANSACTION',canonical_host_hash:`sha256:${'a'.repeat(64)}`,
};
const legacyPartitionKey = eventModel.partitionKey(legacyPartition);
legacyDb.prepare(`
  INSERT INTO asi_event_log (
    event_id,event_type,event_version,producer_engine,producer_version,correlation_id,causation_id,idempotency_key,
    partition_key,input_snapshot_ref,payload_hash,rights_state,freshness_state,assertion_purpose,decision,
    reason_codes_json,trace_refs_json,payload_json,occurred_at,observed_at,received_at
  ) VALUES ('legacy-event','SOURCE_DISCOVERY_REQUESTED','1.0.0','LEGACY_TEST','1.0.0','legacy-correlation',NULL,
    'legacy-idempotency',?,'legacy-snapshot',?,'UNKNOWN','CURRENT','DISCOVERY_METADATA_INDEX','HOLD','[]','[]','{}',?,?,?)
`).run(legacyPartitionKey,`sha256:${'b'.repeat(64)}`,nowIso,nowIso,nowIso);
legacyDb.prepare(`
  INSERT INTO asi_outbox (
    id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,created_at,updated_at
  ) VALUES ('legacy-outbox','legacy-event','DISCOVERY_WIKIDATA','ASI_DISCOVERY_WIKIDATA_QUEUE',
    'kidults-asi-shadow-discovery-wikidata','{}','PENDING',?,?)
`).run(nowIso,nowIso);
legacyDb.exec(readFileSync(resolve(migrationRoot,'0005_asi_runtime_recovery_fairness_shadow.sql'),'utf8'));
test('additive 0005 migration backfills the collision-safe fleet and market-cell fairness grain', () => {
  const migrated = legacyDb.prepare(`SELECT partition_key,fairness_key FROM asi_outbox WHERE id='legacy-outbox'`).get();
  assert.equal(migrated.partition_key,legacyPartitionKey);
  assert.equal(migrated.fairness_key,runtime.asiFairnessKey(legacyPartition,'DISCOVERY_WIKIDATA'));
  assert.deepEqual(legacyDb.prepare(`PRAGMA foreign_key_check`).all(),[]);
});
legacyDb.close();

const db = new MemoryD1Database();
const mesh = new QueueMesh();
const env = {DB:db};
for (const fleet of registry.ASI_FLEETS) env[fleet.binding] = mesh.binding(fleet);

function isolatedHarness() {
  const isolatedDb = new MemoryD1Database();
  const isolatedMesh = new QueueMesh();
  const isolatedEnv = {DB:isolatedDb};
  for (const fleet of registry.ASI_FLEETS) isolatedEnv[fleet.binding] = isolatedMesh.binding(fleet);
  return {db:isolatedDb,mesh:isolatedMesh,env:isolatedEnv};
}

async function seedOutbox(name, region, fleet, sequence, status = 'PENDING', targetDb = db, eventOverrides = {}) {
  const payload = eventOverrides.payload || {fixture:name,network_authorized:false,production_eligible:false};
  const payloadHash = await processors.sha256Ref(payload);
  const baseEvent = {
    event_id:`event-${name}`,
    event_type:'SOURCE_DISCOVERY_REQUESTED',
    event_version:'1.0.0',
    occurred_at:nowIso,
    observed_at:nowIso,
    producer_engine:'ASI_RUNTIME_RECOVERY_TEST',
    producer_version:'1.0.0',
    correlation_id:`correlation-${name}`,
    causation_id:null,
    idempotency_key:`idempotency-${name}`,
    partition:{
      channel:'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',region,language:'en',scope_id:`scope-${region}`,
      source_role:'SOLD_TRANSACTION',canonical_host_hash:`sha256:${String(sequence).padStart(64,'0')}`,
    },
    input_snapshot_ref:`snapshot-${name}`,
    payload_hash:payloadHash,
    rights_state:'UNKNOWN',
    freshness_state:'CURRENT',
    assertion_purpose:'DISCOVERY_METADATA_INDEX',
    decision:'HOLD',
    reason_codes:['SHADOW_TEST_ONLY'],
    trace_refs:[],
    payload,
  };
  const event = {
    ...baseEvent,
    ...eventOverrides,
    partition:{...baseEvent.partition,...(eventOverrides.partition || {})},
    payload,
    payload_hash:payloadHash,
  };
  const outboxId = `outbox-${name}`;
  const createdAt = new Date(now.getTime() - (1000 - sequence) * 1000).toISOString();
  const task = {
    transport_version:'1.0.0',outbox_id:outboxId,target_fleet:fleet.id,source_queue:fleet.queue,created_at:createdAt,event,
  };
  const key = eventModel.partitionKey(event.partition);
  const fairKey = runtime.asiFairnessKey(event.partition,fleet.id);
  targetDb.sqlite.prepare(`
    INSERT INTO asi_event_log (
      event_id,event_type,event_version,producer_engine,producer_version,correlation_id,causation_id,idempotency_key,
      partition_key,input_snapshot_ref,payload_hash,rights_state,freshness_state,assertion_purpose,decision,
      reason_codes_json,trace_refs_json,payload_json,occurred_at,observed_at,received_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    event.event_id,event.event_type,event.event_version,event.producer_engine,event.producer_version,event.correlation_id,
    event.causation_id,event.idempotency_key,key,event.input_snapshot_ref,event.payload_hash,event.rights_state,
    event.freshness_state,event.assertion_purpose,event.decision,JSON.stringify(event.reason_codes),
    JSON.stringify(event.trace_refs),JSON.stringify(event.payload),event.occurred_at,event.observed_at,createdAt,
  );
  targetDb.sqlite.prepare(`
    INSERT INTO asi_outbox (
      id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,attempt_count,
      partition_key,fairness_key,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,0,?,?,?,?)
  `).run(outboxId,event.event_id,fleet.id,fleet.binding,fleet.queue,JSON.stringify(task),status,key,fairKey,createdAt,createdAt);
  return {event,task,outboxId,key,fairKey};
}

const originalFetch = globalThis.fetch;
let networkAttempts = 0;
globalThis.fetch = async () => {
  networkAttempts += 1;
  throw new Error('ASI_RECOVERY_TEST_EXTERNAL_NETWORK_FORBIDDEN');
};

try {
  const fairFleet = registry.ASI_FLEET_BY_ID.get('DISCOVERY_WIKIDATA');
  const fairRows = [];
  let sequence = 1;
  for (const region of ['AFRICA','AMERICAS','ASIA']) {
    fairRows.push(await seedOutbox(`fair-${region}-1`,region,fairFleet,sequence++));
    fairRows.push(await seedOutbox(`fair-${region}-2`,region,fairFleet,sequence++));
  }
  const fairFirst = await runtime.relayPendingOutbox(env,3);
  test('fair relay selects one item from each of three source partitions before a second item', () => {
    assert.equal(fairFirst.selected,3);
    assert.equal(fairFirst.partitionsSelected,3);
    assert.equal(fairFirst.dispatched,3);
    assert.deepEqual([...new Set(mesh.sent.slice(0,3).map((item) => item.task.event.partition.region))].sort(),[
      'AFRICA','AMERICAS','ASIA',
    ]);
  });
  const fairSecond = await runtime.relayPendingOutbox(env,3);
  test('persistent fairness state advances all three partitions without starvation', () => {
    assert.equal(fairSecond.dispatched,3);
    assert.deepEqual(queryAll(db,`
      SELECT selection_count,dispatch_count FROM asi_relay_fairness ORDER BY fairness_key
    `).map((row) => [Number(row.selection_count),Number(row.dispatch_count)]),[[2,2],[2,2],[2,2]]);
  });

  const ageHarness = isolatedHarness();
  const ageOldOne = await seedOutbox('age-old-cell-1','AGE-OLD',fairFleet,1001,'PENDING',ageHarness.db);
  await seedOutbox('age-old-cell-2','AGE-OLD',fairFleet,1002,'PENDING',ageHarness.db);
  const ageFreshOne = await seedOutbox('age-fresh-cell-1','AGE-FRESH-1',fairFleet,1003,'PENDING',ageHarness.db);
  await seedOutbox('age-fresh-cell-2','AGE-FRESH-2',fairFleet,1004,'PENDING',ageHarness.db);
  ageHarness.db.sqlite.prepare(`UPDATE asi_outbox SET created_at=datetime('now','-3 hours') WHERE fairness_key=?`)
    .run(ageOldOne.fairKey);
  ageHarness.db.sqlite.prepare(`UPDATE asi_outbox SET created_at=datetime('now','-1 hour') WHERE id=?`)
    .run(ageFreshOne.outboxId);
  ageHarness.db.sqlite.prepare(`
    INSERT INTO asi_relay_fairness (
      fairness_key,last_partition_key,selection_count,dispatch_count,retry_count,dead_letter_count,hold_count,
      last_outbox_id,last_selected_at,updated_at
    ) VALUES (?,?,100,100,0,0,0,NULL,datetime('now','-2 hours'),datetime('now','-2 hours'))
  `).run(ageOldOne.fairKey,ageOldOne.key);
  const oldestAgeFirst = await runtime.relayPendingOutbox(ageHarness.env,1);
  test('oldest waiting market cell is not starved by continuous fresh keys or historic selection count', () => {
    assert.equal(oldestAgeFirst.dispatched,1);
    assert.equal(ageHarness.mesh.sent[0].task.event.partition.region,'AGE-OLD');
  });
  await seedOutbox('age-fresh-cell-3','AGE-FRESH-3',fairFleet,1005,'PENDING',ageHarness.db);
  const leastRecentlyServedNext = await runtime.relayPendingOutbox(ageHarness.env,1);
  test('least-recently-served clock rotates to the oldest unserved market cell after aged work is served', () => {
    assert.equal(leastRecentlyServedNext.dispatched,1);
    assert.equal(ageHarness.mesh.sent[1].task.event.partition.region,'AGE-FRESH-1');
  });
  ageHarness.db.close();

  const budget = queryOne(db,`
    SELECT * FROM asi_fleet_budgets WHERE engine_fleet=? AND datetime(window_ends_at)>datetime('now')
  `,fairFleet.id);
  db.sqlite.prepare(`UPDATE asi_fleet_budgets SET request_limit=request_used WHERE engine_fleet=? AND window_started_at=?`)
    .run(fairFleet.id,budget.window_started_at);
  const budgetRow = await seedOutbox('budget-hold','EUROPE',fairFleet,sequence++);
  const sendsBeforeBudget = mesh.sent.length;
  const budgetRelay = await runtime.relayPendingOutbox(env,1);
  test('per-fleet hourly request and zero-cost budget hold before Queue send', () => {
    assert.equal(budgetRelay.retry,1);
    assert.equal(mesh.sent.length,sendsBeforeBudget);
    const outbox = queryOne(db,`SELECT last_error,attempt_count,control_hold_count FROM asi_outbox WHERE id=?`,budgetRow.outboxId);
    assert.equal(outbox.last_error,'ASI_BUDGET_HOLD');
    assert.equal(Number(outbox.attempt_count),0);
    assert.equal(Number(outbox.control_hold_count),1);
    assert.equal(queryOne(db,`SELECT reason_code FROM asi_transport_control_holds WHERE outbox_id=?`,budgetRow.outboxId).reason_code,'ASI_BUDGET_HOLD');
    assert.equal(queryOne(db,`SELECT COUNT(*) AS n FROM asi_transport_attempts WHERE outbox_id=?`,budgetRow.outboxId).n,0);
    assert.equal(Number(queryOne(db,`SELECT cost_limit_microunits FROM asi_fleet_budgets WHERE engine_fleet=?`,fairFleet.id).cost_limit_microunits),0);
  });
  db.sqlite.prepare(`UPDATE asi_fleet_budgets SET request_limit=1000 WHERE engine_fleet=?`).run(fairFleet.id);

  const circuitRow = await seedOutbox('circuit-future-probe','EUROPE',fairFleet,sequence++);
  db.sqlite.prepare(`
    UPDATE asi_circuit_breakers SET state='OPEN',next_probe_at=datetime('now','+1 hour'),reason_code='ASI_TEST_OPEN'
    WHERE engine_fleet=?
  `).run(fairFleet.id);
  const sendsBeforeCircuit = mesh.sent.length;
  const circuitHold = await runtime.relayPendingOutbox(env,1);
  test('future circuit probe is not treated as active and produces an observable hold', () => {
    assert.equal(circuitHold.retry,1);
    assert.equal(mesh.sent.length,sendsBeforeCircuit);
    const heldOutbox = queryOne(db,`SELECT last_error,attempt_count FROM asi_outbox WHERE id=?`,circuitRow.outboxId);
    assert.equal(heldOutbox.last_error,'ASI_CIRCUIT_HOLD');
    assert.equal(Number(heldOutbox.attempt_count),0);
    assert.equal(queryOne(db,`SELECT state FROM asi_circuit_breakers WHERE engine_fleet=?`,fairFleet.id).state,'OPEN');
  });
  db.sqlite.prepare(`UPDATE asi_circuit_breakers SET next_probe_at=datetime('now','-1 minute') WHERE engine_fleet=?`).run(fairFleet.id);
  db.sqlite.prepare(`UPDATE asi_outbox SET next_attempt_at=NULL WHERE id=?`).run(circuitRow.outboxId);
  const halfOpenProbe = await runtime.relayPendingOutbox(env,1);
  test('due half-open probe is single-use and a successful send closes the circuit', () => {
    assert.equal(halfOpenProbe.dispatched,1);
    assert.equal(queryOne(db,`SELECT state FROM asi_circuit_breakers WHERE engine_fleet=?`,fairFleet.id).state,'CLOSED');
  });

  const probeHarness = isolatedHarness();
  const probeFleet = registry.ASI_FLEET_BY_ID.get('DISCOVERY_GOVERNMENT_REGIONAL_CATALOGS');
  await seedOutbox('probe-owner-fence','PROBE-FENCE',probeFleet,1501,'PENDING',probeHarness.db);
  probeHarness.db.sqlite.prepare(`
    INSERT INTO asi_circuit_breakers (
      engine_fleet,state,failure_count,opened_at,next_probe_at,reason_code,updated_at,
      consecutive_failure_count,success_count,opened_count
    ) VALUES (?,'OPEN',5,datetime('now','-10 minutes'),datetime('now','-1 minute'),'ASI_TEST_OPEN',datetime('now'),5,0,1)
  `).run(probeFleet.id);
  probeHarness.mesh.beforeSend = async (fleet) => {
    if (fleet.id !== probeFleet.id) return;
    probeHarness.db.sqlite.prepare(`
      UPDATE asi_circuit_breakers SET probe_lease_owner='replacement-probe-owner',
        probe_lease_expires_at=datetime('now','+1 hour') WHERE engine_fleet=? AND state='HALF_OPEN'
    `).run(probeFleet.id);
  };
  const fencedProbe = await runtime.relayPendingOutbox(probeHarness.env,1);
  test('stale half-open probe owner cannot close or count against a replacement probe owner', () => {
    assert.equal(fencedProbe.dispatched,1);
    const circuit = queryOne(probeHarness.db,`
      SELECT state,probe_lease_owner,success_count,failure_count FROM asi_circuit_breakers WHERE engine_fleet=?
    `,probeFleet.id);
    assert.equal(circuit.state,'HALF_OPEN');
    assert.equal(circuit.probe_lease_owner,'replacement-probe-owner');
    assert.equal(Number(circuit.success_count),0);
    assert.equal(Number(circuit.failure_count),5);
  });
  probeHarness.db.close();

  const failingFleet = registry.ASI_FLEET_BY_ID.get('DISCOVERY_OPENSTREETMAP');
  mesh.failedFleets.add(failingFleet.id);
  for (let index = 0; index < 5; index += 1) {
    await seedOutbox(`circuit-failure-${index}`,`FAIL-${index}`,failingFleet,sequence++);
  }
  const failureRelay = await runtime.relayPendingOutbox(env,5);
  test('five consecutive transport failures open the per-fleet circuit', () => {
    assert.equal(failureRelay.retry,5);
    const circuit = queryOne(db,`SELECT state,consecutive_failure_count,opened_count FROM asi_circuit_breakers WHERE engine_fleet=?`,failingFleet.id);
    assert.equal(circuit.state,'OPEN');
    assert.equal(Number(circuit.consecutive_failure_count),5);
    assert.equal(Number(circuit.opened_count),1);
  });
  const sixthFailure = await seedOutbox('circuit-sixth-held','FAIL-6',failingFleet,sequence++);
  const sendsBeforeSixth = mesh.sent.length;
  const sixthRelay = await runtime.relayPendingOutbox(env,1);
  test('open circuit blocks a sixth Queue send and records the control transition', () => {
    assert.equal(sixthRelay.retry,1);
    assert.equal(mesh.sent.length,sendsBeforeSixth);
    assert.equal(queryOne(db,`SELECT last_error FROM asi_outbox WHERE id=?`,sixthFailure.outboxId).last_error,'ASI_CIRCUIT_HOLD');
  });

  const holdHarness = isolatedHarness();
  const holdFleet = registry.ASI_FLEET_BY_ID.get('DISCOVERY_GITHUB_HOMEPAGE');
  const heldBeforeSend = await seedOutbox('five-controls-before-send','HOLD-CELL',holdFleet,2001,'PENDING',holdHarness.db);
  holdHarness.db.sqlite.prepare(`
    INSERT INTO asi_circuit_breakers (
      engine_fleet,state,failure_count,opened_at,next_probe_at,reason_code,updated_at,
      consecutive_failure_count,success_count,opened_count
    ) VALUES (?,'OPEN',0,datetime('now'),datetime('now','+1 hour'),'ASI_TEST_CONTROL_HOLD',datetime('now'),0,0,1)
  `).run(holdFleet.id);
  for (let holdIndex = 0; holdIndex < 5; holdIndex += 1) {
    const held = await runtime.relayPendingOutbox(holdHarness.env,1);
    assert.equal(held.retry,1);
    holdHarness.db.sqlite.prepare(`UPDATE asi_outbox SET next_attempt_at=NULL WHERE id=?`).run(heldBeforeSend.outboxId);
  }
  holdHarness.db.sqlite.prepare(`
    UPDATE asi_circuit_breakers SET state='CLOSED',next_probe_at=NULL,probe_lease_owner=NULL,probe_lease_expires_at=NULL
    WHERE engine_fleet=?
  `).run(holdFleet.id);
  holdHarness.mesh.failedFleets.add(holdFleet.id);
  const firstActualFailure = await runtime.relayPendingOutbox(holdHarness.env,1);
  test('five control holds do not consume send attempts and the first actual send failure remains RETRY attempt one', () => {
    assert.equal(firstActualFailure.retry,1);
    const outbox = queryOne(holdHarness.db,`
      SELECT status,attempt_count,control_hold_count FROM asi_outbox WHERE id=?
    `,heldBeforeSend.outboxId);
    assert.equal(outbox.status,'RETRY');
    assert.equal(Number(outbox.attempt_count),1);
    assert.equal(Number(outbox.control_hold_count),5);
    assert.equal(queryOne(holdHarness.db,`
      SELECT COUNT(*) AS n FROM asi_transport_control_holds WHERE outbox_id=?
    `,heldBeforeSend.outboxId).n,5);
    const actual = queryAll(holdHarness.db,`
      SELECT attempt_number,outcome FROM asi_transport_attempts WHERE outbox_id=?
    `,heldBeforeSend.outboxId);
    assert.deepEqual(actual.map((row) => [Number(row.attempt_number),row.outcome]),[[1,'RETRY']]);
  });
  holdHarness.db.close();

  const corruptHarness = isolatedHarness();
  const corruptFleet = registry.ASI_FLEET_BY_ID.get('DISCOVERY_DATACITE_OPEN_RESEARCH');
  const corrupt = await seedOutbox('corrupt-terminal-hold','CORRUPT',corruptFleet,2101,'PENDING',corruptHarness.db);
  const healthyPeer = await seedOutbox('corrupt-healthy-peer','HEALTHY',corruptFleet,2102,'PENDING',corruptHarness.db);
  corruptHarness.db.sqlite.prepare(`UPDATE asi_outbox SET payload_json='{"broken"' WHERE id=?`).run(corrupt.outboxId);
  const corruptRelay = await runtime.relayPendingOutbox(corruptHarness.env,2);
  test('corrupt outbox is terminal HOLD without circuit impact while a healthy peer dispatches', () => {
    assert.equal(corruptRelay.held,1);
    assert.equal(corruptRelay.dispatched,1);
    const corruptState = queryOne(corruptHarness.db,`
      SELECT status,attempt_count FROM asi_outbox WHERE id=?
    `,corrupt.outboxId);
    assert.equal(corruptState.status,'HOLD');
    assert.equal(Number(corruptState.attempt_count),0);
    assert.equal(queryOne(corruptHarness.db,`
      SELECT COUNT(*) AS n FROM asi_transport_attempts WHERE outbox_id=?
    `,corrupt.outboxId).n,0);
    const circuit = queryOne(corruptHarness.db,`
      SELECT failure_count,consecutive_failure_count FROM asi_circuit_breakers WHERE engine_fleet=?
    `,corruptFleet.id);
    assert.equal(Number(circuit.failure_count),0);
    assert.equal(Number(circuit.consecutive_failure_count),0);
    assert.equal(corruptHarness.mesh.sent.some((item) => item.task.outbox_id === healthyPeer.outboxId),true);
  });
  corruptHarness.db.close();

  const taskFenceHarness = isolatedHarness();
  const taskFenceFleet = registry.ASI_FLEET_BY_ID.get('DISCOVERY_INTERNET_ARCHIVE_CONTINUITY');
  const taskFenceCanonicalHost = 'task-lease-fence.example';
  const taskFenceCanonicalHostDigest = createHash('sha256').update(taskFenceCanonicalHost).digest('hex');
  const taskFenceTarget = await seedOutbox(
    'task-lease-fence','TASK-FENCE',taskFenceFleet,2201,'DISPATCHED',taskFenceHarness.db,
    {
      rights_state:'ALLOW',
      assertion_purpose:'BOUNDED_SHADOW_ACQUISITION',
      decision:'PASS',
      reason_codes:[],
      partition:{canonical_host_hash:`sha256:${taskFenceCanonicalHostDigest}`},
      payload:{
        source_id:'source-task-lease-fence',
        discovery_seed:{
          source_id:'source-task-lease-fence',
          canonical_site_id:`site-${taskFenceCanonicalHostDigest.slice(0,32)}`,
          canonical_host:taskFenceCanonicalHost,
          seed_ref:'frontier:task-lease-fence',
          discovery_rights_state:'ALLOW',
        },
      },
    },
  );
  const staleTaskMessage = new QueueMessage('stale-task-worker',taskFenceTarget.task,1);
  const taskFenceEventCountBefore = queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_event_log`).n;
  const taskFenceOutboxCountBefore = queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_outbox`).n;
  const taskFenceCandidateCountBefore = queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_source_candidates`).n;
  const taskFenceObservationCountBefore = queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_source_candidate_observations`).n;
  // Read one is the consumer's initial ownership check; read two precedes the
  // idempotent source-envelope persistence.  Read three is the final fenced DB
  // preflight immediately before the first new processor-output event/outbox
  // batch.  Steal after that SELECT returned active to reproduce the exact
  // check-then-batch TOCTOU interleaving (the former wrapper would commit it).
  taskFenceHarness.db.taskLeaseFenceReadsBeforeSteal = 3;
  await runtime.consumeAsiBatch({
    queue:taskFenceFleet.queue,messages:[staleTaskMessage],
    ackAll:() => staleTaskMessage.ack(),retryAll:(options) => staleTaskMessage.retry(options),
  },taskFenceHarness.env);
  test('stale task lease owner cannot mutate processor state after the final fence read before the output batch', () => {
    assert.equal(staleTaskMessage.state,'RETRY');
    assert.equal(taskFenceHarness.db.taskLeaseFenceReadsBeforeSteal,0);
    const lease = queryOne(taskFenceHarness.db,`
      SELECT lease_owner,released_at FROM asi_task_leases WHERE outbox_id=?
    `,taskFenceTarget.outboxId);
    assert.equal(lease.lease_owner,'replacement-task-owner');
    assert.equal(Number(queryOne(taskFenceHarness.db,`
      SELECT attempt_count FROM asi_task_leases WHERE outbox_id=?
    `,taskFenceTarget.outboxId).attempt_count),2);
    assert.equal(lease.released_at,null);
    assert.equal(queryOne(taskFenceHarness.db,`
      SELECT COUNT(*) AS n FROM asi_processed_messages WHERE outbox_id=?
    `,taskFenceTarget.outboxId).n,0);
    assert.equal(queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_queue_watermarks`).n,0);
    assert.equal(queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_engine_health`).n,0);
    assert.equal(queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_event_log`).n,taskFenceEventCountBefore);
    assert.equal(queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_outbox`).n,taskFenceOutboxCountBefore);
    assert.equal(queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_source_candidates`).n,taskFenceCandidateCountBefore);
    assert.equal(queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_source_candidate_observations`).n,taskFenceObservationCountBefore);
    assert.equal(queryOne(taskFenceHarness.db,`SELECT COUNT(*) AS n FROM asi_task_lease_write_fences`).n,0);
  });
  taskFenceHarness.db.close();

  const replayRollbackHarness = isolatedHarness();
  const replayRollbackFleet = registry.ASI_FLEET_BY_ID.get('DISCOVERY_OPTIONAL_LICENSED_GAP_FILL');
  const replayRollbackTarget = await seedOutbox(
    'replay-claim-rollback','REPLAY-ROLLBACK',replayRollbackFleet,2301,'DEAD_LETTERED',replayRollbackHarness.db,
  );
  replayRollbackHarness.db.sqlite.prepare(`
    INSERT INTO asi_replay_requests (
      replay_id,source_event_id,target_engine_fleet,requested_by,reason_code,status,requested_at
    ) VALUES ('replay-claim-rollback',?,?,'SHADOW_TEST','ATOMIC_CLAIM_TEST','PENDING',?)
  `).run(replayRollbackTarget.event.event_id,replayRollbackFleet.id,nowIso);
  replayRollbackHarness.db.sqlite.prepare(`
    INSERT INTO asi_replay_attempts (
      attempt_id,replay_id,outbox_id,attempt_number,state,reason_code,lease_owner,started_at
    ) VALUES ('preexisting-attempt','replay-claim-rollback',?,1,'CLAIMED','CONFLICT_FIXTURE','fixture-owner',?)
  `).run(replayRollbackTarget.outboxId,nowIso);
  let replayClaimError = null;
  try { await runtime.recoverPendingReplays(replayRollbackHarness.env,1); }
  catch (error) { replayClaimError = error; }
  test('replay claim and attempt insertion are atomic and roll back together on attempt conflict', () => {
    assert.match(String(replayClaimError),/UNIQUE constraint failed/);
    const replay = queryOne(replayRollbackHarness.db,`
      SELECT status,attempt_count,lease_owner FROM asi_replay_requests WHERE replay_id='replay-claim-rollback'
    `);
    assert.equal(replay.status,'PENDING');
    assert.equal(Number(replay.attempt_count),0);
    assert.equal(replay.lease_owner,null);
  });
  replayRollbackHarness.db.close();

  const replayFenceHarness = isolatedHarness();
  const replayFenceFleet = registry.ASI_FLEET_BY_ID.get('DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER');
  const replayFenceTarget = await seedOutbox(
    'replay-stale-worker','REPLAY-FENCE',replayFenceFleet,2401,'DEAD_LETTERED',replayFenceHarness.db,
  );
  replayFenceHarness.db.sqlite.prepare(`
    INSERT INTO asi_replay_requests (
      replay_id,source_event_id,target_engine_fleet,requested_by,reason_code,status,requested_at
    ) VALUES ('replay-stale-worker',?,?,'SHADOW_TEST','LEASE_FENCE_TEST','PENDING',?)
  `).run(replayFenceTarget.event.event_id,replayFenceFleet.id,nowIso);
  replayFenceHarness.db.stealReplayLeaseAfterFenceRead = true;
  const staleReplay = await runtime.recoverPendingReplays(replayFenceHarness.env,1);
  test('stale replay lease owner cannot reset outbox, send, transition, or count after ownership changes', () => {
    assert.equal(staleReplay.selected,1);
    assert.equal(staleReplay.skipped,1);
    const replay = queryOne(replayFenceHarness.db,`
      SELECT status,attempt_count,lease_owner FROM asi_replay_requests WHERE replay_id='replay-stale-worker'
    `);
    assert.equal(replay.status,'RUNNING');
    assert.equal(Number(replay.attempt_count),1);
    assert.equal(replay.lease_owner,'replacement-replay-owner');
    const outbox = queryOne(replayFenceHarness.db,`
      SELECT status,attempt_count FROM asi_outbox WHERE id=?
    `,replayFenceTarget.outboxId);
    assert.equal(outbox.status,'DEAD_LETTERED');
    assert.equal(Number(outbox.attempt_count),0);
    assert.equal(replayFenceHarness.mesh.sent.length,0);
    assert.equal(queryOne(replayFenceHarness.db,`
      SELECT state FROM asi_replay_attempts WHERE replay_id='replay-stale-worker'
    `).state,'CLAIMED');
  });
  replayFenceHarness.db.close();

  const terminalTarget = fairRows[0];
  const failedPersistMessage = new QueueMessage('dlq-terminal-1',terminalTarget.task,1);
  db.failNextBatch = true;
  await runtime.consumeAsiBatch({
    queue:'kidults-asi-shadow-dead-letter',messages:[failedPersistMessage],
    ackAll:() => failedPersistMessage.ack(),retryAll:(options) => failedPersistMessage.retry(options),
  },env);
  test('terminal DLQ persistence failure requests retry and never ACKs', () => {
    assert.equal(failedPersistMessage.state,'RETRY');
    assert.equal(queryOne(db,`SELECT COUNT(*) AS n FROM asi_terminal_dlq_receipts`).n,0);
  });
  const persistedMessage = new QueueMessage('dlq-terminal-1',terminalTarget.task,2);
  await runtime.consumeAsiBatch({
    queue:'kidults-asi-shadow-dead-letter',messages:[persistedMessage],
    ackAll:() => persistedMessage.ack(),retryAll:(options) => persistedMessage.retry(options),
  },env);
  const duplicateMessage = new QueueMessage('dlq-terminal-1',terminalTarget.task,3);
  await runtime.consumeAsiBatch({
    queue:'kidults-asi-shadow-dead-letter',messages:[duplicateMessage],
    ackAll:() => duplicateMessage.ack(),retryAll:(options) => duplicateMessage.retry(options),
  },env);
  test('terminal DLQ ACK follows D1 commit and duplicate delivery is receipt-idempotent', () => {
    assert.equal(persistedMessage.state,'ACK');
    assert.equal(duplicateMessage.state,'ACK');
    assert.equal(queryOne(db,`SELECT COUNT(*) AS n FROM asi_terminal_dlq_receipts`).n,1);
    assert.equal(queryOne(db,`SELECT COUNT(*) AS n FROM asi_dead_letters WHERE message_id='dlq-terminal-1'`).n,1);
    const receipt = queryOne(db,`SELECT ack_policy,ack_requested,loss_guarantee,operating_state FROM asi_terminal_dlq_receipts`);
    assert.equal(receipt.ack_policy,'ACK_AFTER_D1_PERSIST');
    assert.equal(Number(receipt.ack_requested),1);
    assert.equal(Number(receipt.loss_guarantee),0);
    assert.equal(receipt.operating_state,'HOLD');
    assert.equal(queryOne(db,`
      SELECT dead_letter_count FROM asi_engine_health WHERE engine_fleet=?
    `,fairFleet.id).dead_letter_count,1);
  });

  db.sqlite.prepare(`
    INSERT INTO asi_replay_requests (
      replay_id,source_event_id,target_engine_fleet,requested_by,reason_code,status,requested_at
    ) VALUES ('replay-terminal-1',?,?,'SHADOW_TEST','TERMINAL_DLQ_REVIEWED','PENDING',?)
  `).run(terminalTarget.event.event_id,fairFleet.id,nowIso);
  const replayDispatch = await runtime.recoverPendingReplays(env,10);
  test('explicit bounded replay claims a durable lease and redispatches the original idempotent outbox', () => {
    assert.equal(replayDispatch.dispatched,1);
    const replay = queryOne(db,`SELECT status,attempt_count,max_attempts,outbox_id,lease_owner FROM asi_replay_requests WHERE replay_id='replay-terminal-1'`);
    assert.equal(replay.status,'AWAITING_CONSUMER');
    assert.equal(Number(replay.attempt_count),1);
    assert.equal(Number(replay.max_attempts),2);
    assert.equal(replay.outbox_id,terminalTarget.outboxId);
    assert.equal(replay.lease_owner,null);
    assert.equal(queryOne(db,`SELECT COUNT(*) AS n FROM asi_replay_attempts WHERE replay_id='replay-terminal-1'`).n,1);
  });
  db.sqlite.prepare(`
    INSERT INTO asi_processed_messages (
      queue_name,outbox_id,message_id,event_id,status,attempt_count,first_seen_at,last_seen_at,completed_at
    ) VALUES (?,?,?,?, 'SUCCEEDED',1,?,?,?)
  `).run(fairFleet.queue,terminalTarget.outboxId,'replay-consumer-success',terminalTarget.event.event_id,nowIso,nowIso,nowIso);
  const replayCompletion = await runtime.recoverPendingReplays(env,10);
  test('consumer success resolves replay and terminal HOLD without deleting immutable evidence', () => {
    assert.equal(replayCompletion.completed,1);
    assert.equal(queryOne(db,`SELECT status FROM asi_replay_requests WHERE replay_id='replay-terminal-1'`).status,'COMPLETED');
    assert.equal(queryOne(db,`SELECT operating_state FROM asi_terminal_dlq_receipts WHERE message_id='dlq-terminal-1'`).operating_state,'REPLAYED');
    assert.notEqual(queryOne(db,`SELECT replayed_at FROM asi_dead_letters WHERE message_id='dlq-terminal-1'`).replayed_at,null);
  });

  db.sqlite.prepare(`
    INSERT INTO asi_replay_requests (
      replay_id,source_event_id,target_engine_fleet,requested_by,reason_code,status,requested_at,
      lease_owner,lease_expires_at,attempt_count,max_attempts
    ) VALUES ('replay-active-lease',?,?,'SHADOW_TEST','LEASE_TEST','RUNNING',?,
      'active-owner',datetime('now','+1 hour'),0,2)
  `).run(terminalTarget.event.event_id,'DISCOVERY_GITHUB_HOMEPAGE',nowIso);
  const activeLeaseCycle = await runtime.recoverPendingReplays(env,10);
  test('unexpired replay lease is not stolen', () => {
    assert.equal(activeLeaseCycle.selected,0);
    assert.equal(queryOne(db,`SELECT lease_owner FROM asi_replay_requests WHERE replay_id='replay-active-lease'`).lease_owner,'active-owner');
  });
  db.sqlite.prepare(`UPDATE asi_replay_requests SET lease_expires_at=datetime('now','-1 minute') WHERE replay_id='replay-active-lease'`).run();
  const expiredLeaseCycle = await runtime.recoverPendingReplays(env,10);
  test('expired replay lease is reclaimed once and fails closed when its target outbox is absent', () => {
    assert.equal(expiredLeaseCycle.selected,1);
    assert.equal(expiredLeaseCycle.hold,1);
    const replay = queryOne(db,`SELECT status,attempt_count,terminal_reason,lease_owner FROM asi_replay_requests WHERE replay_id='replay-active-lease'`);
    assert.equal(replay.status,'HOLD');
    assert.equal(Number(replay.attempt_count),1);
    assert.equal(replay.terminal_reason,'ASI_REPLAY_SOURCE_OUTBOX_MISSING_OR_DRIFTED');
    assert.equal(replay.lease_owner,null);
  });

  const telemetry = await runtime.asiMeshTelemetry(env);
  test('operating telemetry is explicit about SHADOW, non-deployment and no no-loss guarantee', () => {
    assert.equal(telemetry.mode,'SHADOW');
    assert.equal(telemetry.deployed,false);
    assert.equal(telemetry.remote_resources_verified,false);
    assert.equal(telemetry.terminal_dlq.loss_guarantee,false);
    assert.equal(telemetry.fleet_health_dead_letter_count_basis,'DERIVED_FROM_IDEMPOTENT_TERMINAL_D1_RECEIPTS_BY_SOURCE_QUEUE');
    assert.equal(telemetry.fleet_health.find((row) => row.engine_fleet === fairFleet.id).dead_letter_count,1);
    assert.equal(telemetry.fair_relay_policy.decision_value_optimization,'NOT_IMPLEMENTED');
    assert.equal(telemetry.fair_relay_policy.coverage_gap_optimization,'NOT_IMPLEMENTED');
    assert.equal(telemetry.production,'HOLD');
    assert.equal(networkAttempts,0);
  });

  test('data quality has unique replay/outbox grains and no orphan foreign-key rows', () => {
    assert.equal(queryOne(db,`
      SELECT COUNT(*) AS n FROM (
        SELECT event_id,engine_fleet,queue_binding,COUNT(*) AS copies FROM asi_outbox
        GROUP BY event_id,engine_fleet,queue_binding HAVING COUNT(*)>1
      )
    `).n,0);
    assert.equal(queryOne(db,`
      SELECT COUNT(*) AS n FROM (
        SELECT replay_id,attempt_number,COUNT(*) AS copies FROM asi_replay_attempts
        GROUP BY replay_id,attempt_number HAVING COUNT(*)>1
      )
    `).n,0);
    assert.throws(() => db.sqlite.prepare(`
      INSERT INTO asi_replay_requests (
        replay_id,source_event_id,target_engine_fleet,requested_by,reason_code,status,requested_at,max_attempts
      ) VALUES ('replay-unbounded-forbidden',?,'DISCOVERY_WIKIDATA','SHADOW_TEST','BOUNDS_TEST','PENDING',?,3)
    `).run(terminalTarget.event.event_id,nowIso),/ASI_REPLAY_BOUNDS_INVALID/);
    assert.deepEqual(queryAll(db,`PRAGMA foreign_key_check`),[]);
  });

  process.stdout.write(JSON.stringify({
    status:'PASS',mode:'SHADOW',tests:testCount,fair_partitions:3,replay_max_attempts:2,
    terminal_ack_policy:'ACK_AFTER_D1_PERSIST',loss_guarantee:false,network_requests:networkAttempts,
    remote_resources_verified:false,deployed:false,public_projection_authorized:false,production:'HOLD',
  })+'\n');
} finally {
  globalThis.fetch = originalFetch;
  db.close();
  rmSync(compiledRoot,{recursive:true,force:true});
}
