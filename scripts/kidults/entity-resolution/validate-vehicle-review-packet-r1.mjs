import fs from 'node:fs/promises';
const [packetPath, contractPath, samplingPath] = process.argv.slice(2);
if(!packetPath||!contractPath||!samplingPath) throw new Error('usage: validate-vehicle-review-packet-r1 <packet> <review-contract> <sampling>');
const p=JSON.parse(await fs.readFile(packetPath,'utf8'));
const c=JSON.parse(await fs.readFile(contractPath,'utf8'));
const s=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const target=(s.strata||[]).find(x=>x.stratum_id==='er-stratum-vehicle-mechanical-asset');
if(p.status!=='REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED'||p.case_count!==120) throw new Error('PACKET_STATE_INVALID');
if(p.labels_present!==false||p.model_predictions_present!==false||p.empirical_pass!==false||p.track_b!=='NOT_STARTED') throw new Error('OVERCLAIM');
if(p.production!=='HOLD'||p.public_release!=='HOLD') throw new Error('RELEASE_BOUNDARY');
if(p.reviewer_a!=='NOT_ASSIGNED'||p.reviewer_b!=='NOT_ASSIGNED') throw new Error('FAKE_REVIEWER_ASSIGNMENT');
if(p.blind_partition?.state!=='CANDIDATE_NOT_SEALED'||p.blind_partition?.case_count!==60) throw new Error('BLIND_STATE_INVALID');
for(const [k,v] of Object.entries(target.case_class_targets)) if(p.case_class_counts?.[k]!==v) throw new Error(`CASE_CLASS_${k}`);
for(const [k,v] of Object.entries(target.identity_boundary_targets)) if(p.identity_boundary_counts?.[k]!==v) throw new Error(`BOUNDARY_${k}`);
const required=c.packet_input_fields||[];
for(const row of p.cases||[]){
  for(const k of required) if(row[k]===undefined||row[k]===null||(Array.isArray(row[k])&&row[k].length===0)) throw new Error(`REQUIRED_FIELD_${k}:${row.case_id}`);
  if(row.rights_state!=='ALLOW') throw new Error(`RIGHTS_${row.case_id}`);
  if(row.label!==null||row.model_prediction!==null) throw new Error(`LABEL_OR_MODEL_LEAK_${row.case_id}`);
  for(const forbidden of c.fields_prohibited_from_reviewer_packets||[]) if(row[forbidden]!==undefined&&row[forbidden]!==null) throw new Error(`FORBIDDEN_${forbidden}:${row.case_id}`);
}
if(new Set((p.cases||[]).map(x=>x.case_id)).size!==120) throw new Error('CASE_ID_DUPLICATE');
if(new Set(p.blind_partition.case_ids||[]).size!==60) throw new Error('BLIND_ID_DUPLICATE');
console.log('KIDULTS_ER_VEHICLE_REVIEW_PACKET_R1_PASS_UNLABELED_NOT_REVIEWED');