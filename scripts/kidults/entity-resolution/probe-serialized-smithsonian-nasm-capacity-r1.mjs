import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const outPath=process.argv[2]||'/tmp/serialized-smithsonian-nasm-capacity-r1.json';
const indexUrl='https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/nasm/index.txt';
const allowedHost='smithsonian-open-access.s3-us-west-2.amazonaws.com';
const maxShards=256,maxRecords=30000,maxCompressedBytes=35*1024*1024,timeoutMs=60000;
const rightsRefs=['https://www.si.edu/openaccess','https://github.com/Smithsonian/OpenAccess','https://creativecommons.org/publicdomain/zero/1.0/'];
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function allowed(url){const u=new URL(url);return u.protocol==='https:'&&u.hostname===allowedHost&&u.pathname.startsWith('/metadata/edan/nasm/');}
async function fetchBytes(url){if(!allowed(url))throw new Error(`URL_NOT_ALLOWED:${url}`);let last;for(let a=0;a<4;a++){try{const r=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-SMITHSONIAN-NASM/1.0',accept:'*/*'},signal:AbortSignal.timeout(timeoutMs)});if(!r.ok)throw new Error(`HTTP_${r.status}`);const b=Buffer.from(await r.arrayBuffer());if(b.length>maxCompressedBytes)throw new Error(`SHARD_OVER_BOUND:${b.length}`);return b;}catch(e){last=e;if(a<3)await sleep(1000*(2**a));}}throw last;}
async function fetchText(url){return (await fetchBytes(url)).toString('utf8');}
const flatTexts=[];function collect(v,path=''){if(v==null)return;if(typeof v==='string'||typeof v==='number'){flatTexts.push({path,text:String(v)});return;}if(Array.isArray(v)){for(let i=0;i<v.length;i++)collect(v[i],`${path}[${i}]`);return;}if(typeof v==='object')for(const [k,val] of Object.entries(v))collect(val,path?`${path}.${k}`:k);}
const serialLabel=/\b(?:serial(?:\s+(?:number|no\.?|#))?|s\/n)\b\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,24})/i;
const makerKey=/(manufacturer|maker|manufactured|made by|builder|company)/i;
const modelKey=/(model|type|designation|aircraft|engine|craft|vehicle)/i;
const rejectSerial=/^(?:19|20)\d{2}$|^\d{1,3}(?:\.\d+)?(?:cm|mm|in|ft)?$/i;
function firstMatch(entries,re){for(const e of entries){const m=e.text.match(re);if(m)return {path:e.path,text:e.text.slice(0,240),match:m[1]||m[0]};}return null;}
function extractCandidate(record,sourceUrl,lineNo){flatTexts.length=0;collect(record);const serial=firstMatch(flatTexts,serialLabel);if(!serial||rejectSerial.test(serial.match))return null;const maker=flatTexts.find(e=>makerKey.test(e.path)||makerKey.test(e.text));const model=flatTexts.find(e=>modelKey.test(e.path)||modelKey.test(e.text));if(!maker||!model)return null;const id=String(record?.id||record?.url||record?.content?.descriptiveNonRepeating?.record_ID?.content||'').trim();if(!id)return null;return {record_id:id,source_shard:sourceUrl,source_line:lineNo,record_sha256:sha(record),serial_evidence:{path:serial.path,value:serial.match,context:serial.text},maker_evidence:{path:maker.path,context:maker.text.slice(0,240)},model_evidence:{path:model.path,context:model.text.slice(0,240)},rights_state:'ALLOW_METADATA_CC0_BOUNDARY',license_evidence_refs:rightsRefs};}
const indexText=await fetchText(indexUrl);
// Smithsonian's current bulk EDAN unit indexes enumerate line-delimited JSON shards as *.txt.
// Scan the whole bounded NASM shard set (up to 256 hash buckets) while preserving a 30k record ceiling.
const shardUrls=indexText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(s=>/^https:\/\//i.test(s)?s:new URL(s,indexUrl).toString()).filter(u=>allowed(u)&&/\.(?:txt|json|jsonl|ndjson|gz)(?:$|\?)/i.test(u)).sort().slice(0,maxShards);
if(!shardUrls.length)throw new Error('NO_NASM_SHARDS_IN_INDEX');
const candidates=[];let recordsScanned=0,shardsScanned=0,parseErrors=0,bytesDownloaded=0;
for(const shard of shardUrls){if(recordsScanned>=maxRecords)break;let b;try{b=await fetchBytes(shard);}catch(e){continue;}bytesDownloaded+=b.length;let text;try{text=/\.gz(?:$|\?)/i.test(shard)?gunzipSync(b).toString('utf8'):b.toString('utf8');}catch{continue;}shardsScanned++;const lines=text.split(/\r?\n/);for(let i=0;i<lines.length&&recordsScanned<maxRecords;i++){const line=lines[i].trim();if(!line)continue;recordsScanned++;let rec;try{rec=JSON.parse(line);}catch{parseErrors++;continue;}const c=extractCandidate(rec,shard,i+1);if(c)candidates.push(c);}}
const unique=[...new Map(candidates.map(c=>[c.record_id,c])).values()].sort((a,b)=>a.record_id.localeCompare(b.record_id));
const byModelMaker=new Map();for(const c of unique){const key=sha({maker:c.maker_evidence.context.toLowerCase(),model:c.model_evidence.context.toLowerCase()});if(!byModelMaker.has(key))byModelMaker.set(key,[]);byModelMaker.get(key).push(c);}
let hardCapacity=0;for(const group of byModelMaker.values()){const serials=new Set(group.map(x=>x.serial_evidence.value.toLowerCase()));hardCapacity+=Math.floor(Math.min(group.length,serials.size)/2);}hardCapacity=Math.min(40,hardCapacity);
const normalizationCapacity=Math.min(40,unique.length);
const metrics={index_url:indexUrl,shards_listed:shardUrls.length,shards_scanned:shardsScanned,records_scanned:recordsScanned,parse_errors:parseErrors,compressed_bytes_downloaded:bytesDownloaded,grammar_complete_distinct_records:unique.length,same_object_normalization_capacity:normalizationCapacity,same_model_maker_distinct_serial_hard_negative_capacity:hardCapacity,cross_market_alias_capacity:0,conservative_capacity:normalizationCapacity+hardCapacity,full_120_ready:false};
const blockers=[];if(normalizationCapacity<40)blockers.push(`SAME_OBJECT_NORMALIZATION_${normalizationCapacity}_OF_40`);if(hardCapacity<40)blockers.push(`HARD_NEGATIVE_${hardCapacity}_OF_40`);blockers.push('CROSS_MARKET_ALIAS_0_OF_40_INDEPENDENT_AUTHORITY_REQUIRED');
const artifact={id:'kidults-er-serialized-smithsonian-nasm-capacity-r1',version:'1.0.2',status:'COMPLETE_FAIL_CLOSED_CAPACITY_DIAGNOSTIC',parent_issue:640,stratum_id:'er-stratum-serialized-reference',source_family:'smithsonian-open-access-nasm',source_authority:'Smithsonian National Air and Space Museum',rights_state:'ALLOW_METADATA_CC0_BOUNDARY',license_evidence_refs:rightsRefs,metrics,candidates:unique.slice(0,240),blockers,labels_present:false,reviewers_assigned:0,empirical_cases_created:0,blind_partition_sealed:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'Bounded NASM Open Access metadata diagnostic only. Serial evidence must be explicitly labeled serial/SN text; accession/date/dimension numbers are not substituted. Maker/model context is required. Capacity is diagnostic and not reviewer-ready until candidate grammar and source-disjoint pair construction are separately validated. CROSS_MARKET_ALIAS remains zero without an independent authority.'};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');console.log(JSON.stringify({status:artifact.status,metrics,blockers,production:'HOLD'},null,2));
