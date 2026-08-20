import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [acceptedRoot='/tmp/accepted',expandedPath='/tmp/expanded4000.json',receiptPath='/tmp/release-overlap-repair-r1.json']=process.argv.slice(2);
const SHA=/^sha256:[0-9a-f]{64}$/;
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
function fail(code,detail=''){throw new Error(detail?`${code}:${detail}`:code)}
function uniqStrings(v,code){if(!Array.isArray(v)||!v.length)fail(code);const out=[...new Set(v.map(x=>String(x).trim()).filter(Boolean))].sort();if(out.length!==v.length)fail(`${code}_DUP`);return out;}
function pairKey(c){
  const a=String(c.source_a_reference??c.source_reference??'').trim(),b=String(c.source_b_reference??c.source_reference??'').trim();
  const da=String(c.source_a_payload_sha256??c.source_payload_sha256??'').trim(),db=String(c.source_b_payload_sha256??c.source_payload_sha256??'').trim();
  if(!a||!b||!SHA.test(da)||!SHA.test(db))fail('PAIR_EVIDENCE_INVALID',c.case_id||c.candidate_id||'UNKNOWN');
  return JSON.stringify([{ref:a,sha:da},{ref:b,sha:db}].sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y))));
}
async function walk(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.isFile()&&e.name.endsWith('.json'))out.push(p);}return out;}
function caseArrays(v){const out=[];if(Array.isArray(v?.cases))out.push(v.cases);for(const k of ['pressing','variant'])if(Array.isArray(v?.packets?.[k]?.cases))out.push(v.packets[k].cases);return out;}
async function findById(id){for(const p of await walk(acceptedRoot)){const v=JSON.parse(await fs.readFile(p,'utf8'));if(v?.id===id)return {path:p,value:v};}fail('ACCEPTED_FRAGMENT_NOT_FOUND',id)}
function refsOf(c){const out=[];for(const k of ['source_reference','source_a_reference','source_b_reference'])if(c?.[k])out.push(String(c[k]).trim());return out.filter(Boolean);}
function cats(r){return (r?.payload?.label_catalog_numbers||[]).map(x=>String(x?.catalog_number||'').trim()).filter(Boolean);}
function eligibleHard(a,b){
  const ap=a?.payload||{},bp=b?.payload||{};
  if(!ap.release_group_mbid||ap.release_group_mbid!==bp.release_group_mbid)return false;
  if(!ap.barcode||!bp.barcode||ap.barcode===bp.barcode)return false;
  const ac=cats(a),bc=cats(b);if(!ac.length||!bc.length)return false;
  return ac.every(x=>!bc.includes(x))&&bc.every(x=>!ac.includes(x));
}
function safeRecord(r){return r&&r.rights_state==='ALLOW'&&r.source_reference&&SHA.test(String(r.source_payload_sha256||''))&&Array.isArray(r.license_evidence_refs)&&r.license_evidence_refs.length&&Array.isArray(r.provenance_refs)&&r.provenance_refs.length&&r.payload?.release_group_mbid;}
function normalizationCase(old,r,i){
  const ref=String(r.source_reference),digest=String(r.source_payload_sha256);
  return {case_id:`variant-r9-reacquired-normalization-${String(i+1).padStart(3,'0')}`,stratum_id:'er-stratum-variant-release-heavy',case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:old.identity_boundary,source_a_reference:ref,source_b_reference:ref,source_a_payload_sha256:digest,source_b_payload_sha256:digest,license_evidence_refs:uniqStrings(r.license_evidence_refs,'NORMALIZATION_LICENSE_REFS'),rights_state:'ALLOW',provenance_refs:uniqStrings(r.provenance_refs,'NORMALIZATION_PROVENANCE_REFS'),label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'};
}
function hardCase(old,e,i){
  return {case_id:`variant-r9-reacquired-hard-${String(i+1).padStart(3,'0')}`,stratum_id:'er-stratum-variant-release-heavy',case_class:'HARD_NEGATIVE',identity_boundary:old.identity_boundary,source_a_reference:e.a.source_reference,source_b_reference:e.b.source_reference,source_a_payload_sha256:e.a.source_payload_sha256,source_b_payload_sha256:e.b.source_payload_sha256,license_evidence_refs:[...new Set([...(e.a.license_evidence_refs||[]),...(e.b.license_evidence_refs||[])])].sort(),rights_state:'ALLOW',provenance_refs:[...new Set([...(e.a.provenance_refs||[]),...(e.b.provenance_refs||[])])].sort(),label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'};
}

const pressingBase=await findById('kidults-er-pressing-partial-review-packet-r1');
const variantBase=await findById('kidults-er-variant-observed-corpus-review-packet-r3');
if(!Array.isArray(pressingBase.value.cases)||pressingBase.value.cases.length!==44)fail('PRESSING_BASE44_BOUNDARY');
if(!Array.isArray(variantBase.value.cases)||variantBase.value.cases.length!==45)fail('VARIANT_BASE45_BOUNDARY');

const pressingPairs=new Set(pressingBase.value.cases.map(pairKey));
const overlaps=variantBase.value.cases.filter(c=>pressingPairs.has(pairKey(c))).sort((a,b)=>String(a.case_id).localeCompare(String(b.case_id)));
const byClass=Object.fromEntries([...new Set(overlaps.map(x=>x.case_class))].sort().map(k=>[k,overlaps.filter(x=>x.case_class===k).length]));
if(overlaps.length!==42||byClass.SAME_OBJECT_NORMALIZATION!==39||byClass.HARD_NEGATIVE!==3||Object.keys(byClass).length!==2)fail('EXPECTED_CROSS_STRATUM_OVERLAP_DRIFT',`${overlaps.length}:${JSON.stringify(byClass)}`);

const allFiles=await walk(acceptedRoot);const usedRefs=new Set();const allReleaseCases=[];
for(const p of allFiles){const v=JSON.parse(await fs.readFile(p,'utf8'));for(const arr of caseArrays(v))for(const c of arr){if(['er-stratum-pressing-edition-media','er-stratum-variant-release-heavy'].includes(c?.stratum_id)){allReleaseCases.push(c);for(const r of refsOf(c))usedRefs.add(r);}}}

const expanded=JSON.parse(await fs.readFile(expandedPath,'utf8'));
if(expanded.id!=='kidults-er-musicbrainz-expanded-vinyl-corpus-r3'||expanded.source!=='musicbrainz-core-catalog'||expanded.rights_state!=='ALLOW'||expanded.production!=='HOLD'||!Array.isArray(expanded.records)||expanded.records.length<1000)fail('EXPANDED_CORPUS_BOUNDARY');
const available=expanded.records.filter(safeRecord).filter(r=>!usedRefs.has(String(r.source_reference))).sort((a,b)=>String(a.source_record_id).localeCompare(String(b.source_record_id)));

const normalizationOld=overlaps.filter(c=>c.case_class==='SAME_OBJECT_NORMALIZATION');
const hardOld=overlaps.filter(c=>c.case_class==='HARD_NEGATIVE');
const selectedNorm=[],selectedGroups=new Set(),replacementRefs=new Set();
for(const r of available){const g=String(r.payload.release_group_mbid);if(selectedGroups.has(g))continue;selectedNorm.push(r);selectedGroups.add(g);replacementRefs.add(String(r.source_reference));if(selectedNorm.length===normalizationOld.length)break;}
if(selectedNorm.length!==normalizationOld.length)fail('FRESH_NORMALIZATION_CAPACITY_INSUFFICIENT',`${selectedNorm.length}/${normalizationOld.length}`);

const hardPool=available.filter(r=>!replacementRefs.has(String(r.source_reference)));
const groups=new Map();for(const r of hardPool){const g=String(r.payload.release_group_mbid);if(!groups.has(g))groups.set(g,[]);groups.get(g).push(r);}
const edges=[];for(const [g,rs] of [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){rs.sort((a,b)=>String(a.source_record_id).localeCompare(String(b.source_record_id)));for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++)if(eligibleHard(rs[i],rs[j]))edges.push({group:g,a:rs[i],b:rs[j]});}
const hardSelected=[],hardUsed=new Set();for(const e of edges){const ar=String(e.a.source_reference),br=String(e.b.source_reference);if(hardUsed.has(ar)||hardUsed.has(br)||replacementRefs.has(ar)||replacementRefs.has(br))continue;hardUsed.add(ar);hardUsed.add(br);hardSelected.push(e);if(hardSelected.length===hardOld.length)break;}
if(hardSelected.length!==hardOld.length)fail('FRESH_HARDNEGATIVE_CAPACITY_INSUFFICIENT',`${hardSelected.length}/${hardOld.length}`);
for(const e of hardSelected){replacementRefs.add(String(e.a.source_reference));replacementRefs.add(String(e.b.source_reference));}
if(replacementRefs.size!==45)fail('REPLACEMENT_SOURCE_DISJOINTNESS',String(replacementRefs.size));

const replacementByOld=new Map();normalizationOld.forEach((old,i)=>replacementByOld.set(old.case_id,normalizationCase(old,selectedNorm[i],i)));hardOld.forEach((old,i)=>replacementByOld.set(old.case_id,hardCase(old,hardSelected[i],i)));
const repairedCases=variantBase.value.cases.map(c=>replacementByOld.get(c.case_id)||c);
if(repairedCases.length!==45||new Set(repairedCases.map(c=>c.case_id)).size!==45)fail('REPAIRED_VARIANT_CASE_ID_BOUNDARY');
const classCounts=Object.fromEntries([...new Set(repairedCases.map(c=>c.case_class))].sort().map(k=>[k,repairedCases.filter(c=>c.case_class===k).length]));
if(JSON.stringify(classCounts)!==JSON.stringify({HARD_NEGATIVE:5,SAME_OBJECT_NORMALIZATION:40}))fail('REPAIRED_VARIANT_CLASS_QUOTA',JSON.stringify(classCounts));
variantBase.value.cases=repairedCases;
variantBase.value.status='PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED_CROSS_STRATUM_EVIDENCE_REACQUIRED_R1';
variantBase.value.cross_stratum_evidence_repair={version:'r1',superseded_case_count:42,replacement_case_count:42,replacement_source_reference_count:45,evidence_created_from_fresh_rights_admitted_musicbrainz_core_metadata:true,labels_created:false,model_results_created:false,production:'HOLD'};
await fs.writeFile(variantBase.path,JSON.stringify(variantBase.value,null,2)+'\n');

const finalRelease=[];for(const p of await walk(acceptedRoot)){const v=JSON.parse(await fs.readFile(p,'utf8'));for(const arr of caseArrays(v))for(const c of arr)if(['er-stratum-pressing-edition-media','er-stratum-variant-release-heavy'].includes(c?.stratum_id))finalRelease.push(c);}
const pairSeen=new Map();for(const c of finalRelease){const k=pairKey(c);if(pairSeen.has(k))fail('RELEASE_EVIDENCE_PAIR_DUPLICATE_REMAINS',`${pairSeen.get(k)}|${c.case_id}`);pairSeen.set(k,c.case_id);}
const safeProjection=[...replacementByOld.entries()].map(([superseded,c])=>({superseded_case_id:superseded,replacement_case_id:c.case_id,case_class:c.case_class,identity_boundary:c.identity_boundary,source_a_reference:c.source_a_reference,source_b_reference:c.source_b_reference,source_a_payload_sha256:c.source_a_payload_sha256,source_b_payload_sha256:c.source_b_payload_sha256})).sort((a,b)=>a.replacement_case_id.localeCompare(b.replacement_case_id));
const receipt={id:'kidults-er-release-cross-stratum-evidence-overlap-repair-r1',version:'1.0.0',parent_issue:838,status:'PASS_EXACT_KNOWN_42_CROSS_STRATUM_OVERLAPS_REACQUIRED_WITH_SOURCE_DISJOINT_LAWFUL_EVIDENCE',source_family:'musicbrainz-core-catalog',expanded_corpus_id:expanded.id,expanded_corpus_record_count:expanded.record_count,observed_overlap_case_count:overlaps.length,observed_overlap_case_class_counts:byClass,superseded_case_ids:overlaps.map(c=>c.case_id),replacement_case_count:safeProjection.length,replacement_source_reference_count:replacementRefs.size,replacement_projection_sha256:sha(safeProjection),raw_provider_payload_persisted:false,labels_created:false,model_predictions_created:false,reviewer_identity_created:false,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'Repairs only the exact current accepted Pressing-vs-Variant evidence-pair overlap discovered by fail-closed base720 materialization. Replacement cases are freshly source-bound from the already admitted bounded MusicBrainz core-metadata research lane, globally source-disjoint from all accepted release evidence at repair time, and remain unlabeled/unreviewed. No raw provider payload is persisted or uploaded.'};
await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,overlaps:receipt.observed_overlap_case_count,replacements:receipt.replacement_case_count,replacement_sources:receipt.replacement_source_reference_count,projection_sha256:receipt.replacement_projection_sha256,production:'HOLD'},null,2));
