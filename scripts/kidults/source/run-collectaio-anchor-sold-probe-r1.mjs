import fs from 'node:fs';

const anchors = [
  { scope_id: 'construction_mechanical_sets', query: 'LEGO 10179', expected: ['10179', 'Millennium Falcon'] },
  { scope_id: 'diecast_scale_models', query: 'Hot Wheels 1968 Custom Camaro', expected: ['1968', 'Custom Camaro'] },
  { scope_id: 'video_games_consoles', query: 'Nintendo World Championships 1990', expected: ['Nintendo World Championships', '1990'] },
  { scope_id: 'vinyl_recorded_music', query: 'Beatles Please Please Me Black and Gold', expected: ['Please Please Me'] }
];

const base = 'https://www.collectaio.com';
const out = {
  id: 'collectaio-anchor-sold-probe-r1',
  generated_at: new Date().toISOString(),
  source: 'CollectAIO public read-only API',
  production: false,
  claims: { global_price: false, global_liquidity: false, provider_is_truth: false },
  records: []
};

function text(v) { return String(v ?? '').toLowerCase(); }
function scoreCandidate(candidate, anchor) {
  const blob = text(candidate?.name || candidate?.title || candidate?.display_name || candidate?.slug);
  return anchor.expected.reduce((n, token) => n + (blob.includes(token.toLowerCase()) ? 1 : 0), 0);
}
function collectArray(obj) {
  if (Array.isArray(obj)) return obj;
  for (const key of ['items','results','data']) if (Array.isArray(obj?.[key])) return obj[key];
  return [];
}
function keyTree(value, depth = 0) {
  if (depth > 2 || value == null) return null;
  if (Array.isArray(value)) {
    if (!value.length) return [];
    return [keyTree(value[0], depth + 1)];
  }
  if (typeof value !== 'object') return typeof value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = keyTree(value[key], depth + 1);
  return out;
}
function findSoldArrays(value, path = '$', depth = 0, hits = []) {
  if (depth > 5 || value == null) return hits;
  if (Array.isArray(value)) {
    const lower = path.toLowerCase();
    if (lower.includes('sold') || lower.includes('comp') || lower.includes('sale')) hits.push({ path, length: value.length });
    if (value[0] && typeof value[0] === 'object') findSoldArrays(value[0], `${path}[0]`, depth + 1, hits);
    return hits;
  }
  if (typeof value !== 'object') return hits;
  for (const [key, child] of Object.entries(value)) findSoldArrays(child, `${path}.${key}`, depth + 1, hits);
  return hits;
}
function numericAtPath(obj, path) {
  const parts = path.replace(/^\$\.?/, '').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) cur = cur?.[p];
  const n = Number(cur);
  return Number.isFinite(n) ? n : null;
}
function soldMetadata(item) {
  const directArrays = [item?.sold_comps, item?.soldComps, item?.market_signals?.sold_comps, item?.market?.sold_comps, item?.listings?.sold, item?.market_data?.sold_comps, item?.pricing?.sold_comps];
  const sold = directArrays.find(Array.isArray) || [];
  const countCandidates = [
    item?.sold_comp_count,
    item?.soldCompsCount,
    item?.market_signals?.sold_comp_count,
    item?.market_data?.sold_comp_count,
    item?.pricing?.sold_comp_count,
    item?.market?.sold_comp_count,
    item?.comps?.sold_count,
    item?.comps?.count
  ];
  const explicitCount = countCandidates.map(Number).find(Number.isFinite);
  const discovered = findSoldArrays(item);
  const discoveredMax = discovered.reduce((m, h) => Math.max(m, h.length || 0), 0);
  const sampleSize = explicitCount ?? Math.max(sold.length, discoveredMax);
  const basis = item?.price_basis ?? item?.basis ?? item?.market_signals?.basis ?? item?.market_data?.basis ?? item?.pricing?.basis ?? null;
  const freshness = item?.last_checked_at ?? item?.updated_at ?? item?.market_signals?.last_checked_at ?? item?.market_data?.last_checked_at ?? item?.pricing?.last_checked_at ?? null;
  return { sample_size: sampleSize, basis, freshness, sold_array_present: sampleSize > 0, discovered_sold_paths: discovered };
}

for (const anchor of anchors) {
  const u = new URL('/api/v2/search', base);
  u.searchParams.set('q', anchor.query);
  u.searchParams.set('page', '1');
  u.searchParams.set('per_page', '10');
  const sr = await fetch(u, { headers: { 'user-agent': 'KIDULTS-bounded-evidence-probe/1.0' } });
  if (!sr.ok) {
    out.records.push({ scope_id: anchor.scope_id, query: anchor.query, state: 'SEARCH_HTTP_BLOCKED', http_status: sr.status });
    continue;
  }
  const sj = await sr.json();
  const candidates = collectArray(sj).map(c => ({ c, score: scoreCandidate(c, anchor) })).sort((a,b)=>b.score-a.score);
  const top = candidates[0];
  if (!top || top.score === 0 || !top.c?.slug) {
    out.records.push({ scope_id: anchor.scope_id, query: anchor.query, state: 'NO_EXACT_CANDIDATE', candidate_count: candidates.length });
    continue;
  }

  const detailUrl = `${base}/api/v1/items/${encodeURIComponent(top.c.slug)}`;
  const dr = await fetch(detailUrl, { headers: { 'user-agent': 'KIDULTS-bounded-evidence-probe/1.0' } });
  if (!dr.ok) {
    out.records.push({ scope_id: anchor.scope_id, query: anchor.query, state: 'DETAIL_HTTP_BLOCKED', slug: top.c.slug, http_status: dr.status });
    continue;
  }
  const item = await dr.json();
  const meta = soldMetadata(item);
  const exact = scoreCandidate(item, anchor) === anchor.expected.length;
  out.records.push({
    scope_id: anchor.scope_id,
    query: anchor.query,
    state: exact && meta.sample_size > 0 ? 'EXACT_MATCH_WITH_SOLD_EVIDENCE_CANDIDATE' : exact ? 'EXACT_MATCH_NO_SOLD_SAMPLE' : 'NON_EXACT_MATCH',
    slug: item?.slug ?? top.c.slug,
    canonical_url: `${base}/item/${item?.slug ?? top.c.slug}`,
    exact_identity_tokens: exact,
    sold_sample_size: meta.sample_size,
    sold_basis: meta.basis,
    freshness: meta.freshness,
    sold_array_present: meta.sold_array_present,
    discovered_sold_paths: meta.discovered_sold_paths,
    schema_keys_only: exact ? keyTree(item) : undefined
  });
}

fs.mkdirSync('artifacts/kidults/source', { recursive: true });
fs.writeFileSync('artifacts/kidults/source/collectaio-anchor-sold-probe-r1.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

if (!out.records.some(r => r.state === 'EXACT_MATCH_WITH_SOLD_EVIDENCE_CANDIDATE')) {
  console.error('FAIL_CLOSED: no exact existing KIDULTS anchor has sold evidence yet');
  process.exit(2);
}
