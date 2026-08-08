type DbEnv = { DB: D1Database };

type PortalPayload = Record<string, any>;

const round2 = (value: number) => Math.round(value * 100) / 100;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function pearson(left: number[], right: number[]) {
  const n = Math.min(left.length, right.length);
  if (n < 3) return null;
  const x = left.slice(-n);
  const y = right.slice(-n);
  const meanX = x.reduce((a,b)=>a+b,0)/n;
  const meanY = y.reduce((a,b)=>a+b,0)/n;
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;
  for (let i=0;i<n;i++) {
    const dx=x[i]-meanX;
    const dy=y[i]-meanY;
    numerator += dx*dy;
    sumX += dx*dx;
    sumY += dy*dy;
  }
  const denominator = Math.sqrt(sumX*sumY);
  return denominator ? Math.max(-1, Math.min(1, numerator/denominator)) : null;
}

export async function enrichPortalPayload(env: DbEnv, runId: string, payload: PortalPayload) {
  const indexHistory = await env.DB.prepare(`
    SELECT i.kidult100,r.finished_at
    FROM index_snapshots i JOIN intelligence_runs r ON r.id=i.run_id
    WHERE r.status='succeeded' AND r.finished_at IS NOT NULL
    ORDER BY r.finished_at DESC LIMIT 6
  `).all<{kidult100:number;finished_at:string}>();

  const history = [...(indexHistory.results || [])].reverse();
  payload.trend = history.map((row) => ({
    period: new Date(row.finished_at).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}),
    value: Number(row.kidult100)
  }));

  const currentCategories = await env.DB.prepare(`
    SELECT category FROM category_snapshots WHERE run_id=? ORDER BY score DESC,category ASC LIMIT 4
  `).bind(runId).all<{category:string}>();
  const labels = (currentCategories.results || []).map((row)=>row.category);

  const scoreHistory = new Map<string, Map<string, number>>();
  if (labels.length) {
    const placeholders = labels.map(()=>'?').join(',');
    const rows = await env.DB.prepare(`
      SELECT c.category,c.score,c.run_id,r.finished_at
      FROM category_snapshots c JOIN intelligence_runs r ON r.id=c.run_id
      WHERE r.status='succeeded' AND c.category IN (${placeholders})
      ORDER BY r.finished_at ASC
    `).bind(...labels).all<{category:string;score:number;run_id:string;finished_at:string}>();
    for (const row of rows.results || []) {
      if (!scoreHistory.has(row.category)) scoreHistory.set(row.category,new Map());
      scoreHistory.get(row.category)!.set(row.run_id,Number(row.score));
    }
  }

  const runIds = await env.DB.prepare(`
    SELECT id FROM intelligence_runs WHERE status='succeeded' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 6
  `).all<{id:string}>();
  const orderedRunIds = [...(runIds.results || [])].reverse().map((row)=>row.id);

  const series = labels.map((label)=>orderedRunIds
    .map((id)=>scoreHistory.get(label)?.get(id))
    .filter((value): value is number => Number.isFinite(value)));

  const values = labels.map((_,row)=>labels.map((__,column)=>{
    if (row===column) return 1;
    const leftMap=scoreHistory.get(labels[row]) || new Map<string,number>();
    const rightMap=scoreHistory.get(labels[column]) || new Map<string,number>();
    const common=orderedRunIds.filter((id)=>leftMap.has(id)&&rightMap.has(id));
    const left=common.map((id)=>leftMap.get(id)!);
    const right=common.map((id)=>rightMap.get(id)!);
    const value=pearson(left,right);
    return value===null?0:round2(value);
  }));

  payload.correlation = { labels, values };

  const ready = payload.trend.length >= 2
    && labels.length >= 2
    && orderedRunIds.length >= 3
    && series.length === labels.length
    && series.every((item)=>item.length >= 3);

  payload.status = ready ? 'production' : 'staging';
  payload.label = ready ? 'Production intelligence' : 'Staging intelligence';
  payload.governance = {
    ...(payload.governance || {}),
    productionEligible: Boolean(payload.governance?.productionEligible) && ready,
    trendObservationCount: payload.trend.length,
    correlationObservationWindow: orderedRunIds.length,
    publicationContractVersion: 'portal-v1'
  };

  return { payload, ready };
}

export async function persistEnrichedSnapshot(env: DbEnv, runId: string, payload: PortalPayload) {
  const payloadJson = JSON.stringify(payload);
  const payloadHash = await sha256(payloadJson);
  await env.DB.prepare(`
    UPDATE publication_snapshots SET payload_json=?,payload_hash=? WHERE run_id=? AND channel='portal'
  `).bind(payloadJson,payloadHash,runId).run();
  return payloadHash;
}
