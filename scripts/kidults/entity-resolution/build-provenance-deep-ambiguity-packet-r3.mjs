import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [capacityPath,samplingPath,contractPath,outPath='/tmp/provenance-deep-ambiguity-packet-r3.json']=process.argv.slice(2);
if(!capacityPath||!samplingPath||!contractPath) throw new Error('usage: build-provenance-deep-ambiguity-packet-r3 <capacity> <sampling> <contract> [out]');
const capacity=JSON.parse(await fs.readFile(capacityPath,'utf8'));
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const contract=JSON.parse(await fs.readFile(contractPath,'utf8'));
const hex=/^sha256:[a-f0-9]{64}$/;
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
if(capacity.id!=='kidults-er-provenance-deep-ambiguity-r3'||capacity.stratum_id!=='er-stratum-provenance-unique-object'||capacity.rights_state!=='ALLOW') throw new Error('CAPACITY_INVALID');
if(capacity.labels_present!==false||capacity.reviewers_assigned!==0||capacity.empirical_cases_created!==0) throw new Error('CAPACITY_OVERCLAIM');
if(contract.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED') throw new Error('REVIEW_CONTRACT_NOT_READY');
const target=(sampling.strata||[]).find(x=>x.stratum_id===capacity.stratum_id);
if(!target||target.case_class_targets?.AMBIGUOUS_REVIEW_REQUIRED!==50) throw new Error('SAMPLING_TARGET_INVALID');
const pool=(capacity.candidate_pool||[]).slice(0,47);
const cases=pool.map((c,i)=>{
  if(c.case_class!=='AMBIGUOUS_REVIEW_REQUIRED'||c.rights_state!=='ALLOW'||!hex.test(c.activity_payload_sha256)) throw new Error('AMBIGUOUS_EVIDENCE_INVALID');
  if(!Array.isArray(c.object_references)||c.object_references.length<2||!Array.isArray(c.object_payload_sha256)||c.object_payload_sha256.length!==c.object_references.length) throw new Error('OBJECT_EVIDENCE_INVALID');
  if(c.object_payload_sha256.some(x=>!hex.test(x.payload_sha256))) throw new Error('OBJECT_DIGEST_INVALID');
  return {case_id:`provenance-r3-ambiguous-${String(i+1).padStart(3,'0')}`,stratum_id:capacity.stratum_id,case_class:'AMBIGUOUS_REVIEW_REQUIRED',identity_boundary:'MARKET_EVENT',source_a_reference:c.activity_reference,source_a_payload_sha256:c.activity_payload_sha256,source_b_references:c.object_references,source_b_payload_sha256:c.object_payload_sha256,license_evidence_refs:c.license_evidence_refs,rights_state:'ALLOW',provenance_refs:c.provenance_refs,reviewer_prompt_context:{candidate_basis:c.candidate_basis,explicit_target_count:c.explicit_target_count},label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'};
});
const used=new Set();for(const c of cases){for(const r of [c.source_a_reference,...c.source_b_references]){if(used.has(r))throw new Error(`SOURCE_REFERENCE_REUSE:${r}`);used.add(r);}}
const blindCount=Math.floor(cases.length/2);const blindIds=cases.filter((_,i)=>i%2===0).slice(0,blindCount).map(x=>x.case_id);
const artifact={id:'kidults-er-provenance-deep-ambiguity-packet-r3',version:'3.0.0',status:cases.length?'PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED':'NO_ADDITIONAL_CASES_PROVEN',stratum_id:capacity.stratum_id,packet_scope:'DEEP_SCAN_ADDITIONAL_AMBIGUITY_ONLY',case_count:cases.length,prior_reviewer_ready_case_count:73,total_reviewer_ready_if_combined:73+cases.length,sampling_target_total:120,remaining_case_count:47-cases.length,case_class_counts:{AMBIGUOUS_REVIEW_REQUIRED:cases.length},identity_boundary_counts:{MARKET_EVENT:cases.length},labels_present:false,model_predictions_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',blind_partition:{state:'CANDIDATE_NOT_SEALED',case_count:blindIds.length,case_ids:blindIds,partition_sha256:sha(JSON.stringify(blindIds))},cases,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:`${cases.length} additional real Getty source-bound AMBIGUOUS_REVIEW_REQUIRED cases are packetized from later activity-stream pages after excluding all references used by the prior 73 reviewer-ready Provenance cases. They remain unlabeled material only; review, adjudication, sealed holdout, attestation, benchmark PASS, Track B, publication and Production remain blocked.`};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:artifact.status,case_count:artifact.case_count,total_reviewer_ready_if_combined:artifact.total_reviewer_ready_if_combined,remaining_case_count:artifact.remaining_case_count,blind_candidate_count:artifact.blind_partition.case_count,production:'HOLD'},null,2));
