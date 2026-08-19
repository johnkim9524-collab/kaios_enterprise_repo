import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [samplingPath, outPath='/tmp/serialized-reference-capacity-r2.json']=process.argv.slice(2);
if(!samplingPath) throw new Error('usage: probe-serialized-reference-capacity-r2 <sampling-plan> [out]');
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const target=(sampling.strata||[]).find(x=>x.stratum_id==='er-stratum-serialized-reference');
if(!target||target.cases!==120||target.blind!==60) throw new Error('SERIALIZED_TARGET_INVALID');
const WDQS='https://query.wikidata.org/sparql';
const LICENSE='https://www.wikidata.org/wiki/Wikidata:Licensing';
const UA='KIDULTS-SERIALIZED-REFERENCE-CAPACITY-R2/1.0 (read-only empirical preflight)';
const qid=v=>String(v||'').match(/\/entity\/(Q\d+)$/)?.[1]||null;
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJson(url){let last;for(let a=0;a<4;a++){try{const r=await fetch(url,{headers:{accept:'application/json','user-agent':UA},signal:AbortSignal.timeout(45000)});if(r.ok)return await r.json();last=new Error(`HTTP_${r.status}`);}catch(e){last=e;}if(a<3)await sleep(1000*(a+1));}throw last;}
async function sparql(query){const u=`${WDQS}?query=${encodeURIComponent(query)}&format=json`;const p=await fetchJson(u);if(!Array.isArray(p?.results?.bindings))throw new Error('WDQS_BINDINGS_REQUIRED');return {url:u,payload:p};}
const WHERE=`
 ?item wdt:P2598 ?serial ; p:P217 ?inventoryStatement ; wdt:P31 ?model .
 ?inventoryStatement ps:P217 ?inventory ; pq:P195 ?collection .
 ?model wdt:P176 ?maker .
 FILTER(STR(?serial) != STR(?inventory))
`;
const countQ=`SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE { ${WHERE} }`;
const detailQ=`SELECT DISTINCT ?item ?serial ?inventory ?collection ?model ?maker WHERE { ${WHERE} } ORDER BY ?item ?serial ?inventory ?collection ?model ?maker LIMIT 5000`;
const [countRes,detailRes]=await Promise.all([sparql(countQ),sparql(detailQ)]);
const declared=Number(countRes.payload.results.bindings[0]?.count?.value||0);
const bindings=detailRes.payload.results.bindings.map(b=>({item:qid(b.item?.value),serial:String(b.serial?.value||'').trim(),inventory:String(b.inventory?.value||'').trim(),collection:qid(b.collection?.value),model:qid(b.model?.value),maker:qid(b.maker?.value)})).filter(x=>x.item&&x.serial&&x.inventory&&x.collection&&x.model&&x.maker&&x.serial!==x.inventory);
const dedup=[...new Map(bindings.map(x=>[[x.item,x.serial,x.inventory,x.collection,x.model,x.maker].join('\0'),x])).values()];
if(detailRes.payload.results.bindings.length>=5000) throw new Error('DETAIL_LIMIT_REACHED_CAPACITY_UNKNOWN');
const byItem=new Map();for(const x of dedup){if(!byItem.has(x.item))byItem.set(x.item,[]);byItem.get(x.item).push(x);}
const records=[...byItem.entries()].map(([item,rows])=>({record_id:`wikidata-serialized-r2:${item}`,item_qid:item,serials:[...new Set(rows.map(x=>x.serial))].sort(),inventories:[...new Set(rows.map(x=>x.inventory))].sort(),models:[...new Set(rows.map(x=>x.model))].sort(),makers:[...new Set(rows.map(x=>x.maker))].sort(),collections:[...new Set(rows.map(x=>x.collection))].sort(),alias_pairs:[...new Map(rows.map(x=>[[x.serial,x.inventory,x.collection].join('\0'),{manufacturer_serial:x.serial,inventory_reference:x.inventory,collection_qid:x.collection,model_qid:x.model,maker_qid:x.maker}])).values()]})).sort((a,b)=>a.item_qid.localeCompare(b.item_qid));
function hardPairs(rs){const out=[];for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i],b=rs[j];const sm=a.models.find(x=>b.models.includes(x));const mk=a.makers.find(x=>b.makers.includes(x));const as=a.serials.find(x=>!b.serials.includes(x));const bs=b.serials.find(x=>!a.serials.includes(x));if(sm&&mk&&as&&bs)out.push({left:a.record_id,right:b.record_id,shared_model:sm,shared_maker:mk,left_serial:as,right_serial:bs});}return out;}
const hard=hardPairs(records);
const aliasCount=records.reduce((n,r)=>n+r.alias_pairs.length,0);
const metrics={declared_distinct_item_count:declared,detail_distinct_item_count:records.length,grammar_complete_real_record_count:records.length,normalization_candidate_capacity:records.length,cross_authority_alias_pair_count:aliasCount,same_model_distinct_serial_hard_negative_pair_count:hard.length,conservative_case_capacity:Math.min(records.length,target.case_class_targets.SAME_OBJECT_NORMALIZATION)+Math.min(hard.length,target.case_class_targets.HARD_NEGATIVE)+Math.min(aliasCount,target.case_class_targets.CROSS_MARKET_ALIAS)};
const checks={grammar_complete_record_floor_met:records.length>=120,normalization_floor_met:records.length>=40,hard_negative_floor_met:hard.length>=40,cross_authority_alias_floor_met:aliasCount>=40,blind_record_floor_met:records.length>=60,conservative_120_case_capacity_met:metrics.conservative_case_capacity>=120};
const ready=Object.values(checks).every(Boolean);
const artifact={id:'kidults-er-serialized-reference-live-capacity-r2',version:'1.0.0',stratum_id:'er-stratum-serialized-reference',status:ready?'COMPLETE_SOURCE_CAPACITY_READY':'COMPLETE_FAIL_CLOSED_INSUFFICIENT_CAPACITY',source_family:'wikidata-cc0-structured-data',source_query_boundary:'P2598 manufacturer serial + P217/P195 qualified collection inventory + P31 model entity whose own P176 identifies manufacturer',approved_grammar_binding:'maker_or_brand + reference_or_model + serial_or_batch; no Q10929058 subclass assumption required by approved stratum',license_evidence_ref:LICENSE,count_query_sha256:sha(countQ),detail_query_sha256:sha(detailQ),metrics,checks,blockers:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),records:records.slice(0,240),hard_negative_pairs:hard.slice(0,120),labels_present:false,reviewers_assigned:false,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'This R2 live probe tests a broader but still authoritative model/reference binding permitted by the approved SERIALIZED_REFERENCE grammar. It preserves manufacturer serial and independently qualified collection inventory requirements. It does not create labels, independent review, empirical PASS, Track B, publication or Production authority.'};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2));
console.log(JSON.stringify({status:artifact.status,declared,records:records.length,alias_pairs:aliasCount,hard_negative_pairs:hard.length,conservative_case_capacity:metrics.conservative_case_capacity,checks,ready,output:outPath},null,2));
if(process.env.KAIOS_REQUIRE_SERIALIZED_R2_READY==='1'&&!ready)process.exit(3);