import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [capacityPath,existingPacketPath,samplingPath,contractPath,outPath='/tmp/serialized-smithsonian-nasm-review-packet-r4.json']=process.argv.slice(2);
if(!capacityPath||!existingPacketPath||!samplingPath||!contractPath) throw new Error('usage: build-serialized-smithsonian-nasm-review-packet-r4 <capacity> <existing-packet> <sampling> <contract> [out]');
const capacity=JSON.parse(await fs.readFile(capacityPath,'utf8'));
const existing=JSON.parse(await fs.readFile(existingPacketPath,'utf8'));
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const contract=JSON.parse(await fs.readFile(contractPath,'utf8'));
const stratum='er-stratum-serialized-reference';
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
if(capacity.id!=='kidults-er-serialized-smithsonian-nasm-capacity-r4'||capacity.status!=='COMPLETE_FAIL_CLOSED_SEMANTICALLY_STRICT_CAPACITY_DIAGNOSTIC'||capacity.stratum_id!==stratum||capacity.rights_state!=='ALLOW_METADATA_CC0_BOUNDARY') throw new Error('CAPACITY_INVALID');
if(existing.id!=='kidults-er-serialized-source-disjoint-review-packet-r3'||existing.stratum_id!==stratum||existing.status!=='PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED'||existing.labels_present!==false) throw new Error('EXISTING_PACKET_INVALID');
if(contract.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED') throw new Error('REVIEW_CONTRACT_NOT_READY');
const target=(sampling.strata||[]).find(x=>x.stratum_id===stratum);
if(!target||target.cases!==120||target.case_class_targets?.SAME_OBJECT_NORMALIZATION!==40||target.case_class_targets?.HARD_NEGATIVE!==40||target.case_class_targets?.CROSS_MARKET_ALIAS!==40) throw new Error('SAMPLING_TARGET_INVALID');
const existingNorm=Number(existing.case_class_counts?.SAME_OBJECT_NORMALIZATION||0);
if(existing.case_count!==9||existingNorm!==9||Number(existing.case_class_counts?.HARD_NEGATIVE||0)!==0||Number(existing.case_class_counts?.CROSS_MARKET_ALIAS||0)!==0) throw new Error(`EXISTING_SERIALIZED_TRUTH_DRIFT:${existing.case_count}:${existingNorm}`);
const remainingNorm=Math.max(0,40-existingNorm);
if(remainingNorm!==31) throw new Error(`UNEXPECTED_NORMALIZATION_DEFICIT:${remainingNorm}`);
const candidates=[...(capacity.candidates||[])].filter(c=>c&&c.rights_state==='ALLOW_METADATA_CC0_BOUNDARY').sort((a,b)=>String(a.identity_key).localeCompare(String(b.identity_key)));
if(candidates.length<remainingNorm||Number(capacity.metrics?.canonical_identity_distinct_records||0)<remainingNorm) throw new Error(`NASM_STRICT_CAPACITY_LT_${remainingNorm}:${candidates.length}`);
const existingRefs=new Set((existing.cases||[]).flatMap(c=>[c.source_a_reference,c.source_b_reference]).filter(Boolean));
const seenRecords=new Set(),seenIdentities=new Set();
const selected=[];
for(const c of candidates){
  const recordId=String(c.record_id||'').trim(),identity=String(c.identity_key||'').trim(),shard=String(c.source_shard||'').trim();
  if(!recordId||!/^sha256:[a-f0-9]{64}$/.test(identity)||!/^sha256:[a-f0-9]{64}$/.test(String(c.record_sha256||''))||!/^https:\/\/smithsonian-open-access\.s3-us-west-2\.amazonaws\.com\/metadata\/edan\/nasm\//.test(shard)) continue;
  if(!Number.isInteger(Number(c.source_line))||Number(c.source_line)<1||seenRecords.has(recordId)||seenIdentities.has(identity)) continue;
  const sourceRef=`${shard}#line=${Number(c.source_line)}`;
  if(existingRefs.has(sourceRef)) continue;
  selected.push({...c,source_reference:sourceRef});seenRecords.add(recordId);seenIdentities.add(identity);
  if(selected.length===remainingNorm) break;
}
if(selected.length!==remainingNorm) throw new Error(`SOURCE_DISJOINT_NASM_SELECTED_${selected.length}_OF_${remainingNorm}`);
const cases=selected.map((c,i)=>({
  case_id:`serialized-r4-nasm-normalization-${String(i+1).padStart(3,'0')}`,
  stratum_id:stratum,
  case_class:'SAME_OBJECT_NORMALIZATION',
  identity_boundary:'SOURCE_RECORD',
  source_a_reference:c.source_reference,
  source_b_reference:c.source_reference,
  source_record_ids:[c.record_id],
  source_payload_sha256:c.record_sha256,
  semantic_identity_sha256:c.identity_key,
  reviewer_prompt_context:{manufacturer_serial:c.serial_evidence?.value,maker:c.maker_evidence?.value,model_or_designation:c.model_evidence?.value,serial_evidence_path:c.serial_evidence?.path,maker_evidence_path:c.maker_evidence?.path,model_evidence_path:c.model_evidence?.path,candidate_basis:'ONE_SMITHSONIAN_NASM_CC0_METADATA_RECORD_WITH_EXPLICIT_SERIAL_MAKER_AND_MODEL_OR_DESIGNATION'},
  license_evidence_refs:[...new Set(c.license_evidence_refs||capacity.license_evidence_refs||[])],
  rights_state:'ALLOW_METADATA_CC0_BOUNDARY',
  provenance_refs:[c.source_reference,`smithsonian-record:${c.record_id}`,`semantic-identity:${c.identity_key}`],
  label:null,
  model_prediction:null,
  reviewer_assignment:'PENDING_REAL_REVIEWER'
}));
const newRefs=cases.map(c=>c.source_a_reference);if(new Set(newRefs).size!==newRefs.length) throw new Error('NEW_SOURCE_REFERENCE_REUSE');
const newRecordIds=cases.flatMap(c=>c.source_record_ids);if(new Set(newRecordIds).size!==newRecordIds.length) throw new Error('NEW_SOURCE_RECORD_REUSE');
const addedBlindCount=Math.ceil(cases.length/2),addedBlindIds=cases.filter((_,i)=>i%2===0).slice(0,addedBlindCount).map(c=>c.case_id);
const artifact={
  id:'kidults-er-serialized-smithsonian-nasm-review-packet-r4',version:'4.0.0',status:'NORMALIZATION_FLOOR_REVIEWER_MATERIAL_READY_UNLABELED_NOT_REVIEWED',stratum_id:stratum,source_family:'smithsonian-open-access-nasm',base_packet_id:existing.id,base_reviewer_ready_case_count:existing.case_count,base_normalization_count:existingNorm,additional_case_count:cases.length,total_reviewer_ready_if_combined:existing.case_count+cases.length,sampling_target_total:120,remaining_case_count:120-existing.case_count-cases.length,case_class_counts_if_combined:{SAME_OBJECT_NORMALIZATION:existingNorm+cases.length,HARD_NEGATIVE:0,CROSS_MARKET_ALIAS:0},remaining_case_class_deficit:{SAME_OBJECT_NORMALIZATION:0,HARD_NEGATIVE:40,CROSS_MARKET_ALIAS:40},source_record_reuse_with_existing:0,labels_present:false,model_predictions_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',blind_partition_addition:{state:'CANDIDATE_NOT_SEALED',case_count:addedBlindIds.length,case_ids:addedBlindIds,partition_sha256:sha(JSON.stringify(addedBlindIds))},cases,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'Fresh current-main Smithsonian NASM CC0 metadata closes only the SERIALIZED_REFERENCE SAME_OBJECT_NORMALIZATION reviewer-material floor from 9/40 to 40/40 using 31 source-disjoint strict semantic records. It creates no real reviewer identity, reviewer label, adjudication, sealed holdout, empirical PASS, Track B handoff, public claim or Production authority. HARD_NEGATIVE and CROSS_MARKET_ALIAS remain 40-case deficits each.'
};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:artifact.status,added:artifact.additional_case_count,serialized_total:artifact.total_reviewer_ready_if_combined,normalization_total:artifact.case_class_counts_if_combined.SAME_OBJECT_NORMALIZATION,remaining:artifact.remaining_case_count,production:'HOLD'},null,2));
