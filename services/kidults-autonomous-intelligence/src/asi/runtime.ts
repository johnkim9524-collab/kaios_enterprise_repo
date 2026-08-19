import { assertAsiEventPayloadHash, partitionKey, validateAsiEvent, type AsiEventEnvelope, type AsiPartition } from './event';
import { runAsiProcessorTask } from './processor-runtime';
import { asiProcessorInventory, type AsiProcessorState } from './processors';
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
  partition_key:string|null;
  fairness_key:string|null;
  control_hold_count:number;
};

type DispatchResult = 'DISPATCHED'|'SKIPPED'|'RETRY'|'DEAD_LETTERED'|'HELD';
type DispatchKind = 'NORMAL'|'REPLAY';

type ReplayLeaseFence = {
  replayId:string;
  leaseOwner:string;
};

type TaskLeaseFence = {
  leaseOwner:string;
  leaseEpoch:number;
};

type FleetControlReservation = {
  allowed:true;
  reason:'ALLOWED';
  circuitState:'CLOSED'|'OPEN'|'HALF_OPEN';
  budgetWindow:string;
  nextAttemptAt:string;
  probeOwner:string|null;
} | {
  allowed:false;
  reason:'CIRCUIT_HOLD'|'BUDGET_HOLD';
  circuitState:'CLOSED'|'OPEN'|'HALF_OPEN';
  budgetWindow:string;
  nextAttemptAt:string;
  probeOwner:string|null;
};

type ReplayRow = {
  replay_id:string;
  source_event_id:string;
  target_engine_fleet:string;
  status:string;
  attempt_count:number;
  max_attempts:number;
  lease_owner:string|null;
  lease_expires_at:string|null;
  outbox_id:string|null;
};

export interface AsiRelayResult {
  selected:number;
  partitionsSelected:number;
  dispatched:number;
  retry:number;
  deadLettered:number;
  held:number;
  skipped:number;
}

export interface AsiReplayResult {
  selected:number;
  dispatched:number;
  completed:number;
  retry:number;
  hold:number;
  skipped:number;
}

export interface AsiRecoveryCycleResult {
  mode:'SHADOW';
  relay:AsiRelayResult;
  replay:AsiReplayResult;
  production:'HOLD';
}

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const safeJson = (value: unknown) => JSON.stringify(value) ?? 'null';
const ASI_DEAD_LETTER_QUEUE_NAME = 'kidults-asi-shadow-dead-letter';
const ASI_QUEUE_TASK_MAX_BYTES = 120 * 1024;
const OUTBOX_LEASE_SECONDS = 120;
const OUTBOX_MAX_ATTEMPTS = 5;
const TASK_LEASE_SECONDS = 300;
const REPLAY_LEASE_SECONDS = 300;
const REPLAY_LIMIT = 10;
const FLEET_REQUEST_LIMIT_PER_HOUR = 1000;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_SECONDS = 300;
const FAIRNESS_DIMENSIONS = ['channel','region','language','scope_id','source_role'] as const;

export function asiFairnessKey(partition: AsiPartition, engineFleet: string): string {
  return `fairness:v1:${JSON.stringify([engineFleet,...FAIRNESS_DIMENSIONS.map((key) => partition[key])])}`;
}

function hourWindow(at: Date): {key:string;startedAt:string;endsAt:string} {
  const started = new Date(at);
  started.setUTCMinutes(0,0,0);
  const ended = new Date(started.getTime() + 60 * 60 * 1000);
  return {
    key:`SHADOW_TRANSPORT_UTC_HOUR:${started.toISOString()}`,
    startedAt:started.toISOString(),
    endsAt:ended.toISOString(),
  };
}

function errorCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g,'_').replace(/^_+|_+$/g,'');
  return (normalized || 'ASI_TRANSPORT_FAILURE').slice(0,120);
}

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
        id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,partition_key,fairness_key,created_at,updated_at
      ) SELECT ?,?,?,?,?,?,'PENDING',?,?,?,?
      WHERE EXISTS (
        SELECT 1 FROM asi_event_log WHERE event_id=? AND event_type=? AND event_version=? AND producer_engine=?
          AND producer_version=? AND correlation_id=? AND causation_id IS ? AND idempotency_key=? AND partition_key=?
          AND input_snapshot_ref=? AND payload_hash=? AND rights_state=? AND freshness_state=? AND assertion_purpose IS ?
          AND decision IS ? AND reason_codes_json=? AND trace_refs_json=? AND payload_json=? AND occurred_at=? AND observed_at=?
      )
    `).bind(
      item.task.outbox_id,event.event_id,item.fleet.id,item.fleet.binding,item.fleet.queue,item.serialized,
      partitionKey(event.partition),asiFairnessKey(event.partition,item.fleet.id),createdAt,createdAt,
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
    SELECT id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,attempt_count,next_attempt_at,lease_owner,
      lease_expires_at,partition_key,fairness_key,control_hold_count
    FROM asi_outbox WHERE id=?
  `).bind(outboxId).first<OutboxRow>();
}

async function claimOutbox(
  env: AsiMeshEnv,
  outboxId: string,
  replayFence: ReplayLeaseFence | null,
): Promise<{row:OutboxRow;leaseOwner:string} | null> {
  const leaseOwner = makeId('relay');
  const claimed = await env.DB.prepare(`
    UPDATE asi_outbox SET status='DISPATCHING',lease_owner=?,
      lease_expires_at=datetime('now',?),updated_at=?
    WHERE id=? AND (
      (status IN ('PENDING','RETRY') AND (next_attempt_at IS NULL OR datetime(next_attempt_at)<=datetime('now')))
      OR (status='DISPATCHING' AND datetime(lease_expires_at)<=datetime('now'))
    )
      AND (? IS NULL OR EXISTS (
        SELECT 1 FROM asi_replay_requests r WHERE r.replay_id=? AND r.status='RUNNING' AND r.lease_owner=?
          AND r.lease_expires_at IS NOT NULL AND datetime(r.lease_expires_at)>datetime('now')
      ))
  `).bind(
    leaseOwner,`+${OUTBOX_LEASE_SECONDS} seconds`,nowIso(),outboxId,replayFence?.replayId || null,
    replayFence?.replayId || null,replayFence?.leaseOwner || null,
  ).run();
  if (Number(claimed.meta.changes || 0) === 0) return null;
  const row = await loadOutbox(env,outboxId);
  return row ? {row,leaseOwner} : null;
}

async function replayLeaseIsActive(env: AsiMeshEnv, fence: ReplayLeaseFence): Promise<boolean> {
  const active = await env.DB.prepare(`
    SELECT 1 AS active FROM asi_replay_requests
    WHERE replay_id=? AND status='RUNNING' AND lease_owner=?
      AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now')
  `).bind(fence.replayId,fence.leaseOwner).first<{active:number}>();
  return Number(active?.active || 0) === 1;
}

async function assertReplayLease(env: AsiMeshEnv, fence: ReplayLeaseFence | null): Promise<void> {
  if (fence && !await replayLeaseIsActive(env,fence)) throw new Error('ASI_REPLAY_LEASE_FENCE_LOST');
}

async function beginOutboxSendAttempt(
  env: AsiMeshEnv,
  row: OutboxRow,
  leaseOwner: string,
  replayFence: ReplayLeaseFence | null,
): Promise<OutboxRow | null> {
  const started = await env.DB.prepare(`
    UPDATE asi_outbox SET attempt_count=attempt_count+1,updated_at=?
    WHERE id=? AND status='DISPATCHING' AND lease_owner=?
      AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now')
      AND (? IS NULL OR EXISTS (
        SELECT 1 FROM asi_replay_requests r
        WHERE r.replay_id=? AND r.status='RUNNING' AND r.lease_owner=?
          AND r.lease_expires_at IS NOT NULL AND datetime(r.lease_expires_at)>datetime('now')
      ))
  `).bind(
    nowIso(),row.id,leaseOwner,replayFence?.replayId || null,
    replayFence?.replayId || null,replayFence?.leaseOwner || null,
  ).run();
  if (Number(started.meta.changes || 0) === 0) return null;
  const attempted = await loadOutbox(env,row.id);
  return attempted?.lease_owner === leaseOwner ? attempted : null;
}

async function ensureFleetControls(
  env: AsiMeshEnv,
  fleet: AsiFleet,
): Promise<{budgetWindow:string;windowStartedAt:string;windowEndsAt:string}> {
  const timestamp = nowIso();
  const window = hourWindow(new Date(timestamp));
  const budgetWindow = 'SHADOW_TRANSPORT_UTC_HOUR';
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO asi_circuit_breakers (
        engine_fleet,state,failure_count,consecutive_failure_count,success_count,opened_count,updated_at
      ) VALUES (?,'CLOSED',0,0,0,0,?)
    `).bind(fleet.id,timestamp),
    env.DB.prepare(`
      INSERT OR IGNORE INTO asi_fleet_budgets (
        engine_fleet,budget_window,request_limit,request_used,cost_limit_microunits,cost_used_microunits,
        window_started_at,window_ends_at,updated_at
      ) VALUES (?,?,?,0,0,0,?,?,?)
    `).bind(fleet.id,budgetWindow,FLEET_REQUEST_LIMIT_PER_HOUR,window.startedAt,window.endsAt,timestamp),
  ]);
  return {budgetWindow,windowStartedAt:window.startedAt,windowEndsAt:window.endsAt};
}

async function reserveFleetDispatch(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  outboxId: string,
  leaseOwner: string,
  replayFence: ReplayLeaseFence | null,
): Promise<FleetControlReservation> {
  const window = await ensureFleetControls(env,fleet);
  const timestamp = nowIso();
  const probeOwner = makeId('probe');
  let circuit = await env.DB.prepare(`
    SELECT state,next_probe_at,probe_lease_expires_at FROM asi_circuit_breakers WHERE engine_fleet=?
  `).bind(fleet.id).first<{state:'CLOSED'|'OPEN'|'HALF_OPEN';next_probe_at:string|null;probe_lease_expires_at:string|null}>();
  if (!circuit) throw new Error('ASI_CIRCUIT_CONTROL_MISSING');

  if (circuit.state === 'OPEN') {
    const claimedProbe = await env.DB.prepare(`
      UPDATE asi_circuit_breakers SET state='HALF_OPEN',probe_lease_owner=?,
        probe_lease_expires_at=datetime('now',?),updated_at=?
      WHERE engine_fleet=? AND state='OPEN' AND next_probe_at IS NOT NULL
        AND datetime(next_probe_at)<=datetime('now')
        AND EXISTS (
          SELECT 1 FROM asi_outbox o WHERE o.id=? AND o.status='DISPATCHING' AND o.lease_owner=?
            AND o.lease_expires_at IS NOT NULL AND datetime(o.lease_expires_at)>datetime('now')
        )
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM asi_replay_requests r WHERE r.replay_id=? AND r.status='RUNNING' AND r.lease_owner=?
            AND r.lease_expires_at IS NOT NULL AND datetime(r.lease_expires_at)>datetime('now')
        ))
    `).bind(
      probeOwner,`+${OUTBOX_LEASE_SECONDS} seconds`,timestamp,fleet.id,outboxId,leaseOwner,
      replayFence?.replayId || null,replayFence?.replayId || null,replayFence?.leaseOwner || null,
    ).run();
    if (Number(claimedProbe.meta.changes || 0) === 0) {
      return {
        allowed:false,reason:'CIRCUIT_HOLD',circuitState:'OPEN',budgetWindow:window.budgetWindow,
        nextAttemptAt:circuit.next_probe_at || new Date(Date.parse(timestamp) + CIRCUIT_OPEN_SECONDS * 1000).toISOString(),
        probeOwner:null,
      };
    }
    circuit = {state:'HALF_OPEN',next_probe_at:circuit.next_probe_at,probe_lease_expires_at:null};
  } else if (circuit.state === 'HALF_OPEN') {
    const claimedProbe = await env.DB.prepare(`
      UPDATE asi_circuit_breakers SET probe_lease_owner=?,probe_lease_expires_at=datetime('now',?),updated_at=?
      WHERE engine_fleet=? AND state='HALF_OPEN'
        AND (probe_lease_expires_at IS NULL OR datetime(probe_lease_expires_at)<=datetime('now'))
        AND EXISTS (
          SELECT 1 FROM asi_outbox o WHERE o.id=? AND o.status='DISPATCHING' AND o.lease_owner=?
            AND o.lease_expires_at IS NOT NULL AND datetime(o.lease_expires_at)>datetime('now')
        )
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM asi_replay_requests r WHERE r.replay_id=? AND r.status='RUNNING' AND r.lease_owner=?
            AND r.lease_expires_at IS NOT NULL AND datetime(r.lease_expires_at)>datetime('now')
        ))
    `).bind(
      probeOwner,`+${OUTBOX_LEASE_SECONDS} seconds`,timestamp,fleet.id,outboxId,leaseOwner,
      replayFence?.replayId || null,replayFence?.replayId || null,replayFence?.leaseOwner || null,
    ).run();
    if (Number(claimedProbe.meta.changes || 0) === 0) {
      return {
        allowed:false,reason:'CIRCUIT_HOLD',circuitState:'HALF_OPEN',budgetWindow:window.budgetWindow,
        nextAttemptAt:circuit.probe_lease_expires_at || new Date(Date.parse(timestamp) + OUTBOX_LEASE_SECONDS * 1000).toISOString(),
        probeOwner:null,
      };
    }
  }

  const reserved = await env.DB.prepare(`
    UPDATE asi_fleet_budgets SET request_used=request_used+1,updated_at=?
    WHERE engine_fleet=? AND budget_window=? AND window_started_at=?
      AND datetime(window_started_at)<=datetime('now') AND datetime(window_ends_at)>datetime('now')
      AND request_used<request_limit AND cost_used_microunits<=cost_limit_microunits
      AND EXISTS (
        SELECT 1 FROM asi_circuit_breakers c WHERE c.engine_fleet=? AND c.state IN ('CLOSED','HALF_OPEN')
      )
      AND EXISTS (
        SELECT 1 FROM asi_outbox o WHERE o.id=? AND o.status='DISPATCHING' AND o.lease_owner=?
          AND o.lease_expires_at IS NOT NULL AND datetime(o.lease_expires_at)>datetime('now')
      )
      AND (? IS NULL OR EXISTS (
        SELECT 1 FROM asi_replay_requests r WHERE r.replay_id=? AND r.status='RUNNING' AND r.lease_owner=?
          AND r.lease_expires_at IS NOT NULL AND datetime(r.lease_expires_at)>datetime('now')
      ))
  `).bind(
    timestamp,fleet.id,window.budgetWindow,window.windowStartedAt,fleet.id,outboxId,leaseOwner,
    replayFence?.replayId || null,replayFence?.replayId || null,replayFence?.leaseOwner || null,
  ).run();
  if (Number(reserved.meta.changes || 0) === 0) {
    if (replayFence && !await replayLeaseIsActive(env,replayFence)) throw new Error('ASI_REPLAY_LEASE_FENCE_LOST');
    const currentCircuit = await env.DB.prepare(`
      SELECT state,next_probe_at,probe_lease_expires_at FROM asi_circuit_breakers WHERE engine_fleet=?
    `).bind(fleet.id).first<{state:'CLOSED'|'OPEN'|'HALF_OPEN';next_probe_at:string|null;probe_lease_expires_at:string|null}>();
    if (circuit.state === 'CLOSED' && currentCircuit && currentCircuit.state !== 'CLOSED') {
      return {
        allowed:false,reason:'CIRCUIT_HOLD',circuitState:currentCircuit.state,budgetWindow:window.budgetWindow,
        nextAttemptAt:currentCircuit.next_probe_at || currentCircuit.probe_lease_expires_at ||
          new Date(Date.parse(timestamp) + CIRCUIT_OPEN_SECONDS * 1000).toISOString(),
        probeOwner:null,
      };
    }
    if (circuit.state === 'HALF_OPEN') {
      await env.DB.prepare(`
        UPDATE asi_circuit_breakers SET state='OPEN',probe_lease_owner=NULL,probe_lease_expires_at=NULL,
          next_probe_at=datetime('now',?),updated_at=? WHERE engine_fleet=? AND state='HALF_OPEN'
          AND probe_lease_owner=?
      `).bind(`+${CIRCUIT_OPEN_SECONDS} seconds`,timestamp,fleet.id,probeOwner).run();
    }
    return {
      allowed:false,reason:'BUDGET_HOLD',circuitState:circuit.state,budgetWindow:window.budgetWindow,
      nextAttemptAt:window.windowEndsAt,
      probeOwner:null,
    };
  }
  return {
    allowed:true,reason:'ALLOWED',circuitState:circuit.state,budgetWindow:window.budgetWindow,
    nextAttemptAt:timestamp,
    probeOwner:circuit.state === 'HALF_OPEN' ? probeOwner : null,
  };
}

async function halfOpenProbeIsOwned(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  control: FleetControlReservation,
): Promise<boolean> {
  if (!control.allowed || control.circuitState !== 'HALF_OPEN' || !control.probeOwner) return control.circuitState !== 'HALF_OPEN';
  const owner = await env.DB.prepare(`
    SELECT 1 AS active FROM asi_circuit_breakers
    WHERE engine_fleet=? AND state='HALF_OPEN' AND probe_lease_owner=?
      AND probe_lease_expires_at IS NOT NULL AND datetime(probe_lease_expires_at)>datetime('now')
  `).bind(fleet.id,control.probeOwner).first<{active:number}>();
  return Number(owner?.active || 0) === 1;
}

function transportAttempt(
  env: AsiMeshEnv,
  row: OutboxRow,
  dispatchKind: DispatchKind,
  outcome: Exclude<FleetControlReservation['reason'],'ALLOWED'>|'DISPATCHED'|'RETRY'|'DEAD_LETTERED',
  circuitState: FleetControlReservation['circuitState'],
  budgetWindow: string,
  message: string | null,
  timestamp: string,
): D1PreparedStatement {
  return env.DB.prepare(`
    INSERT INTO asi_transport_attempts (
      attempt_id,outbox_id,engine_fleet,attempt_number,dispatch_kind,outcome,circuit_state,budget_window,
      error_code,attempted_at,completed_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    makeId('transport'),row.id,row.engine_fleet,row.attempt_count,dispatchKind,outcome,circuitState,budgetWindow,
    message ? errorCode(message) : null,timestamp,timestamp,
  );
}

function circuitSuccess(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  control: FleetControlReservation,
  timestamp: string,
): D1PreparedStatement {
  if (control.circuitState === 'HALF_OPEN') {
    return env.DB.prepare(`
      UPDATE asi_circuit_breakers SET state='CLOSED',consecutive_failure_count=0,success_count=success_count+1,
        next_probe_at=NULL,reason_code=NULL,probe_lease_owner=NULL,probe_lease_expires_at=NULL,
        last_success_at=?,updated_at=?
      WHERE engine_fleet=? AND state='HALF_OPEN' AND probe_lease_owner=?
    `).bind(timestamp,timestamp,fleet.id,control.probeOwner);
  }
  return env.DB.prepare(`
    UPDATE asi_circuit_breakers SET consecutive_failure_count=0,success_count=success_count+1,
      last_success_at=?,updated_at=? WHERE engine_fleet=? AND state='CLOSED'
  `).bind(timestamp,timestamp,fleet.id);
}

function circuitFailure(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  control: FleetControlReservation,
  message: string,
  timestamp: string,
): D1PreparedStatement {
  if (control.circuitState === 'HALF_OPEN') {
    return env.DB.prepare(`
      UPDATE asi_circuit_breakers SET failure_count=failure_count+1,
        consecutive_failure_count=consecutive_failure_count+1,state='OPEN',opened_count=opened_count+1,
        opened_at=?,next_probe_at=datetime('now',?),reason_code=?,probe_lease_owner=NULL,
        probe_lease_expires_at=NULL,last_failure_at=?,updated_at=?
      WHERE engine_fleet=? AND state='HALF_OPEN' AND probe_lease_owner=?
    `).bind(
      timestamp,`+${CIRCUIT_OPEN_SECONDS} seconds`,errorCode(message),timestamp,timestamp,fleet.id,control.probeOwner,
    );
  }
  return env.DB.prepare(`
    UPDATE asi_circuit_breakers SET failure_count=failure_count+1,
      consecutive_failure_count=consecutive_failure_count+1,
      state=CASE WHEN consecutive_failure_count+1>=? THEN 'OPEN' ELSE state END,
      opened_count=opened_count+CASE WHEN consecutive_failure_count+1=? AND state<>'OPEN' THEN 1 ELSE 0 END,
      opened_at=CASE WHEN consecutive_failure_count+1>=? THEN ? ELSE opened_at END,
      next_probe_at=CASE WHEN consecutive_failure_count+1>=? THEN datetime('now',?) ELSE next_probe_at END,
      reason_code=?,probe_lease_owner=NULL,probe_lease_expires_at=NULL,last_failure_at=?,updated_at=?
    WHERE engine_fleet=? AND state='CLOSED'
  `).bind(
    CIRCUIT_FAILURE_THRESHOLD,CIRCUIT_FAILURE_THRESHOLD,CIRCUIT_FAILURE_THRESHOLD,timestamp,
    CIRCUIT_FAILURE_THRESHOLD,`+${CIRCUIT_OPEN_SECONDS} seconds`,errorCode(message),timestamp,timestamp,fleet.id,
  );
}

async function deferControlHold(
  env: AsiMeshEnv,
  row: OutboxRow,
  leaseOwner: string,
  control: Extract<FleetControlReservation,{allowed:false}>,
  dispatchKind: DispatchKind,
): Promise<void> {
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO asi_transport_control_holds (
        hold_id,outbox_id,engine_fleet,control_hold_number,dispatch_kind,reason_code,circuit_state,budget_window,held_at
      )
      SELECT ?,id,engine_fleet,control_hold_count+1,?,?,?,?,?
      FROM asi_outbox WHERE id=? AND status='DISPATCHING' AND lease_owner=?
        AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now')
    `).bind(
      makeId('control_hold'),dispatchKind,`ASI_${control.reason}`,control.circuitState,control.budgetWindow,
      timestamp,row.id,leaseOwner,
    ),
    env.DB.prepare(`
      UPDATE asi_outbox SET status='RETRY',next_attempt_at=?,updated_at=?,last_error=?,control_hold_count=control_hold_count+1,
        lease_owner=NULL,lease_expires_at=NULL WHERE id=? AND status='DISPATCHING' AND lease_owner=?
    `).bind(control.nextAttemptAt,timestamp,`ASI_${control.reason}`,row.id,leaseOwner),
  ]);
}

function countTerminalDeadLetterOnce(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  receiptId: string,
  recordedAt: string,
): D1PreparedStatement[] {
  return [
    env.DB.prepare(`
      INSERT INTO asi_engine_health (
        engine_fleet,queue_name,state,processed_count,failed_count,retry_count,dead_letter_count,
        last_success_at,last_failure_at,updated_at
      )
      SELECT ?,?,'TERMINAL_HOLD',0,0,0,1,NULL,?,?
      WHERE EXISTS (
        SELECT 1 FROM asi_terminal_dlq_receipts r JOIN asi_outbox o ON o.id=r.outbox_id
        WHERE r.receipt_id=? AND r.health_counted=0 AND o.engine_fleet=? AND o.queue_name=?
          AND r.receipt_type IN ('CLOUDFLARE_QUEUE_DLQ','OUTBOX_DISPATCH_EXHAUSTED')
      )
      ON CONFLICT(engine_fleet) DO UPDATE SET state='TERMINAL_HOLD',
        dead_letter_count=asi_engine_health.dead_letter_count+1,last_failure_at=excluded.last_failure_at,
        updated_at=excluded.updated_at
    `).bind(fleet.id,fleet.queue,recordedAt,recordedAt,receiptId,fleet.id,fleet.queue),
    env.DB.prepare(`
      UPDATE asi_terminal_dlq_receipts SET health_counted=1
      WHERE receipt_id=? AND health_counted=0
        AND receipt_type IN ('CLOUDFLARE_QUEUE_DLQ','OUTBOX_DISPATCH_EXHAUSTED')
        AND EXISTS (
          SELECT 1 FROM asi_outbox o WHERE o.id=asi_terminal_dlq_receipts.outbox_id
            AND o.engine_fleet=? AND o.queue_name=?
        )
    `).bind(receiptId,fleet.id,fleet.queue),
  ];
}

async function deadLetterOutbox(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  row: OutboxRow,
  leaseOwner: string,
  message: string,
  dispatchKind: DispatchKind,
  control: FleetControlReservation,
): Promise<void> {
  const recordedAt = nowIso();
  const receiptId = `terminal_outbox_${row.id}`;
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_outbox SET status='DEAD_LETTERED',lease_owner=NULL,lease_expires_at=NULL,last_error=?,updated_at=?
      WHERE id=? AND lease_owner=?
    `).bind(message,recordedAt,row.id,leaseOwner),
    env.DB.prepare(`
      INSERT OR IGNORE INTO asi_terminal_dlq_receipts (
        receipt_id,receipt_type,dlq_queue_name,source_queue_name,message_id,event_id,outbox_id,payload_json,payload_bytes,
        operating_state,replay_required,ack_policy,ack_requested,loss_guarantee,recorded_at
      ) VALUES (?,'OUTBOX_DISPATCH_EXHAUSTED',?,?,?,?,?,?,?,'HOLD',1,'NO_QUEUE_ACK_OUTBOX_TERMINAL',0,0,?)
    `).bind(
      receiptId,row.queue_name,row.queue_name,row.id,row.event_id,row.id,row.payload_json,
      new TextEncoder().encode(row.payload_json).byteLength,recordedAt,
    ),
    env.DB.prepare(`
      INSERT OR IGNORE INTO asi_dead_letters (
        id,queue_name,source_queue_name,source_queue_provenance_state,source_queue_candidates_json,
        message_id,event_id,attempts,error_code,error_message,payload_json,recorded_at,
        terminal_receipt_id,operating_state,replay_required
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'HOLD',1)
    `).bind(`dlq_outbox_${row.id}`,row.queue_name,row.queue_name,'RESOLVED_OUTBOX_TASK_ENVELOPE',JSON.stringify([row.queue_name]),
      row.id,row.event_id,row.attempt_count,'ASI_OUTBOX_DISPATCH_EXHAUSTED',message,row.payload_json,recordedAt,receiptId),
    transportAttempt(env,row,dispatchKind,'DEAD_LETTERED',control.circuitState,control.budgetWindow,message,recordedAt),
    ...countTerminalDeadLetterOnce(env,fleet,receiptId,recordedAt),
    circuitFailure(env,fleet,control,message,recordedAt),
  ]);
}

async function holdOutboxRegistryDrift(
  env: AsiMeshEnv,
  row: OutboxRow,
  leaseOwner: string,
  message: string,
): Promise<void> {
  const recordedAt = nowIso();
  const receiptId = `terminal_outbox_${row.id}`;
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_outbox SET status='HOLD',lease_owner=NULL,lease_expires_at=NULL,last_error=?,updated_at=?
      WHERE id=? AND lease_owner=?
    `).bind(message,recordedAt,row.id,leaseOwner),
    env.DB.prepare(`
      INSERT OR IGNORE INTO asi_terminal_dlq_receipts (
        receipt_id,receipt_type,dlq_queue_name,source_queue_name,message_id,event_id,outbox_id,payload_json,payload_bytes,
        operating_state,replay_required,ack_policy,ack_requested,loss_guarantee,recorded_at
      ) VALUES (?,'OUTBOX_TERMINAL_HOLD',?,?,?,?,?,?,?,'HOLD',1,'NO_QUEUE_ACK_OUTBOX_TERMINAL',0,0,?)
    `).bind(
      receiptId,row.queue_name,row.queue_name,row.id,row.event_id,row.id,row.payload_json,
      new TextEncoder().encode(row.payload_json).byteLength,recordedAt,
    ),
    env.DB.prepare(`
      INSERT OR IGNORE INTO asi_dead_letters (
        id,queue_name,source_queue_name,source_queue_provenance_state,source_queue_candidates_json,
        message_id,event_id,attempts,error_code,error_message,payload_json,recorded_at,
        terminal_receipt_id,operating_state,replay_required
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'HOLD',1)
    `).bind(
      `dlq_outbox_${row.id}`,row.queue_name,row.queue_name,'RESOLVED_OUTBOX_TASK_ENVELOPE',JSON.stringify([row.queue_name]),
      row.id,row.event_id,row.attempt_count,'ASI_OUTBOX_REGISTRY_DRIFT',message,row.payload_json,recordedAt,receiptId,
    ),
  ]);
}

async function recordOutboxDispatchFailure(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  row: OutboxRow,
  leaseOwner: string,
  message: string,
  dispatchKind: DispatchKind,
  control: FleetControlReservation,
): Promise<void> {
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_outbox SET status='RETRY',next_attempt_at=datetime('now','+1 minute'),updated_at=?,last_error=?,
        lease_owner=NULL,lease_expires_at=NULL WHERE id=? AND lease_owner=?
    `).bind(timestamp,message,row.id,leaseOwner),
    transportAttempt(env,row,dispatchKind,'RETRY',control.circuitState,control.budgetWindow,message,timestamp),
    circuitFailure(env,fleet,control,message,timestamp),
  ]);
}

async function dispatchOutbox(
  env: AsiMeshEnv,
  outboxId: string,
  dispatchKind: DispatchKind = 'NORMAL',
  replayFence: ReplayLeaseFence | null = null,
): Promise<DispatchResult> {
  const existing = await loadOutbox(env,outboxId);
  if (!existing || existing.status === 'DISPATCHED') return 'SKIPPED';
  if (existing.status === 'DEAD_LETTERED') return 'DEAD_LETTERED';
  if (existing.status === 'HOLD') return 'HELD';
  await assertReplayLease(env,replayFence);
  const claim = await claimOutbox(env,outboxId,replayFence);
  if (!claim) return 'SKIPPED';
  const {row,leaseOwner} = claim;
  let task: AsiQueueTask;
  let fleet: AsiFleet;
  try {
    task = validateQueueTask(JSON.parse(row.payload_json));
    const registeredFleet = ASI_FLEET_BY_ID.get(row.engine_fleet as AsiFleetId);
    if (!registeredFleet || registeredFleet.binding !== row.queue_binding || registeredFleet.queue !== row.queue_name || task.outbox_id !== row.id ||
      task.target_fleet !== registeredFleet.id || task.source_queue !== registeredFleet.queue || task.event.event_id !== row.event_id) {
      throw new Error('ASI_OUTBOX_TASK_REGISTRY_DRIFT');
    }
    fleet = registeredFleet;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await assertReplayLease(env,replayFence);
    await holdOutboxRegistryDrift(env,row,leaseOwner,message);
    return 'HELD';
  }

  const control = await reserveFleetDispatch(env,fleet,row.id,leaseOwner,replayFence);
  await assertReplayLease(env,replayFence);
  if (!control.allowed) {
    await deferControlHold(env,row,leaseOwner,control,dispatchKind);
    return 'RETRY';
  }
  if (!await halfOpenProbeIsOwned(env,fleet,control)) {
    await deferControlHold(env,row,leaseOwner,{
      allowed:false,reason:'CIRCUIT_HOLD',circuitState:'HALF_OPEN',budgetWindow:control.budgetWindow,
      nextAttemptAt:new Date(Date.now() + OUTBOX_LEASE_SECONDS * 1000).toISOString(),probeOwner:null,
    },dispatchKind);
    return 'RETRY';
  }

  const attempt = await beginOutboxSendAttempt(env,row,leaseOwner,replayFence);
  if (!attempt) return 'SKIPPED';
  await assertReplayLease(env,replayFence);
  try {
    await env[fleet.binding].send(task,{contentType:'json'});
  } catch (error) {
    await assertReplayLease(env,replayFence);
    const message = error instanceof Error ? error.message : String(error);
    if (attempt.attempt_count >= OUTBOX_MAX_ATTEMPTS) {
      await deadLetterOutbox(env,fleet,attempt,leaseOwner,message,dispatchKind,control);
      return 'DEAD_LETTERED';
    }
    await recordOutboxDispatchFailure(env,fleet,attempt,leaseOwner,message,dispatchKind,control);
    return 'RETRY';
  }
  await assertReplayLease(env,replayFence);
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_outbox SET status='DISPATCHED',dispatched_at=?,updated_at=?,next_attempt_at=NULL,
        lease_owner=NULL,lease_expires_at=NULL,last_error=NULL WHERE id=? AND lease_owner=?
    `).bind(timestamp,timestamp,attempt.id,leaseOwner),
    transportAttempt(env,attempt,dispatchKind,'DISPATCHED',control.circuitState,control.budgetWindow,null,timestamp),
    circuitSuccess(env,fleet,control,timestamp),
  ]);
  return 'DISPATCHED';
}

async function eventOutboxRows(env: AsiMeshEnv, eventId: string): Promise<OutboxRow[]> {
  const rows = await env.DB.prepare(`
    SELECT id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,attempt_count,next_attempt_at,lease_owner,
      lease_expires_at,partition_key,fairness_key,control_hold_count
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

async function stageAsiEvent(env: AsiMeshEnv, event: AsiEventEnvelope): Promise<AsiFleet[]> {
  await assertAsiEventPayloadHash(event);
  const fleetIds = targetFleetsFor(event);
  const fleets = fleetIds.map((fleetId) => ASI_FLEET_BY_ID.get(fleetId));
  if (fleets.some((fleet) => !fleet)) throw new Error('ASI_TARGET_FLEET_REGISTRY_DRIFT');
  await persistEventAndOutboxes(env,event,fleets as AsiFleet[]);
  return fleets as AsiFleet[];
}

export async function enqueueAsiEvent(env: AsiMeshEnv, rawEvent: unknown): Promise<AsiEnqueueResult> {
  const event = validateAsiEvent(rawEvent);
  const fleets = await stageAsiEvent(env,event);
  if (fleets.length === 0) return {eventId:event.event_id,state:'PARKED_NO_ENGINE_PROCESSOR',fleets:[],queues:[]};
  const rows = await resumeEventOutboxes(env,event.event_id);
  const state: AsiEnqueueState = rows.some((row) => row.status === 'DEAD_LETTERED' || row.status === 'HOLD')
    ? 'TRANSPORT_HOLD'
    : rows.every((row) => row.status === 'DISPATCHED') ? 'DISPATCHED' : 'QUEUED_FOR_RELAY';
  return {eventId:event.event_id,state,fleets:rows.map((row) => row.engine_fleet),queues:rows.map((row) => row.queue_name)};
}

async function recordFairSelection(
  env: AsiMeshEnv,
  candidate: {id:string;partition_key:string;fairness_key:string},
  result: DispatchResult,
): Promise<void> {
  if (result === 'SKIPPED') return;
  const timestamp = nowIso();
  await env.DB.prepare(`
    INSERT INTO asi_relay_fairness (
      fairness_key,last_partition_key,selection_count,dispatch_count,retry_count,dead_letter_count,hold_count,
      last_outbox_id,last_selected_at,updated_at
    ) VALUES (?,?,1,?,?,?,?,?,?,?)
    ON CONFLICT(fairness_key) DO UPDATE SET
      selection_count=asi_relay_fairness.selection_count+1,
      dispatch_count=asi_relay_fairness.dispatch_count+excluded.dispatch_count,
      retry_count=asi_relay_fairness.retry_count+excluded.retry_count,
      dead_letter_count=asi_relay_fairness.dead_letter_count+excluded.dead_letter_count,
      hold_count=asi_relay_fairness.hold_count+excluded.hold_count,
      last_partition_key=excluded.last_partition_key,last_outbox_id=excluded.last_outbox_id,
      last_selected_at=excluded.last_selected_at,updated_at=excluded.updated_at
  `).bind(
    candidate.fairness_key,candidate.partition_key,result === 'DISPATCHED' ? 1 : 0,
    result === 'RETRY' ? 1 : 0,result === 'DEAD_LETTERED' ? 1 : 0,result === 'HELD' ? 1 : 0,
    candidate.id,timestamp,timestamp,
  ).run();
}

export async function relayPendingOutbox(env: AsiMeshEnv, limit = 25): Promise<AsiRelayResult> {
  const candidates = await env.DB.prepare(`
    WITH eligible AS (
      SELECT o.id,COALESCE(o.partition_key,e.partition_key) AS partition_key,
        COALESCE(o.fairness_key,o.partition_key,e.partition_key) AS fairness_key,o.created_at
      FROM asi_outbox o JOIN asi_event_log e ON e.event_id=o.event_id
      WHERE (
        o.status IN ('PENDING','RETRY') AND (o.next_attempt_at IS NULL OR datetime(o.next_attempt_at)<=datetime('now'))
      ) OR (o.status='DISPATCHING' AND datetime(o.lease_expires_at)<=datetime('now'))
    ), market_cells AS (
      SELECT fairness_key,MIN(created_at) AS oldest_pending_at
      FROM eligible GROUP BY fairness_key
    ), ranked AS (
      SELECT eligible.*,
        ROW_NUMBER() OVER (PARTITION BY eligible.fairness_key ORDER BY eligible.created_at,eligible.id) AS partition_rank,
        f.last_selected_at,market_cells.oldest_pending_at,
        COALESCE(f.last_selected_at,market_cells.oldest_pending_at) AS service_clock
      FROM eligible LEFT JOIN asi_relay_fairness f ON f.fairness_key=eligible.fairness_key
      JOIN market_cells ON market_cells.fairness_key=eligible.fairness_key
    )
    SELECT id,partition_key,fairness_key FROM ranked
    ORDER BY partition_rank,julianday(service_clock),julianday(oldest_pending_at),julianday(created_at),id
    LIMIT ?
  `).bind(Math.max(1,Math.min(100,limit))).all<{id:string;partition_key:string;fairness_key:string}>();
  let dispatched = 0;
  let retry = 0;
  let deadLettered = 0;
  let held = 0;
  let skipped = 0;
  const selectedPartitions = new Set<string>();
  for (const candidate of candidates.results || []) {
    const result = await dispatchOutbox(env,candidate.id);
    if (result === 'DISPATCHED') dispatched += 1;
    else if (result === 'RETRY') retry += 1;
    else if (result === 'DEAD_LETTERED') deadLettered += 1;
    else if (result === 'HELD') held += 1;
    else skipped += 1;
    if (result !== 'SKIPPED') selectedPartitions.add(candidate.fairness_key);
    await recordFairSelection(env,candidate,result);
  }
  return {
    selected:(candidates.results || []).length,partitionsSelected:selectedPartitions.size,
    dispatched,retry,deadLettered,held,skipped,
  };
}

async function claimTaskLease(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  task: AsiQueueTask,
): Promise<TaskLeaseFence | null> {
  const leaseOwner = makeId('task');
  const leaseId = `lease_${task.outbox_id}`;
  const timestamp = nowIso();
  const key = partitionKey(task.event.partition);
  const claimed = await env.DB.prepare(`
    INSERT INTO asi_task_leases (
      lease_id,engine_fleet,partition_key,task_event_id,lease_owner,acquired_at,expires_at,released_at,
      release_state,outbox_id,attempt_count,last_error
    ) VALUES (?,?,?,?,?,?,datetime('now',?),NULL,NULL,?,1,NULL)
    ON CONFLICT(engine_fleet,partition_key,task_event_id) DO UPDATE SET
      lease_id=excluded.lease_id,lease_owner=excluded.lease_owner,acquired_at=excluded.acquired_at,
      expires_at=excluded.expires_at,released_at=NULL,release_state=NULL,outbox_id=excluded.outbox_id,
      attempt_count=asi_task_leases.attempt_count+1,last_error=NULL
    WHERE asi_task_leases.released_at IS NOT NULL OR datetime(asi_task_leases.expires_at)<=datetime('now')
  `).bind(
    leaseId,fleet.id,key,task.event.event_id,leaseOwner,timestamp,`+${TASK_LEASE_SECONDS} seconds`,task.outbox_id,
  ).run();
  if (Number(claimed.meta.changes || 0) === 0) return null;
  const owner = await env.DB.prepare(`
    SELECT lease_owner,attempt_count FROM asi_task_leases
    WHERE engine_fleet=? AND partition_key=? AND task_event_id=? AND outbox_id=?
  `).bind(fleet.id,key,task.event.event_id,task.outbox_id).first<{lease_owner:string;attempt_count:number}>();
  const leaseEpoch = Number(owner?.attempt_count || 0);
  return owner?.lease_owner === leaseOwner && Number.isSafeInteger(leaseEpoch) && leaseEpoch > 0
    ? {leaseOwner,leaseEpoch}
    : null;
}

function releaseTaskLease(
  env: AsiMeshEnv,
  task: AsiQueueTask,
  fence: TaskLeaseFence,
  releaseState: 'SUCCEEDED'|'FAILED',
  error: string | null,
  timestamp: string,
): D1PreparedStatement {
  return env.DB.prepare(`
    UPDATE asi_task_leases SET released_at=?,release_state=?,last_error=?
    WHERE outbox_id=? AND task_event_id=? AND lease_owner=? AND attempt_count=? AND released_at IS NULL
      AND datetime(expires_at)>datetime('now')
  `).bind(timestamp,releaseState,error,task.outbox_id,task.event.event_id,fence.leaseOwner,fence.leaseEpoch);
}

async function taskLeaseIsActive(
  env: AsiMeshEnv,
  task: AsiQueueTask,
  fence: TaskLeaseFence,
): Promise<boolean> {
  const active = await env.DB.prepare(`
    SELECT 1 AS active FROM asi_task_leases
    WHERE outbox_id=? AND task_event_id=? AND lease_owner=? AND attempt_count=? AND released_at IS NULL
      AND datetime(expires_at)>datetime('now')
  `).bind(task.outbox_id,task.event.event_id,fence.leaseOwner,fence.leaseEpoch).first<{active:number}>();
  return Number(active?.active || 0) === 1;
}

async function assertTaskLease(env: AsiMeshEnv, task: AsiQueueTask, fence: TaskLeaseFence): Promise<void> {
  if (!await taskLeaseIsActive(env,task,fence)) throw new Error('ASI_TASK_LEASE_FENCE_LOST');
}

function taskLeaseFencedDatabase(
  database: D1Database,
  task: AsiQueueTask,
  fence: TaskLeaseFence,
  assertFence: () => Promise<void>,
): D1Database {
  const underlying = new WeakMap<object,D1PreparedStatement>();
  const guard = () => database.prepare(`
    INSERT INTO asi_task_lease_write_fences (
      fence_check_id,outbox_id,task_event_id,lease_owner,lease_epoch,checked_at
    ) VALUES (?,?,?,?,?,?)
  `).bind(
    makeId('task_fence'),task.outbox_id,task.event.event_id,fence.leaseOwner,fence.leaseEpoch,nowIso(),
  );
  const rethrowFence = (error: unknown): never => {
    if (String(error).includes('ASI_TASK_LEASE_FENCE_LOST')) throw new Error('ASI_TASK_LEASE_FENCE_LOST');
    throw error;
  };
  const fencedBatch = async (statements: D1PreparedStatement[]): Promise<D1Result[]> => {
    // This preflight gives fast failure and observability.  It is not the
    // correctness boundary: ownership can change immediately after it.  The
    // trigger-backed guard and all writes below execute in one D1 batch
    // transaction, closing that TOCTOU window with owner + epoch fencing.
    await assertFence();
    try {
      const results = await database.batch([guard(),...statements]);
      return results.slice(1);
    } catch (error) {
      return rethrowFence(error);
    }
  };
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(statement,{
      get(target,property,receiver) {
        if (property === 'bind') {
          return (...values: Parameters<D1PreparedStatement['bind']>) => wrap(target.bind(...values));
        }
        if (property === 'run') {
          return async () => {
            const [result] = await fencedBatch([target]);
            return result;
          };
        }
        return Reflect.get(target,property,receiver);
      },
    });
    underlying.set(proxy,statement);
    return proxy;
  };
  return new Proxy(database,{
    get(target,property,receiver) {
      if (property === 'prepare') return (query: string) => wrap(target.prepare(query));
      if (property === 'batch') {
        return async (statements: D1PreparedStatement[]) => fencedBatch(
          statements.map((statement) => underlying.get(statement) || statement),
        );
      }
      return Reflect.get(target,property,receiver);
    },
  });
}

async function recordTransportReceipt(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  queueName: string,
  task: AsiQueueTask,
  messageId: string,
  attempts: number,
  processorState: AsiProcessorState,
  taskLeaseFence: TaskLeaseFence,
): Promise<void> {
  const token = makeId('receipt');
  const timestamp = nowIso();
  const key = partitionKey(task.event.partition);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO asi_processed_messages (
        queue_name,outbox_id,message_id,event_id,status,attempt_count,first_seen_at,last_seen_at,processing_token
      ) SELECT ?,?,?,?,'PROCESSING',?,?,?,? WHERE EXISTS (
        SELECT 1 FROM asi_task_leases WHERE outbox_id=? AND task_event_id=? AND lease_owner=? AND attempt_count=?
          AND released_at IS NULL AND datetime(expires_at)>datetime('now')
      )
      ON CONFLICT(queue_name,outbox_id) DO UPDATE SET message_id=excluded.message_id,status='PROCESSING',
        attempt_count=MAX(asi_processed_messages.attempt_count,excluded.attempt_count),last_seen_at=excluded.last_seen_at,
        processing_token=excluded.processing_token,completed_at=NULL,last_error=NULL
      WHERE asi_processed_messages.status<>'SUCCEEDED'
    `).bind(
      queueName,task.outbox_id,messageId,task.event.event_id,attempts,timestamp,timestamp,token,
      task.outbox_id,task.event.event_id,taskLeaseFence.leaseOwner,taskLeaseFence.leaseEpoch,
    ),
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
      ) SELECT ?,?, ?,1,0,0,0,?,NULL,? WHERE EXISTS (
        SELECT 1 FROM asi_processed_messages WHERE queue_name=? AND outbox_id=? AND processing_token=? AND status='PROCESSING'
      )
      ON CONFLICT(engine_fleet) DO UPDATE SET state=excluded.state,
        processed_count=asi_engine_health.processed_count+1,last_success_at=excluded.last_success_at,updated_at=excluded.updated_at
    `).bind(fleet.id,fleet.queue,`PROCESSOR_${processorState}`,timestamp,timestamp,queueName,task.outbox_id,token),
    env.DB.prepare(`
      UPDATE asi_processed_messages SET status='SUCCEEDED',completed_at=?,last_seen_at=?,processing_token=NULL,last_error=NULL
      WHERE queue_name=? AND outbox_id=? AND processing_token=?
    `).bind(timestamp,timestamp,queueName,task.outbox_id,token),
    releaseTaskLease(env,task,taskLeaseFence,'SUCCEEDED',null,timestamp),
  ]);
  const succeeded = await env.DB.prepare(`
    SELECT 1 AS succeeded FROM asi_processed_messages
    WHERE queue_name=? AND outbox_id=? AND status='SUCCEEDED' AND processing_token IS NULL
  `).bind(queueName,task.outbox_id).first<{succeeded:number}>();
  if (Number(succeeded?.succeeded || 0) !== 1) throw new Error('ASI_TASK_LEASE_FENCE_LOST');
}

async function recordTransportFailure(
  env: AsiMeshEnv,
  fleet: AsiFleet,
  queueName: string,
  task: AsiQueueTask | null,
  messageId: string,
  attempts: number,
  error: string,
  taskLeaseFence: TaskLeaseFence | null,
): Promise<void> {
  const timestamp = nowIso();
  const outboxId = task?.outbox_id || `invalid_${messageId}`;
  const failureToken = makeId('failure');
  const failureRecord = task && taskLeaseFence
    ? env.DB.prepare(`
      INSERT INTO asi_processed_messages (
        queue_name,outbox_id,message_id,event_id,status,attempt_count,first_seen_at,last_seen_at,processing_token,last_error
      ) SELECT ?,?,?,?,'FAILED',?,?,?, ?,? WHERE EXISTS (
        SELECT 1 FROM asi_task_leases WHERE outbox_id=? AND task_event_id=? AND lease_owner=? AND attempt_count=?
          AND released_at IS NULL AND datetime(expires_at)>datetime('now')
      )
      ON CONFLICT(queue_name,outbox_id) DO UPDATE SET status='FAILED',attempt_count=MAX(asi_processed_messages.attempt_count,excluded.attempt_count),
        last_seen_at=excluded.last_seen_at,processing_token=excluded.processing_token,last_error=excluded.last_error
      WHERE asi_processed_messages.status<>'SUCCEEDED'
    `).bind(
      queueName,outboxId,messageId,task.event.event_id,attempts,timestamp,timestamp,failureToken,error,
      task.outbox_id,task.event.event_id,taskLeaseFence.leaseOwner,taskLeaseFence.leaseEpoch,
    )
    : task ? env.DB.prepare(`
      INSERT INTO asi_processed_messages (
        queue_name,outbox_id,message_id,event_id,status,attempt_count,first_seen_at,last_seen_at,processing_token,last_error
      ) VALUES (?,?,?,?,'FAILED',?,?,?, ?,?)
      ON CONFLICT(queue_name,outbox_id) DO UPDATE SET status='FAILED',
        attempt_count=MAX(asi_processed_messages.attempt_count,excluded.attempt_count),
        last_seen_at=excluded.last_seen_at,processing_token=excluded.processing_token,last_error=excluded.last_error
      WHERE asi_processed_messages.status<>'SUCCEEDED'
    `).bind(
      queueName,outboxId,messageId,task.event.event_id,attempts,timestamp,timestamp,failureToken,error,
    ) : env.DB.prepare(`
      INSERT INTO asi_processed_messages (
        queue_name,outbox_id,message_id,event_id,status,attempt_count,first_seen_at,last_seen_at,processing_token,last_error
      ) VALUES (?,?,?,NULL,'FAILED',?,?,?, ?,?)
      ON CONFLICT(queue_name,outbox_id) DO UPDATE SET status='FAILED',
        attempt_count=MAX(asi_processed_messages.attempt_count,excluded.attempt_count),
        last_seen_at=excluded.last_seen_at,processing_token=excluded.processing_token,last_error=excluded.last_error
      WHERE asi_processed_messages.status<>'SUCCEEDED'
    `).bind(queueName,outboxId,messageId,attempts,timestamp,timestamp,failureToken,error);
  const statements: D1PreparedStatement[] = [
    failureRecord,
    env.DB.prepare(`
      INSERT INTO asi_engine_health (
        engine_fleet,queue_name,state,processed_count,failed_count,retry_count,dead_letter_count,last_success_at,last_failure_at,updated_at
      ) SELECT ?,?,'TRANSPORT_RETRY',0,1,1,0,NULL,?,? WHERE EXISTS (
        SELECT 1 FROM asi_processed_messages WHERE queue_name=? AND outbox_id=? AND processing_token=? AND status='FAILED'
      )
      ON CONFLICT(engine_fleet) DO UPDATE SET state='TRANSPORT_RETRY',failed_count=asi_engine_health.failed_count+1,
        retry_count=asi_engine_health.retry_count+1,last_failure_at=excluded.last_failure_at,updated_at=excluded.updated_at
    `).bind(fleet.id,fleet.queue,timestamp,timestamp,queueName,outboxId,failureToken),
  ];
  if (task) {
    const key = partitionKey(task.event.partition);
    statements.push(env.DB.prepare(`
      INSERT INTO asi_queue_watermarks (queue_name,partition_key,last_event_id,last_observed_at,last_processed_at,processed_count,failed_count)
      SELECT ?,?,?,?,?,0,1 WHERE EXISTS (
        SELECT 1 FROM asi_processed_messages WHERE queue_name=? AND outbox_id=? AND processing_token=? AND status='FAILED'
      )
      ON CONFLICT(queue_name,partition_key) DO UPDATE SET last_processed_at=excluded.last_processed_at,
        failed_count=asi_queue_watermarks.failed_count+1
    `).bind(queueName,key,task.event.event_id,task.event.observed_at,timestamp,queueName,outboxId,failureToken));
    if (taskLeaseFence) statements.push(releaseTaskLease(env,task,taskLeaseFence,'FAILED',error,timestamp));
  }
  statements.push(env.DB.prepare(`
    UPDATE asi_processed_messages SET processing_token=NULL
    WHERE queue_name=? AND outbox_id=? AND processing_token=?
  `).bind(queueName,outboxId,failureToken));
  await env.DB.batch(statements);
}

async function consumeDeadLetterBatch(batch: MessageBatch<AsiQueueTask>, env: AsiMeshEnv): Promise<void> {
  for (const message of batch.messages) {
    try {
      let task: AsiQueueTask | null = null;
      try { task = validateQueueTask(message.body); } catch {}
      const recordedAt = nowIso();
      const sourceQueue = task?.source_queue || null;
      const payloadJson = safeJson(message.body);
      const receiptId = `terminal_dlq_${message.id}`;
      const statements: D1PreparedStatement[] = [env.DB.prepare(`
        INSERT OR IGNORE INTO asi_terminal_dlq_receipts (
          receipt_id,receipt_type,dlq_queue_name,source_queue_name,message_id,event_id,outbox_id,payload_json,payload_bytes,
          operating_state,replay_required,ack_policy,ack_requested,loss_guarantee,recorded_at
        ) VALUES (?,'CLOUDFLARE_QUEUE_DLQ',?,?,?,?,?,?,?,'HOLD',1,'ACK_AFTER_D1_PERSIST',1,0,?)
      `).bind(
        receiptId,batch.queue,sourceQueue,message.id,task?.event.event_id || null,task?.outbox_id || null,payloadJson,
        new TextEncoder().encode(payloadJson).byteLength,recordedAt,
      ),env.DB.prepare(`
        INSERT OR IGNORE INTO asi_dead_letters (
          id,queue_name,source_queue_name,source_queue_provenance_state,source_queue_candidates_json,
          message_id,event_id,attempts,error_code,error_message,payload_json,recorded_at,
          terminal_receipt_id,operating_state,replay_required
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'HOLD',1)
      `).bind(`dlq_${message.id}`,batch.queue,sourceQueue,task ? 'RESOLVED_TASK_ENVELOPE' : 'UNRESOLVED_INVALID_TASK',
        JSON.stringify(sourceQueue ? [sourceQueue] : []),message.id,task?.event.event_id || null,message.attempts,
        task ? 'CLOUDFLARE_QUEUE_DLQ' : 'CLOUDFLARE_QUEUE_DLQ_TASK_INVALID',
        'Message exhausted source-queue retries; attempts are DLQ delivery attempts',payloadJson,recordedAt,receiptId)];
      if (task) {
        statements.push(env.DB.prepare(`
          UPDATE asi_outbox SET status='DEAD_LETTERED',last_error='CLOUDFLARE_QUEUE_DLQ',updated_at=?,
            lease_owner=NULL,lease_expires_at=NULL WHERE id=? AND event_id=? AND engine_fleet=? AND queue_name=?
        `).bind(recordedAt,task.outbox_id,task.event.event_id,task.target_fleet,task.source_queue));
        const taskFleet = ASI_FLEET_BY_ID.get(task.target_fleet);
        if (taskFleet?.queue === task.source_queue) {
          statements.push(...countTerminalDeadLetterOnce(env,taskFleet,receiptId,recordedAt));
        }
      }
      await env.DB.batch(statements);
      // Queue ACK is requested only after the D1 terminal receipt and dead-letter
      // row commit together. If persistence throws, the catch requests retry.
      message.ack();
    } catch (error) {
      console.error(JSON.stringify({
        event:'asi.terminal_dlq.persist_failed',queue:batch.queue,message_id:message.id,
        error_code:errorCode(error instanceof Error ? error.message : String(error)),mode:'SHADOW',production:'HOLD',
      }));
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
    let taskLeaseFence: TaskLeaseFence | null = null;
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
      taskLeaseFence = await claimTaskLease(env,fleet,task);
      if (!taskLeaseFence) {
        message.retry({delaySeconds:30});
        return;
      }
      const claimedTask = task;
      const claimedTaskLeaseFence = taskLeaseFence;
      await assertTaskLease(env,claimedTask,claimedTaskLeaseFence);
      const fencedDatabase = taskLeaseFencedDatabase(
        env.DB,
        claimedTask,
        claimedTaskLeaseFence,
        async () => { await assertTaskLease(env,claimedTask,claimedTaskLeaseFence); },
      );
      const taskEnv = new Proxy(env,{
        get(target,property,receiver) {
          if (property === 'DB') return fencedDatabase;
          return Reflect.get(target,property,receiver);
        },
      });
      await persistEventAndOutboxes(taskEnv,claimedTask.event,[]);
      const processorRun = await runAsiProcessorTask(taskEnv,fleet,claimedTask,message.id,{
        stageEvent: async (event) => { await stageAsiEvent(taskEnv,event); },
        dispatchEvent: async (eventId) => { await resumeEventOutboxes(taskEnv,eventId); },
      });
      await assertTaskLease(env,claimedTask,claimedTaskLeaseFence);
      await recordTransportReceipt(
        env,fleet,batch.queue,claimedTask,message.id,message.attempts,processorRun.processor.state,claimedTaskLeaseFence,
      );
      message.ack();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await recordTransportFailure(
        env,fleet,batch.queue,task,message.id,message.attempts,messageText,taskLeaseFence,
      ).catch(() => undefined);
      message.retry({delaySeconds:Math.min(300,15 * 2 ** Math.max(0,message.attempts - 1))});
    }
  }));
}

async function completeReplay(
  env: AsiMeshEnv,
  replay: ReplayRow,
  fleet: AsiFleet,
  reasonCode: string,
): Promise<void> {
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_replay_requests SET status='COMPLETED',completed_at=?,replay_event_id=source_event_id,
        lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,last_error=NULL,terminal_reason=NULL
      WHERE replay_id=? AND (
        (?='RUNNING' AND status='RUNNING' AND lease_owner=? AND lease_expires_at IS NOT NULL
          AND datetime(lease_expires_at)>datetime('now') AND attempt_count=?)
        OR (?='AWAITING_CONSUMER' AND status='AWAITING_CONSUMER' AND attempt_count=?)
      )
    `).bind(
      timestamp,replay.replay_id,replay.status,replay.lease_owner,replay.attempt_count,replay.status,replay.attempt_count,
    ),
    env.DB.prepare(`
      UPDATE asi_replay_attempts SET state='COMPLETED',reason_code=?,completed_at=?
      WHERE replay_id=? AND attempt_number=? AND EXISTS (
        SELECT 1 FROM asi_replay_requests WHERE replay_id=? AND status='COMPLETED' AND completed_at=?
      )
    `).bind(reasonCode,timestamp,replay.replay_id,replay.attempt_count,replay.replay_id,timestamp),
    env.DB.prepare(`
      UPDATE asi_dead_letters SET replayed_at=?,replay_event_id=?,operating_state='REPLAYED',replay_required=0
      WHERE event_id=? AND source_queue_name=? AND replayed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM asi_replay_requests WHERE replay_id=? AND status='COMPLETED' AND completed_at=?
        )
    `).bind(timestamp,replay.source_event_id,replay.source_event_id,fleet.queue,replay.replay_id,timestamp),
    env.DB.prepare(`
      UPDATE asi_terminal_dlq_receipts SET operating_state='REPLAYED',replay_required=0
      WHERE event_id=? AND source_queue_name=? AND replay_required=1
        AND EXISTS (
          SELECT 1 FROM asi_replay_requests WHERE replay_id=? AND status='COMPLETED' AND completed_at=?
        )
    `).bind(replay.source_event_id,fleet.queue,replay.replay_id,timestamp),
  ]);
  const completed = await env.DB.prepare(`
    SELECT 1 AS completed FROM asi_replay_requests WHERE replay_id=? AND status='COMPLETED' AND completed_at=?
  `).bind(replay.replay_id,timestamp).first<{completed:number}>();
  if (Number(completed?.completed || 0) !== 1) throw new Error('ASI_REPLAY_LEASE_FENCE_LOST');
}

async function holdReplay(
  env: AsiMeshEnv,
  replay: ReplayRow,
  reasonCode: string,
): Promise<void> {
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_replay_requests SET status='HOLD',lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,
        last_error=?,terminal_reason=?,completed_at=? WHERE replay_id=? AND (
          (?='RUNNING' AND status='RUNNING' AND lease_owner=? AND lease_expires_at IS NOT NULL
            AND datetime(lease_expires_at)>datetime('now') AND attempt_count=?)
          OR (?='AWAITING_CONSUMER' AND status='AWAITING_CONSUMER' AND attempt_count=?)
        )
    `).bind(
      reasonCode,reasonCode,timestamp,replay.replay_id,replay.status,replay.lease_owner,replay.attempt_count,
      replay.status,replay.attempt_count,
    ),
    env.DB.prepare(`
      UPDATE asi_replay_attempts SET state='HOLD',reason_code=?,completed_at=?
      WHERE replay_id=? AND attempt_number=? AND EXISTS (
        SELECT 1 FROM asi_replay_requests WHERE replay_id=? AND status='HOLD' AND completed_at=?
      )
    `).bind(reasonCode,timestamp,replay.replay_id,replay.attempt_count,replay.replay_id,timestamp),
  ]);
  const held = await env.DB.prepare(`
    SELECT 1 AS held FROM asi_replay_requests WHERE replay_id=? AND status='HOLD' AND completed_at=?
  `).bind(replay.replay_id,timestamp).first<{held:number}>();
  if (Number(held?.held || 0) !== 1) throw new Error('ASI_REPLAY_LEASE_FENCE_LOST');
}

async function reconcileAwaitingReplays(env: AsiMeshEnv, limit: number): Promise<number> {
  const pending = await env.DB.prepare(`
    SELECT r.replay_id,r.source_event_id,r.target_engine_fleet,r.status,r.attempt_count,r.max_attempts,
      r.lease_owner,r.lease_expires_at,r.outbox_id,o.status AS outbox_status,p.status AS processing_status,
      r.next_attempt_at,
      CASE WHEN r.next_attempt_at IS NOT NULL AND datetime(r.next_attempt_at)<=datetime('now') THEN 1 ELSE 0 END AS consumer_timed_out
    FROM asi_replay_requests r
    LEFT JOIN asi_outbox o ON o.id=r.outbox_id
    LEFT JOIN asi_processed_messages p ON p.queue_name=o.queue_name AND p.outbox_id=o.id
    WHERE r.status='AWAITING_CONSUMER'
    ORDER BY r.requested_at,r.replay_id LIMIT ?
  `).bind(limit).all<ReplayRow & {
    outbox_status:string|null;processing_status:string|null;next_attempt_at:string|null;consumer_timed_out:number;
  }>();
  let completed = 0;
  for (const replay of pending.results || []) {
    const fleet = ASI_FLEET_BY_ID.get(replay.target_engine_fleet as AsiFleetId);
    if (!fleet) {
      await holdReplay(env,replay,'ASI_REPLAY_TARGET_FLEET_INVALID');
      continue;
    }
    if (replay.processing_status === 'SUCCEEDED') {
      await completeReplay(env,replay,fleet,'ASI_REPLAY_CONSUMER_SUCCEEDED');
      completed += 1;
      continue;
    }
    if (replay.outbox_status === 'DEAD_LETTERED') {
      if (replay.attempt_count >= replay.max_attempts) await holdReplay(env,replay,'ASI_REPLAY_ATTEMPTS_EXHAUSTED');
      else await env.DB.prepare(`
        UPDATE asi_replay_requests SET status='RETRY',next_attempt_at=datetime('now','+1 minute'),
          last_error='ASI_REPLAY_RETURNED_TO_DLQ' WHERE replay_id=? AND status='AWAITING_CONSUMER'
            AND attempt_count=?
      `).bind(replay.replay_id,replay.attempt_count).run();
      continue;
    }
    if (Number(replay.consumer_timed_out) === 1) {
      await holdReplay(env,replay,'ASI_REPLAY_CONSUMER_CONFIRMATION_TIMEOUT');
    }
  }
  return completed;
}

async function claimReplay(env: AsiMeshEnv, replayId: string): Promise<ReplayRow | null> {
  const leaseOwner = makeId('replay');
  const timestamp = nowIso();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_replay_requests SET status='RUNNING',attempt_count=attempt_count+1,started_at=COALESCE(started_at,?),
        lease_owner=?,lease_expires_at=datetime('now',?),next_attempt_at=NULL,last_error=NULL
      WHERE replay_id=? AND max_attempts BETWEEN 1 AND 2 AND attempt_count<max_attempts AND (
        (status IN ('PENDING','RETRY') AND (next_attempt_at IS NULL OR datetime(next_attempt_at)<=datetime('now')))
        OR (status='RUNNING' AND datetime(lease_expires_at)<=datetime('now'))
      )
    `).bind(timestamp,leaseOwner,`+${REPLAY_LEASE_SECONDS} seconds`,replayId),
    env.DB.prepare(`
      INSERT INTO asi_replay_attempts (
        attempt_id,replay_id,outbox_id,attempt_number,state,reason_code,lease_owner,started_at
      )
      SELECT 'replay_attempt_' || replay_id || '_' || attempt_count,replay_id,outbox_id,attempt_count,
        'CLAIMED','ASI_REPLAY_LEASE_CLAIMED',lease_owner,?
      FROM asi_replay_requests
      WHERE replay_id=? AND status='RUNNING' AND lease_owner=?
        AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now')
    `).bind(timestamp,replayId,leaseOwner),
  ]);
  if (Number(results[0]?.meta.changes || 0) === 0) return null;
  const row = await env.DB.prepare(`
    SELECT replay_id,source_event_id,target_engine_fleet,status,attempt_count,max_attempts,
      lease_owner,lease_expires_at,outbox_id
    FROM asi_replay_requests WHERE replay_id=? AND lease_owner=?
  `).bind(replayId,leaseOwner).first<ReplayRow>();
  if (!row) return null;
  return row;
}

async function processReplay(
  env: AsiMeshEnv,
  replay: ReplayRow,
): Promise<'DISPATCHED'|'COMPLETED'|'RETRY'|'HOLD'> {
  if (!replay.lease_owner) throw new Error('ASI_REPLAY_LEASE_FENCE_LOST');
  const replayFence: ReplayLeaseFence = {replayId:replay.replay_id,leaseOwner:replay.lease_owner};
  await assertReplayLease(env,replayFence);
  const fleet = ASI_FLEET_BY_ID.get(replay.target_engine_fleet as AsiFleetId);
  if (!fleet) {
    await holdReplay(env,replay,'ASI_REPLAY_TARGET_FLEET_INVALID');
    return 'HOLD';
  }
  const sourceOutbox = await env.DB.prepare(`
    SELECT id,event_id,engine_fleet,queue_binding,queue_name,payload_json,status,attempt_count,next_attempt_at,
      lease_owner,lease_expires_at,partition_key,fairness_key,control_hold_count
    FROM asi_outbox WHERE event_id=? AND engine_fleet=?
  `).bind(replay.source_event_id,fleet.id).first<OutboxRow>();
  if (!sourceOutbox || sourceOutbox.queue_binding !== fleet.binding || sourceOutbox.queue_name !== fleet.queue) {
    await holdReplay(env,replay,'ASI_REPLAY_SOURCE_OUTBOX_MISSING_OR_DRIFTED');
    return 'HOLD';
  }
  const prior = await env.DB.prepare(`
    SELECT status FROM asi_processed_messages WHERE queue_name=? AND outbox_id=?
  `).bind(fleet.queue,sourceOutbox.id).first<{status:string}>();
  if (prior?.status === 'SUCCEEDED') {
    const bound = {...replay,outbox_id:sourceOutbox.id};
    const boundOutbox = await env.DB.prepare(`
      UPDATE asi_replay_requests SET outbox_id=?
      WHERE replay_id=? AND status='RUNNING' AND lease_owner=?
        AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now') AND attempt_count=?
    `).bind(sourceOutbox.id,replay.replay_id,replay.lease_owner,replay.attempt_count).run();
    if (Number(boundOutbox.meta.changes || 0) !== 1) throw new Error('ASI_REPLAY_LEASE_FENCE_LOST');
    await completeReplay(env,bound,fleet,'ASI_REPLAY_ALREADY_SUCCEEDED');
    return 'COMPLETED';
  }
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_replay_requests SET outbox_id=? WHERE replay_id=? AND status='RUNNING' AND lease_owner=?
        AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now') AND attempt_count=?
    `).bind(sourceOutbox.id,replay.replay_id,replay.lease_owner,replay.attempt_count),
    env.DB.prepare(`
      UPDATE asi_replay_attempts SET outbox_id=?
      WHERE replay_id=? AND attempt_number=? AND lease_owner=? AND EXISTS (
        SELECT 1 FROM asi_replay_requests WHERE replay_id=? AND status='RUNNING' AND lease_owner=?
          AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now') AND attempt_count=?
      )
    `).bind(
      sourceOutbox.id,replay.replay_id,replay.attempt_count,replay.lease_owner,replay.replay_id,replay.lease_owner,
      replay.attempt_count,
    ),
  ]);
  await assertReplayLease(env,replayFence);

  if (sourceOutbox.status === 'DISPATCHED') {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE asi_replay_requests SET status='AWAITING_CONSUMER',lease_owner=NULL,lease_expires_at=NULL,
          next_attempt_at=datetime('now','+1 hour')
        WHERE replay_id=? AND status='RUNNING' AND lease_owner=?
          AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now') AND attempt_count=?
      `).bind(replay.replay_id,replay.lease_owner,replay.attempt_count),
      env.DB.prepare(`
        UPDATE asi_replay_attempts SET state='AWAITING_CONSUMER',reason_code='ASI_REPLAY_OUTBOX_ALREADY_DISPATCHED'
        WHERE replay_id=? AND attempt_number=? AND lease_owner=? AND EXISTS (
          SELECT 1 FROM asi_replay_requests WHERE replay_id=? AND status='AWAITING_CONSUMER' AND attempt_count=?
        )
      `).bind(replay.replay_id,replay.attempt_count,replay.lease_owner,replay.replay_id,replay.attempt_count),
    ]);
    return 'DISPATCHED';
  }

  await env.DB.prepare(`
    UPDATE asi_outbox SET status='RETRY',attempt_count=0,next_attempt_at=NULL,dispatched_at=NULL,
      lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=?
    WHERE id=? AND status IN ('DEAD_LETTERED','HOLD','RETRY','PENDING','DISPATCHING')
      AND EXISTS (
        SELECT 1 FROM asi_replay_requests WHERE replay_id=? AND status='RUNNING' AND lease_owner=?
          AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now') AND attempt_count=?
      )
  `).bind(nowIso(),sourceOutbox.id,replay.replay_id,replay.lease_owner,replay.attempt_count).run();
  await assertReplayLease(env,replayFence);
  const result = await dispatchOutbox(env,sourceOutbox.id,'REPLAY',replayFence);
  if (result === 'DISPATCHED') {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE asi_replay_requests SET status='AWAITING_CONSUMER',lease_owner=NULL,lease_expires_at=NULL,
          next_attempt_at=datetime('now','+1 hour'),last_error=NULL
        WHERE replay_id=? AND status='RUNNING' AND lease_owner=?
          AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now') AND attempt_count=?
      `).bind(replay.replay_id,replay.lease_owner,replay.attempt_count),
      env.DB.prepare(`
        UPDATE asi_replay_attempts SET state='AWAITING_CONSUMER',reason_code='ASI_REPLAY_DISPATCHED'
        WHERE replay_id=? AND attempt_number=? AND lease_owner=? AND EXISTS (
          SELECT 1 FROM asi_replay_requests WHERE replay_id=? AND status='AWAITING_CONSUMER' AND attempt_count=?
        )
      `).bind(replay.replay_id,replay.attempt_count,replay.lease_owner,replay.replay_id,replay.attempt_count),
    ]);
    return 'DISPATCHED';
  }
  if (replay.attempt_count >= replay.max_attempts || result === 'DEAD_LETTERED') {
    await holdReplay(env,replay,result === 'DEAD_LETTERED' ? 'ASI_REPLAY_DISPATCH_DEAD_LETTERED' : 'ASI_REPLAY_ATTEMPTS_EXHAUSTED');
    return 'HOLD';
  }
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE asi_replay_requests SET status='RETRY',lease_owner=NULL,lease_expires_at=NULL,
        next_attempt_at=datetime('now','+1 minute'),last_error='ASI_REPLAY_DISPATCH_RETRY'
      WHERE replay_id=? AND status='RUNNING' AND lease_owner=?
        AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at)>datetime('now') AND attempt_count=?
    `).bind(replay.replay_id,replay.lease_owner,replay.attempt_count),
    env.DB.prepare(`
      UPDATE asi_replay_attempts SET state='RETRY',reason_code='ASI_REPLAY_DISPATCH_RETRY',completed_at=?
      WHERE replay_id=? AND attempt_number=? AND lease_owner=? AND EXISTS (
        SELECT 1 FROM asi_replay_requests WHERE replay_id=? AND status='RETRY' AND attempt_count=?
      )
    `).bind(nowIso(),replay.replay_id,replay.attempt_count,replay.lease_owner,replay.replay_id,replay.attempt_count),
  ]);
  return 'RETRY';
}

export async function recoverPendingReplays(env: AsiMeshEnv, limit = REPLAY_LIMIT): Promise<AsiReplayResult> {
  const boundedLimit = Math.max(1,Math.min(25,limit));
  const completed = await reconcileAwaitingReplays(env,boundedLimit);
  const candidates = await env.DB.prepare(`
    SELECT replay_id FROM asi_replay_requests WHERE max_attempts BETWEEN 1 AND 2 AND attempt_count<max_attempts AND (
      (status IN ('PENDING','RETRY') AND (next_attempt_at IS NULL OR datetime(next_attempt_at)<=datetime('now')))
      OR (status='RUNNING' AND datetime(lease_expires_at)<=datetime('now'))
    ) ORDER BY requested_at,replay_id LIMIT ?
  `).bind(boundedLimit).all<{replay_id:string}>();
  let selected = 0;
  let dispatched = 0;
  let completedDuringDispatch = 0;
  let retry = 0;
  let hold = 0;
  let skipped = 0;
  for (const candidate of candidates.results || []) {
    const replay = await claimReplay(env,candidate.replay_id);
    if (!replay) continue;
    selected += 1;
    let result: Awaited<ReturnType<typeof processReplay>>;
    try {
      result = await processReplay(env,replay);
    } catch (error) {
      if (error instanceof Error && error.message === 'ASI_REPLAY_LEASE_FENCE_LOST') {
        skipped += 1;
        continue;
      }
      throw error;
    }
    if (result === 'DISPATCHED') dispatched += 1;
    else if (result === 'COMPLETED') completedDuringDispatch += 1;
    else if (result === 'RETRY') retry += 1;
    else hold += 1;
  }
  return {selected,dispatched,completed:completed + completedDuringDispatch,retry,hold,skipped};
}

export async function runAsiRecoveryCycle(
  env: AsiMeshEnv,
  relayLimit = 25,
  replayLimit = REPLAY_LIMIT,
): Promise<AsiRecoveryCycleResult> {
  const replay = await recoverPendingReplays(env,replayLimit);
  const relay = await relayPendingOutbox(env,relayLimit);
  return {mode:'SHADOW',relay,replay,production:'HOLD'};
}

export async function asiMeshTelemetry(env: AsiMeshEnv): Promise<Record<string, unknown>> {
  const [events,outbox,watermarks,deadLetters,admissions,health,fairness,replays,circuits,budgets,terminalDlq,leases,controlHolds] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM asi_event_log`).first<{count:number}>(),
    env.DB.prepare(`SELECT status,COUNT(*) AS count FROM asi_outbox GROUP BY status ORDER BY status`).all<{status:string;count:number}>(),
    env.DB.prepare(`SELECT queue_name,SUM(processed_count) AS processed,SUM(failed_count) AS failed,MAX(last_processed_at) AS last_processed_at FROM asi_queue_watermarks GROUP BY queue_name ORDER BY queue_name`).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM asi_dead_letters WHERE replayed_at IS NULL`).first<{count:number}>(),
    env.DB.prepare(`SELECT decision,COUNT(*) AS count FROM asi_purpose_admissions GROUP BY decision ORDER BY decision`).all(),
    env.DB.prepare(`
      SELECT h.engine_fleet,h.queue_name,h.state,h.processed_count,h.failed_count,h.retry_count,
        (SELECT COUNT(*) FROM asi_terminal_dlq_receipts r JOIN asi_outbox o ON o.id=r.outbox_id
          WHERE o.engine_fleet=h.engine_fleet AND o.queue_name=h.queue_name
            AND r.receipt_type IN ('CLOUDFLARE_QUEUE_DLQ','OUTBOX_DISPATCH_EXHAUSTED')) AS dead_letter_count,
        h.last_success_at,h.last_failure_at,h.updated_at
      FROM asi_engine_health h ORDER BY h.engine_fleet
    `).all(),
    env.DB.prepare(`
      SELECT COUNT(*) AS partition_count,COALESCE(SUM(selection_count),0) AS selections,
        COALESCE(SUM(dispatch_count),0) AS dispatched,COALESCE(SUM(retry_count),0) AS retries,
        COALESCE(SUM(dead_letter_count),0) AS dead_lettered,COALESCE(SUM(hold_count),0) AS held,
        MIN(selection_count) AS min_partition_selections,
        MAX(selection_count) AS max_partition_selections
      FROM asi_relay_fairness
    `).first(),
    env.DB.prepare(`SELECT status,COUNT(*) AS count FROM asi_replay_requests GROUP BY status ORDER BY status`).all(),
    env.DB.prepare(`
      SELECT state,COUNT(*) AS fleet_count,SUM(consecutive_failure_count) AS consecutive_failures,
        SUM(opened_count) AS opened_count FROM asi_circuit_breakers GROUP BY state ORDER BY state
    `).all(),
    env.DB.prepare(`
      SELECT engine_fleet,budget_window,request_limit,request_used,cost_limit_microunits,cost_used_microunits,
        window_started_at,window_ends_at FROM asi_fleet_budgets
      WHERE datetime(window_started_at)<=datetime('now') AND datetime(window_ends_at)>datetime('now')
      ORDER BY engine_fleet
    `).all(),
    env.DB.prepare(`
      SELECT COUNT(*) AS receipt_count,
        SUM(CASE WHEN replay_required=1 THEN 1 ELSE 0 END) AS hold_count,
        SUM(CASE WHEN ack_policy='ACK_AFTER_D1_PERSIST' AND ack_requested=1 THEN 1 ELSE 0 END) AS ack_after_persist_count
      FROM asi_terminal_dlq_receipts
    `).first(),
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM asi_task_leases WHERE released_at IS NULL AND datetime(expires_at)>datetime('now')) AS active_task_leases,
        (SELECT COUNT(*) FROM asi_task_leases WHERE released_at IS NULL AND datetime(expires_at)<=datetime('now')) AS expired_task_leases,
        (SELECT COUNT(*) FROM asi_replay_requests WHERE status='RUNNING' AND datetime(lease_expires_at)>datetime('now')) AS active_replay_leases,
        (SELECT COUNT(*) FROM asi_replay_requests WHERE status='RUNNING' AND datetime(lease_expires_at)<=datetime('now')) AS expired_replay_leases
    `).first(),
    env.DB.prepare(`
      SELECT reason_code,COUNT(*) AS count FROM asi_transport_control_holds
      GROUP BY reason_code ORDER BY reason_code
    `).all(),
  ]);
  return {
    mode:'SHADOW',
    runtime_alignment:'TWENTY_FIVE_DETERMINISTIC_SHADOW_PROCESSORS_QUEUE_RECOVERY_AND_FAIR_RELAY_CODE_WIRED_NOT_DEPLOYED',
    registered_fleet_count:ASI_FLEETS.length,
    engine_processor_implementation_count:asiProcessorInventory().length,
    event_count:Number(events?.count || 0),
    outbox:outbox.results || [],
    watermarks:watermarks.results || [],
    fleet_health:health.results || [],
    fleet_health_dead_letter_count_basis:'DERIVED_FROM_IDEMPOTENT_TERMINAL_D1_RECEIPTS_BY_SOURCE_QUEUE',
    unreplayed_dead_letters:Number(deadLetters?.count || 0),
    purpose_admissions:admissions.results || [],
    recovery_control:{
      version:'kidults-asi-runtime-recovery-fairness-shadow-v1@1.0.0',
      bounded_replay_max_attempts:2,
      task_lease_seconds:TASK_LEASE_SECONDS,
      replay_lease_seconds:REPLAY_LEASE_SECONDS,
      outbox_lease_seconds:OUTBOX_LEASE_SECONDS,
      leases:leases || {},
    },
    fair_relay_policy:{
      method:'PERSISTENT_LEAST_RECENTLY_SERVED_OLDEST_AGE_MARKET_CELL_V1',
      dimensions:['engine_fleet','channel','region','language','scope_id','source_role'],
      bounded_selection_limit:100,
      starvation_resistance:'CODE_AND_DETERMINISTIC_TEST_ONLY_NOT_REMOTE_LOAD_VERIFIED',
      decision_value_optimization:'NOT_IMPLEMENTED',
      coverage_gap_optimization:'NOT_IMPLEMENTED',
      state:fairness || {},
    },
    transport_control_holds:controlHolds.results || [],
    replay:replays.results || [],
    circuit_breakers:circuits.results || [],
    fleet_budgets:budgets.results || [],
    terminal_dlq:{
      ...(terminalDlq || {}),
      delivery_semantics:'AT_LEAST_ONCE',
      ack_policy:'ACK_ONLY_AFTER_D1_TERMINAL_LEDGER_PERSIST',
      operating_state:'HOLD_UNTIL_EXPLICIT_BOUNDED_REPLAY_COMPLETES',
      loss_guarantee:false,
      limitation:'FINITE_DLQ_RETRIES_AND_SIMULTANEOUS_QUEUE_D1_OUTAGE_REMAIN_UNVERIFIED',
    },
    remote_resources_verified:false,
    deployed:false,
    public_projection_authorized:false,
    production:'HOLD',
  };
}
