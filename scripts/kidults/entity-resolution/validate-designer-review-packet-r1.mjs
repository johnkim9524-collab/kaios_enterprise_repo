import fs from 'node:fs/promises';
const [packetPath,contractPath,samplingPath]=process.argv.slice(2);
if(!packetPath||!contractPath||!samplingPath) throw new Error('usage: validate-designer-review-packet-r1 <packet> <review-contract> <sampling>');
const p=JSON.parse(await fs.readFile(packetPath,'utf8'));
const c=JSON.parse(await fs.readFile(contractPath,'utf8'));
const s=JSON.parse(await fs.readFile(samplingPath,'utf8'));
const target=(s.strata||[]).find(x=>x.stratum_id==='er-stratum-designer-maker-edition');
if(p.status!=='REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED'||p.case_count!==120) throw new Error('PACKET_STATE');
if(p.labels_present!==false||p.model_predictions_present!==false||p.empirical_pass!==false||p.track_b!=='NOT_STARTED') throw new Error('OVERCLAIM');
if(p.reviewer_a!=='NOT_ASSIGNED'||p.reviewer_b!=='NOT_ASSIGNED'||p.blind_partition?.state!=='CANDIDATE_NOT_SEALED'||p.blind_partition?.case_count!==60) throw new Error('REVIEW_OR_BLIND_STATE');
if(p.production!=='HOLD'||p.public_release!=='HOLD') throw new Error('RELEASE');
for(const [k,v] of Object.entries(target.case_class_targets)) if(p.case_class_counts?.[k]!==v) throw new Error(`CLASS_${k}`);
for(const [k,v] of Object.entries(target.identity_boundary_targets)) if(p.identity_boundary_counts?.[k]!==v) throw new Error(`BOUNDARY_${k}`);
for(const row of p.cases||[]){for(const k of c.packet_input_fields||[]) if(row[k]===undefined||row[k]===null||(Array.isArray(row[k])&&row[k].length===0)) throw new Error(`FIELD_${k}:${row.case_id}`);if(row.rights_state!=='ALLOW'||row.label!==null||row.model_prediction!==null)throw new Error(`CASE_BOUNDARY_${row.case_id}`);for(const forbidden of c.fields_prohibited_from_reviewer_packets||[])if(row[forbidden]!==undefined&&row[forbidden]!==null)throw new Error(`FORBIDDEN_${forbidden}:${row.case_id}`);}
if(new Set((p.cases||[]).map(x=>x.case_id)).size!==120||new Set(p.blind_partition.case_ids||[]).size!==60) throw new Error('DUPLICATE_IDS');
console.log('KIDULTS_ER_DESIGNER_REVIEW_PACKET_R1_PASS_UNLABELED_NOT_REVIEWED');