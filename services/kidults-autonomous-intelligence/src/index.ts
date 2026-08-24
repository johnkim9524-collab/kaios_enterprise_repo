import { bearerAuthorized, parseBoundedJson } from './http-security';

export type Env = Pick<Cloudflare.Env,
  'DB' | 'METHODOLOGY_VERSION' | 'MIN_EVIDENCE_FOR_PUBLISH'
> & {
  KIDULTS_ENV: string;
  ASI_PUBLICATION_ENABLED: string;
  INGEST_TOKEN?: string;
};

type MetricInput = {
  key: string;
  value: number;
  unit?: string;
  confidence?: number;
};

type IngestInput = {
  source: {
    id: string;
    name: string;
    family: string;
    region?: string;
    baseUrl?: string;
    trustTier?: 'A' | 'B' | 'C' | 'D';
  };
  entity: {
    id?: string;
    type?: string;
    name: string;
    category: string;
    externalKeys?: Record<string, string>;
  };
  evidence: {
    admissionId: string;
    admissionInputSnapshotRef: string;
    externalId?: string;
    observedAt: string;
    provenanceUrl?: string;
    provenanceLabel?: string;
    licenseCode?: string;
    grade?: 'A' | 'B' | 'C' | 'D';
    confidence?: number;
    raw: unknown;
  };
  metrics: MetricInput[];
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  market_activity: 0.32,
  cultural_momentum: 0.24,
  scarcity: 0.21,
  canon_strength: 0.23,
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function authorized(request: Request, env: Env) {
  return bearerAuthorized(request,env.INGEST_TOKEN);
}

function validateIngest(input: IngestInput) {
  if (!input?.source?.id || !input.source.name || !input.source.family) throw new Error('source.id, source.name and source.family are required');
  if (!input?.entity?.name || !input.entity.category) throw new Error('entity.name and entity.category are required');
  if (!input?.evidence?.observedAt) throw new Error('evidence.observedAt is required');
  if (!input.evidence.admissionId) throw new Error('evidence.admissionId is required');
  if (!/^sha256:[a-f0-9]{64}$/.test(input.evidence.admissionInputSnapshotRef || '')) throw new Error('evidence.admissionInputSnapshotRef is required');
  if (!Number.isFinite(Date.parse(input.evidence.observedAt))) throw new Error('evidence.observedAt must be ISO-compatible');
  if (!Array.isArray(input.metrics) || input.metrics.length === 0) throw new Error('metrics must contain at least one observation');
  for (const metric of input.metrics) {
    if (!metric.key || !Number.isFinite(Number(metric.value))) throw new Error('each metric requires key and numeric value');
  }
}

async function ingest(request: Request, env: Env) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  const input = (await parseBoundedJson(request)) as IngestInput;
  validateIngest(input);

  const timestamp = nowIso();
  const sourceId = input.source.id;
  const admission = await env.DB.prepare(`
    SELECT a.admission_id,a.source_id,a.purpose,a.evidence_class,a.output_class,a.region,a.decision,a.rights_state,
      a.policy_version,a.input_snapshot_ref,a.review_due_at
    FROM asi_purpose_admissions a
    JOIN asi_admission_assertions aa ON aa.admission_id=a.admission_id
    JOIN asi_engine_assertions ea ON ea.assertion_id=aa.assertion_id
    WHERE a.admission_id=? AND a.source_id=? AND a.purpose='BOUNDED_SHADOW_ACQUISITION'
      AND a.output_class='INTERNAL_SHADOW' AND a.decision='PASS' AND a.rights_state='ALLOW'
      AND a.policy_version='kidults-asi-purpose-specific-admission-policy-v1@1.0.0'
      AND a.input_snapshot_ref=?
      AND a.required_assertion_count=9 AND a.satisfied_assertion_count=9
      AND a.superseded_at IS NULL AND a.revoked_at IS NULL AND a.review_due_at>?
      AND ea.source_id=a.source_id AND ea.purpose=a.purpose AND ea.decision='PASS' AND ea.rights_state='ALLOW'
    GROUP BY a.admission_id
    HAVING COUNT(DISTINCT ea.assertion_type)=9
      AND COUNT(DISTINCT CASE WHEN ea.assertion_type IN (
        'COLLECT','STORE','TRANSFORM','RETENTION','RATE_LIMIT','ROBOTS','SCHEMA','PROVENANCE','FRESHNESS'
      ) THEN ea.assertion_type END)=9
    LIMIT 1
  `).bind(input.evidence.admissionId,sourceId,input.evidence.admissionInputSnapshotRef,timestamp).first<{
    admission_id:string;source_id:string;purpose:string;evidence_class:string;output_class:string;
    region:string;decision:string;rights_state:string;policy_version:string;input_snapshot_ref:string;review_due_at:string;
  }>();
  if (!admission) return json({ error: 'purpose_admission_required', sourceId }, { status: 403 });
  const entityId = input.entity.id || `ent_${slug(input.entity.type || 'collectible')}_${slug(input.entity.name)}`;
  const evidenceId = makeId('ev');
  const rawPayload = JSON.stringify(input.evidence.raw);
  const payloadHash = await sha256(input.evidence.raw);
  const evidenceConfidence = clamp(Number(input.evidence.confidence ?? 50));

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT INTO source_registry (id,name,source_family,region,base_url,trust_tier,is_active,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_family=excluded.source_family,region=excluded.region,
        base_url=excluded.base_url,trust_tier=excluded.trust_tier,is_active=1,updated_at=excluded.updated_at
    `).bind(sourceId, input.source.name, input.source.family, input.source.region || null, input.source.baseUrl || null,
      input.source.trustTier || 'C', timestamp, timestamp),
    env.DB.prepare(`
      INSERT INTO entity_registry (id,entity_type,canonical_name,category,external_keys_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET canonical_name=excluded.canonical_name,category=excluded.category,
        external_keys_json=excluded.external_keys_json,updated_at=excluded.updated_at
    `).bind(entityId, input.entity.type || 'collectible', input.entity.name, input.entity.category,
      JSON.stringify(input.entity.externalKeys || {}), timestamp, timestamp),
    env.DB.prepare(`
      INSERT INTO evidence_ledger (
        id,source_id,entity_id,external_id,observed_at,ingested_at,payload_hash,provenance_url,provenance_label,
        license_code,raw_payload_json,evidence_grade,confidence,status,admission_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'accepted',?)
    `).bind(evidenceId, sourceId, entityId, input.evidence.externalId || null, input.evidence.observedAt, timestamp,
      payloadHash, input.evidence.provenanceUrl || null, input.evidence.provenanceLabel || null,
      input.evidence.licenseCode || null, rawPayload, input.evidence.grade || 'D', evidenceConfidence,admission.admission_id),
  ];

  for (const metric of input.metrics) {
    statements.push(env.DB.prepare(`
      INSERT INTO observations (id,evidence_id,entity_id,metric_key,metric_value,unit,confidence,observed_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(makeId('obs'), evidenceId, entityId, metric.key, Number(metric.value), metric.unit || null,
      clamp(Number(metric.confidence ?? evidenceConfidence)), input.evidence.observedAt, timestamp));
  }

  statements.push(env.DB.prepare(`
    INSERT INTO audit_log (id,event_type,actor,subject_id,details_json,created_at)
    VALUES (?,'evidence.ingested','collector',?,?,?)
  `).bind(makeId('audit'), evidenceId, JSON.stringify({
    sourceId,entityId,metrics:input.metrics.length,payloadHash,admissionId:admission.admission_id,
    admissionPurpose:admission.purpose,admissionRightsState:admission.rights_state,
  }), timestamp));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('UNIQUE')) return json({ ok: true, duplicate: true, sourceId, entityId, payloadHash }, { status: 200 });
    throw error;
  }

  return json({ ok: true, evidenceId, sourceId, entityId, payloadHash, observedAt: input.evidence.observedAt }, { status: 201 });
}

async function runIntelligence(env: Env, triggerType: string) {
  const startedAt = nowIso();
  const runId = makeId('run');
  const cutoff = startedAt;

  const evidenceCountRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM evidence_ledger WHERE status='accepted' AND observed_at<=?`).bind(cutoff).first<{count:number}>();
  const inputEvidenceCount = Number(evidenceCountRow?.count || 0);

  await env.DB.prepare(`
    INSERT INTO intelligence_runs (id,started_at,trigger_type,methodology_version,evidence_cutoff,status,input_evidence_count)
    VALUES (?,?,?,?,?,'running',?)
  `).bind(runId, startedAt, triggerType, env.METHODOLOGY_VERSION, cutoff, inputEvidenceCount).run();

  const rows = await env.DB.prepare(`
    WITH latest AS (
      SELECT o.entity_id,o.metric_key,o.metric_value,o.confidence,o.observed_at,e.category,
             ROW_NUMBER() OVER (PARTITION BY o.entity_id,o.metric_key ORDER BY o.observed_at DESC,o.created_at DESC) AS rn
      FROM observations o
      JOIN entity_registry e ON e.id=o.entity_id
      JOIN evidence_ledger l ON l.id=o.evidence_id
      WHERE l.status='accepted' AND o.observed_at<=?
    )
    SELECT category,metric_key,
           SUM(metric_value * confidence) / NULLIF(SUM(confidence),0) AS value,
           AVG(confidence) AS confidence,
           COUNT(*) AS observation_count
    FROM latest
    WHERE rn=1
    GROUP BY category,metric_key
    ORDER BY category,metric_key
  `).bind(cutoff).all<{category:string;metric_key:string;value:number;confidence:number;observation_count:number}>();

  const categoryMap = new Map<string, Map<string, { value:number; confidence:number; count:number }>>();
  for (const row of rows.results || []) {
    if (!categoryMap.has(row.category)) categoryMap.set(row.category, new Map());
    categoryMap.get(row.category)!.set(row.metric_key, {
      value: Number(row.value), confidence: Number(row.confidence), count: Number(row.observation_count),
    });
  }

  const categorySnapshots: Array<{
    category:string;score:number;confidence:number;marketActivity:number|null;culturalMomentum:number|null;
    scarcity:number|null;canonStrength:number|null;marketVelocity:number|null;liquidity:number|null;
    lifecycleStage:string;evidenceCount:number;
  }> = [];

  for (const [category, metrics] of categoryMap.entries()) {
    let weightedScore = 0;
    let weightTotal = 0;
    let confidenceWeighted = 0;
    let confidenceWeight = 0;
    let evidenceCount = 0;

    for (const [metricKey, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      const metric = metrics.get(metricKey);
      if (!metric) continue;
      weightedScore += clamp(metric.value) * weight;
      weightTotal += weight;
      confidenceWeighted += clamp(metric.confidence) * weight;
      confidenceWeight += weight;
      evidenceCount += metric.count;
    }

    if (weightTotal === 0) continue;
    const score = round1(weightedScore / weightTotal);
    const confidence = round1(confidenceWeighted / Math.max(confidenceWeight, 0.0001));
    const lifecycleStage = score >= 82 ? 'Legacy' : score >= 68 ? 'Growth' : score >= 55 ? 'Emerging' : 'Monitor';
    const valueOf = (key:string) => metrics.has(key) ? round2(metrics.get(key)!.value) : null;

    categorySnapshots.push({
      category, score, confidence,
      marketActivity: valueOf('market_activity'),
      culturalMomentum: valueOf('cultural_momentum'),
      scarcity: valueOf('scarcity'),
      canonStrength: valueOf('canon_strength'),
      marketVelocity: valueOf('market_velocity'),
      liquidity: valueOf('liquidity'),
      lifecycleStage, evidenceCount,
    });
  }

  categorySnapshots.sort((a,b) => b.score - a.score || a.category.localeCompare(b.category));

  const snapshotStatements: D1PreparedStatement[] = [];
  for (const item of categorySnapshots) {
    snapshotStatements.push(env.DB.prepare(`
      INSERT INTO category_snapshots (
        id,run_id,category,score,confidence,market_activity,cultural_momentum,scarcity,canon_strength,
        market_velocity,liquidity,lifecycle_stage,evidence_count,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(makeId('cat'), runId, item.category, item.score, item.confidence, item.marketActivity, item.culturalMomentum,
      item.scarcity, item.canonStrength, item.marketVelocity, item.liquidity, item.lifecycleStage, item.evidenceCount, startedAt));
  }
  if (snapshotStatements.length) await env.DB.batch(snapshotStatements);

  const confidenceTotal = categorySnapshots.reduce((sum,item)=>sum+Math.max(item.confidence,1),0);
  const weightedMean = (selector:(item:typeof categorySnapshots[number])=>number|null) => {
    let numerator=0, denominator=0;
    for (const item of categorySnapshots) {
      const value=selector(item); if (value===null || !Number.isFinite(value)) continue;
      const weight=Math.max(item.confidence,1); numerator += value*weight; denominator += weight;
    }
    return denominator ? numerator/denominator : null;
  };

  const kidult100 = weightedMean((item)=>item.score) ?? 0;
  const sentiment = weightedMean((item)=>item.culturalMomentum);
  const canon = weightedMean((item)=>item.canonStrength);
  const velocity = weightedMean((item)=>item.marketVelocity);
  const confidence = confidenceTotal ? categorySnapshots.reduce((sum,item)=>sum+item.confidence*Math.max(item.confidence,1),0)/confidenceTotal : 0;

  const sourceFamiliesRow = await env.DB.prepare(`SELECT COUNT(DISTINCT source_family) AS count FROM source_registry WHERE is_active=1`).first<{count:number}>();
  const brandsRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM entity_registry WHERE entity_type='brand'`).first<{count:number}>();
  const listingsRow = await env.DB.prepare(`
    WITH latest AS (
      SELECT entity_id,metric_value,ROW_NUMBER() OVER(PARTITION BY entity_id ORDER BY observed_at DESC,created_at DESC) rn
      FROM observations WHERE metric_key='active_listings'
    ) SELECT COALESCE(SUM(metric_value),0) AS total FROM latest WHERE rn=1
  `).first<{total:number}>();

  const minEvidence = Math.max(1, Number(env.MIN_EVIDENCE_FOR_PUBLISH || 20));
  const productionEligible = inputEvidenceCount >= minEvidence && categorySnapshots.length >= 4 && Number(sourceFamiliesRow?.count || 0) >= 3;

  await env.DB.prepare(`
    INSERT INTO index_snapshots (
      id,run_id,kidult100,sentiment_index,canon_strength,market_velocity,active_listings,confidence,
      coverage_brands,source_families,category_count,evidence_count,production_eligible,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(makeId('idx'), runId, round1(kidult100), sentiment===null?null:round1(sentiment), canon===null?null:round1(canon),
    velocity===null?null:round2(velocity), Number(listingsRow?.total || 0), round1(confidence), Number(brandsRow?.count || 0),
    Number(sourceFamiliesRow?.count || 0), categorySnapshots.length, inputEvidenceCount, productionEligible?1:0, startedAt).run();

  await env.DB.prepare(`UPDATE intelligence_runs SET finished_at=?,status='succeeded',output_category_count=? WHERE id=?`)
    .bind(nowIso(), categorySnapshots.length, runId).run();

  await env.DB.prepare(`INSERT INTO audit_log (id,event_type,actor,subject_id,details_json,created_at) VALUES (?,'intelligence.run','engine',?,?,?)`)
    .bind(makeId('audit'), runId, JSON.stringify({ inputEvidenceCount, categories: categorySnapshots.length, productionEligible }), nowIso()).run();

  return { runId, inputEvidenceCount, categoryCount: categorySnapshots.length, productionEligible };
}

async function buildPortalPayload(env: Env, runId?: string) {
  const index = runId
    ? await env.DB.prepare(`SELECT i.*,r.methodology_version,r.finished_at FROM index_snapshots i JOIN intelligence_runs r ON r.id=i.run_id WHERE i.run_id=?`).bind(runId).first<any>()
    : await env.DB.prepare(`SELECT i.*,r.methodology_version,r.finished_at FROM index_snapshots i JOIN intelligence_runs r ON r.id=i.run_id WHERE r.status='succeeded' ORDER BY r.finished_at DESC LIMIT 1`).first<any>();
  if (!index) return null;

  const categories = await env.DB.prepare(`SELECT * FROM category_snapshots WHERE run_id=? ORDER BY score DESC,category ASC`).bind(index.run_id).all<any>();
  const previous = await env.DB.prepare(`SELECT i.kidult100,r.finished_at FROM index_snapshots i JOIN intelligence_runs r ON r.id=i.run_id WHERE r.status='succeeded' AND r.finished_at<? ORDER BY r.finished_at DESC LIMIT 1`).bind(index.finished_at).first<any>();
  const change30d = previous?.kidult100 ? round1(((index.kidult100 - previous.kidult100) / previous.kidult100) * 100) : 0;

  const sourceRows = await env.DB.prepare(`SELECT source_family AS name,COUNT(*) AS count FROM source_registry WHERE is_active=1 GROUP BY source_family ORDER BY count DESC,name`).all<any>();
  const regionRows = await env.DB.prepare(`SELECT COALESCE(region,'Other') AS region,COUNT(*) AS count FROM source_registry WHERE is_active=1 GROUP BY COALESCE(region,'Other') ORDER BY count DESC,region`).all<any>();
  const evidenceGrades = await env.DB.prepare(`SELECT evidence_grade AS grade,COUNT(*) AS count FROM evidence_ledger WHERE status='accepted' GROUP BY evidence_grade`).all<any>();

  const toPercent = (rows:any[], key='count') => {
    const total = rows.reduce((sum,row)=>sum+Number(row[key]||0),0) || 1;
    let used=0;
    return rows.map((row,index)=>{
      const value=index===rows.length-1?100-used:Math.round((Number(row[key]||0)/total)*100);
      used+=value; return {...row,value};
    });
  };

  const sourceComposition = toPercent(sourceRows.results || []).slice(0,5).map(({name,value}:any)=>({name,value}));
  const geography = toPercent(regionRows.results || []).slice(0,5).map(({region,value}:any)=>({region,value}));
  const gradeMap = new Map((evidenceGrades.results || []).map((row:any)=>[row.grade,Number(row.count)]));
  const gradeRows = ['A','B','C','D'].map((grade)=>({grade,count:gradeMap.get(grade)||0}));
  const confidenceDistribution = toPercent(gradeRows).map(({grade,value}:any)=>({grade,value}));

  const categoriesData=(categories.results||[]).map((row:any)=>({
    name:row.category, score:round1(row.score), confidence:round1(row.confidence), state:row.lifecycle_stage,
    velocity:row.market_velocity===null?0:round2(row.market_velocity), liquidity:row.liquidity===null?0:round1(row.liquidity),
  }));
  const movers=categoriesData.slice(0,5).map((item:any,index:number)=>({name:item.name,change:index===0?round1(change30d):0}));
  const lifecycle=categoriesData.slice(0,4).map((item:any)=>({name:item.name,stage:item.state,score:Math.round(item.score)}));

  return {
    status: index.production_eligible ? 'production-ready' : 'staging',
    label: 'KIDULTS autonomous intelligence',
    updated: index.finished_at,
    methodologyVersion: index.methodology_version,
    headline: {
      kidult100: round1(index.kidult100), change30d, confidence: round1(index.confidence),
      coverageBrands: Number(index.coverage_brands), sourceFamilies: Number(index.source_families), categories: Number(index.category_count),
      sentiment: index.sentiment_index===null?0:round1(index.sentiment_index), canonStrength:index.canon_strength===null?0:round1(index.canon_strength),
      marketVelocity:index.market_velocity===null?0:round2(index.market_velocity), activeListings:Number(index.active_listings||0),
    },
    trend: [],
    categoriesData,
    signalMix: [
      {name:'Market activity',value:32},{name:'Cultural momentum',value:24},{name:'Scarcity',value:21},{name:'Canon strength',value:23},
    ],
    confidenceDistribution, sourceComposition, geography, movers, lifecycle,
    correlation: { labels: [], values: [] },
    governance: {
      engineVersion:'autonomous-foundation-v1', runId:index.run_id, deterministic:true,
      productionEligible:Boolean(index.production_eligible), manualApprovalRequired:!Boolean(index.production_eligible),
      evidenceCount:Number(index.evidence_count),
    },
  };
}

async function publish(env: Env, triggerType='manual') {
  if (env.ASI_PUBLICATION_ENABLED !== 'true') throw new Error('ASI_PUBLICATION_HOLD');
  const result = await runIntelligence(env, triggerType);
  const payload = await buildPortalPayload(env, result.runId);
  if (!payload) throw new Error('run produced no publishable payload');
  const payloadJson=JSON.stringify(payload);
  const payloadHash=await sha256(payloadJson);
  const timestamp=nowIso();
  await env.DB.prepare(`INSERT INTO publication_snapshots (id,run_id,channel,payload_json,payload_hash,status,published_at,created_at) VALUES (?,?,?,?,?,'published',?,?)`)
    .bind(makeId('pub'),result.runId,'portal',payloadJson,payloadHash,timestamp,timestamp).run();
  return {...result,payloadHash,payload};
}

async function route(request: Request, env: Env) {
  const url=new URL(request.url);
  if (request.method==='GET' && url.pathname==='/health') {
    const db=await env.DB.prepare('SELECT 1 AS ok').first<{ok:number}>();
    return json({ok:db?.ok===1,service:'kidults-autonomous-intelligence',environment:env.KIDULTS_ENV,methodologyVersion:env.METHODOLOGY_VERSION});
  }
  if (request.method==='GET' && url.pathname==='/v1/intelligence/current') {
    const published=await env.DB.prepare(`SELECT payload_json,payload_hash,published_at FROM publication_snapshots WHERE channel='portal' AND status='published' ORDER BY published_at DESC LIMIT 1`).first<any>();
    if (!published) return json({error:'no published snapshot'}, {status:404});
    return new Response(published.payload_json,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60','etag':`"${published.payload_hash}"`,'x-kidults-published-at':published.published_at}});
  }
  if (request.method==='GET' && url.pathname.startsWith('/v1/evidence/')) {
    const evidenceId=url.pathname.split('/').pop()!;
    const row=await env.DB.prepare(`SELECT id,source_id,entity_id,external_id,observed_at,ingested_at,payload_hash,provenance_url,provenance_label,license_code,evidence_grade,confidence,status,supersedes_id,admission_id FROM evidence_ledger WHERE id=?`).bind(evidenceId).first();
    return row?json(row):json({error:'not found'},{status:404});
  }
  if (request.method==='POST' && url.pathname==='/internal/ingest') return ingest(request,env);
  if (request.method==='POST' && url.pathname==='/internal/publish') {
    if (!authorized(request,env)) return json({error:'unauthorized'},{status:401});
    return json({
      error:'legacy_monolithic_publication_path_disabled',
      replacement:'GOVERNED_PROJECTION_REGISTRY_AFTER_PURPOSE_SPECIFIC_PUBLICATION_ADMISSION',
      production:'HOLD',
    },{status:410});
  }
  return json({error:'not found'},{status:404});
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return route(request,env).catch(async(error)=>{
      const message=error instanceof Error?error.message:String(error);
      try { await env.DB.prepare(`INSERT INTO audit_log (id,event_type,actor,details_json,created_at) VALUES (?,'runtime.error','worker',?,?)`).bind(makeId('audit'),JSON.stringify({message}),nowIso()).run(); } catch {}
      return json({error:'internal_error',message:env.KIDULTS_ENV==='production'?'Internal error':message},{status:500});
    });
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    void _event;
    void env;
    void ctx;
  },
};
