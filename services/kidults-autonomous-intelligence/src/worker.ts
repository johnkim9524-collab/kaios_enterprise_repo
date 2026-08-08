import baseWorker, { type Env as BaseEnv } from './index';
import { collectConfiguredAdapters } from './orchestrator';
import { enrichPortalPayload, persistEnrichedSnapshot } from './publication';

export interface Env extends BaseEnv {
  SOURCE_ADAPTERS_JSON?: string;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;

function internalRequest(path: string, env: Env, body?: unknown) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (env.INGEST_TOKEN) headers.set('authorization', `Bearer ${env.INGEST_TOKEN}`);
  return new Request(`https://kidults.internal${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function recordCollectorRun(env: Env, values: {
  id: string; adapterId: string; family: string; startedAt: string; finishedAt: string; status: string;
  rawCount: number; normalizedCount: number; acceptedCount: number; rejectedCount: number; errorText?: string;
}) {
  await env.DB.prepare(`
    INSERT INTO collector_runs (
      id,adapter_id,source_family,started_at,finished_at,status,raw_count,normalized_count,accepted_count,rejected_count,error_text
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(values.id, values.adapterId, values.family, values.startedAt, values.finishedAt, values.status,
    values.rawCount, values.normalizedCount, values.acceptedCount, values.rejectedCount, values.errorText || null).run();
}

async function collect(env: Env) {
  const batches = await collectConfiguredAdapters(env.SOURCE_ADAPTERS_JSON);
  const summary = { adapters: batches.length, accepted: 0, duplicates: 0, rejected: 0, runs: [] as unknown[] };

  for (const batch of batches) {
    const startedAt = nowIso();
    const runId = makeId('collector');
    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;
    let errorText: string | undefined;

    for (const item of batch.normalized) {
      try {
        const response = await baseWorker.fetch(internalRequest('/internal/ingest', env, item), env);
        const result = await response.json() as { duplicate?: boolean; error?: string };
        if (!response.ok) {
          rejected += 1;
          errorText = result.error || `ingest HTTP ${response.status}`;
          continue;
        }
        if (result.duplicate) duplicates += 1;
        else accepted += 1;
      } catch (error) {
        rejected += 1;
        errorText = error instanceof Error ? error.message : String(error);
      }
    }

    await recordCollectorRun(env, {
      id: runId, adapterId: batch.adapterId, family: batch.family, startedAt, finishedAt: nowIso(),
      status: rejected ? 'partial' : 'succeeded', rawCount: batch.rawCount, normalizedCount: batch.normalized.length,
      acceptedCount: accepted, rejectedCount: rejected, errorText,
    });

    summary.accepted += accepted;
    summary.duplicates += duplicates;
    summary.rejected += rejected;
    summary.runs.push({ runId, adapterId: batch.adapterId, family: batch.family, accepted, duplicates, rejected });
  }

  return summary;
}

async function promote(env: Env) {
  const response = await baseWorker.fetch(internalRequest('/internal/publish', env), env);
  const result = await response.json() as any;
  if (!response.ok) throw new Error(result?.message || result?.error || `publish HTTP ${response.status}`);

  const enriched = await enrichPortalPayload(env, result.runId, result.payload || {});
  const payloadHash = await persistEnrichedSnapshot(env, result.runId, enriched.payload);
  const publishReady = Boolean(result.productionEligible) && enriched.ready;

  if (!publishReady) {
    await env.DB.prepare(`UPDATE publication_snapshots SET status='blocked',published_at=NULL WHERE run_id=? AND channel='portal'`)
      .bind(result.runId).run();
    await env.DB.prepare(`
      INSERT INTO audit_log (id,event_type,actor,subject_id,details_json,created_at)
      VALUES (?,'publication.blocked','orchestrator',?,?,?)
    `).bind(makeId('audit'), result.runId || null, JSON.stringify({
      productionEligible: Boolean(result.productionEligible),
      portalContractReady: enriched.ready,
      trendObservationCount: enriched.payload?.governance?.trendObservationCount || 0,
      correlationObservationWindow: enriched.payload?.governance?.correlationObservationWindow || 0
    }), nowIso()).run();
    return { promoted: false, portalContractReady: enriched.ready, result: { ...result, payload: enriched.payload, payloadHash } };
  }

  const snapshot = await env.DB.prepare(`
    SELECT id,payload_hash,published_at FROM publication_snapshots
    WHERE run_id=? AND channel='portal' ORDER BY created_at DESC LIMIT 1
  `).bind(result.runId).first<{ id:string; payload_hash:string; published_at:string }>();

  if (!snapshot) throw new Error('eligible run has no publication snapshot');

  await env.DB.prepare(`
    INSERT INTO publication_state(channel,snapshot_id,payload_hash,promoted_at,updated_at)
    VALUES ('portal',?,?,?,?)
    ON CONFLICT(channel) DO UPDATE SET snapshot_id=excluded.snapshot_id,payload_hash=excluded.payload_hash,
      promoted_at=excluded.promoted_at,updated_at=excluded.updated_at
  `).bind(snapshot.id, snapshot.payload_hash, snapshot.published_at || nowIso(), nowIso()).run();

  await env.DB.prepare(`
    INSERT INTO audit_log (id,event_type,actor,subject_id,details_json,created_at)
    VALUES (?,'publication.promoted','orchestrator',?,?,?)
  `).bind(makeId('audit'), snapshot.id, JSON.stringify({ runId: result.runId, payloadHash: snapshot.payload_hash }), nowIso()).run();

  return { promoted: true, snapshotId: snapshot.id, payloadHash: snapshot.payload_hash, result: { ...result, payload: enriched.payload } };
}

async function autonomousCycle(env: Env) {
  const collection = await collect(env);
  const promotion = await promote(env);
  return { ok: true, collection, promotion, completedAt: nowIso() };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/internal/collect') {
      const auth = env.INGEST_TOKEN ? request.headers.get('authorization') === `Bearer ${env.INGEST_TOKEN}` : env.KIDULTS_ENV !== 'production';
      if (!auth) return json({ error: 'unauthorized' }, 401);
      try { return json(await collect(env)); }
      catch (error) { return json({ error: 'collection_failed', message: error instanceof Error ? error.message : String(error) }, 500); }
    }
    if (request.method === 'POST' && url.pathname === '/internal/autonomous-cycle') {
      const auth = env.INGEST_TOKEN ? request.headers.get('authorization') === `Bearer ${env.INGEST_TOKEN}` : env.KIDULTS_ENV !== 'production';
      if (!auth) return json({ error: 'unauthorized' }, 401);
      try { return json(await autonomousCycle(env)); }
      catch (error) { return json({ error: 'cycle_failed', message: error instanceof Error ? error.message : String(error) }, 500); }
    }
    if (request.method === 'GET' && url.pathname === '/v1/intelligence/current') {
      const state = await env.DB.prepare(`
        SELECT p.payload_json,p.payload_hash,p.published_at
        FROM publication_state s JOIN publication_snapshots p ON p.id=s.snapshot_id
        WHERE s.channel='portal' AND p.status='published' LIMIT 1
      `).first<{ payload_json:string; payload_hash:string; published_at:string }>();
      if (!state) return json({ error: 'no promoted production snapshot' }, 404);
      return new Response(state.payload_json, { headers: {
        'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60',
        'etag': `"${state.payload_hash}"`, 'x-kidults-published-at': state.published_at,
      }});
    }
    return baseWorker.fetch(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(autonomousCycle(env).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await env.DB.prepare(`
        INSERT INTO audit_log (id,event_type,actor,details_json,created_at)
        VALUES (?,'autonomous_cycle.error','scheduler',?,?)
      `).bind(makeId('audit'), JSON.stringify({ message }), nowIso()).run();
    }));
  },
};
