import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [capacityPath, contractPath, samplingPath, outPath='/tmp/kidults-er-vehicle-review-packet-r1.json'] = process.argv.slice(2);
if (!capacityPath || !contractPath || !samplingPath) throw new Error('usage: build-vehicle-review-packet-r1 <capacity> <review-contract> <sampling> [out]');
const capacity=JSON.parse(await fs.readFile(capacityPath,'utf8'));
const contract=JSON.parse(await fs.readFile(contractPath,'utf8'));
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const sha=(v)=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;

if(capacity.stratum_id!=='er-stratum-vehicle-mechanical-asset') throw new Error('WRONG_STRATUM');
if(capacity.readiness_gate?.source_capacity_ready_for_120_cases!==true) throw new Error('VEHICLE_CAPACITY_NOT_READY');
if(capacity.candidate_manifest?.labels_present!==false || capacity.candidate_manifest?.model_predictions_present!==false) throw new Error('UPSTREAM_NOT_UNLABELED');
if(contract.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED') throw new Error('REVIEW_CONTRACT_NOT_READY');
const target=(sampling.strata||[]).find(x=>x.stratum_id===capacity.stratum_id);
if(!target || target.cases!==120 || target.blind!==60) throw new Error('SAMPLING_TARGET_INVALID');

const records=new Map((capacity.records||[]).map(r=>[r.record_id,r]));
const selected=Object.values(capacity.candidate_manifest.selected||{}).flat();
if(selected.length!==120) throw new Error(`SELECTED_CASES_${selected.length}_NOT_120`);

function evidence(record){
  if(!record) throw new Error('SOURCE_RECORD_MISSING');
  return {
    reference:record.source_reference,
    payload_sha256:record.source_payload_sha256,
    license_evidence_refs:record.license_evidence_refs,
    rights_state:record.rights_state,
    provenance_refs:[record.source_reference, ...(record.license_evidence_refs||[])]
  };
}

const cases=selected.map((c,index)=>{
  const ids=c.source_record_ids||[];
  const a=records.get(ids[0]);
  const b=records.get(ids[1]||ids[0]);
  const ea=evidence(a), eb=evidence(b);
  return {
    case_id:`vehicle-r1-${String(index+1).padStart(3,'0')}`,
    stratum_id:capacity.stratum_id,
    case_class:c.case_class,
    identity_boundary:c.identity_boundary,
    source_a_reference:ea.reference,
    source_b_reference:eb.reference,
    source_a_payload_sha256:ea.payload_sha256,
    source_b_payload_sha256:eb.payload_sha256,
    license_evidence_refs:[...new Set([...(ea.license_evidence_refs||[]),...(eb.license_evidence_refs||[])])],
    rights_state:(ea.rights_state==='ALLOW'&&eb.rights_state==='ALLOW')?'ALLOW':'HOLD',
    provenance_refs:[...new Set([...(ea.provenance_refs||[]),...(eb.provenance_refs||[])])],
    candidate_basis:c.candidate_basis,
    boundary_assignment_basis:c.boundary_assignment_basis,
    reviewer_prompt_context:{
      maker:c.maker||c.shared_maker||null,
      model:c.model||c.shared_model||null,
      left_model:c.left_model||null,
      right_model:c.right_model||null,
      chassis_identifier:c.chassis_identifier||null,
      left_chassis_identifier:c.left_chassis_identifier||null,
      right_chassis_identifier:c.right_chassis_identifier||null
    },
    label:null,
    model_prediction:null,
    reviewer_assignment:'PENDING_REAL_REVIEWER'
  };
});

const caseClassCounts=Object.fromEntries(Object.keys(target.case_class_targets).map(k=>[k,cases.filter(c=>c.case_class===k).length]));
const boundaryCounts=Object.fromEntries(Object.keys(target.identity_boundary_targets).map(k=>[k,cases.filter(c=>c.identity_boundary===k).length]));
for(const [k,v] of Object.entries(target.case_class_targets)) if(caseClassCounts[k]!==v) throw new Error(`CASE_CLASS_${k}_${caseClassCounts[k]}_NOT_${v}`);
for(const [k,v] of Object.entries(target.identity_boundary_targets)) if(boundaryCounts[k]!==v) throw new Error(`BOUNDARY_${k}_${boundaryCounts[k]}_NOT_${v}`);
if(cases.some(c=>c.rights_state!=='ALLOW')) throw new Error('RIGHTS_NOT_ALLOW');
if(cases.some(c=>!/^sha256:[a-f0-9]{64}$/.test(c.source_a_payload_sha256)||!/^sha256:[a-f0-9]{64}$/.test(c.source_b_payload_sha256))) throw new Error('DIGEST_INVALID');

// Deterministic pre-model partition candidate only. It is NOT sealed until the partition artifact is committed and the model-freeze ordering proof exists.
const blindCaseIds=cases.filter((_,i)=>i%2===0).slice(0,60).map(c=>c.case_id);
if(blindCaseIds.length!==60) throw new Error('BLIND_PARTITION_CANDIDATE_NOT_60');
const artifact={
  id:'kidults-er-vehicle-review-packet-r1',
  version:'1.0.0',
  status:'REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED',
  stratum_id:capacity.stratum_id,
  case_count:cases.length,
  case_class_counts:caseClassCounts,
  identity_boundary_counts:boundaryCounts,
  source_capacity_artifact_id:capacity.id,
  source_capacity_integrity:capacity.integrity?.canonical_payload_sha256||null,
  labels_present:false,
  model_predictions_present:false,
  reviewer_a:'NOT_ASSIGNED',
  reviewer_b:'NOT_ASSIGNED',
  blind_partition:{state:'CANDIDATE_NOT_SEALED',case_count:60,case_ids:blindCaseIds,partition_sha256:sha(JSON.stringify(blindCaseIds))},
  cases,
  empirical_pass:false,
  track_b:'NOT_STARTED',
  public_release:'HOLD',
  production:'HOLD',
  truth_boundary:'120 real source-bound vehicle ER cases are packetized for future independent human review. No labels, reviewer identity, adjudication, sealed holdout, empirical attestation, benchmark PASS, Track B PASS, publication or Production are claimed.'
};
await fs.writeFile(out,JSON.stringify(artifact,null,2));
console.log(JSON.stringify({status:artifact.status,case_count:artifact.case_count,blind_candidate_count:60,case_class_counts:caseClassCounts,identity_boundary_counts:boundaryCounts,labels_present:false,production:'HOLD'},null,2));