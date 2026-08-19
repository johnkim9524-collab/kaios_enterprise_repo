import fs from 'node:fs/promises';
const p=process.argv[2]||'/tmp/pressing-partial-review-packet-r1.json';
const x=JSON.parse(await fs.readFile(p,'utf8'));
if(x.status!=='PARTIAL_REVIEW_PACKET_READY_UNLABELED_NOT_REVIEWED'||x.stratum_id!=='er-stratum-pressing-edition-media') throw new Error('STATUS_OR_STRATUM');
const hard=Number(x.case_class_counts?.HARD_NEGATIVE);
if(!Number.isInteger(hard)||hard<0||hard>40) throw new Error('HARD_CAPACITY_INVALID');
const expected=40+hard;
if(x.case_count!==expected||x.remaining_case_count!==120-expected) throw new Error('CASE_COUNTS');
if(x.case_class_counts?.SAME_OBJECT_NORMALIZATION!==40||x.case_class_counts?.CROSS_MARKET_ALIAS!==0) throw new Error('CLASS_COUNTS');
if(x.remaining_case_class_deficit?.SAME_OBJECT_NORMALIZATION!==0||x.remaining_case_class_deficit?.HARD_NEGATIVE!==40-hard||x.remaining_case_class_deficit?.CROSS_MARKET_ALIAS!==40) throw new Error('DEFICIT_COUNTS');
if(x.source_record_reuse_across_cases!==0) throw new Error('SOURCE_REUSE');
if(x.labels_present!==false||x.model_predictions_present!==false||x.reviewer_a!=='NOT_ASSIGNED'||x.reviewer_b!=='NOT_ASSIGNED') throw new Error('REVIEW_BOUNDARY');
if(x.blind_partition?.state!=='CANDIDATE_NOT_SEALED'||x.blind_partition?.case_count!==Math.floor(expected/2)) throw new Error('BLIND_BOUNDARY');
if(x.empirical_pass!==false||x.track_b!=='NOT_STARTED'||x.public_release!=='HOLD'||x.production!=='HOLD') throw new Error('OVERCLAIM');
for(const c of x.cases||[]){if(c.rights_state!=='ALLOW'||c.label!==null||c.model_prediction!==null)throw new Error('CASE_BOUNDARY');}
console.log(`KIDULTS_PRESSING_PARTIAL_REVIEW_PACKET_R1_PASS_${expected}_OF_120`);
