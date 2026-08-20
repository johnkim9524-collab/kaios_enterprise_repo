import fs from 'node:fs';
const x=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/asi-autonomous-action-queue-v2.json','utf8'));const fail=m=>{throw new Error(m)};
if(x.status!=='SHADOW_AUTONOMOUS_ACTION_QUEUE_FEEDBACK_AWARE'||x.production!=='HOLD'||x.public_release!=='HOLD'||x.matrix_id!=='kidults-global-data-acquisition-master-matrix-feedback-v1')fail('BOUNDARY');
if(x.total_deduped_acquisition_demands!==2048||x.top_priority_actions?.length!==100||x.rights_review_queue?.length<1)fail('COUNTS');
const s=x.market_structure_feedback_summary||{};if(s.record_count_weight!==0||s.bootstrap_collection_share_weight!==0||s.unknown_or_unverified_does_not_modify_priority!==true)fail('FEEDBACK_BOUNDARY');
for(const a of x.top_priority_actions){if(a.production!=='HOLD'||!Number.isFinite(a.priority_score)||!Number.isFinite(a.market_structure_modifier)||a.market_structure_modifier<0||a.market_structure_modifier>25)fail('ACTION');if(a.market_structure_feedback_state==='NO_VERIFIED_CATEGORY_REGION_FACTOR'&&a.market_structure_modifier!==0)fail('UNVERIFIED_MUTATION')}
console.log(JSON.stringify({status:'PASS',demands:x.total_deduped_acquisition_demands,top:x.top_priority_actions.length,market_modified_rows:s.modified_rows||0,verified_factor_applications:s.verified_factor_applications||0,production:x.production}));
