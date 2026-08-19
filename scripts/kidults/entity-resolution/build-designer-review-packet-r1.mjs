import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const [capacityPath,contractPath,samplingPath,outPath='/tmp/designer-review-packet-r1.json']=process.argv.slice(2);
if(!capacityPath||!contractPath||!samplingPath) throw new Error('usage: build-designer-review-packet-r1 <capacity> <review-contract> <sampling> [out]');
const capacity=JSON.parse(await fs.readFile(capacityPath,'utf8'));
const contract=JSON.parse(await fs.readFile(contractPath,'utf8'));
const sampling=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const target=(sampling.strata||[]).find(x=>x.stratum_id==='er-stratum-designer-maker-edition');
if(capacity.stratum_id!==target.stratum_id||capacity.readiness_gate?.source_capacity_ready_for_120_cases!==true) throw new Error('DESIGNER_CAPACITY_NOT_READY');
if(contract.status!=='READY_FOR_REAL_REVIEWERS_NOT_ATTESTED') throw new Error('REVIEW_CONTRACT_NOT_READY');
const records=new Map((capacity.records||[]).map(r=>[r.record_id,r]));
const selected=Object.values(capacity.candidate_manifest?.selected||{}).flat();
if(selected.length!==120) throw new Error(`SELECTED_${selected.length}_NOT_120`);
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
function ev(id){const r=records.get(id);if(!r)throw new Error(`MISSING_SOURCE_${id}`);return r;}
const cases=selected.map((c,i)=>{
  const a=ev(c.source_record_ids[0]); const b=ev(c.source_record_ids[1]||c.source_record_ids[0]);
  return {
    case_id:`designer-r1-${String(i+1).padStart(3,'0')}`,
    stratum_id:capacity.stratum_id,
    case_class:c.case_class,
    identity_boundary:c.identity_boundary,
    source_a_reference:a.source_reference,
    source_b_reference:b.source_reference,
    source_a_payload_sha256:a.source_payload_sha256,
    source_b_payload_sha256:b.source_payload_sha256,
    license_evidence_refs:[...new Set([...(a.license_evidence_refs||[]),...(b.license_evidence_refs||[])])],
    rights_state:a.rights_state==='ALLOW'&&b.rights_state==='ALLOW'?'ALLOW':'HOLD',
    provenance_refs:[a.source_reference,b.source_reference,...(a.license_evidence_refs||[])],
    candidate_basis:c.candidate_basis,
    boundary_assignment_basis:c.boundary_assignment_basis,
    reviewer_prompt_context:{artist:c.artist||c.shared_artist||null,title:c.title||null,left_title:c.left_title||null,right_title:c.right_title||null},
    label:null,model_prediction:null,reviewer_assignment:'PENDING_REAL_REVIEWER'
  };
});
const classCounts=Object.fromEntries(Object.keys(target.case_class_targets).map(k=>[k,cases.filter(c=>c.case_class===k).length]));
const boundaryCounts=Object.fromEntries(Object.keys(target.identity_boundary_targets).map(k=>[k,cases.filter(c=>c.identity_boundary===k).length]));
for(const [k,v] of Object.entries(target.case_class_targets)) if(classCounts[k]!==v) throw new Error(`CLASS_${k}_${classCounts[k]}_NOT_${v}`);
for(const [k,v] of Object.entries(target.identity_boundary_targets)) if(boundaryCounts[k]!==v) throw new Error(`BOUNDARY_${k}_${boundaryCounts[k]}_NOT_${v}`);
if(cases.some(c=>c.rights_state!=='ALLOW')) throw new Error('RIGHTS_NOT_ALLOW');
const blindIds=cases.filter((_,i)=>i%2===0).slice(0,60).map(c=>c.case_id);
const packet={id:'kidults-er-designer-review-packet-r1',version:'1.0.0',status:'REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED',stratum_id:capacity.stratum_id,case_count:120,case_class_counts:classCounts,identity_boundary_counts:boundaryCounts,source_capacity_artifact_id:capacity.id,labels_present:false,model_predictions_present:false,reviewer_a:'NOT_ASSIGNED',reviewer_b:'NOT_ASSIGNED',blind_partition:{state:'CANDIDATE_NOT_SEALED',case_count:60,case_ids:blindIds,partition_sha256:sha(JSON.stringify(blindIds))},cases,empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'120 real MoMA source-bound Designer/Maker cases are packetized for future independent human review. No reviewer identity, labels, adjudication, sealed holdout, empirical attestation, benchmark PASS, Track B PASS, publication or Production are claimed.'};
await fs.writeFile(outPath,JSON.stringify(packet,null,2));
console.log(JSON.stringify({status:packet.status,case_count:120,blind_candidate_count:60,case_class_counts:classCounts,identity_boundary_counts:boundaryCounts,production:'HOLD'},null,2));