import baseWorker, { type Env as BaseEnv } from './index';
import {
  ASI_ENGINE_ALIGNMENT_POLICY_DIGEST,
  ASI_ENGINE_ALIGNMENT_POLICY_VERSION,
  assertAsiExecutionAlignment,
  type AsiEngineAlignmentPreflightReceipt,
} from './asi/alignment';
import {
  asiMeshTelemetry,
  consumeAsiBatch,
  enqueueAsiEvent,
  runAsiRecoveryCycle,
  type AsiRecoveryCycleResult,
  type AsiMeshEnv,
  type AsiQueueTask,
} from './asi/runtime';
import { ASI_PLATFORM_PRINCIPLES } from './asi/registry';
import { isControlTowerRoute } from './control-tower-ui/executive-control-tower.js';
import { isGatewayRoute } from './control-tower-gateway/control-tower-gateway.js';
import { bearerAuthorized, parseBoundedJson } from './http-security';

export type Env = BaseEnv & AsiMeshEnv & {
  ASI_MESH_MODE: Cloudflare.Env['ASI_MESH_MODE'];
};

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'cache-control': 'no-store' },
});

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;

function authorized(request: Request, env: Env): boolean {
  return bearerAuthorized(request,env.INGEST_TOKEN);
}

function engineAlignmentStatus() {
  return {
    policy_version:ASI_ENGINE_ALIGNMENT_POLICY_VERSION,
    policy_digest:ASI_ENGINE_ALIGNMENT_POLICY_DIGEST,
    principle_order:ASI_PLATFORM_PRINCIPLES,
    hard_floor_enforced:true,
    execution_fleet_count:25,
    logical_engine_contract_count:52,
    full_52_engine_runtime_implementation_claimed:false,
    durable_remote_runtime_deployed:false,
    public_release:'HOLD',
    production:'HOLD',
  } as const;
}

function enqueueErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'ASI_EVENT_ID_OR_IDEMPOTENCY_CONFLICT') {
    return json({error:'asi_event_conflict',message},409);
  }
  const clientError = error instanceof SyntaxError || message.startsWith('ASI_EVENT_') ||
    message.startsWith('ASI_ENGINE_ALIGNMENT_') || message.startsWith('CONTENT_TYPE_') ||
    message.startsWith('REQUEST_BODY_');
  return json({error:clientError ? 'asi_event_rejected' : 'asi_transport_unavailable',message},clientError ? 400 : 503);
}

async function recordShadowHeartbeat(
  env: Env,
  recovery: AsiRecoveryCycleResult,
): Promise<void> {
  // Keep scheduled recovery observability O(1). Full mesh telemetry contains
  // whole-table COUNT/GROUP BY queries and is intentionally available only on
  // the authenticated on-demand status route below. Running it every hour made
  // observability itself a D1 free-tier capacity consumer.
  await env.DB.prepare(`
    INSERT INTO audit_log (id,event_type,actor,details_json,created_at)
    VALUES (?,'asi.shadow.heartbeat','scheduler',?,?)
  `).bind(makeId('audit'),JSON.stringify({
    meshMode:env.ASI_MESH_MODE,
    telemetryMode:'ON_DEMAND_ONLY',
    recoveryCycle:recovery,
    engineAlignment:engineAlignmentStatus(),
    publicationAuthorized:false,
  }),nowIso()).run();
}

async function preflightAlignmentReceipts(
  env: Env,
  batch: MessageBatch<AsiQueueTask>,
): Promise<AsiEngineAlignmentPreflightReceipt[]> {
  const receipts: AsiEngineAlignmentPreflightReceipt[] = [];
  for (const message of batch.messages) {
    const task = message.body;
    const receipt = await assertAsiExecutionAlignment(task.target_fleet,task.event);
    if (!receipt.hard_floor_pass) throw new Error('ASI_ENGINE_ALIGNMENT_PREFLIGHT_NOT_PASS');
    await env.DB.prepare(`
      INSERT OR IGNORE INTO audit_log (id,event_type,actor,details_json,created_at)
      VALUES (?,'asi.engine.alignment.preflight.v2',?,?,?)
    `).bind(
      receipt.receipt_id,
      `asi-engine:${task.target_fleet}`,
      JSON.stringify({
        ...receipt,
        source_queue:task.source_queue,
        outbox_id:task.outbox_id,
        queue_message_id:message.id,
        runtime_mode:env.ASI_MESH_MODE,
      }),
      nowIso(),
    ).run();
    receipts.push(receipt);
  }
  return receipts;
}

async function recordAlignmentBatchCompletion(
  env: Env,
  batch: MessageBatch<AsiQueueTask>,
  receipts: readonly AsiEngineAlignmentPreflightReceipt[],
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO audit_log (id,event_type,actor,details_json,created_at)
    VALUES (?,'asi.engine.alignment.batch.completed.v2','asi-runtime',?,?)
  `).bind(makeId('audit'),JSON.stringify({
    queue:batch.queue,
    message_count:batch.messages.length,
    message_ids:batch.messages.map((message) => message.id),
    alignment_receipt_ids:receipts.map((receipt) => receipt.receipt_id),
    logical_engine_ids:[...new Set(receipts.map((receipt) => receipt.logical_engine_id))].sort(),
    fleet_ids:[...new Set(receipts.map((receipt) => receipt.fleet_id))].sort(),
    principle_order:ASI_PLATFORM_PRINCIPLES,
    all_hard_floors_pass:receipts.every((receipt) => receipt.hard_floor_pass),
    production:'HOLD',
  }),nowIso()).run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (isControlTowerRoute(url.pathname) || isGatewayRoute(url.pathname)) {
      return json({
        error:'projection_runtime_not_connected',
        reason:'FIXTURE_AND_SIMULATED_ACTION_ROUTES_DISABLED_UNTIL_GOVERNED_PROJECTION_AUTH_AND_DURABLE_ACTION_RUNTIME_EXIST',
        production:'HOLD',
      },423);
    }
    if (request.method === 'GET' && url.pathname === '/internal/asi/shadow/status') {
      if (!authorized(request,env)) return json({ error: 'unauthorized' },401);
      return json({
        ...(await asiMeshTelemetry(env)),
        engine_alignment:engineAlignmentStatus(),
      });
    }
    if (request.method === 'POST' && url.pathname === '/internal/asi/shadow/enqueue') {
      if (!authorized(request,env)) return json({ error: 'unauthorized' },401);
      if (env.ASI_MESH_MODE !== 'SHADOW') return json({ error: 'asi_mesh_not_in_shadow_mode' },423);
      try {
        const event = await parseBoundedJson(request);
        const result = await enqueueAsiEvent(env,event);
        const status = result.state === 'PARKED_NO_ENGINE_PROCESSOR' ? 423 : result.state === 'TRANSPORT_HOLD' ? 503 : 202;
        return json({ok:status === 202,...result,engine_alignment:engineAlignmentStatus(),mode:'SHADOW',production:'HOLD'},status);
      } catch (error) {
        return enqueueErrorResponse(error);
      }
    }
    if (request.method === 'POST' && (url.pathname === '/internal/collect' || url.pathname === '/internal/autonomous-cycle' || url.pathname === '/internal/ingest')) {
      return json({
        error:'legacy_serial_path_disabled',
        replacement:'/internal/asi/shadow/enqueue',
        reason:'NO_SYNCHRONOUS_ENGINE_CHAIN',
      },410);
    }
    if (request.method === 'GET' && url.pathname === '/v1/intelligence/current') {
      return json({ error:'publication_hold',reason:'PURPOSE_SPECIFIC_PUBLICATION_ADMISSION_NOT_GRANTED',production:'HOLD' },423);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/v1/evidence/')) {
      return json({ error:'evidence_projection_hold',reason:'PUBLIC_EVIDENCE_PROJECTION_NOT_ADMITTED',production:'HOLD' },423);
    }
    return baseWorker.fetch(request,env);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const recovery = await runAsiRecoveryCycle(env);
      await recordShadowHeartbeat(env,recovery);
    })().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await env.DB.prepare(`
        INSERT INTO audit_log (id,event_type,actor,details_json,created_at)
        VALUES (?,'asi.shadow.heartbeat.error','scheduler',?,?)
      `).bind(makeId('audit'),JSON.stringify({message,engineAlignment:engineAlignmentStatus()}),nowIso()).run();
    }));
  },

  async queue(batch: MessageBatch<AsiQueueTask>, env: Env): Promise<void> {
    const receipts = await preflightAlignmentReceipts(env,batch);
    await consumeAsiBatch(batch,env);
    await recordAlignmentBatchCompletion(env,batch,receipts);
  },
} satisfies ExportedHandler<Env, AsiQueueTask>;
