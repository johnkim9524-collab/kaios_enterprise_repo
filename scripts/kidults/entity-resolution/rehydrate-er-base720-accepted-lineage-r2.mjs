import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {adaptReleaseLineageForBase720} from './er-release-lineage-adapter-v1-lib.mjs';
import {materializeBase720,validateBase720} from './er-base720-materializer-v1-lib.mjs';

const [root='/tmp/accepted',provenanceRoot='/tmp/provenance',samplingPath='coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json',outPath='/tmp/er-base720-real-lineage-r2.json',receiptPath='/tmp/er-base720-real-lineage-r2-receipt.json']=process.argv.slice(2);
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const SHA=/^sha256:[0-9a-f]{64}$/;
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fail(code,detail=''){throw new Error(detail?`${code}:${detail}`:code)}
async function walk(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.isFile()&&e.name.endsWith('.json'))out.push(p);}return out;}
async function jsonFiles(dir){return Promise.all((await walk(dir)).map(async p=>({path:p,value:JSON.parse(await fs.readFile(p,'utf8'))})));}
function findId(files,id){const hit=files.find(x=>x.value?.id===id);if(!hit)fail('ARTIFACT_JSON_ID_NOT_FOUND',id);return hit.value;}
function casesOf(x,stratum){if(Array.isArray(x?.cases))return x.cases;if(stratum==='er-stratum-pressing-edition-media'&&Array.isArray(x?.packets?.pressing?.cases))return x.packets.pressing.cases;if(stratum==='er-stratum-variant-release-heavy'&&Array.isArray(x?.packets?.variant?.cases))return x.packets.variant.cases;fail('CASES_NOT_FOUND',`${x?.id||'UNKNOWN'}:${stratum}`)}
function packet(cases){return {production:'HOLD',public_release:'HOLD',cases};}
function strings(v,code){if(!Array.isArray(v)||!v.length)fail(code);const a=[...new Set(v.map(String))];if(a.length!==v.length)fail(`${code}_DUP`);return a;}
function noResultLeak(c){for(const k of ['label','labels','model_prediction','model_predictions','model_score','review_label','reviewer_label','adjudicated_label','final_label','benchmark_result']){const v=c?.[k];if(v!==undefined&&v!==null&&v!==false&&v!==''&&!(Array.isArray(v)&&!v.length))fail('RESULT_LEAKAGE',`${c?.case_id||'UNKNOWN'}:${k}`)}}
function basicCase(raw){
  noResultLeak(raw);
  const a=String(raw.source_a_reference??raw.source_reference??'').trim(),b=String(raw.source_b_reference??raw.source_reference??'').trim();
  const da=String(raw.source_a_payload_sha256??raw.source_payload_sha256??'').trim(),db=String(raw.source_b_payload_sha256??raw.source_payload_sha256??'').trim();
  if(!raw.case_id||!raw.stratum_id||!raw.case_class||!raw.identity_boundary||!a||!b||!SHA.test(da)||!SHA.test(db))fail('BASIC_CASE_EVIDENCE_INVALID',raw?.case_id);
  if(raw.rights_state!=='ALLOW')fail('BASIC_CASE_RIGHTS_NOT_ALLOW',raw.case_id);
  return {case_id:raw.case_id,stratum_id:raw.stratum_id,case_class:raw.case_class,identity_boundary:raw.identity_boundary,source_a_reference:a,source_b_reference:b,source_a_payload_sha256:da,source_b_payload_sha256:db,license_evidence_refs:strings(raw.license_evidence_refs,'LICENSE_REFS'),rights_state:'ALLOW',provenance_refs:strings(raw.provenance_refs,'PROVENANCE_REFS')};
}
function qid(v){return String(v||'').match(/(Q\d+)/)?.[1]||null}
function claimValues(entity,p){return (entity?.claims?.[p]||[]).map(s=>s?.mainsnak?.datavalue?.value).filter(v=>v!==undefined&&v!==null)}
function strValue(v){return typeof v==='object'&&v?.id?v.id:String(v)}
async function fetchText(url){let last;for(let i=0;i<5;i++){try{const r=await fetch(url,{headers:{accept:'application/json','user-agent':'KIDULTS-ER-BASE720-REHYDRATE/2.0 current-main empirical lineage validation'},signal:AbortSignal.timeout(30000)});if(r.ok)return await r.text();last=new Error(`HTTP_${r.status}`);}catch(e){last=e}if(i<4)await sleep(1000*(2**i));}throw last}
async function adaptWikidataNormalization(raw){
  noResultLeak(raw);if(raw.stratum_id!=='er-stratum-serialized-reference'||raw.case_class!=='SAME_OBJECT_NORMALIZATION'||raw.identity_boundary!=='SOURCE_RECORD'||raw.rights_state!=='ALLOW')fail('WIKIDATA_SERIALIZED_CASE_BOUNDARY',raw.case_id);
  const ref=String(raw.source_a_reference||'');if(ref!==raw.source_b_reference)fail('WIKIDATA_SINGLE_RECORD_REF_MISMATCH',raw.case_id);const item=qid(ref);if(!item)fail('WIKIDATA_QID_MISSING',raw.case_id);
  const ctx=raw.reviewer_prompt_context||{},serial=String(ctx.manufacturer_serial||''),inventory=String(ctx.collection_inventory_reference||''),collection=String(ctx.collection_qid||''),model=String(ctx.model_qid||''),maker=String(ctx.maker_qid||'');if(!serial||!inventory||!/^Q\d+$/.test(collection)||!/^Q\d+$/.test(model)||!/^Q\d+$/.test(maker))fail('WIKIDATA_CONTEXT_INVALID',raw.case_id);
  const text=await fetchText(ref),body=JSON.parse(text),entity=body?.entities?.[item];if(!entity)fail('WIKIDATA_ENTITY_MISSING',item);
  if(!claimValues(entity,'P2598').map(String).includes(serial))fail('WIKIDATA_SERIAL_DRIFT',raw.case_id);
  if(!claimValues(entity,'P31').map(strValue).includes(model))fail('WIKIDATA_MODEL_DRIFT',raw.case_id);
  const inv=(entity.claims?.P217||[]).some(s=>String(s?.mainsnak?.datavalue?.value)===inventory&&(s?.qualifiers?.P195||[]).some(q=>strValue(q?.datavalue?.value)===collection));if(!inv)fail('WIKIDATA_INVENTORY_COLLECTION_DRIFT',raw.case_id);
  const modelRef=`https://www.wikidata.org/wiki/Special:EntityData/${model}.json`,modelText=await fetchText(modelRef),modelEntity=JSON.parse(modelText)?.entities?.[model];if(!claimValues(modelEntity,'P176').map(strValue).includes(maker))fail('WIKIDATA_MAKER_DRIFT',raw.case_id);
  const digest=sha(text);
  return {case_id:raw.case_id,stratum_id:raw.stratum_id,case_class:raw.case_class,identity_boundary:raw.identity_boundary,source_a_reference:ref,source_b_reference:ref,source_a_payload_sha256:digest,source_b_payload_sha256:digest,license_evidence_refs:strings(raw.license_evidence_refs,'LICENSE_REFS'),rights_state:'ALLOW',provenance_refs:[...new Set([...strings(raw.provenance_refs,'PROVENANCE_REFS'),modelRef])].sort()};
}
function adaptNasmNormalization(raw){
  noResultLeak(raw);if(raw.stratum_id!=='er-stratum-serialized-reference'||raw.case_class!=='SAME_OBJECT_NORMALIZATION'||raw.identity_boundary!=='SOURCE_RECORD'||raw.rights_state!=='ALLOW_METADATA_CC0_BOUNDARY')fail('NASM_SERIALIZED_CASE_BOUNDARY',raw.case_id);
  const ref=String(raw.source_a_reference||'');if(ref!==raw.source_b_reference||!SHA.test(String(raw.source_payload_sha256||'')))fail('NASM_SOURCE_DIGEST_INVALID',raw.case_id);
  if(!/smithsonian-open-access\.s3-us-west-2\.amazonaws\.com\/metadata\/edan\/nasm\//.test(ref))fail('NASM_SOURCE_REF_INVALID',raw.case_id);
  return {case_id:raw.case_id,stratum_id:raw.stratum_id,case_class:raw.case_class,identity_boundary:raw.identity_boundary,source_a_reference:ref,source_b_reference:ref,source_a_payload_sha256:raw.source_payload_sha256,source_b_payload_sha256:raw.source_payload_sha256,license_evidence_refs:strings(raw.license_evidence_refs,'LICENSE_REFS'),rights_state:'ALLOW',provenance_refs:strings(raw.provenance_refs,'PROVENANCE_REFS')};
}
async function adaptSerialized(fragments){
  const raw=fragments.flatMap(x=>casesOf(x,'er-stratum-serialized-reference'));if(raw.length!==120)fail('SERIALIZED_EXACT_120_REQUIRED',raw.length);
  const out=[];for(const c of raw){if(c.case_id.startsWith('serialized-r3-normalization-'))out.push(await adaptWikidataNormalization(c));else if(c.case_id.startsWith('serialized-r4-nasm-normalization-'))out.push(adaptNasmNormalization(c));else out.push(basicCase(c));}
  const ids=new Set();for(const c of out){if(ids.has(c.case_id))fail('SERIALIZED_DUPLICATE_CASE_ID',c.case_id);ids.add(c.case_id)}
  const count=field=>Object.fromEntries([...new Set(out.map(x=>x[field]))].sort().map(k=>[k,out.filter(x=>x[field]===k).length]));
  const cc=count('case_class'),ib=count('identity_boundary');if(JSON.stringify(cc)!==JSON.stringify({CROSS_MARKET_ALIAS:40,HARD_NEGATIVE:40,SAME_OBJECT_NORMALIZATION:40}))fail('SERIALIZED_CLASS_QUOTA',JSON.stringify(cc));if(JSON.stringify(ib)!==JSON.stringify({PHYSICAL_OBJECT:60,SOURCE_RECORD:60}))fail('SERIALIZED_BOUNDARY_QUOTA',JSON.stringify(ib));
  return {id:'kidults-er-serialized-accepted-lineage-adapter-r2',version:'2.0.0',status:'EXACT_120_ACCEPTED_LINEAGE_REHYDRATED_UNLABELED_NOT_REVIEWED',stratum_id:'er-stratum-serialized-reference',case_count:120,case_class_counts:cc,identity_boundary_counts:ib,legacy_wikidata_live_payload_revalidated:9,legacy_nasm_source_record_digest_promoted_from_exact_record_sha256:31,labels_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',cases:out};
}

const files=await jsonFiles(root);
const designer=findId(files,'kidults-er-designer-review-packet-r1');
const vehicle=findId(files,'kidults-er-vehicle-review-packet-r1');
const pBase=findId(files,'kidults-er-pressing-partial-review-packet-r1');
const pHard=findId(files,'kidults-er-pressing-hardnegative-expansion-r2');
const vBase=findId(files,'kidults-er-variant-observed-corpus-review-packet-r3');
const vHard=findId(files,'kidults-er-variant-hardnegative-expansion-r4');
const cross=findId(files,'kidults-er-wikidata-release-crosswalk-review-packets-r1');
const residual1=findId(files,'kidults-er-expanded-musicbrainz-hardnegative-packets-r1');
const residual2=findId(files,'kidults-er-expanded-musicbrainz-hardnegative-packets-r2');
const serWd=findId(files,'kidults-er-serialized-source-disjoint-review-packet-r3');
const serNasm=findId(files,'kidults-er-serialized-smithsonian-nasm-review-packet-r4');
const serFaa=findId(files,'kidults-er-serialized-faa-hardnegative-packet-r1');
const serAlias=findId(files,'kidults-er-serialized-faa-ntsb-crossauthority-r1');

const pressing=adaptReleaseLineageForBase720({stratumId:'er-stratum-pressing-edition-media',fragments:[pBase,pHard,cross,residual2],samplingPlan:sampling});
const variant=adaptReleaseLineageForBase720({stratumId:'er-stratum-variant-release-heavy',fragments:[vBase,vHard,cross,residual1,residual2],samplingPlan:sampling});
const serialized=await adaptSerialized([serWd,serNasm,serFaa,serAlias]);

const provenanceFiles=await jsonFiles(provenanceRoot);const provenanceCases=provenanceFiles.flatMap(x=>Array.isArray(x.value?.cases)&&x.value?.stratum_id==='er-stratum-provenance-unique-object'?x.value.cases:[]);if(provenanceCases.length!==120)fail('PROVENANCE_EXACT_120_REQUIRED',provenanceCases.length);
const provenance=packet(provenanceCases);
const packets=[packet(casesOf(designer,'er-stratum-designer-maker-edition')),packet(pressing.cases),provenance,packet(serialized.cases),packet(variant.cases),packet(casesOf(vehicle,'er-stratum-vehicle-mechanical-asset'))];
const manifest={id:'kidults-er-base720-materialization-manifest-v1',version:'1.0.0',production:'HOLD',packet_paths:['designer','pressing','provenance','serialized','variant','vehicle'],single_record_identity_case_classes:['CROSS_MARKET_ALIAS','SAME_OBJECT_NORMALIZATION']};
const dataset=materializeBase720({manifest,packets,samplingPlan:sampling});const validation=validateBase720(dataset,sampling);
await fs.writeFile(outPath,JSON.stringify(dataset,null,2)+'\n');
const receipt={id:'kidults-er-base720-real-lineage-r2-receipt',version:'2.0.0',parent_issue:838,status:'PASS_EXACT_REAL_ACCEPTED_BASE720_MATERIALIZED_UNLABELED_NOT_REVIEWED',dataset_id:dataset.id,dataset_sha256:dataset.dataset_sha256,case_set_sha256:dataset.case_set_sha256,case_count:720,stratum_count:6,graded_population_case_count:0,validation,release_adapter_receipts:{pressing:pressing.boundary_repair,variant:variant.boundary_repair},serialized_adapter:{case_count:serialized.case_count,wikidata_live_payload_revalidated:serialized.legacy_wikidata_live_payload_revalidated,nasm_exact_record_digest_count:serialized.legacy_nasm_source_record_digest_promoted_from_exact_record_sha256},reviewers:'NOT_BOUND_TO_PRE_REVIEW_PACKET',labels:'NOT_COLLECTED',empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD'};
await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
