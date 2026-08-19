// Bounded read-only evidence probe R2. Existing KIDULTS anchors only. No Production/G5.
import fs from 'node:fs';

const anchors = [
  ['designer_toys','KAWS Companion',['KAWS','Companion']],
  ['designer_toys','Medicom BEARBRICK 1000',['1000']],
  ['construction_mechanical_sets','LEGO NINJAGO City 70620',['70620','NINJAGO City']],
  ['sneakers','Nike Air Jordan 1 High Chicago 1985',['Jordan 1','Chicago']],
  ['sneakers','Nike SB Dunk Low Pro Paris',['Dunk','Paris']],
  ['collectible_electronics','Apple iPhone 1st Generation',['iPhone','1st']],
  ['collectible_electronics','Sony Walkman TPS-L2',['TPS-L2']],
  ['video_games_consoles','Bandai Stadium Events NES',['Stadium Events']],
  ['video_games_consoles','Nintendo World Championships 1990',['Nintendo World Championships']],
  ['scope-trading-cards','Magic The Gathering Alpha Black Lotus',['Black Lotus','Alpha']],
  ['construction_mechanical_sets','LEGO 10179 Millennium Falcon',['10179','Millennium Falcon']]
].map(([scope_id,query,expected])=>({scope_id,query,expected}));

const base='https://www.collectaio.com';
const out={id:'collectaio-anchor-sold-probe-r2',generated_at:new Date().toISOString(),source:'CollectAIO public read-only API',production:false,truth_boundary:{classification:'BOUNDED_RECENT_SOLD_CANDIDATE_NOT_CURRENT_PRICE',current_price_verified:false,liquidity_verified:false,time_to_sale_verified:false,global_representativeness_verified:false},records:[]};
const txt=v=>String(v??'').toLowerCase();
const score=(o,a)=>{const b=txt(o?.name||o?.title||o?.display_name||o?.slug);return a.expected.reduce((n,t)=>n+(b.includes(t.toLowerCase())?1:0),0)};
const arr=o=>Array.isArray(o)?o:(['items','results','data'].map(k=>o?.[k]).find(Array.isArray)||[]);

for(const a of anchors){
  const u=new URL('/api/v2/search',base);u.searchParams.set('q',a.query);u.searchParams.set('page','1');u.searchParams.set('per_page','10');
  const sr=await fetch(u,{headers:{'user-agent':'KIDULTS-bounded-evidence-probe/2.0'}});
  if(!sr.ok){out.records.push({scope_id:a.scope_id,query:a.query,state:'SEARCH_HTTP_BLOCKED',http_status:sr.status});continue}
  const candidates=arr(await sr.json()).map(c=>({c,s:score(c,a)})).sort((x,y)=>y.s-x.s);
  const top=candidates[0];
  if(!top||top.s===0||!top.c?.slug){out.records.push({scope_id:a.scope_id,query:a.query,state:'NO_EXACT_CANDIDATE',candidate_count:candidates.length});continue}
  const dr=await fetch(`${base}/api/v1/items/${encodeURIComponent(top.c.slug)}`,{headers:{'user-agent':'KIDULTS-bounded-evidence-probe/2.0'}});
  if(!dr.ok){out.records.push({scope_id:a.scope_id,query:a.query,state:'DETAIL_HTTP_BLOCKED',http_status:dr.status,slug:top.c.slug});continue}
  const item=await dr.json(); const exact=score(item,a)===a.expected.length;
  const listings=(Array.isArray(item?.listings)?item.listings:[]).filter(x=>txt(x?.market_state)==='sold');
  const events=listings.slice(0,10).map(x=>({provider_record_id:x?.id??null,event_at:x?.date??null,observed_at:x?.updated_at??null,marketplace:x?.marketplace??null,price:typeof x?.price==='number'?x.price:null,currency:x?.currency??null,condition:x?.condition??null,source_url:x?.url??null,title:x?.title??null}));
  const latest=events.map(x=>x.event_at).filter(Boolean).sort().at(-1)??null;
  const age=latest?Math.floor((Date.now()-new Date(latest).getTime())/86400000):null;
  const has=exact&&events.length>0;
  out.records.push({scope_id:a.scope_id,query:a.query,state:has?'EXACT_MATCH_WITH_BOUNDED_RECENT_SOLD_EVIDENCE':exact?'EXACT_MATCH_NO_SOLD_SAMPLE':'NON_EXACT_MATCH',evidence_classification:has?'BOUNDED_RECENT_SOLD_CANDIDATE_NOT_CURRENT_PRICE':'NOT_ADMITTED',claim_ceiling:has?'EXACT_ITEM_OBSERVED_SOLD_TRANSACTIONS_ONLY':'NONE',current_price_claim_allowed:false,liquidity_claim_allowed:false,time_to_sale_claim_allowed:false,slug:item?.slug??top.c.slug,canonical_url:`${base}/item/${item?.slug??top.c.slug}`,sold_sample_size:events.length,latest_event_at:latest,latest_event_age_days:age,bounded_sold_events:exact?events:[]});
}

out.exact_sold_candidates=out.records.filter(r=>r.state==='EXACT_MATCH_WITH_BOUNDED_RECENT_SOLD_EVIDENCE').sort((a,b)=>(a.latest_event_age_days??99999)-(b.latest_event_age_days??99999));
fs.mkdirSync('artifacts/kidults/source',{recursive:true});fs.writeFileSync('artifacts/kidults/source/collectaio-anchor-sold-probe-r2.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
if(!out.exact_sold_candidates.length){console.error('FAIL_CLOSED: no exact sold candidate in bounded R2');process.exit(2)}
