import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [capacityPath,samplingPath,contractPath,outPath='/tmp/provenance-residual-review-packet-r2.json']=process.argv.slice(2);
if(!capacityPath||!samplingPath||!contractPath) throw new Error('usage: build-provenance-residual-review-packet-r2 <capacity> <sampling> <review-contract> [out]');
const capacity=JSON.parse(await fs.readFile(capacityPath,'utf8'));
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const contract=JSON.parse(await fs.readFile(contractPath,'utf8'));
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
const hex=/^sha256:[a-f0-9]{64}$/;
if(capacity.id!=='kidults-er-provenance-residual-capacity-r2'||capacity.stratum_id!=='er-stratum-provenance-unique-object') throw new Error('CAPACITY_ARTIFACT_INVALID');
if(capacity.rights_state!=='ALLOW'||capacity.labels_present!==false||capacity.reviewers_assigned!==0||capacity.empirical_cases_created!==0) throw new Error('CAPACITY_TRUTH_BOUNDARY_INVALID');
if(contract.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED') throw new Error('REVIEW_CONTRACT_NOT_READY');
const target=(sampling.strata||[]).find(x=>x.stratum_id===capacity.stratum_id);
if(!target||target.case_class_targets?.AMBIGUOUS_REVIEW_REQUIRED!==50||target.case_class_targets?.HARD_NEGATIVE!==20||target.identity_boundary_targets?.MARKET_EVENT!==100||target.identity_boundary_targets?.PHYSICAL_OBJECT!==20) throw new Error('SAMPLING_TARGET_INVALID');
const amb=(capacity.candidate_pools?.AMBIGUOUS_REVIEW_REQUIRED||[]).slice(0,50);
const hard=(capacity.candidate_pools?.HARD_NEGATIVE||[]).slice(0,20);
const cases=[];
for(let i=0;i<amb.length;i++){
  const c=amb[i];
  if(c.rights_state!=='ALLOW'||!hex.test(c.activity_payload_sha256)||!Array.isArray(c.object_references)||c.object_references.length<2) throw new Error('AMBIGUOUS_EVIDENCE_INVALID');
  if(!Array.isArray(c.object_payload_sha256)||c.object_payload_sha256.length!==c.object_references.length||c.object_payload_sha256.some(x=>!hex.test(x.payload_sha256))) throw new Error('AMBIGUOUS_OBJECT_DIGEST_INVALID');
  cases.push({case_id:`provenance-r2-ambiguous-${String(i+1).padStart(3,'0')}`,stratum_id:capacity.stratum_id,case_class:'AMBIGUOUS_REVIEW_REQUIRED',identity_boundary:'MARKET_EVENT',source_a_reference:c.activity_reference,source_a_payload_sha256:c.activity_payload_sha256,source_b_references:c.object_references,source_b_payload_sha256:c.object_payload_sha256,license_evidence_refs:c.license_evidence_refs,rights_state:c.rights_state,provenance_refs:c.provenance_refs,reviewer_prompt_context:{candidate_basis:c.candidate_basis,explicit_target_count:c.explicit_target_count},label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'});
}
for(let i=0;i<hard.length;i++){
  const c=hard[i];
  if(c.rights_state!=='ALLOW'||!hex.test(c.left_payload_sha256)||!hex.test(c.right_payload_sha256)||c.left_object_reference===c.right_object_reference) throw new Error('HARD_NEGATIVE_EVIDENCE_INVALID');
  cases.push({case_id:`provenance-r2-hard-${String(i+1).padStart(3,'0')}`,stratum_id:capacity.stratum_id,case_class:'HARD_NEGATIVE',identity_boundary:'PHYSICAL_OBJECT',source_a_reference:c.left_object_reference,source_b_reference:c.right_object_reference,source_a_payload_sha256:c.left_payload_sha256,source_b_payload_sha256:c.right_payload_sha256,license_evidence_refs:c.license_evidence_refs,rights_state:c.rights_state,provenance_refs:c.provenance_refs,reviewer_prompt_context:{candidate_basis:c.candidate_basis,shared_normalized_source_label:c.shared_normalized_source_label},label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'});
}
const used=new Set();
for(const c of cases){const refs=[c.source_a_reference,...(c.source_b_references||[]),...(c.source_b_reference?[c.source_b_reference]:[])];for(const r of refs){if(used.has(r)) throw new Error(`SOURCE_REFERENCE_REUSE:${r}`);used.add(r);}}
const blindTarget=Math.floor(cases.length/2);const blindCaseIds=cases.filter((_,i)=>i%2===0).slice(0,blindTarget).map(c=>c.case_id);
const artifact={id:'kidults-er-provenance-residual-review-packet-r2',version:'2.0.0',status:cases.length>0?'PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED':'NO_RESIDUAL_CASES_PROVEN',stratum_id:capacity.stratum_id,packet_scope:'RESIDUAL_AMBIGUOUS_AND_HARD_NEGATIVE_ONLY',case_count:cases.length,sampling_target_total:120,existing_packet_case_count:50,total_reviewer_ready_if_combined:50+cases.length,remaining_case_count:70-cases.length,case_class_counts:{TRANSACTION_TO_OBJECT_LINKAGE:0,AMBIGUOUS_REVIEW_REQUIRED:amb.length,HARD_NEGATIVE:hard.length},identity_boundary_counts:{MARKET_EVENT:amb.length,PHYSICAL_OBJECT:hard.length},labels_present:false,model_predictions_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',blind_partition:{state:'CANDIDATE_NOT_SEALED',case_count:blindCaseIds.length,case_ids:blindCaseIds,partition_sha256:sha(JSON.stringify(blindCaseIds))},cases,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:`${cases.length} additional real Getty source-bound provenance cases are packetized after excluding references already used by the 50-case transaction-to-object packet. They are unlabeled reviewer-ready material only; independent reviewers, labels, adjudication, sealed holdout, empirical attestation, benchmark PASS, Track B, publication and Production remain unclaimed.`};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2));
console.log(JSON.stringify({status:artifact.status,case_count:artifact.case_count,total_reviewer_ready_if_combined:artifact.total_reviewer_ready_if_combined,remaining_case_count:artifact.remaining_case_count,blind_candidate_count:artifact.blind_partition.case_count,production:'HOLD'},null,2));
