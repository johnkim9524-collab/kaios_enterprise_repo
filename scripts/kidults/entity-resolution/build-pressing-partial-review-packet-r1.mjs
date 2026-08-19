import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [corpusPath, capacityPath, contractPath, outPath='/tmp/pressing-partial-review-packet-r1.json'] = process.argv.slice(2);
if(!corpusPath||!capacityPath||!contractPath) throw new Error('usage: build-pressing-partial-review-packet-r1 <corpus> <capacity> <review-contract> [out]');
const corpus=JSON.parse(await fs.readFile(corpusPath,'utf8'));
const capacity=JSON.parse(await fs.readFile(capacityPath,'utf8'));
const contract=JSON.parse(await fs.readFile(contractPath,'utf8'));
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
if(corpus.status!=='REAL_SOURCE_RECORD_CORPUS_UNLABELED'||corpus.stratum_id!=='er-stratum-pressing-edition-media') throw new Error('CORPUS_INVALID');
if(capacity.status!=='COMPLETE_FAIL_CLOSED_PARTIAL_CAPACITY') throw new Error('PARTIAL_CAPACITY_REQUIRED');
if(capacity.metrics?.same_object_normalization_capacity!==40||capacity.metrics?.cross_market_alias_capacity!==0) throw new Error('CLASS_CAPACITY_INVALID');
if(contract.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED') throw new Error('REVIEW_CONTRACT_NOT_READY');

const hardCapacity=Number(capacity.metrics?.hard_negative_capacity||0);
const provenCaseCount=40+hardCapacity;
if(provenCaseCount!==capacity.metrics?.conservative_case_capacity) throw new Error('CONSERVATIVE_CAPACITY_MISMATCH');
const records=new Map((corpus.records||[]).map(r=>[r.source_record_id,r]));
const hard=(capacity.candidate_pools?.HARD_NEGATIVE_SOURCE_DISJOINT||[]).slice(0,hardCapacity);
const used=new Set(hard.flatMap(c=>c.source_record_ids||[]));
const normal=[];
for(const c of capacity.candidate_pools?.SAME_OBJECT_NORMALIZATION||[]){
  const id=c.source_record_ids?.[0];
  if(id&&!used.has(id)){normal.push(c);used.add(id);if(normal.length===40)break;}
}
if(hard.length!==hardCapacity||normal.length!==40) throw new Error(`SOURCE_DISJOINT_SELECTION_${normal.length}_NORMAL_${hard.length}_HARD`);
const selected=[...normal,...hard];
const allSourceIds=selected.flatMap(c=>c.source_record_ids||[]);
if(new Set(allSourceIds).size!==allSourceIds.length) throw new Error('SOURCE_RECORD_REUSE_ACROSS_CASES');

function ev(id){const r=records.get(id);if(!r)throw new Error(`MISSING_SOURCE:${id}`);return r;}
const cases=selected.map((c,i)=>{
  const ids=c.source_record_ids||[];const a=ev(ids[0]);const b=ev(ids[1]||ids[0]);
  return {
    case_id:`pressing-r1-${String(i+1).padStart(3,'0')}`,
    stratum_id:corpus.stratum_id,
    case_class:c.case_class,
    identity_boundary:c.case_class==='SAME_OBJECT_NORMALIZATION'?'SOURCE_RECORD':'PHYSICAL_OBJECT',
    source_a_reference:a.source_reference,
    source_b_reference:b.source_reference,
    source_a_payload_sha256:a.source_payload_sha256,
    source_b_payload_sha256:b.source_payload_sha256,
    license_evidence_refs:[...new Set([...(a.license_evidence_refs||[]),...(b.license_evidence_refs||[])])],
    rights_state:a.rights_state==='ALLOW'&&b.rights_state==='ALLOW'?'ALLOW':'HOLD',
    provenance_refs:[...new Set([...(a.provenance_refs||[]),...(b.provenance_refs||[])])],
    candidate_basis:c.candidate_basis,
    reviewer_prompt_context:{release_mbid:c.release_mbid||null,barcode:c.barcode||null,left_release_mbid:c.left_release_mbid||null,right_release_mbid:c.right_release_mbid||null,left_barcode:c.left_barcode||null,right_barcode:c.right_barcode||null},
    label:null,
    model_prediction:null,
    reviewer_assignment:'PENDING_REAL_REVIEWER'
  };
});
if(cases.length!==provenCaseCount) throw new Error('CASE_COUNT_INVALID');
if(cases.some(c=>c.rights_state!=='ALLOW')) throw new Error('RIGHTS_NOT_ALLOW');
const blindCount=Math.floor(provenCaseCount/2);
const blindIds=cases.filter((_,i)=>i%2===0).slice(0,blindCount).map(c=>c.case_id);
const remaining=120-provenCaseCount;
const packet={
  id:'kidults-er-pressing-partial-review-packet-r1',version:'1.1.0',status:'PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED',stratum_id:corpus.stratum_id,
  case_count:provenCaseCount,sampling_target_total:120,remaining_case_count:remaining,
  case_class_counts:{SAME_OBJECT_NORMALIZATION:40,HARD_NEGATIVE:hardCapacity,CROSS_MARKET_ALIAS:0},
  remaining_case_class_deficit:{SAME_OBJECT_NORMALIZATION:0,HARD_NEGATIVE:40-hardCapacity,CROSS_MARKET_ALIAS:40},
  identity_boundary_counts:{SOURCE_RECORD:40,PHYSICAL_OBJECT:hardCapacity},
  source_record_reuse_across_cases:0,labels_present:false,model_predictions_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',
  blind_partition:{state:'CANDIDATE_NOT_SEALED',case_count:blindCount,case_ids:blindIds,partition_sha256:sha(JSON.stringify(blindIds))},cases,
  empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',
  truth_boundary:`${provenCaseCount} real MusicBrainz source-bound Pressing/Edition cases are packetized: 40 SAME_OBJECT_NORMALIZATION and ${hardCapacity} source-record-disjoint HARD_NEGATIVE. The remaining ${40-hardCapacity} hard-negative and 40 cross-market-alias cases are not fabricated. No reviewers, labels, sealed holdout, empirical PASS, Track B, publication or Production are claimed.`
};
await fs.writeFile(outPath,JSON.stringify(packet,null,2));
console.log(JSON.stringify({status:packet.status,case_count:provenCaseCount,remaining_case_count:remaining,class_counts:packet.case_class_counts,blind_candidate_count:blindCount,production:'HOLD'},null,2));
