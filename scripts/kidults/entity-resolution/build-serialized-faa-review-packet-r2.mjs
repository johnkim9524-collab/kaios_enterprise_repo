import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [capacityPath,priorPacketPath,samplingPath,contractPath,rightsPath,outPath='/tmp/serialized-faa-review-packet-r2.json']=process.argv.slice(2);
if(!capacityPath||!priorPacketPath||!samplingPath||!contractPath||!rightsPath) throw new Error('usage: build-serialized-faa-review-packet-r2 <faa-capacity> <prior-40-packet> <sampling> <review-contract> <rights> [out]');
const cap=JSON.parse(await fs.readFile(capacityPath,'utf8'));
const prior=JSON.parse(await fs.readFile(priorPacketPath,'utf8'));
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const contract=JSON.parse(await fs.readFile(contractPath,'utf8'));
const rights=JSON.parse(await fs.readFile(rightsPath,'utf8'));
const stratum='er-stratum-serialized-reference';
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
if(cap.id!=='kidults-er-serialized-faa-releasable-capacity-r1'||cap.status!=='COMPLETE_STRICT_CAPACITY_READY_DIAGNOSTIC_ONLY'||cap.stratum_id!==stratum)throw new Error('FAA_CAPACITY_INVALID');
if(cap.metrics?.same_maker_model_distinct_serial_hard_negative_capacity!==40||cap.metrics?.registration_to_manufacturer_serial_alias_capacity!==40||cap.metrics?.selected_source_record_count!==120)throw new Error('FAA_40_40_CAPACITY_REQUIRED');
if(!/^sha256:[a-f0-9]{64}$/.test(String(cap.source_archive_sha256||'')))throw new Error('FAA_ARCHIVE_DIGEST_REQUIRED');
if(cap.privacy_boundary!=='OWNER_REGISTRANT_NAME_ADDRESS_CONTACT_AND_ALL_PII_EXCLUDED_FROM_DERIVED_OUTPUT')throw new Error('PRIVACY_BOUNDARY');
if(prior.id!=='kidults-er-serialized-smithsonian-nasm-review-packet-r4'||prior.total_reviewer_ready_if_combined!==40||prior.case_class_counts_if_combined?.SAME_OBJECT_NORMALIZATION!==40||prior.remaining_case_class_deficit?.HARD_NEGATIVE!==40||prior.remaining_case_class_deficit?.CROSS_MARKET_ALIAS!==40)throw new Error('PRIOR_SERIALIZED_40_TRUTH_REQUIRED');
if(contract.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED')throw new Error('REVIEW_CONTRACT_NOT_READY');
if(rights.status!=='ALLOW_BOUNDED_NONPII_INTERNAL_ER_ONLY'||rights.field_purpose_decisions?.N_NUMBER!=='ALLOW'||rights.field_purpose_decisions?.MANUFACTURER_SERIAL!=='ALLOW'||rights.field_purpose_decisions?.OWNER_OR_REGISTRANT_NAME!=='BLOCK')throw new Error('FAA_RIGHTS_NOT_ADMITTED');
const target=(sampling.strata||[]).find(x=>x.stratum_id===stratum);
if(!target||target.cases!==120||target.blind!==60||target.case_class_targets?.SAME_OBJECT_NORMALIZATION!==40||target.case_class_targets?.HARD_NEGATIVE!==40||target.case_class_targets?.CROSS_MARKET_ALIAS!==40||target.identity_boundary_targets?.SOURCE_RECORD!==60||target.identity_boundary_targets?.PHYSICAL_OBJECT!==60)throw new Error('SERIALIZED_SAMPLING_TARGET_DRIFT');
const evidenceRefs=[cap.release_page,cap.documentation_url,rights.official_release_page,rights.official_file_documentation].filter(Boolean);
const archiveRef=`${cap.source_url}#${cap.source_archive_sha256}`;
const hard=(cap.hard_negative_candidates||[]).map((p,i)=>({
  case_id:`serialized-faa-hard-${String(i+1).padStart(3,'0')}`,stratum_id:stratum,case_class:'HARD_NEGATIVE',identity_boundary:'PHYSICAL_OBJECT',expected:'NO_MATCH',
  source_a_reference:`${archiveRef}:record:${p.left.record_id}`,source_b_reference:`${archiveRef}:record:${p.right.record_id}`,
  source_record_ids:[p.left.record_id,p.right.record_id],source_a_payload_sha256:p.left.identity_digest,source_b_payload_sha256:p.right.identity_digest,
  rights_state:'ALLOW',license_evidence_refs:evidenceRefs,provenance_refs:[archiveRef,`faa-model-code:${p.manufacturer_model_code}`,`faa-n-number:${p.left.n_number}`,`faa-n-number:${p.right.n_number}`],
  reviewer_prompt_context:{manufacturer_name:p.manufacturer_name,model_or_series:p.model_name,manufacturer_model_code:p.manufacturer_model_code,left_n_number:p.left.n_number,right_n_number:p.right.n_number,left_manufacturer_serial:p.left.manufacturer_serial,right_manufacturer_serial:p.right.manufacturer_serial,candidate_basis:'SAME_FAA_MANUFACTURER_MODEL_CODE_DISTINCT_PHYSICAL_AIRCRAFT_DISTINCT_MANUFACTURER_SERIAL_AND_REGISTRATION'},
  label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'
}));
const aliases=(cap.alias_candidates||[]).map((a,i)=>({
  case_id:`serialized-faa-alias-${String(i+1).padStart(3,'0')}`,stratum_id:stratum,case_class:'CROSS_MARKET_ALIAS',identity_boundary:i<20?'SOURCE_RECORD':'PHYSICAL_OBJECT',expected:'MATCH',
  source_a_reference:`${archiveRef}:record:${a.record_id}:identifier:FAA_N_NUMBER`,source_b_reference:`${archiveRef}:record:${a.record_id}:identifier:MANUFACTURER_SERIAL`,
  source_record_ids:[a.record_id],source_a_payload_sha256:a.identity_digest,source_b_payload_sha256:a.identity_digest,
  rights_state:'ALLOW',license_evidence_refs:evidenceRefs,provenance_refs:[archiveRef,`faa-n-number:${a.n_number}`,`manufacturer-assigned-serial:${a.manufacturer_serial}`,`faa-model-code:${a.manufacturer_model_code}`],
  reviewer_prompt_context:{manufacturer_name:a.manufacturer_name,model_or_series:a.model_name,manufacturer_model_code:a.manufacturer_model_code,faa_registration_identifier:a.n_number,manufacturer_assigned_serial_identifier:a.manufacturer_serial,identifier_namespace_a:'FAA_N_NUMBER',identifier_namespace_b:'MANUFACTURER_ASSIGNED_SERIAL',candidate_basis:'ONE_FAA_RELEASABLE_MASTER_RECORD_EXPLICITLY_BINDS_TWO_DIFFERENT_ISSUER_IDENTIFIER_NAMESPACES_TO_THE_SAME_AIRCRAFT',semantic_admission:'CROSS_MARKET_ALIAS_LEGACY_CLASS_APPLIED_AS_AUTHORITATIVE_CROSS_IDENTIFIER_RECONCILIATION_PER_SERIALIZED_STRATUM_RATIONALE_NO_MARKET_DATA'},
  label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'
}));
if(hard.length!==40||aliases.length!==40)throw new Error('FAA_PACKET_COUNT');
const all=[...hard,...aliases];const sourceIds=all.flatMap(c=>c.source_record_ids);if(new Set(sourceIds).size!==120)throw new Error(`FAA_SOURCE_RECORD_REUSE:${new Set(sourceIds).size}`);
for(const p of hard){if(p.reviewer_prompt_context.left_manufacturer_serial===p.reviewer_prompt_context.right_manufacturer_serial||p.reviewer_prompt_context.left_n_number===p.reviewer_prompt_context.right_n_number)throw new Error('HARD_NEGATIVE_IDENTITY_COLLISION');}
for(const a of aliases){if(a.reviewer_prompt_context.identifier_namespace_a===a.reviewer_prompt_context.identifier_namespace_b||a.reviewer_prompt_context.faa_registration_identifier===a.reviewer_prompt_context.manufacturer_assigned_serial_identifier)throw new Error('ALIAS_NAMESPACE_OR_IDENTIFIER_NOT_DISTINCT');}
const addedBlind=[...hard.filter((_,i)=>i%2===0).slice(0,20),...aliases.filter((_,i)=>i%2===0).slice(0,20)].map(c=>c.case_id);
if(addedBlind.length!==40)throw new Error('ADDED_BLIND_40_REQUIRED');
const combinedClass={SAME_OBJECT_NORMALIZATION:40,HARD_NEGATIVE:40,CROSS_MARKET_ALIAS:40};
const combinedBoundary={SOURCE_RECORD:40+aliases.filter(x=>x.identity_boundary==='SOURCE_RECORD').length,PHYSICAL_OBJECT:hard.length+aliases.filter(x=>x.identity_boundary==='PHYSICAL_OBJECT').length};
if(combinedBoundary.SOURCE_RECORD!==60||combinedBoundary.PHYSICAL_OBJECT!==60)throw new Error(`BOUNDARY_TARGET_NOT_EXACT:${JSON.stringify(combinedBoundary)}`);
const artifact={id:'kidults-er-serialized-faa-review-packet-r2',version:'2.0.0',status:'FULL_STRATUM_REVIEW_MATERIAL_READY_UNLABELED_NOT_REVIEWED',stratum_id:stratum,source_family:'faa-releasable-aircraft-registry',prior_reviewer_ready_case_count:40,additional_case_count:80,total_reviewer_ready_if_combined:120,sampling_target_total:120,remaining_case_count:0,case_class_counts_if_combined:combinedClass,identity_boundary_counts_if_combined:combinedBoundary,source_record_count_added:120,source_record_reuse_with_prior:0,source_record_reuse_within_addition:0,rights_admission_id:rights.id,source_archive_sha256:cap.source_archive_sha256,privacy_boundary:cap.privacy_boundary,labels_present:false,model_predictions_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',blind_partition_addition:{state:'CANDIDATE_NOT_SEALED',case_count:40,case_ids:addedBlind,partition_sha256:sha(addedBlind)},blind_candidate_count_if_combined:60,cases:all,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'Fresh FAA releasable-registry non-PII evidence closes SERIALIZED_REFERENCE reviewer material at 120/120 only if all exact gates pass: class counts 40/40/40, identity boundaries SOURCE_RECORD 60 / PHYSICAL_OBJECT 60, 120 new FAA source records with no reuse, and bounded rights admission. CROSS_MARKET_ALIAS is used only for explicit reconciliation between FAA registration N-number and manufacturer-assigned serial identifier namespaces bound by the same authoritative FAA Master record; no marketplace, owner, sale, value or current-market meaning is inferred. Reviewer identities, labels, adjudication, blind seal, empirical PASS, Track B and Production remain absent/HOLD.'};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');console.log(JSON.stringify({status:artifact.status,added:80,total:120,class_counts:combinedClass,boundary_counts:combinedBoundary,blind_candidates_if_combined:60,privacy:'PII_EXCLUDED',empirical_pass:false,production:'HOLD'},null,2));
