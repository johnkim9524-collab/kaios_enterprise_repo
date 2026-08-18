import baseWorker, { type Env as BaseEnv } from './index';
import {
  asiMeshTelemetry,
  consumeAsiBatch,
  enqueueAsiEvent,
  relayPendingOutbox,
  type AsiMeshEnv,
  type AsiQueueTask,
} from './asi/runtime';
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

function enqueueErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'ASI_EVENT_ID_OR_IDEMPOTENCY_CONFLICT') {
    return json({error:'asi_event_conflict',message},409);
  }
  const clientError = error instanceof SyntaxError || message.startsWith('ASI_EVENT_') ||
    message.startsWith('CONTENT_TYPE_') || message.startsWith('REQUEST_BODY_');
  return json({error:clientError ? 'asi_event_rejected' : 'asi_transport_unavailable',message},clientError ? 400 : 503);
}

async function recordShadowHeartbeat(
  env: Env,
  relay: {selected:number;dispatched:number;retry:number;deadLettered:number},
): Promise<void> {
  const telemetry = await asiMeshTelemetry(env);
  await env.DB.prepare(`
    INSERT INTO audit_log (id,event_type,actor,details_json,created_at)
    VALUES (?,'asi.shadow.heartbeat','scheduler',?,?)
  `).bind(makeId('audit'),JSON.stringify({
    meshMode:env.ASI_MESH_MODE,
    registeredFleetCount:telemetry.registered_fleet_count,
    eventCount:telemetry.event_count,
    unreplayedDeadLetters:telemetry.unreplayed_dead_letters,
    outboxRelay:relay,
    publicationAuthorized:false,
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
      return json(await asiMeshTelemetry(env));
    }
    if (request.method === 'POST' && url.pathname === '/internal/asi/shadow/enqueue') {
      if (!authorized(request,env)) return json({ error: 'unauthorized' },401);
      if (env.ASI_MESH_MODE !== 'SHADOW') return json({ error: 'asi_mesh_not_in_shadow_mode' },423);
      try {
        const event = await parseBoundedJson(request);
        const result = await enqueueAsiEvent(env,event);
        const status = result.state === 'PARKED_NO_ENGINE_PROCESSOR' ? 423 : result.state === 'TRANSPORT_HOLD' ? 503 : 202;
        return json({ok:status === 202,...result,mode:'SHADOW',production:'HOLD'},status);
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
      const relay = await relayPendingOutbox(env);
      await recordShadowHeartbeat(env,relay);
    })().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await env.DB.prepare(`
        INSERT INTO audit_log (id,event_type,actor,details_json,created_at)
        VALUES (?,'asi.shadow.heartbeat.error','scheduler',?,?)
      `).bind(makeId('audit'),JSON.stringify({message}),nowIso()).run();
    }));
  },

  async queue(batch: MessageBatch<AsiQueueTask>, env: Env): Promise<void> {
    await consumeAsiBatch(batch,env);
  },
} satisfies ExportedHandler<Env, AsiQueueTask>;
