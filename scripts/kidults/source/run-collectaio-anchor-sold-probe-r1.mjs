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
function soldMetadata(item) {
  const candidates = [item?.sold_comps, item?.soldComps, item?.market_signals?.sold_comps, item?.market?.sold_comps, item?.listings?.sold];
  const sold = candidates.find(Array.isArray) || [];
  const sampleSize = Number(item?.sold_comp_count ?? item?.soldCompsCount ?? item?.market_signals?.sold_comp_count ?? sold.length ?? 0);
  const basis = item?.price_basis ?? item?.basis ?? item?.market_signals?.basis ?? null;
  const freshness = item?.last_checked_at ?? item?.updated_at ?? item?.market_signals?.last_checked_at ?? null;
  return { sample_size: Number.isFinite(sampleSize) ? sampleSize : sold.length, basis, freshness, sold_array_present: sold.length > 0 };
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
    sold_array_present: meta.sold_array_present
  });
}

fs.mkdirSync('artifacts/kidults/source', { recursive: true });
fs.writeFileSync('artifacts/kidults/source/collectaio-anchor-sold-probe-r1.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

if (!out.records.some(r => r.state === 'EXACT_MATCH_WITH_SOLD_EVIDENCE_CANDIDATE')) {
  console.error('FAIL_CLOSED: no exact existing KIDULTS anchor has sold evidence yet');
  process.exit(2);
}
