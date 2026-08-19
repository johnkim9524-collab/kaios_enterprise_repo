import fs from 'node:fs/promises';
const p=process.argv[2]||'/tmp/provenance-residual-review-packet-r2.json';
const x=JSON.parse(await fs.readFile(p,'utf8'));
const hex=/^sha256:[a-f0-9]{64}$/;
if(x.id!=='kidults-er-provenance-residual-review-packet-r2'||x.stratum_id!=='er-stratum-provenance-unique-object') throw new Error('ARTIFACT_INVALID');
if(!['PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED','NO_RESIDUAL_CASES_PROVEN'].includes(x.status)) throw new Error('STATUS_INVALID');
if(x.case_count!==(x.cases||[]).length||x.existing_packet_case_count!==50||x.total_reviewer_ready_if_combined!==50+x.case_count||x.remaining_case_count!==70-x.case_count) throw new Error('COUNT_MISMATCH');
if(x.case_count<0||x.case_count>70||x.total_reviewer_ready_if_combined>120) throw new Error('COUNT_RANGE_INVALID');
const amb=x.cases.filter(c=>c.case_class==='AMBIGUOUS_REVIEW_REQUIRED');const hard=x.cases.filter(c=>c.case_class==='HARD_NEGATIVE');
if(amb.length!==x.case_class_counts?.AMBIGUOUS_REVIEW_REQUIRED||hard.length!==x.case_class_counts?.HARD_NEGATIVE||x.case_class_counts?.TRANSACTION_TO_OBJECT_LINKAGE!==0) throw new Error('CLASS_COUNTS_INVALID');
if(amb.length>50||hard.length>20) throw new Error('CLASS_TARGET_EXCEEDED');
if(x.identity_boundary_counts?.MARKET_EVENT!==amb.length||x.identity_boundary_counts?.PHYSICAL_OBJECT!==hard.length) throw new Error('BOUNDARY_COUNTS_INVALID');
if(x.labels_present!==false||x.model_predictions_present!==false||x.reviewer_a!=='NOT_ASSIGNED'||x.reviewer_b!=='NOT_ASSIGNED') throw new Error('REVIEW_TRUTH_INVALID');
if(x.blind_partition?.state!=='CANDIDATE_NOT_SEALED'||x.blind_partition?.case_count!==Math.floor(x.case_count/2)||!hex.test(x.blind_partition?.partition_sha256)) throw new Error('BLIND_BOUNDARY_INVALID');
if(x.empirical_pass!==false||x.track_b!=='NOT_STARTED'||x.public_release!=='HOLD'||x.production!=='HOLD') throw new Error('DOWNSTREAM_OVERCLAIM');
const used=new Set();
for(const c of x.cases||[]){
  if(c.rights_state!=='ALLOW'||c.label!==null||c.model_prediction!==null||c.reviewer_assignment!=='PENDING_REAL_REVIEWER') throw new Error('CASE_TRUTH_INVALID');
  if(!hex.test(c.source_a_payload_sha256)) throw new Error('SOURCE_A_DIGEST_INVALID');
  const refs=[c.source_a_reference];
  if(c.case_class==='AMBIGUOUS_REVIEW_REQUIRED'){
    if(c.identity_boundary!=='MARKET_EVENT'||!Array.isArray(c.source_b_references)||c.source_b_references.length<2||!Array.isArray(c.source_b_payload_sha256)||c.source_b_payload_sha256.length!==c.source_b_references.length||c.source_b_payload_sha256.some(v=>!hex.test(v.payload_sha256))) throw new Error('AMBIGUOUS_CASE_INVALID');
    refs.push(...c.source_b_references);
  } else if(c.case_class==='HARD_NEGATIVE'){
    if(c.identity_boundary!=='PHYSICAL_OBJECT'||!c.source_b_reference||!hex.test(c.source_b_payload_sha256)||c.source_a_reference===c.source_b_reference) throw new Error('HARD_NEGATIVE_CASE_INVALID');
    refs.push(c.source_b_reference);
  } else throw new Error('UNEXPECTED_CASE_CLASS');
  if(!Array.isArray(c.license_evidence_refs)||c.license_evidence_refs.length<2||!Array.isArray(c.provenance_refs)||c.provenance_refs.length<2) throw new Error('RIGHTS_OR_PROVENANCE_MISSING');
  for(const r of refs){if(used.has(r)) throw new Error(`SOURCE_REFERENCE_REUSE:${r}`);used.add(r);}
}
console.log(`KIDULTS_PROVENANCE_RESIDUAL_REVIEW_PACKET_R2_PASS_${x.case_count}_UNLABELED`);
