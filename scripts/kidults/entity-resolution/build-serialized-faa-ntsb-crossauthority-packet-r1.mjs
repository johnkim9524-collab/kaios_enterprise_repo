import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { createHash } from 'node:crypto';

const [masterPath,refPath,ntsbCsvPath,faaDigestPath,ntsbDigestPath,samplingPath,reviewPath,hardnegativePath,outPath='/tmp/serialized-faa-ntsb-crossauthority-r1.json']=process.argv.slice(2);
if(!masterPath||!refPath||!ntsbCsvPath||!faaDigestPath||!ntsbDigestPath||!samplingPath||!reviewPath||!hardnegativePath) throw new Error('usage');
const config=JSON.parse(await fs.readFile('coordination/kidults/entity-resolution/serialized-ntsb-aviation-public-r1.json','utf8'));
const faaConfig=JSON.parse(await fs.readFile('coordination/kidults/entity-resolution/serialized-faa-releasable-aircraft-r1.json','utf8'));
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const review=JSON.parse(await fs.readFile(reviewPath,'utf8'));
const hard=JSON.parse(await fs.readFile(hardnegativePath,'utf8'));
const faaSha=(await fs.readFile(faaDigestPath,'utf8')).trim();
const ntsbSha=(await fs.readFile(ntsbDigestPath,'utf8')).trim();
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
if(!/^sha256:[a-f0-9]{64}$/.test(faaSha)||!/^sha256:[a-f0-9]{64}$/.test(ntsbSha)) throw new Error('ARCHIVE_DIGEST');
if(config.rights_state!=='ALLOW_PUBLIC_USE_DATASET'||faaConfig.rights_state!=='ALLOW'||config.production!=='HOLD'||faaConfig.production!=='HOLD') throw new Error('RIGHTS_BOUNDARY');
if(review.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED') throw new Error('REVIEW_CONTRACT');
const target=(sampling.strata||[]).find(x=>x.stratum_id==='er-stratum-serialized-reference');
if(!target||target.cases!==120||target.case_class_targets?.SAME_OBJECT_NORMALIZATION!==40||target.case_class_targets?.HARD_NEGATIVE!==40||target.case_class_targets?.CROSS_MARKET_ALIAS!==40||target.identity_boundary_targets?.SOURCE_RECORD!==60||target.identity_boundary_targets?.PHYSICAL_OBJECT!==60) throw new Error('SAMPLING_TARGET');
if(hard.additional_case_count!==40||hard.total_serialized_reviewer_ready_if_combined!==80||hard.remaining_case_class_deficit?.CROSS_MARKET_ALIAS!==40||hard.labels_present!==false||hard.empirical_pass!==false) throw new Error('HARDNEGATIVE_BASELINE');

function csv(line){const out=[];let s='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(s);s='';}else s+=c;}out.push(s);return out;}
const clean=v=>String(v??'').replace(/^"|"$/g,'').trim();
const nreg=v=>{let x=clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');if(!x)return null;if(!x.startsWith('N'))x=`N${x}`;return /^N[A-Z0-9]{1,6}$/.test(x)?x:null;};
const serialNorm=v=>{const x=clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');return x.length>=2&&x.length<=30&&!['NONE','UNKNOWN','NA','N/A','UNK'].includes(x)?x:null;};
const codeOk=v=>/^[A-Z0-9]{3,7}$/i.test(clean(v));

const refs=new Map();
for(const [i,line] of (await fs.readFile(refPath,'utf8')).split(/\r?\n/).entries()){
  if(!line.trim()) continue; const r=csv(line),code=clean(r[0]),maker=clean(r[1]),model=clean(r[2]);
  if(i===0&&/CODE|MFR/i.test(code)) continue;
  if(codeOk(code)&&maker&&model) refs.set(code,{maker,model});
}
if(refs.size<100) throw new Error('FAA_REF_CAPACITY');
const excludedFaa=new Set((hard.cases||[]).flatMap(c=>c.source_record_ids||[]));
const faaByN=new Map(); let faaEligible=0;
for(const [i,line] of (await fs.readFile(masterPath,'utf8')).split(/\r?\n/).entries()){
  if(!line.trim()) continue; const r=csv(line),nRaw=clean(r[0]),serial=clean(r[1]),modelCode=clean(r[2]);
  if(i===0&&/N[- ]?NUMBER/i.test(nRaw)) continue;
  const n=nreg(nRaw),sn=serialNorm(serial); if(!n||!sn||!codeOk(modelCode)||!refs.has(modelCode)) continue;
  const recordHash=sha({n_number:nRaw,serial_number:serial,mfr_model_code:modelCode});
  if(excludedFaa.has(recordHash)) continue;
  const ref=refs.get(modelCode),projection={registration_sha256:sha(n),serial_number:serial,mfr_model_code:modelCode,aircraft_manufacturer:ref.maker,aircraft_model:ref.model};
  faaEligible++;
  if(!faaByN.has(n)) faaByN.set(n,{n,serial_raw:serial,serial_norm:sn,modelCode,maker:ref.maker,model:ref.model,recordHash,projection,projectionSha:sha(projection)});
}
if(faaByN.size<40) throw new Error('FAA_ALIAS_CAPACITY_LT_40');

const input=createReadStream(ntsbCsvPath,{encoding:'utf8'}); const rl=readline.createInterface({input,crlfDelay:Infinity});
let header=null,idx={},ntsbRows=0,grammarRows=0; const candidates=[]; const usedFaa=new Set(),usedNtsb=new Set();
for await (const line of rl){
  if(!line.trim()) continue;
  const row=csv(line);
  if(!header){header=row.map(x=>clean(x)); for(let i=0;i<header.length;i++)idx[header[i].toLowerCase()]=i; const req=['ev_id','aircraft_key','ntsb_no','regis_no','acft_make','acft_model','acft_serial_no'];for(const k of req)if(idx[k]===undefined)throw new Error(`NTSB_COLUMN_MISSING:${k}`); continue;}
  ntsbRows++;
  const ev=clean(row[idx.ev_id]),aircraftKey=clean(row[idx.aircraft_key]),ntsbNo=clean(row[idx.ntsb_no]),reg=clean(row[idx.regis_no]),make=clean(row[idx.acft_make]),model=clean(row[idx.acft_model]),series=idx.acft_series===undefined?'':clean(row[idx.acft_series]),serial=clean(row[idx.acft_serial_no]);
  const n=nreg(reg),sn=serialNorm(serial); if(!ev||!aircraftKey||!ntsbNo||!n||!sn||!make||!model) continue; grammarRows++;
  const faa=faaByN.get(n); if(!faa||faa.serial_norm!==sn||usedFaa.has(faa.recordHash)) continue;
  const ntsbRecordHash=sha({ev_id:ev,aircraft_key:aircraftKey,ntsb_no:ntsbNo,regis_no:reg,acft_serial_no:serial}); if(usedNtsb.has(ntsbRecordHash)) continue;
  const projection={registration_sha256:sha(n),serial_number:serial,ntsb_no:ntsbNo,aircraft_make:make,aircraft_model:model,aircraft_series:series};
  candidates.push({faa,ntsb:{ev,aircraftKey,ntsbNo,reg,serial,make,model,series,recordHash:ntsbRecordHash,projection,projectionSha:sha(projection)}});
  usedFaa.add(faa.recordHash);usedNtsb.add(ntsbRecordHash);
  if(candidates.length===40) break;
}
if(candidates.length!==40) throw new Error(`FAA_NTSB_SOURCE_DISJOINT_ALIAS_CAPACITY_${candidates.length}_OF_40`);

const cases=candidates.map((p,i)=>({
  case_id:`serialized-faa-ntsb-alias-${String(i+1).padStart(3,'0')}`,
  stratum_id:'er-stratum-serialized-reference',
  case_class:'CROSS_MARKET_ALIAS',
  identity_boundary:i<20?'SOURCE_RECORD':'PHYSICAL_OBJECT',
  expected:'MATCH',
  source_a_reference:`faa-releasable:${faaSha}:${p.faa.recordHash}`,
  source_b_reference:`ntsb-avall:${ntsbSha}:${p.ntsb.recordHash}`,
  source_record_ids:[p.faa.recordHash,p.ntsb.recordHash],
  source_a_payload_sha256:p.faa.projectionSha,
  source_b_payload_sha256:p.ntsb.projectionSha,
  license_evidence_refs:[faaConfig.download_page,faaConfig.documentation_url,config.dataset_page,config.schema_url,config.public_use_evidence_url],
  rights_state:'ALLOW',
  rights_scope:`${faaConfig.rights_scope}+${config.rights_scope}`,
  provenance_refs:[faaConfig.dataset_url,config.dataset_page,config.dataset_url,faaSha,ntsbSha],
  reviewer_prompt_context:{shared_manufacturer_serial:p.faa.serial_raw,faa_aircraft_manufacturer:p.faa.maker,faa_aircraft_model:p.faa.model,ntsb_aircraft_make:p.ntsb.make,ntsb_aircraft_model:p.ntsb.model,ntsb_aircraft_series:p.ntsb.series,ntsb_case_number:p.ntsb.ntsbNo,faa_registration_sha256:sha(p.faa.n),ntsb_registration_sha256:sha(nreg(p.ntsb.reg)),candidate_basis:'INDEPENDENT_FAA_AND_NTSB_AUTHORITIES_AGREE_ON_NORMALIZED_REGISTRATION_AND_MANUFACTURER_SERIAL'},
  label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'
}));
const refsAll=cases.flatMap(c=>[c.source_a_reference,c.source_b_reference]); if(new Set(refsAll).size!==refsAll.length) throw new Error('SOURCE_REFERENCE_REUSE');
const ids=cases.flatMap(c=>c.source_record_ids); if(new Set(ids).size!==ids.length) throw new Error('SOURCE_RECORD_REUSE');
const blindIds=cases.filter((_,i)=>i%2===0).slice(0,20).map(c=>c.case_id);
const artifact={
  id:'kidults-er-serialized-faa-ntsb-crossauthority-packet-r1',version:'1.0.0',status:'SERIALIZED_REVIEWER_MATERIAL_120_OF_120_READY_UNLABELED_NOT_REVIEWED',parent_issue:609,stratum_id:'er-stratum-serialized-reference',source_families:['faa-releasable-aircraft-registry','ntsb-public-aviation-dataset'],faa_archive_sha256:faaSha,ntsb_archive_sha256:ntsbSha,ntsb_aircraft_rows_scanned:ntsbRows,ntsb_grammar_complete_rows_scanned:grammarRows,faa_non_pii_records_after_hardnegative_exclusion:faaEligible,base_serialized_reviewer_ready_case_count:80,additional_case_count:40,total_serialized_reviewer_ready_if_combined:120,aggregate_reviewer_ready_before:680,aggregate_reviewer_ready_if_combined:720,case_class_counts_if_combined:{SAME_OBJECT_NORMALIZATION:40,HARD_NEGATIVE:40,CROSS_MARKET_ALIAS:40},identity_boundary_counts_if_combined:{SOURCE_RECORD:60,PHYSICAL_OBJECT:60},remaining_case_class_deficit:{SAME_OBJECT_NORMALIZATION:0,HARD_NEGATIVE:0,CROSS_MARKET_ALIAS:0},remaining_serialized_case_count:0,remaining_program_material_deficit:120,privacy:{retained_owner_or_address_fields:0,retained_crew_or_operator_fields:0,raw_faa_master_rows_emitted:0,raw_ntsb_rows_emitted:0,raw_registration_numbers_emitted:0},reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',labels_present:false,blind_partition_addition:{state:'CANDIDATE_NOT_SEALED',case_count:20,case_ids:blindIds,partition_sha256:sha(JSON.stringify(blindIds))},cases,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'Forty source-disjoint cross-authority reviewer cases are created only where independent FAA and NTSB public-use aircraft records agree on normalized registration and manufacturer serial. This closes SERIALIZED_REFERENCE reviewer-material allocation only. It creates no reviewer identity, label, adjudication, sealed holdout, empirical PASS, Track B handoff, market claim, Public release or Production/G5 authority. The remaining 120-case program material deficit is GRADED_POPULATION.'
};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:artifact.status,added:40,serialized_total:120,aggregate_total:720,source_record_boundary:60,physical_object_boundary:60,remaining_program_material_deficit:120,empirical_pass:false,production:'HOLD'},null,2));
