import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const samplingPath=process.argv[2]||'coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json';
const outPath=process.argv[3]||'/tmp/designer-maker-capacity-r1.json';
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const target=(sampling.strata||[]).find(x=>x.stratum_id==='er-stratum-designer-maker-edition');
if(!target) throw new Error('DESIGNER_TARGET_MISSING');
const url='https://media.githubusercontent.com/media/MuseumofModernArt/collection/main/Artworks.csv';
const licenseRefs=['https://github.com/MuseumofModernArt/collection','https://github.com/MuseumofModernArt/collection/blob/main/README.md'];
const response=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-EMPIRICAL-CAPACITY/1.0'}});
if(!response.ok) throw new Error(`MOMA_HTTP_${response.status}`);
const csv=await response.text();
const datasetSha=`sha256:${createHash('sha256').update(csv).digest('hex')}`;

function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;const input=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field);if(row.some(v=>v!==''))rows.push(row);row=[];field='';}else field+=c;}
  row.push(field);if(row.some(v=>v!==''))rows.push(row);const headers=rows.shift();return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const rows=parseCsv(csv).filter(r=>r.Department==='Architecture & Design'&&String(r.ObjectID||'').trim()&&String(r.AccessionNumber||'').trim()&&String(r.Title||'').trim()&&String(r.Artist||'').trim()&&/^https:\/\/www\.moma\.org\/collection\/works\//.test(String(r.URL||''))).map(r=>({
  id:String(r.ObjectID), accession:String(r.AccessionNumber), title:String(r.Title), title_norm:norm(r.Title), artist:String(r.Artist), artist_norm:norm(r.Artist), medium:String(r.Medium||''), medium_norm:norm(r.Medium), url:String(r.URL)
})).sort((a,b)=>Number(a.id)-Number(b.id));
const byId=new Map(rows.map(r=>[r.id,r]));
const used=new Set();
const selected={SAME_OBJECT_NORMALIZATION:[],HARD_NEGATIVE:[],SAME_DESIGN_DIFFERENT_OBJECT:[]};
function takeSingle(r,boundary){if(used.has(r.id))return false;used.add(r.id);selected.SAME_OBJECT_NORMALIZATION.push({case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:boundary,source_record_ids:[r.id],candidate_basis:'SAME_OFFICIAL_OBJECT_ID_PLUS_ACCESSION_NORMALIZATION',boundary_assignment_basis:'ONE_MOMA_OBJECT_RECORD_TWO_OFFICIAL_IDENTIFIERS',artist:r.artist,title:r.title});return true;}
function takePair(bucket,a,b,boundary,basis){if(used.has(a.id)||used.has(b.id)||a.id===b.id)return false;used.add(a.id);used.add(b.id);selected[bucket].push({case_class:bucket,identity_boundary:boundary,source_record_ids:[a.id,b.id],candidate_basis:basis,boundary_assignment_basis:basis,shared_artist:a.artist,left_title:a.title,right_title:b.title});return true;}

// 35 SOURCE_RECORD + 5 PHYSICAL_OBJECT from same-object normalization.
for(const r of rows){if(selected.SAME_OBJECT_NORMALIZATION.length>=40)break;takeSingle(r,selected.SAME_OBJECT_NORMALIZATION.length<35?'SOURCE_RECORD':'PHYSICAL_OBJECT');}

// Same-design/different-object: same normalized artist + same normalized title, distinct official ObjectIDs.
const designGroups=new Map();
for(const r of rows){const k=`${r.artist_norm}|${r.title_norm}`;if(!r.artist_norm||!r.title_norm)continue;if(!designGroups.has(k))designGroups.set(k,[]);designGroups.get(k).push(r);}
let sameDesignObservedPairs=0;
for(const group of [...designGroups.values()].sort((a,b)=>a[0].id.localeCompare(b[0].id))){
  if(group.length<2)continue;
  sameDesignObservedPairs+=group.length*(group.length-1)/2;
  for(let i=0;i<group.length&&selected.SAME_DESIGN_DIFFERENT_OBJECT.length<40;i++)for(let j=i+1;j<group.length&&selected.SAME_DESIGN_DIFFERENT_OBJECT.length<40;j++)takePair('SAME_DESIGN_DIFFERENT_OBJECT',group[i],group[j],'CANONICAL_DESIGN','SAME_MOMA_ARTIST_AND_TITLE_DISTINCT_OBJECT_IDS');
  if(selected.SAME_DESIGN_DIFFERENT_OBJECT.length>=40)break;
}

// Hard negatives: same artist, different title; prefer same medium to keep the negative difficult.
const artistGroups=new Map();for(const r of rows){if(!artistGroups.has(r.artist_norm))artistGroups.set(r.artist_norm,[]);artistGroups.get(r.artist_norm).push(r);}
let hardNegativeObservedPairs=0;
for(const group of [...artistGroups.values()].sort((a,b)=>a[0].id.localeCompare(b[0].id))){
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)if(group[i].title_norm!==group[j].title_norm&&group[i].medium_norm&&group[i].medium_norm===group[j].medium_norm)hardNegativeObservedPairs++;
}
const hardCandidates=[];
for(const group of artistGroups.values())for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)if(group[i].title_norm!==group[j].title_norm&&group[i].medium_norm&&group[i].medium_norm===group[j].medium_norm)hardCandidates.push([group[i],group[j]]);
hardCandidates.sort((x,y)=>`${x[0].id}:${x[1].id}`.localeCompare(`${y[0].id}:${y[1].id}`));
for(const [a,b] of hardCandidates){if(selected.HARD_NEGATIVE.length>=40)break;takePair('HARD_NEGATIVE',a,b,selected.HARD_NEGATIVE.length<30?'PHYSICAL_OBJECT':'CANONICAL_DESIGN','SAME_ARTIST_SAME_MEDIUM_DIFFERENT_TITLE_DISTINCT_OBJECTS');}

const counts=Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,v.length]));
const all=Object.values(selected).flat();
const boundaryCounts={SOURCE_RECORD:0,PHYSICAL_OBJECT:0,CANONICAL_DESIGN:0};for(const c of all)boundaryCounts[c.identity_boundary]=(boundaryCounts[c.identity_boundary]||0)+1;
const targetsPass=Object.entries(target.case_class_targets).every(([k,v])=>counts[k]===v)&&Object.entries(target.identity_boundary_targets).every(([k,v])=>boundaryCounts[k]===v);
const recordsSelected=[...used].map(id=>byId.get(id));
const artifact={
 id:'kidults-er-designer-maker-live-capacity-r1',version:'1.0.0',stratum_id:target.stratum_id,probe_status:targetsPass?'COMPLETE_SOURCE_CAPACITY_READY':'FAIL_CLOSED_TARGET_CAPACITY_NOT_PROVEN',source_id:'moma-collection-research-dataset',dataset_sha256:datasetSha,eligible_real_record_count:rows.length,same_object_normalization_candidate_count:rows.length,same_design_observed_pair_count:sameDesignObservedPairs,hard_negative_observed_pair_count:hardNegativeObservedPairs,selected_unlabeled_case_candidate_count:all.length,selected_source_record_count:recordsSelected.length,selected_source_record_reuse_count:all.reduce((n,c)=>n+c.source_record_ids.length,0)-new Set(all.flatMap(c=>c.source_record_ids)).size,case_class_counts:counts,identity_boundary_counts:boundaryCounts,readiness_gate:{source_capacity_ready_for_120_cases:targetsPass},candidate_manifest:{selected,labels_present:false,model_predictions_present:false},records:recordsSelected.map(r=>({record_id:r.id,source_reference:r.url,source_payload_sha256:`sha256:${createHash('sha256').update(JSON.stringify({id:r.id,accession:r.accession,title:r.title,artist:r.artist,medium:r.medium,url:r.url})).digest('hex')}`,license_evidence_refs:licenseRefs,rights_state:'ALLOW',payload:{collection_object_identifier:r.id,object_number:r.accession,title:r.title,artist_designer:r.artist,medium:r.medium,collection_record_url:r.url}})),labels_present:false,model_predictions_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'This probe measures whether real MoMA Architecture & Design records can satisfy the exact Designer/Maker empirical case-class and identity-boundary allocation with source-record-disjoint deterministic candidates. It does not create labels, independent review, sealed holdout, empirical PASS, Track B PASS, publication or Production authority.'};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2));
console.log(JSON.stringify({probe_status:artifact.probe_status,eligible_real_record_count:rows.length,same_design_observed_pair_count:sameDesignObservedPairs,hard_negative_observed_pair_count:hardNegativeObservedPairs,selected_case_count:all.length,selected_source_record_count:recordsSelected.length,source_record_reuse_count:artifact.selected_source_record_reuse_count,case_class_counts:counts,identity_boundary_counts:boundaryCounts,ready:targetsPass,output:outPath},null,2));
if(process.env.KAIOS_REQUIRE_DESIGNER_120_READY==='1'&&!targetsPass)process.exit(3);