import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [corpusPath, contractPath, samplingPath, outPath='/tmp/kidults-er-provenance-review-packet-r1.json'] = process.argv.slice(2);
if(!corpusPath||!contractPath||!samplingPath) throw new Error('usage: build-provenance-review-packet-r1 <corpus> <review-contract> <sampling> [out]');
const corpus=JSON.parse(await fs.readFile(corpusPath,'utf8'));
const contract=JSON.parse(await fs.readFile(contractPath,'utf8'));
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const sha=(v)=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;

if(corpus.status!=='REAL_SOURCE_EXPLICITLY_LINKED_PAIR_CORPUS_UNLABELED') throw new Error('CORPUS_STATUS_INVALID');
if(corpus.stratum_id!=='er-stratum-provenance-unique-object') throw new Error('WRONG_STRATUM');
if(corpus.pair_count!==120||corpus.pairs?.length!==120) throw new Error('CORPUS_120_REQUIRED');
if(corpus.distinct_activity_count!==120||corpus.distinct_object_count!==120) throw new Error('CORPUS_UNIQUENESS_INVALID');
if(corpus.labels_present!==false||corpus.model_predictions_present!==false) throw new Error('CORPUS_MUST_BE_UNLABELED');
if(contract.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED') throw new Error('REVIEW_CONTRACT_NOT_READY');
const target=(sampling.strata||[]).find(x=>x.stratum_id===corpus.stratum_id);
if(!target||target.case_class_targets?.TRANSACTION_TO_OBJECT_LINKAGE!==50||target.identity_boundary_targets?.MARKET_EVENT!==100) throw new Error('PROVENANCE_SAMPLING_TARGET_INVALID');

const selected=corpus.pairs.slice(0,50);
const cases=selected.map((p,index)=>({
  case_id:`provenance-r1-link-${String(index+1).padStart(3,'0')}`,
  stratum_id:corpus.stratum_id,
  case_class:'TRANSACTION_TO_OBJECT_LINKAGE',
  identity_boundary:'MARKET_EVENT',
  source_a_reference:p.activity?.source_reference,
  source_b_reference:p.object?.source_reference,
  source_a_payload_sha256:p.activity?.source_payload_sha256,
  source_b_payload_sha256:p.object?.source_payload_sha256,
  source_link_evidence_sha256:p.explicit_source_link?.source_link_evidence_sha256,
  license_evidence_refs:p.license_evidence_refs,
  rights_state:p.rights_state,
  provenance_refs:p.provenance_refs,
  reviewer_prompt_context:{
    predicate:p.explicit_source_link?.predicate||null,
    source_path:p.explicit_source_link?.source_path||null,
    verified_from_activity_payload:p.explicit_source_link?.verified_from_activity_payload===true
  },
  label:null,
  model_prediction:null,
  reviewer_assignment:'PENDING_REAL_REVIEWER'
}));
if(cases.length!==50) throw new Error('CASES_50_REQUIRED');
if(cases.some(c=>c.rights_state!=='ALLOW')) throw new Error('RIGHTS_NOT_ALLOW');
if(cases.some(c=>!/^sha256:[a-f0-9]{64}$/.test(c.source_a_payload_sha256)||!/^sha256:[a-f0-9]{64}$/.test(c.source_b_payload_sha256)||!/^sha256:[a-f0-9]{64}$/.test(c.source_link_evidence_sha256))) throw new Error('DIGEST_INVALID');
const blindCaseIds=cases.filter((_,i)=>i%2===0).slice(0,25).map(c=>c.case_id);
const artifact={
  id:'kidults-er-provenance-review-packet-r1',
  version:'1.1.0',
  status:'PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED',
  stratum_id:corpus.stratum_id,
  packet_scope:'TRANSACTION_TO_OBJECT_LINKAGE_ONLY',
  case_count:50,
  sampling_target_total:120,
  remaining_case_count:70,
  case_class_counts:{TRANSACTION_TO_OBJECT_LINKAGE:50,AMBIGUOUS_REVIEW_REQUIRED:0,HARD_NEGATIVE:0},
  identity_boundary_counts:{MARKET_EVENT:50,PHYSICAL_OBJECT:0},
  labels_present:false,
  model_predictions_present:false,
  reviewer_a:'NOT_ASSIGNED',
  reviewer_b:'NOT_ASSIGNED',
  blind_partition:{state:'CANDIDATE_NOT_SEALED',case_count:25,case_ids:blindCaseIds,partition_sha256:sha(JSON.stringify(blindCaseIds))},
  cases,
  empirical_pass:false,
  track_b:'NOT_STARTED',
  public_release:'HOLD',
  production:'HOLD',
  truth_boundary:'50 real Getty source-linked transaction-to-object cases are packetized for future independent review. The remaining 70 provenance cases, reviewers, labels, adjudication, sealed holdout, empirical attestation, benchmark PASS, Track B, publication and Production are not claimed.'
};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2));
console.log(JSON.stringify({status:artifact.status,case_count:50,remaining_case_count:70,blind_candidate_count:25,labels_present:false,production:'HOLD'},null,2));
