// Bounded read-only evidence probe R3. Existing KIDULTS anchors only. No Production/G5.
import fs from 'node:fs';

const anchors = [
  ['diecast_scale_models','CMC 1:18 Ferrari 250 GTO',['CMC','250 GTO']],
  ['vintage_character_toys','Hasbro G.I. Joe Snake Eyes 1982',['Snake Eyes','1982']],
  ['vintage_character_toys','Kenner Star Wars Boba Fett 3.75 inch',['Boba Fett']],
  ['mechanical_watches','Rolex Submariner 124060',['Submariner','124060']],
  ['mechanical_watches','Patek Philippe Nautilus 5711/1A',['Nautilus','5711']],
  ['handbags','Hermes Birkin 25',['Birkin 25']],
  ['handbags','Chanel Medium Classic Flap Bag',['Classic Flap']],
  ['cameras_lenses','Leica M3',['Leica','M3']],
  ['cameras_lenses','Hasselblad 500C/M',['Hasselblad','500C']],
  ['hifi_audio','Technics SL-1200MK2 Turntable',['SL-1200MK2']],
  ['musical_instruments_artist_gear','Gibson 1959 Les Paul Standard',['1959','Les Paul']],
  ['musical_instruments_artist_gear','Fender 1954 Stratocaster',['1954','Stratocaster']]
].map(([scope_id,query,expected])=>({scope_id,query,expected}));

const base='https://www.collectaio.com';
const out={id:'collectaio-anchor-sold-probe-r3',generated_at:new Date().toISOString(),source:'CollectAIO public read-only API',production:false,truth_boundary:{classification:'BOUNDED_RECENT_SOLD_CANDIDATE_NOT_CURRENT_PRICE',current_price_verified:false,liquidity_verified:false,time_to_sale_verified:false,global_representativeness_verified:false},records:[]};
const txt=v=>String(v??'').toLowerCase();
const score=(o,a)=>{const b=txt(o?.name||o?.title||o?.display_name||o?.slug);return a.expected.reduce((n,t)=>n+(b.includes(t.toLowerCase())?1:0),0)};
const arr=o=>Array.isArray(o)?o:(['items','results','data'].map(k=>o?.[k]).find(Array.isArray)||[]);
for(const a of anchors){
  const u=new URL('/api/v2/search',base);u.searchParams.set('q',a.query);u.searchParams.set('page','1');u.searchParams.set('per_page','10');
  const sr=await fetch(u,{headers:{'user-agent':'KIDULTS-bounded-evidence-probe/3.0'}});
  if(!sr.ok){out.records.push({scope_id:a.scope_id,query:a.query,state:'SEARCH_HTTP_BLOCKED',http_status:sr.status});continue}
  const candidates=arr(await sr.json()).map(c=>({c,s:score(c,a)})).sort((x,y)=>y.s-x.s);const top=candidates[0];
  if(!top||top.s===0||!top.c?.slug){out.records.push({scope_id:a.scope_id,query:a.query,state:'NO_EXACT_CANDIDATE',candidate_count:candidates.length});continue}
  const dr=await fetch(`${base}/api/v1/items/${encodeURIComponent(top.c.slug)}`,{headers:{'user-agent':'KIDULTS-bounded-evidence-probe/3.0'}});
  if(!dr.ok){out.records.push({scope_id:a.scope_id,query:a.query,state:'DETAIL_HTTP_BLOCKED',http_status:dr.status,slug:top.c.slug});continue}
  const item=await dr.json();const exact=score(item,a)===a.expected.length;
  const sold=(Array.isArray(item?.listings)?item.listings:[]).filter(x=>txt(x?.market_state)==='sold');
  const events=sold.slice(0,10).map(x=>({provider_record_id:x?.id??null,event_at:x?.date??null,observed_at:x?.updated_at??null,marketplace:x?.marketplace??null,price:typeof x?.price==='number'?x.price:null,currency:x?.currency??null,condition:x?.condition??null,source_url:x?.url??null,title:x?.title??null}));
  const latest=events.map(x=>x.event_at).filter(Boolean).sort().at(-1)??null;const age=latest?Math.floor((Date.now()-new Date(latest).getTime())/86400000):null;const has=exact&&events.length>0;
  out.records.push({scope_id:a.scope_id,query:a.query,state:has?'EXACT_MATCH_WITH_BOUNDED_RECENT_SOLD_EVIDENCE':exact?'EXACT_MATCH_NO_SOLD_SAMPLE':'NON_EXACT_MATCH',evidence_classification:has?'BOUNDED_RECENT_SOLD_CANDIDATE_NOT_CURRENT_PRICE':'NOT_ADMITTED',claim_ceiling:has?'EXACT_ITEM_OBSERVED_SOLD_TRANSACTIONS_ONLY':'NONE',current_price_claim_allowed:false,liquidity_claim_allowed:false,time_to_sale_claim_allowed:false,slug:item?.slug??top.c.slug,canonical_url:`${base}/item/${item?.slug??top.c.slug}`,sold_sample_size:events.length,latest_event_at:latest,latest_event_age_days:age,bounded_sold_events:exact?events:[]});
}
out.exact_sold_candidates=out.records.filter(r=>r.state==='EXACT_MATCH_WITH_BOUNDED_RECENT_SOLD_EVIDENCE').sort((a,b)=>(a.latest_event_age_days??99999)-(b.latest_event_age_days??99999));
fs.mkdirSync('artifacts/kidults/source',{recursive:true});fs.writeFileSync('artifacts/kidults/source/collectaio-anchor-sold-probe-r3.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
// Discovery run: zero new exact SOLD candidates is a valid empirical result, not a CI failure.
