import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [samplingPath,contractPath,outPath='/tmp/serialized-source-disjoint-review-packet-r3.json']=process.argv.slice(2);
if(!samplingPath||!contractPath) throw new Error('usage: build-serialized-source-disjoint-review-packet-r3 <sampling> <contract> [out]');
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const contract=JSON.parse(await fs.readFile(contractPath,'utf8'));
const target=(sampling.strata||[]).find(x=>x.stratum_id==='er-stratum-serialized-reference');
if(!target||target.cases!==120||target.case_class_targets?.SAME_OBJECT_NORMALIZATION!==40) throw new Error('SERIALIZED_TARGET_INVALID');
if(contract.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED') throw new Error('REVIEW_CONTRACT_NOT_READY');
const WDQS='https://query.wikidata.org/sparql';
const LICENSE='https://www.wikidata.org/wiki/Wikidata:Licensing';
const UA='KIDULTS-SERIALIZED-SOURCE-DISJOINT-R3/1.0';
const qid=v=>String(v||'').match(/\/entity\/(Q\d+)$/)?.[1]||null;
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJson(url){let last;for(let a=0;a<5;a++){try{const r=await fetch(url,{headers:{accept:'application/json','user-agent':UA},signal:AbortSignal.timeout(30000)});if(r.ok)return await r.json();last=new Error(`HTTP_${r.status}`);}catch(e){last=e;}if(a<4)await sleep(800*(2**a));}throw last;}
const where=`?item wdt:P2598 ?serial ; p:P217 ?inventoryStatement ; wdt:P31 ?model . ?inventoryStatement ps:P217 ?inventory ; pq:P195 ?collection . ?model wdt:P176 ?maker . FILTER(STR(?serial) != STR(?inventory))`;
const query=`SELECT DISTINCT ?item ?serial ?inventory ?collection ?model ?maker WHERE { ${where} } ORDER BY ?item ?serial ?inventory ?collection ?model ?maker LIMIT 5000`;
const u=`${WDQS}?query=${encodeURIComponent(query)}&format=json`;
const payload=await fetchJson(u);
const rows=(payload?.results?.bindings||[]).map(b=>({item:qid(b.item?.value),serial:String(b.serial?.value||'').trim(),inventory:String(b.inventory?.value||'').trim(),collection:qid(b.collection?.value),model:qid(b.model?.value),maker:qid(b.maker?.value)})).filter(x=>x.item&&x.serial&&x.inventory&&x.collection&&x.model&&x.maker&&x.serial!==x.inventory);
const byItem=new Map();for(const x of rows){if(!byItem.has(x.item))byItem.set(x.item,[]);byItem.get(x.item).push(x);}
const records=[...byItem.entries()].map(([item,rs])=>({item,rows:rs})).sort((a,b)=>a.item.localeCompare(b.item));
const selected=records.slice(0,40);
const cases=selected.map((r,i)=>{const x=r.rows[0];return {case_id:`serialized-r3-normalization-${String(i+1).padStart(3,'0')}`,stratum_id:'er-stratum-serialized-reference',case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:'SOURCE_RECORD',source_a_reference:`https://www.wikidata.org/wiki/Special:EntityData/${r.item}.json`,source_b_reference:`https://www.wikidata.org/wiki/Special:EntityData/${r.item}.json`,source_record_ids:[r.item],source_query_sha256:sha(query),source_binding_digest:sha({item:r.item,serial:x.serial,inventory:x.inventory,collection:x.collection,model:x.model,maker:x.maker}),reviewer_prompt_context:{manufacturer_serial:x.serial,collection_inventory_reference:x.inventory,collection_qid:x.collection,model_qid:x.model,maker_qid:x.maker,basis:'ONE_AUTHORITATIVE_ITEM_CARRIES_DISTINCT_MANUFACTURER_SERIAL_AND_QUALIFIED_COLLECTION_INVENTORY_REFERENCE'},license_evidence_refs:[LICENSE],rights_state:'ALLOW',provenance_refs:[`wikidata:${r.item}:P2598:${x.serial}`,`wikidata:${r.item}:P217:${x.inventory}:P195:${x.collection}`,`wikidata:${x.model}:P176:${x.maker}`],label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'};});
const ids=new Set();for(const c of cases){const id=c.source_record_ids[0];if(ids.has(id))throw new Error(`SOURCE_RECORD_REUSE:${id}`);ids.add(id);}
const blindCount=Math.floor(cases.length/2),blindIds=cases.filter((_,i)=>i%2===0).slice(0,blindCount).map(x=>x.case_id);
const artifact={id:'kidults-er-serialized-source-disjoint-review-packet-r3',version:'3.0.0',status:cases.length?'PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED':'NO_CASES_PROVEN',stratum_id:'er-stratum-serialized-reference',source_family:'wikidata-cc0-structured-data',query_reference:u,query_sha256:sha(query),grammar_complete_real_record_count:records.length,case_count:cases.length,sampling_target_total:120,remaining_case_count:120-cases.length,case_class_counts:{SAME_OBJECT_NORMALIZATION:cases.length,HARD_NEGATIVE:0,CROSS_MARKET_ALIAS:0},labels_present:false,model_predictions_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',blind_partition:{state:'CANDIDATE_NOT_SEALED',case_count:blindIds.length,case_ids:blindIds,partition_sha256:sha(JSON.stringify(blindIds))},cases,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:`Only ${cases.length} distinct Wikidata source records are counted once each as SAME_OBJECT_NORMALIZATION reviewer-ready material. The prior diagnostic's normalization+alias sum is not reused because that would double-count the same source records under source-disjoint accounting. HARD_NEGATIVE and CROSS_MARKET_ALIAS remain zero here. No labels, sealed holdout, empirical PASS, Track B, publication or Production are created.`};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:artifact.status,grammar_complete_real_record_count:records.length,reviewer_ready_cases:cases.length,blind_candidates:blindIds.length,remaining:artifact.remaining_case_count,production:'HOLD'},null,2));
