import fs from 'node:fs/promises';

const [inputPath,manifestPath,outputPath='/tmp/er-real-world-r7e.json']=process.argv.slice(2);
if(!inputPath||!manifestPath) throw new Error('Usage: node extend-er-r7c-serialized-cross-authority-r7e.mjs <r7c.json> <manifest.json> [r7e.json]');
const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const STRATUM='er-stratum-serialized-reference';
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true) throw new Error('R7C_REAL_WORLD_DATASET_REQUIRED');
if(!(manifest.required_strata_ids||[]).includes(STRATUM)) throw new Error('SERIALIZED_STRATUM_REQUIRED');
const timeoutMs=18000;
async function fetchJson(url,headers={},attempts=2){let last;for(let a=1;a<=attempts;a++){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0',...headers},signal:c.signal});if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);return await r.json();}catch(e){last=e;if(a<attempts) await new Promise(x=>setTimeout(x,600*a));}finally{clearTimeout(t);}}throw last;}
function strings(e,p){return (e?.claims?.[p]??[]).map(c=>c?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string'&&v.trim());}
function items(e,p){return (e?.claims?.[p]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function label(e){return e?.labels?.en?.value??e?.labels?.mul?.value??e?.id??null;}

const sparql='SELECT ?item ?serial ?inventory ?model WHERE { ?item wdt:P2598 ?serial ; wdt:P217 ?inventory ; wdt:P31 ?model . } ORDER BY STR(?item) LIMIT 100';
const q=await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,{accept:'application/sparql-results+json'},3);
let selected=null;
for(const row of q?.results?.bindings??[]){const qid=String(row?.item?.value??'').match(/\/entity\/(Q\d+)$/)?.[1],model=String(row?.model?.value??'').match(/\/entity\/(Q\d+)$/)?.[1],serial=String(row?.serial?.value??'').trim(),inventory=String(row?.inventory?.value??'').trim();if(qid&&model&&serial&&inventory&&serial!==inventory){selected={qid,model,serial,inventory};break;}}
if(!selected) throw new Error('NO_ITEM_WITH_SERIAL_AND_INVENTORY_CROSS_AUTHORITY');
const j=await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.qid}.json`);const e=j?.entities?.[selected.qid];if(!e) throw new Error('ENTITYDATA_MISSING');
if(!strings(e,'P2598').includes(selected.serial)||!strings(e,'P217').includes(selected.inventory)||!items(e,'P31').includes(selected.model)) throw new Error('LIVE_CROSS_AUTHORITY_REVALIDATION_FAILED');
const anchor=`wikidata-cross-authority:${selected.qid}`;
const alias={case_id:`wikidata-serialized-cross-authority-${selected.qid}`,case_class:'CROSS_MARKET_ALIAS',identity_boundary:'SOURCE_RECORD',scope_id:STRATUM,expected:'MATCH',blind_holdout:true,left:{anchors:{SOURCE_RECORD:anchor},unique_keys:{reference_id:`manufacturer-serial:${selected.serial}`},external_system:'MANUFACTURER_SERIAL',external_id:selected.serial,entity_id:selected.qid,model_id:selected.model,label:label(e),source:'wikidata-structured-data'},right:{anchors:{SOURCE_RECORD:anchor},unique_keys:{reference_id:`institutional-inventory:${selected.inventory}`},external_system:'INSTITUTIONAL_INVENTORY',external_id:selected.inventory,entity_id:selected.qid,model_id:selected.model,label:label(e),source:'wikidata-structured-data'},provenance_refs:[`wikidata:${selected.qid}:P2598:${selected.serial}`,`wikidata:${selected.qid}:P217:${selected.inventory}`,`wikidata:${selected.qid}:P31:${selected.model}`,'wikidata-property:P2598:manufacturer-serial','wikidata-property:P217:inventory-number'],rights_state:'ALLOW',label_basis:'LIVE_WIKIDATA_ENTITYDATA_BINDS_MANUFACTURER_SERIAL_AND_INSTITUTIONAL_INVENTORY_IDENTIFIERS_TO_THE_SAME_SPECIFIC_OBJECT',claim_ceiling:'SERIALIZED_REFERENCE_CROSS_AUTHORITY_IDENTITY_ONLY'};
if(dataset.cases.some(x=>x.case_id===alias.case_id)) throw new Error('DUPLICATE_R7E_CASE');
const cases=[...dataset.cases,alias];
const out={...dataset,id:'entity-resolution-real-world-dataset-r7e-serialized-complete',dataset_scope:'R7E_SERIALIZED_REFERENCE_MINIMUMS_COMPLETE',scope_stratification_status:'INCOMPLETE',cases,truth_boundary:'R7E adds a manufacturer-serial to institutional-inventory cross-authority alias for one live-revalidated physical object. This completes declared SERIALIZED_REFERENCE minimums only; global final promotion remains blocked.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));console.log(JSON.stringify({id:out.id,item:selected,production:'HOLD'},null,2));