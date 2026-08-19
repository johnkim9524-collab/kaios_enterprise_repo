// Bounded read-only evidence probe. No Production/G5 or provider commitment.
import fs from 'node:fs';

const anchors = [
  { scope_id: 'construction_mechanical_sets', query: 'LEGO 10179', expected: ['10179', 'Millennium Falcon'] },
  { scope_id: 'diecast_scale_models', query: 'Hot Wheels 1968 Custom Camaro', expected: ['1968', 'Custom Camaro'] },
  { scope_id: 'video_games_consoles', query: 'Nintendo World Championships 1990', expected: ['Nintendo World Championships', '1990'] },
  { scope_id: 'vinyl_recorded_music', query: 'Beatles Please Please Me Black and Gold', expected: ['Please Please Me'] },
  { scope_id: 'scope-trading-cards', query: 'Magic The Gathering Alpha Black Lotus', expected: ['Black Lotus', 'Alpha'] }
];

const base = 'https://www.collectaio.com';
const out = { id: 'collectaio-anchor-sold-probe-r1', generated_at: new Date().toISOString(), source: 'CollectAIO public read-only API', production: false, claims: { global_price: false, global_liquidity: false, provider_is_truth: false }, records: [] };

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
  if (Array.isArray(value)) return value.length ? [keyTree(value[0], depth + 1)] : [];
  if (typeof value !== 'object') return typeof value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = keyTree(value[key], depth + 1);
  return out;
}
function soldMetadata(item) {
  const listings = Array.isArray(item?.listings) ? item.listings : [];
  const soldListings = listings.filter(x => text(x?.market_state) === 'sold');
  const boundedSoldEvents = soldListings.slice(0, 10).map(x => ({
    provider_record_id: x?.id ?? null,
    event_at: x?.date ?? null,
    observed_at: x?.updated_at ?? null,
    marketplace: x?.marketplace ?? null,
    price: typeof x?.price === 'number' ? x.price : null,
    currency: x?.currency ?? null,
    condition: x?.condition ?? null,
    source_url: x?.url ?? null,
    include_in_price: x?.include_in_price ?? null,
    title: x?.title ?? null
  }));
  const summarySold = (Array.isArray(item?.listing_summaries) ? item.listing_summaries : [])
    .map(x => Number(x?.sold)).filter(Number.isFinite).reduce((a,b)=>a+b,0);
  const directArrays = [item?.sold_comps, item?.soldComps, item?.market_signals?.sold_comps, item?.market?.sold_comps, item?.market_data?.sold_comps, item?.pricing?.sold_comps].filter(Array.isArray);
  const directCount = directArrays.reduce((m,a)=>Math.max(m,a.length),0);
  const explicitCandidates = [item?.sold_comp_count,item?.soldCompsCount,item?.market_signals?.sold_comp_count,item?.market_data?.sold_comp_count,item?.pricing?.sold_comp_count,item?.market?.sold_comp_count,item?.comps?.sold_count];
  const explicitCount = explicitCandidates.map(Number).find(Number.isFinite) ?? 0;
  const sampleSize = Math.max(soldListings.length, summarySold, directCount, explicitCount);
  const eventDates = boundedSoldEvents.map(x=>x.event_at).filter(Boolean).sort();
  const observedDates = boundedSoldEvents.map(x=>x.observed_at).filter(Boolean).sort();
  const latestEventAt = eventDates.at(-1) ?? null;
  const latestObservedAt = observedDates.at(-1) ?? null;
  const ageDays = latestEventAt ? Math.floor((Date.now() - new Date(latestEventAt).getTime()) / 86400000) : null;
  const basis = item?.price_basis ?? item?.basis ?? item?.market_signals?.basis ?? item?.market_data?.basis ?? item?.pricing?.basis ?? null;
  return { sample_size: sampleSize, sold_listing_count: soldListings.length, summary_sold_count: summarySold, direct_sold_array_count: directCount, explicit_sold_count: explicitCount, basis, latest_event_at: latestEventAt, latest_observed_at: latestObservedAt, latest_event_age_days: ageDays, bounded_sold_events: boundedSoldEvents };
}

for (const anchor of anchors) {
  const u = new URL('/api/v2/search', base);
  u.searchParams.set('q', anchor.query); u.searchParams.set('page','1'); u.searchParams.set('per_page','10');
  const sr = await fetch(u,{headers:{'user-agent':'KIDULTS-bounded-evidence-probe/1.0'}});
  if (!sr.ok) { out.records.push({scope_id:anchor.scope_id,query:anchor.query,state:'SEARCH_HTTP_BLOCKED',http_status:sr.status}); continue; }
  const sj = await sr.json();
  const candidates = collectArray(sj).map(c=>({c,score:scoreCandidate(c,anchor)})).sort((a,b)=>b.score-a.score);
  const top = candidates[0];
  if (!top || top.score===0 || !top.c?.slug) { out.records.push({scope_id:anchor.scope_id,query:anchor.query,state:'NO_EXACT_CANDIDATE',candidate_count:candidates.length}); continue; }
  const dr = await fetch(`${base}/api/v1/items/${encodeURIComponent(top.c.slug)}`,{headers:{'user-agent':'KIDULTS-bounded-evidence-probe/1.0'}});
  if (!dr.ok) { out.records.push({scope_id:anchor.scope_id,query:anchor.query,state:'DETAIL_HTTP_BLOCKED',slug:top.c.slug,http_status:dr.status}); continue; }
  const item = await dr.json();
  const meta = soldMetadata(item);
  const exact = scoreCandidate(item,anchor)===anchor.expected.length;
  out.records.push({scope_id:anchor.scope_id,query:anchor.query,state:exact&&meta.sample_size>0?'EXACT_MATCH_WITH_SOLD_EVIDENCE_CANDIDATE':exact?'EXACT_MATCH_NO_SOLD_SAMPLE':'NON_EXACT_MATCH',slug:item?.slug??top.c.slug,canonical_url:`${base}/item/${item?.slug??top.c.slug}`,exact_identity_tokens:exact,sold_sample_size:meta.sample_size,sold_listing_count:meta.sold_listing_count,summary_sold_count:meta.summary_sold_count,direct_sold_array_count:meta.direct_sold_array_count,explicit_sold_count:meta.explicit_sold_count,sold_basis:meta.basis,latest_event_at:meta.latest_event_at,latest_observed_at:meta.latest_observed_at,latest_event_age_days:meta.latest_event_age_days,bounded_sold_events:exact?meta.bounded_sold_events:[],schema_keys_only:exact?keyTree(item):undefined});
}

fs.mkdirSync('artifacts/kidults/source',{recursive:true});
fs.writeFileSync('artifacts/kidults/source/collectaio-anchor-sold-probe-r1.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
if (!out.records.some(r=>r.state==='EXACT_MATCH_WITH_SOLD_EVIDENCE_CANDIDATE')) { console.error('FAIL_CLOSED: no exact existing KIDULTS anchor has verified sold evidence yet'); process.exit(2); }
