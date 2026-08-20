import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const outPath=process.argv[2]||'/tmp/pressing-wikidata-crossmarket-r2.json';
const target=40, timeoutMs=30000;
const WDQS='https://query.wikidata.org/sparql';
const WD_LICENSE='https://www.wikidata.org/wiki/Wikidata:Licensing';
const MB_LICENSE='https://musicbrainz.org/doc/About/Data_License';
const MB_WS='https://musicbrainz.org/ws/2/release';
const headers={'user-agent':'KIDULTS-ER-PRESSING-CROSSMARKET/2.0 (bounded empirical validation; no Discogs API request)','accept':'application/json'};
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJson(url,attempts=5){let last;for(let a=1;a<=attempts;a++){const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{headers,signal:c.signal});if(!r.ok)throw new Error(`HTTP_${r.status}:${url}`);return await r.json();}catch(e){last=e;if(a<attempts)await sleep(1000*(2**(a-1)));}finally{clearTimeout(timer);}}throw last;}
const query=`SELECT ?item ?mbid ?discogs WHERE { ?item wdt:P5813 ?mbid; wdt:P2206 ?discogs. FILTER(isLiteral(?mbid) && isLiteral(?discogs)) } ORDER BY ?item LIMIT 500`;
const qurl=`${WDQS}?query=${encodeURIComponent(query)}&format=json`;
const discovery=await fetchJson(qurl,5);
const bindings=discovery?.results?.bindings||[];
const dedup=[];const seenQ=new Set(),seenMb=new Set(),seenDiscogs=new Set();
for(const b of bindings){const item=b.item?.value||'',qid=item.split('/').pop()||'',mbid=b.mbid?.value||'',discogs=b.discogs?.value||'';if(!/^Q\d+$/.test(qid)||!/^[0-9a-f-]{36}$/i.test(mbid)||!/^[1-9][0-9]*$/.test(discogs))continue;if(seenQ.has(qid)||seenMb.has(mbid)||seenDiscogs.has(discogs))continue;seenQ.add(qid);seenMb.add(mbid);seenDiscogs.add(discogs);dedup.push({qid,mbid,discogs});}
const cases=[];
for(const row of dedup){if(cases.length>=target)break;let entityJson,mb;try{entityJson=await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${row.qid}.json`,3);await sleep(1100);mb=await fetchJson(`${MB_WS}/${row.mbid}?fmt=json&inc=release-groups+labels+media+artist-credits`,3);}catch{continue;}
const entity=entityJson?.entities?.[row.qid];if(!entity)continue;
const vals=pid=>(entity.claims?.[pid]||[]).map(x=>x?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string');
const mbids=[...new Set(vals('P5813'))],discogsIds=[...new Set(vals('P2206'))];
if(mbids.length!==1||discogsIds.length!==1||mbids[0]!==row.mbid||discogsIds[0]!==row.discogs)continue;
if(mb?.id!==row.mbid||!mb?.barcode)continue;
const media=(mb.media||[]).map(x=>String(x?.format||'').toLowerCase());if(!media.some(x=>x.includes('vinyl')))continue;
const cats=(mb['label-info']||[]).map(x=>x?.['catalog-number']).filter(Boolean);if(!cats.length)continue;
cases.push({case_id:`pressing-r2-crossmarket-${String(cases.length+1).padStart(3,'0')}`,stratum_id:'er-stratum-pressing-edition-media',case_class:'CROSS_MARKET_ALIAS',identity_boundary:'SOURCE_RECORD',wikidata_qid:row.qid,musicbrainz_release_id:row.mbid,discogs_release_id:row.discogs,source_a_reference:`https://www.wikidata.org/wiki/Special:EntityData/${row.qid}.json`,source_b_reference:`https://musicbrainz.org/release/${row.mbid}`,source_a_payload_sha256:sha(entityJson),source_b_payload_sha256:sha(mb),license_evidence_refs:[WD_LICENSE,MB_LICENSE],rights_state:'ALLOW',provenance_refs:[`wikidata:${row.qid}:P5813:${row.mbid}`,`wikidata:${row.qid}:P2206:${row.discogs}`,`musicbrainz:release:${row.mbid}`],reviewer_prompt_context:{musicbrainz_barcode:mb.barcode,musicbrainz_catalog_numbers:[...new Set(cats)].sort(),musicbrainz_media_formats:[...new Set(media)].sort(),candidate_basis:'INDEPENDENT_WIKIDATA_CC0_ITEM_COASSERTS_MUSICBRAINZ_RELEASE_ID_AND_DISCOGS_RELEASE_ID; MUSICBRAINZ_LIVE_RECORD_CONFIRMS_VINYL_RELEASE_GRAMMAR'},label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'});
await sleep(1100);
}
const artifact={id:'kidults-er-pressing-wikidata-crossmarket-r2',version:'2.0.0',status:cases.length>=target?'CROSS_MARKET_ALIAS_40_REVIEWER_READY_UNLABELED':'COMPLETE_FAIL_CLOSED_INSUFFICIENT_CROSS_MARKET_CAPACITY',stratum_id:'er-stratum-pressing-edition-media',case_count:cases.length,target_case_count:target,case_class_counts:{CROSS_MARKET_ALIAS:cases.length},identity_boundary_counts:{SOURCE_RECORD:cases.length},discovery_binding_count:bindings.length,rights_state:'ALLOW',source_authorities:['wikidata-external-id-crosswalk','musicbrainz-core-release-data'],discogs_api_requests:0,discogs_payloads_collected:0,labels_present:false,model_predictions_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',blind_partition_sealed:false,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',cases,truth_boundary:'These are unlabeled reviewer-ready CROSS_MARKET_ALIAS candidates only. Each candidate is independently co-asserted by a live Wikidata CC0 item carrying exactly one MusicBrainz release ID and one Discogs release ID, and its MusicBrainz record is live-verified as vinyl with barcode and catalog-number grammar. No Discogs API or marketplace payload is requested; no price, sales, current-market, label, empirical PASS, Track B, publication or Production claim is made.'};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2));
console.log(JSON.stringify({status:artifact.status,case_count:artifact.case_count,discovery_binding_count:artifact.discovery_binding_count,discogs_api_requests:0,production:'HOLD'},null,2));
