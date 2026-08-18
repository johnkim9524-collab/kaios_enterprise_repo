import { partitionKey, validateAsiEvent, type AsiEventEnvelope } from './event';
import {
  ASI_FLEET_BY_ID,
  ASI_FLEET_BY_QUEUE,
  ASI_FLEETS,
  targetFleetsFor,
  type AsiFleet,
  type AsiFleetId,
  type AsiQueueBinding,
} from './registry';

export interface AsiQueueTask {
  transport_version: '1.0.0';
  outbox_id: string;
  target_fleet: AsiFleetId;
  source_queue: string;
  created_at: string;
  event: AsiEventEnvelope;
}

export type AsiMeshEnv = Pick<Cloudflare.Env, 'DB'> & {
  [Binding in AsiQueueBinding]: Queue<AsiQueueTask>;
};

export type AsiEnqueueState =
  | 'DISPATCHED'
  | 'QUEUED_FOR_RELAY'
  | 'TRANSPORT_HOLD'
  | 'PARKED_NO_ENGINE_PROCESSOR';

export interface AsiEnqueueResult {
  eventId: string;
  state: AsiEnqueueState;
  fleets: string[];
  queues: string[];
}

type StoredEvent = {
  event_type:string;event_version:string;producer_engine:string;producer_version:string;correlation_id:string;causation_id:string|null;
  idempotency_key:string;partition_key:string;input_snapshot_ref:string;payload_hash:string;rights_state:string;freshness_state:string;
  assertion_purpose:string|null;decision:string|null;reason_codes_json:string;trace_refs_json:string;payload_json:string;
  occurred_at:string;observed_at:string;
};

type OutboxRow = {
  id:string;
  event_id:string;
  engine_fleet:string;
  queue_binding:string;
  queue_name:string;
  payload_json:string;
  status:string;
  attempt_count:number;
  next_attempt_at:string|null;
  lease_owner:string|null;
  lease_expires_at:string|null;
};

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const safeJson = (value: unknown) => JSON.stringify(value) ?? 'null';
const ASI_DEAD_LETTER_QUEUE_NAME = 'kidults-asi-shadow-dead-letter';
const ASI_QUEUE_TASK_MAX_BYTES = 120 * 1024;
const OUTBOX_LEASE_SECONDS = 120;
const OUTBOX_MAX_ATTEMPTS = 5;

function expectedStoredEvent(event: AsiEventEnvelope): StoredEvent {
  return {
    event_type:event.event_type,event_version:event.event_version,producer_engine:event.producer_engine,
    producer_version:event.producer_version,correlation_id:event.correlation_id,causation_id:event.causation_id,
    idempotency_key:event.idempotency_key,partition_key:partitionKey(event.partition),input_snapshot_ref:event.input_snapshot_ref,
    payload_hash:event.payload_hash,rights_state:event.rights_state,freshness_state:event.freshness_state,
    assertion_purpose:event.assertion_purpose,decision:event.decision,reason_codes_json:JSON.stringify(event.reason_codes),
    trace_refs_json:JSON.stringify(event.trace_refs),payload_json:JSON.stringify(event.payload),occurred_at:event.occurred_at,
    observed_at:event.observed_at,
  };
}

function storedEventMatches(existing: StoredEvent | null, event: AsiEventEnvelope): boolean {
  if (!existing) return false;
  return !Object.entries(expectedStoredEvent(event)).some(([key,value]) => existing[key as keyof StoredEvent] !== value);
}

function storedEventValues(event: AsiEventEnvelope): Array<string | null> {
  const expected = expectedStoredEvent(event);
  return [
    expected.event_type,expected.event_version,expected.producer_engine,expected.producer_version,
    expected.correlation_id,expected.causation_id,expected.idempotency_key,expected.partition_key,
    expected.input_snapshot_ref,expected.payload_hash,expected.rights_state,expected.freshness_state,
    expected.assertion_purpose,expected.decision,expected.reason_codes_json,expected.trace_refs_json,
    expected.payload_json,expected.occurred_at,expected.observed_at,
  ];
}

async function loadStoredEvent(env: AsiMeshEnv, eventId: string): Promise<StoredEvent | null> {
  return env.DB.prepare(`
    SELECT event_type,event_version,producer_engine,producer_version,correlation_id,causation_id,idempotency_key,
      partition_key,input_snapshot_ref,payload_hash,rights_state,freshness_state,assertion_purpose,decision,
      reason_codes_json,trace_refs_json,payload_json,occurred_at,observed_at
    FROM asi_event_log WHERE event_id=?
  `).bind(eventId).first<StoredEvent>();
}

function eventInsert(env: AsiMeshEnv, event: AsiEventEnvelope): D1PreparedStatement {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO asi_event_log (
      event_id,event_type,event_version,producer_engine,producer_version,correlation_id,causation_id,idempotency_key,
      partition_key,input_snapshot_ref,payload_hash,rights_state,freshness_state,assertion_purpose,decision,
      reason_codes_json,trace_refs_json,payload_json,occurred_at,observed_at,received_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    event.event_id,event.event_type,event.event_version,event.producer_engine,event.producer_version,event.correlation_id,
    event.causation_id,event.idempotency_key,partitionKey(event.partition),event.input_snapshot_ref,event.payload_hash,
    event.rights_state,event.freshness_state,event.assertion_purpose,event.decision,JSON.stringify(event.reason_codes),
    JSON.stringify(event.trace_refs),JSON.stringify(event.payload),event.occurred_at,event.observed_at,nowIso(),
  );
}

function buildQueueTask(event: AsiEventEnvelope, fleet: AsiFleet, createdAt: string): { task:AsiQueueTask; serialized:string } {
  const task: AsiQueueTask = {
    transport_version:'1.0.0',
    outbox_id:`outbox_${event.event_id}_${fleet.id}`,
    target_fleet:fleet.id,
    source_queue:fleet.queue,
    created_at:createdAt,
    event,
  };
  const serialized = JSON.stringify(task);
  if (new TextEncoder().encode(serialized).byteLength > ASI_QUEUE_TASK_MAX_BYTES) {
    throw new Error('ASI_QUEUE_TASK_EXCEEDS_120_KIB_LIMIT');
  }
  return {task,serialized};
}

function validateQueueTask(value: unknown): AsiQueueTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ASI_QUEUE_TASK_NOT_OBJECT');
  const task = value as Partial<AsiQueueTask>;
  if (task.transport_version !== '1.0.0' || typeof task.outbox_id !== 'string' || !task.outbox_id) throw new Error('ASI_QUEUE_TASK_LINEAGE_INVALID');
  if (typeof task.target_fleet !== 'string' || !ASI_FLEET_BY_ID.has(task.target_fleet as AsiFleetId)) throw new Error('ASI_QUEUE_TASK_FLEET_INVALID');
  if (typeof task.source_queue !== 'string' || !task.source_queue) throw new Error('ASI_QUEUE_TASK_SOURCE_QUEUE_INVALID');
  if (typeof task.created_at !== 'string' || !Number.isFinite(Date.parse(task.created_at))) throw new Error('ASI_QUEUE_TASK_TIME_INVALID');
  const event = validateAsiEvent(task.event);
  const normalized: AsiQueueTask = {...(task as AsiQueueTask),event};
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > ASI_QUEUE_TASK_MAX_BYTES) throw new Error('ASI_QUEUE_TASK_EXCEEDS_120_KIB_LIMIT');
  return normalized;
}

async function persistEventAndOutboxes(
  env: AsiMeshEnv,
  event: AsiEventEnvelope,
  fleets: AsiFleet[],
): Promise<void> {
  const createdAt = nowIso();
  const built = fleets.map((fleet) => ({fleet,...buildQueueTask(event,fleet,createdAt)}));
  const statements: D1PreparedStatement[] = [eventInsert(env,event)];
  for (const item of built) {
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO asi_outbox (
        id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,created_at,updated_at
      ) SELECT ?,?,?,?,?,?,'PENDING',?,?
      WHERE EXISTS (
        SELECT 1 FROM asi_event_log WHERE event_id=? AND event_type=? AND event_version=? AND producer_engine=?
          AND producer_version=? AND correlation_id=? AND causation_id IS ? AND idempotency_key=? AND partition_key=?
          AND input_snapshot_ref=? AND payload_hash=? AND rights_state=? AND freshness_state=? AND assertion_purpose IS ?
          AND decision IS ? AND reason_codes_json=? AND trace_refs_json=? AND payload_json=? AND occurred_at=? AND observed_at=?
      )
    `).bind(
      item.task.outbox_id,event.event_id,item.fleet.id,item.fleet.binding,item.fleet.queue,item.serialized,createdAt,createdAt,
      event.event_id,...storedEventValues(event),
    ));
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const existing = await loadStoredEvent(env,event.event_id);
    if (existing && !storedEventMatches(existing,event)) throw new Error('ASI_EVENT_ID_OR_IDEMPOTENCY_CONFLICT');
    const owner = await env.DB.prepare(`SELECT event_id FROM asi_event_log WHERE idempotency_key=?`).bind(event.idempotency_key).first<{event_id:string}>();
    if (owner && owner.event_id !== event.event_id) throw new Error('ASI_EVENT_ID_OR_IDEMPOTENCY_CONFLICT');
    throw error;
  }

  const existing = await loadStoredEvent(env,event.event_id);
  if (!storedEventMatches(existing,event)) throw new Error('ASI_EVENT_ID_OR_IDEMPOTENCY_CONFLICT');
}

async function loadOutbox(env: AsiMeshEnv, outboxId: string): Promise<OutboxRow | null> {
  return env.DB.prepare(`
    SELECT id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,attempt_count,next_attempt_at,lease_owner,lease_expires_at
    FROM asi_outbox WHERE id=?
  `).bind(outboxId).first<OutboxRow>();
}

async function claimOutbox(env: AsiMeshEnv, outboxId: string): Promise<{row:OutboxRow;leaseOwner:string} | null> {
  const leaseOwner = makeId('relay');
  const claimed = await env.DB.prepare(`
    UPDATE asi_outbox SET status='DISPATCHING',attempt_count=attempt_count+1,lease_owner=?,
      lease_expires_at=datetime('now',?),updated_at=?
    WHERE id=? AND (
      (status IN ('PENDING','RETRY') AND (next_attempt_at IS NULL OR next_attempt_at<=datetime('now')))
      OR (status='DISPATCHING' AND lease_expires_at<=datetime('now'))
    )
  `).bind(leaseOwner,`+${OUTBOX_LEASE_SECONDS} seconds`,nowIso(),outboxId).run();
  if (Number(claimed.meta.changes || 0) === 0) return null;
  const row = await loadOutbox(env,outboxId);
  return row ? {row,leaseOwner} : null;
}

async function deadLetterOutbox(env: AsiMeshEnv, row: OutboxRow, leaseOwner: string, message: string): Promise<void> {
  const recordedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_outbox SET status='DEAD_LETTERED',lease_owner=NULL,lease_expires_at=NULL,last_error=?,updated_at=?
      WHERE id=? AND lease_owner=?
    `).bind(message,recordedAt,row.id,leaseOwner),
    env.DB.prepare(`
      INSERT OR IGNORE INTO asi_dead_letters (
        id,queue_name,source_queue_name,source_queue_provenance_state,source_queue_candidates_json,
        message_id,event_id,attempts,error_code,error_message,payload_json,recorded_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(`dlq_outbox_${row.id}`,row.queue_name,row.queue_name,'RESOLVED_OUTBOX_TASK_ENVELOPE',JSON.stringify([row.queue_name]),
      row.id,row.event_id,row.attempt_count,'ASI_OUTBOX_DISPATCH_EXHAUSTED',message,row.payload_json,recordedAt),
  ]);
}

async function dispatchOutbox(env: AsiMeshEnv, outboxId: string): Promise<'DISPATCHED'|'SKIPPED'|'RETRY'|'DEAD_LETTERED'> {
  const existing = await loadOutbox(env,outboxId);
  if (!existing || existing.status === 'DISPATCHED') return 'SKIPPED';
  if (existing.status === 'DEAD_LETTERED' || existing.status === 'HOLD') return 'DEAD_LETTERED';
  const claim = await claimOutbox(env,outboxId);
  if (!claim) return 'SKIPPED';
  const {row,leaseOwner} = claim;
  try {
    const task = validateQueueTask(JSON.parse(row.payload_json));
    const fleet = ASI_FLEET_BY_ID.get(row.engine_fleet as AsiFleetId);
    if (!fleet || fleet.binding !== row.queue_binding || fleet.queue !== row.queue_name || task.outbox_id !== row.id ||
      task.target_fleet !== fleet.id || task.source_queue !== fleet.queue || task.event.event_id !== row.event_id) {
      throw new Error('ASI_OUTBOX_TASK_REGISTRY_DRIFT');
    }
    await env[fleet.binding].send(task,{contentType:'json'});
    await env.DB.prepare(`
      UPDATE asi_outbox SET status='DISPATCHED',dispatched_at=?,updated_at=?,next_attempt_at=NULL,
        lease_owner=NULL,lease_expires_at=NULL,last_error=NULL WHERE id=? AND lease_owner=?
    `).bind(nowIso(),nowIso(),row.id,leaseOwner).run();
    return 'DISPATCHED';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (row.attempt_count >= OUTBOX_MAX_ATTEMPTS) {
      await deadLetterOutbox(env,row,leaseOwner,message);
      return 'DEAD_LETTERED';
    }
    await env.DB.prepare(`
      UPDATE asi_outbox SET status='RETRY',next_attempt_at=datetime('now','+1 minute'),updated_at=?,last_error=?,
        lease_owner=NULL,lease_expires_at=NULL WHERE id=? AND lease_owner=?
    `).bind(nowIso(),message,row.id,leaseOwner).run();
    return 'RETRY';
  }
}

async function eventOutboxRows(env: AsiMeshEnv, eventId: string): Promise<OutboxRow[]> {
  const rows = await env.DB.prepare(`
    SELECT id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,attempt_count,next_attempt_at,lease_owner,lease_expires_at
    FROM asi_outbox WHERE event_id=? ORDER BY engine_fleet
  `).bind(eventId).all<OutboxRow>();
  return rows.results || [];
}

async function resumeEventOutboxes(env: AsiMeshEnv, eventId: string): Promise<OutboxRow[]> {
  const before = await eventOutboxRows(env,eventId);
  for (const row of before) {
    if (row.status !== 'DISPATCHED' && row.status !== 'DEAD_LETTERED' && row.status !== 'HOLD') await dispatchOutbox(env,row.id);
  }
  return eventOutboxRows(env,eventId);
}

export async function enqueueAsiEvent(env: AsiMeshEnv, rawEvent: unknown): Promise<AsiEnqueueResult> {
  const event = validateAsiEvent(rawEvent);
  const fleetIds = targetFleetsFor(event);
  const fleets = fleetIds.map((fleetId) => ASI_FLEET_BY_ID.get(fleetId));
  if (fleets.some((fleet) => !fleet)) throw new Error('ASI_TARGET_FLEET_REGISTRY_DRIFT');
  await persistEventAndOutboxes(env,event,fleets as AsiFleet[]);
  if (fleets.length === 0) return {eventId:event.event_id,state:'PARKED_NO_ENGINE_PROCESSOR',fleets:[],queues:[]};
  const rows = await resumeEventOutboxes(env,event.event_id);
  const state: AsiEnqueueState = rows.some((row) => row.status === 'DEAD_LETTERED' || row.status === 'HOLD')
    ? 'TRANSPORT_HOLD'
    : rows.every((row) => row.status === 'DISPATCHED') ? 'DISPATCHED' : 'QUEUED_FOR_RELAY';
  return {eventId:event.event_id,state,fleets:rows.map((row) => row.engine_fleet),queues:rows.map((row) => row.queue_name)};
}

export async function relayPendingOutbox(env: AsiMeshEnv, limit = 25): Promise<{selected:number;dispatched:number;retry:number;deadLettered:number}> {
  const candidates = await env.DB.prepare(`
    SELECT id FROM asi_outbox WHERE
      (status IN ('PENDING','RETRY') AND (next_attempt_at IS NULL OR next_attempt_at<=datetime('now')))
      OR (status='DISPATCHING' AND lease_expires_at<=datetime('now'))
    ORDER BY created_at,id LIMIT ?
  `).bind(Math.max(1,Math.min(100,limit))).all<{id:string}>();
  let dispatched = 0;
  let retry = 0;
  let deadLettered = 0;
  for (const candidate of candidates.results || []) {
    const result = await dispatchOutbox(env,candidate.id);
    if (result === 'DISPATCHED') dispatched += 1;
    else if (result === 'RETRY') retry += 1;
    else if (result === 'DEAD_LETTERED') deadLettered += 1;
  }
  return {selected:(candidates.results || []).length,dispatched,retry,deadLettered};
}

async function recordTransportReceipt(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  queueName: string,
  task: AsiQueueTask,
  messageId: string,
  attempts: number,
): Promise<void> {
  const token = makeId('receipt');
  const timestamp = nowIso();
  const key = partitionKey(task.event.partition);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO asi_processed_messages (
        queue_name,outbox_id,message_id,event_id,status,attempt_count,first_seen_at,last_seen_at,processing_token
      ) VALUES (?,?,?,?,'PROCESSING',?,?,?,?)
      ON CONFLICT(queue_name,outbox_id) DO UPDATE SET message_id=excluded.message_id,status='PROCESSING',
        attempt_count=MAX(asi_processed_messages.attempt_count,excluded.attempt_count),last_seen_at=excluded.last_seen_at,
        processing_token=excluded.processing_token,completed_at=NULL,last_error=NULL
      WHERE asi_processed_messages.status<>'SUCCEEDED'
    `).bind(queueName,task.outbox_id,messageId,task.event.event_id,attempts,timestamp,timestamp,token),
    env.DB.prepare(`
      INSERT INTO asi_queue_watermarks (queue_name,partition_key,last_event_id,last_observed_at,last_processed_at,processed_count,failed_count)
      SELECT ?,?,?,?,?,1,0 WHERE EXISTS (
        SELECT 1 FROM asi_processed_messages WHERE queue_name=? AND outbox_id=? AND processing_token=? AND status='PROCESSING'
      )
      ON CONFLICT(queue_name,partition_key) DO UPDATE SET
        last_event_id=CASE WHEN excluded.last_observed_at>=asi_queue_watermarks.last_observed_at THEN excluded.last_event_id ELSE asi_queue_watermarks.last_event_id END,
        last_observed_at=MAX(asi_queue_watermarks.last_observed_at,excluded.last_observed_at),last_processed_at=excluded.last_processed_at,
        processed_count=asi_queue_watermarks.processed_count+1
    `).bind(queueName,key,task.event.event_id,task.event.observed_at,timestamp,queueName,task.outbox_id,token),
    env.DB.prepare(`
      INSERT INTO asi_engine_health (
        engine_fleet,queue_name,state,processed_count,failed_count,retry_count,dead_letter_count,last_success_at,last_failure_at,updated_at
      ) SELECT ?,?,'TRANSPORT_RECEIPT_ONLY',1,0,0,0,?,NULL,? WHERE EXISTS (
        SELECT 1 FROM asi_processed_messages WHERE queue_name=? AND outbox_id=? AND processing_token=? AND status='PROCESSING'
      )
      ON CONFLICT(engine_fleet) DO UPDATE SET state='TRANSPORT_RECEIPT_ONLY',
        processed_count=asi_engine_health.processed_count+1,last_success_at=excluded.last_success_at,updated_at=excluded.updated_at
    `).bind(fleet.id,fleet.queue,timestamp,timestamp,queueName,task.outbox_id,token),
    env.DB.prepare(`
      UPDATE asi_processed_messages SET status='SUCCEEDED',completed_at=?,last_seen_at=?,processing_token=NULL,last_error=NULL
      WHERE queue_name=? AND outbox_id=? AND processing_token=?
    `).bind(timestamp,timestamp,queueName,task.outbox_id,token),
  ]);
}

async function recordTransportFailure(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  queueName: string,
  task: AsiQueueTask | null,
  messageId: string,
  attempts: number,
  error: string,
): Promise<void> {
  const timestamp = nowIso();
  const outboxId = task?.outbox_id || `invalid_${messageId}`;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT INTO asi_processed_messages (
        queue_name,outbox_id,message_id,event_id,status,attempt_count,first_seen_at,last_seen_at,processing_token,last_error
      ) VALUES (?,?,?,?,'FAILED',?,?,?,NULL,?)
      ON CONFLICT(queue_name,outbox_id) DO UPDATE SET status='FAILED',attempt_count=MAX(asi_processed_messages.attempt_count,excluded.attempt_count),
        last_seen_at=excluded.last_seen_at,processing_token=NULL,last_error=excluded.last_error
      WHERE asi_processed_messages.status<>'SUCCEEDED'
    `).bind(queueName,outboxId,messageId,task?.event.event_id || null,attempts,timestamp,timestamp,error),
    env.DB.prepare(`
      INSERT INTO asi_engine_health (
        engine_fleet,queue_name,state,processed_count,failed_count,retry_count,dead_letter_count,last_success_at,last_failure_at,updated_at
      ) VALUES (?,?,'TRANSPORT_RETRY',0,1,1,0,NULL,?,?)
      ON CONFLICT(engine_fleet) DO UPDATE SET state='TRANSPORT_RETRY',failed_count=asi_engine_health.failed_count+1,
        retry_count=asi_engine_health.retry_count+1,last_failure_at=excluded.last_failure_at,updated_at=excluded.updated_at
    `).bind(fleet.id,fleet.queue,timestamp,timestamp),
  ];
  if (task) {
    const key = partitionKey(task.event.partition);
    statements.push(env.DB.prepare(`
      INSERT INTO asi_queue_watermarks (queue_name,partition_key,last_event_id,last_observed_at,last_processed_at,processed_count,failed_count)
      VALUES (?,?,?,?,?,0,1)
      ON CONFLICT(queue_name,partition_key) DO UPDATE SET last_processed_at=excluded.last_processed_at,
        failed_count=asi_queue_watermarks.failed_count+1
    `).bind(queueName,key,task.event.event_id,task.event.observed_at,timestamp));
  }
  await env.DB.batch(statements);
}

async function consumeDeadLetterBatch(batch: MessageBatch<AsiQueueTask>, env: AsiMeshEnv): Promise<void> {
  for (const message of batch.messages) {
    try {
      let task: AsiQueueTask | null = null;
      try { task = validateQueueTask(message.body); } catch {}
      const recordedAt = nowIso();
      const sourceQueue = task?.source_queue || null;
      const statements: D1PreparedStatement[] = [env.DB.prepare(`
        INSERT OR IGNORE INTO asi_dead_letters (
          id,queue_name,source_queue_name,source_queue_provenance_state,source_queue_candidates_json,
          message_id,event_id,attempts,error_code,error_message,payload_json,recorded_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(`dlq_${message.id}`,batch.queue,sourceQueue,task ? 'RESOLVED_TASK_ENVELOPE' : 'UNRESOLVED_INVALID_TASK',
        JSON.stringify(sourceQueue ? [sourceQueue] : []),message.id,task?.event.event_id || null,message.attempts,
        task ? 'CLOUDFLARE_QUEUE_DLQ' : 'CLOUDFLARE_QUEUE_DLQ_TASK_INVALID',
        'Message exhausted source-queue retries; attempts are DLQ delivery attempts',safeJson(message.body),recordedAt)];
      if (task) {
        statements.push(env.DB.prepare(`
          UPDATE asi_outbox SET status='DEAD_LETTERED',last_error='CLOUDFLARE_QUEUE_DLQ',updated_at=?,
            lease_owner=NULL,lease_expires_at=NULL WHERE id=? AND event_id=? AND engine_fleet=? AND queue_name=?
        `).bind(recordedAt,task.outbox_id,task.event.event_id,task.target_fleet,task.source_queue));
      }
      await env.DB.batch(statements);
      message.ack();
    } catch {
      message.retry({delaySeconds:60});
    }
  }
}

export async function consumeAsiBatch(batch: MessageBatch<AsiQueueTask>, env: AsiMeshEnv): Promise<void> {
  if (batch.queue === ASI_DEAD_LETTER_QUEUE_NAME) {
    await consumeDeadLetterBatch(batch,env);
    return;
  }
  const fleet = ASI_FLEET_BY_QUEUE.get(batch.queue);
  if (!fleet) {
    for (const message of batch.messages) message.retry({delaySeconds:300});
    throw new Error(`ASI_QUEUE_NOT_REGISTERED:${batch.queue}`);
  }
  await Promise.all(batch.messages.map(async (message) => {
    let task: AsiQueueTask | null = null;
    try {
      task = validateQueueTask(message.body);
      if (task.target_fleet !== fleet.id || task.source_queue !== batch.queue) throw new Error('ASI_QUEUE_TASK_TARGET_MISMATCH');
      const sourceOutbox = await loadOutbox(env,task.outbox_id);
      if (!sourceOutbox || sourceOutbox.event_id !== task.event.event_id || sourceOutbox.engine_fleet !== fleet.id ||
        sourceOutbox.queue_binding !== fleet.binding || sourceOutbox.queue_name !== batch.queue ||
        safeJson(validateQueueTask(JSON.parse(sourceOutbox.payload_json))) !== safeJson(task)) {
        throw new Error('ASI_QUEUE_TASK_OUTBOX_PROVENANCE_MISMATCH');
      }
      const prior = await env.DB.prepare(`SELECT status FROM asi_processed_messages WHERE queue_name=? AND outbox_id=?`)
        .bind(batch.queue,task.outbox_id).first<{status:string}>();
      if (prior?.status === 'SUCCEEDED') { message.ack(); return; }
      await persistEventAndOutboxes(env,task.event,[]);
      await recordTransportReceipt(env,fleet,batch.queue,task,message.id,message.attempts);
      message.ack();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await recordTransportFailure(env,fleet,batch.queue,task,message.id,message.attempts,messageText).catch(() => undefined);
      message.retry({delaySeconds:Math.min(300,15 * 2 ** Math.max(0,message.attempts - 1))});
    }
  }));
}

export async function asiMeshTelemetry(env: AsiMeshEnv): Promise<Record<string, unknown>> {
  const [events,outbox,watermarks,deadLetters,admissions,health] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM asi_event_log`).first<{count:number}>(),
    env.DB.prepare(`SELECT status,COUNT(*) AS count FROM asi_outbox GROUP BY status ORDER BY status`).all<{status:string;count:number}>(),
    env.DB.prepare(`SELECT queue_name,SUM(processed_count) AS processed,SUM(failed_count) AS failed,MAX(last_processed_at) AS last_processed_at FROM asi_queue_watermarks GROUP BY queue_name ORDER BY queue_name`).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM asi_dead_letters WHERE replayed_at IS NULL`).first<{count:number}>(),
    env.DB.prepare(`SELECT decision,COUNT(*) AS count FROM asi_purpose_admissions GROUP BY decision ORDER BY decision`).all(),
    env.DB.prepare(`SELECT engine_fleet,queue_name,state,processed_count,failed_count,retry_count,dead_letter_count,last_success_at,last_failure_at,updated_at FROM asi_engine_health ORDER BY engine_fleet`).all(),
  ]);
  return {
    mode:'SHADOW',
    runtime_alignment:'TWENTY_FIVE_QUEUE_TRANSPORT_SCAFFOLDS_DURABLE_OUTBOX_RELAY_PROCESSORS_ZERO_CODE_WIRED_NOT_DEPLOYED',
    registered_fleet_count:ASI_FLEETS.length,
    engine_processor_implementation_count:0,
    event_count:Number(events?.count || 0),
    outbox:outbox.results || [],
    watermarks:watermarks.results || [],
    fleet_health:health.results || [],
    unreplayed_dead_letters:Number(deadLetters?.count || 0),
    purpose_admissions:admissions.results || [],
    public_projection_authorized:false,
    production:'HOLD',
  };
}
