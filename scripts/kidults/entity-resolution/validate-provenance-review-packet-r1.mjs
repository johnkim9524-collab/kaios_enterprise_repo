import fs from 'node:fs/promises';
const p=process.argv[2]||'/tmp/kidults-er-provenance-review-packet-r1.json';
const x=JSON.parse(await fs.readFile(p,'utf8'));
if(x.status!=='PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED') throw new Error('STATUS_INVALID');
if(x.stratum_id!=='er-stratum-provenance-unique-object') throw new Error('STRATUM_INVALID');
if(x.case_count!==50||x.remaining_case_count!==70) throw new Error('CASE_COUNTS_INVALID');
if(x.case_class_counts?.TRANSACTION_TO_OBJECT_LINKAGE!==50) throw new Error('LINKAGE_50_REQUIRED');
if(x.identity_boundary_counts?.MARKET_EVENT!==50) throw new Error('MARKET_EVENT_50_REQUIRED');
if(x.labels_present!==false||x.model_predictions_present!==false) throw new Error('UNLABELED_REQUIRED');
if(x.reviewer_a!=='NOT_ASSIGNED'||x.reviewer_b!=='NOT_ASSIGNED') throw new Error('REVIEWERS_MUST_NOT_BE_INVENTED');
if(x.blind_partition?.state!=='CANDIDATE_NOT_SEALED'||x.blind_partition?.case_count!==25) throw new Error('BLIND_CANDIDATE_BOUNDARY_INVALID');
if(x.empirical_pass!==false||x.track_b!=='NOT_STARTED') throw new Error('DOWNSTREAM_OVERCLAIM');
if(x.production!=='HOLD'||x.public_release!=='HOLD') throw new Error('RELEASE_BOUNDARY_INVALID');
for(const c of x.cases||[]){
  if(c.rights_state!=='ALLOW') throw new Error('RIGHTS_ALLOW_REQUIRED');
  if(!/^sha256:[a-f0-9]{64}$/.test(c.source_a_payload_sha256)||!/^sha256:[a-f0-9]{64}$/.test(c.source_b_payload_sha256)||!/^sha256:[a-f0-9]{64}$/.test(c.source_link_evidence_sha256)) throw new Error('DIGEST_INVALID');
  if(c.label!==null||c.model_prediction!==null) throw new Error('LABEL_OR_PREDICTION_PRESENT');
}
console.log('KIDULTS_PROVENANCE_REVIEW_PACKET_R1_PASS_PARTIAL_UNLABELED');
