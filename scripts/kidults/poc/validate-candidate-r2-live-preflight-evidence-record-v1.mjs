import fs from 'node:fs';
const x=JSON.parse(fs.readFileSync('coordination/kidults/poc/candidate-r2-live-preflight-evidence-record-v1.json','utf8'));
const e=[]; const a=(ok,m)=>{if(!ok)e.push(m)}; const digest=(v)=>/^sha256:[a-f0-9]{64}$/.test(v??'');
a(x.status==='LIVE_PREFLIGHT_PARTIAL_PASS_TRACK_B_LABEL_REVIEW_REQUIRED','STATUS');
a(x.github.conclusion==='success'&&x.github.workflow_run_id>0&&x.github.artifact_id>0,'GITHUB_IDENTITY');
a(digest(x.github.artifact_digest)&&digest(x.live_run.run_fingerprint)&&digest(x.golden_dataset_candidate.dataset_fingerprint),'DIGEST');
a(x.live_run.source_family_count===5&&x.live_run.authority_source_family_count===4&&x.live_run.transaction_source_family_count===1,'SOURCE_COUNTS');
a(x.live_run.admitted_market_events===1&&x.live_run.sold_transactions===1,'EVENT_COUNTS');
a(x.live_run.duplicate_contamination===0&&x.live_run.stale_record_admission===0&&x.live_run.rights_missing_admission===0,'CONTAMINATION');
a(x.golden_dataset_candidate.case_count===200&&Object.values(x.golden_dataset_candidate.case_mix).every(v=>v===50),'GOLDEN_CASES');
a(x.golden_dataset_candidate.approved_labels===0&&x.golden_dataset_candidate.unreviewed_labels===200&&x.golden_dataset_candidate.measured_accuracy===null,'LABEL_BOUNDARY');
a(x.stress.transaction_source_removal==='FAIL_TRANSACTION_EVIDENCE_REMOVED','SOURCE_REMOVAL_TRUTH');
a(x.disposition.candidate_r2_created===false&&x.disposition.snapshot_candidate_created===false&&x.disposition.track_b_input_eligible===false,'PREMATURE_CANDIDATE');
a(x.disposition.rankability==='BLOCKED'&&x.disposition.publication==='BLOCKED','RANK_PUBLICATION');
a(x.disposition.production==='HOLD'&&x.disposition.provider_contact==='HOLD'&&x.disposition.full_320_expansion==='HOLD','HOLDS');
if(e.length){console.error('Candidate R2 live evidence record: FAIL',e);process.exit(1)}
console.log(JSON.stringify({status:'PASS',live_sources:5,live_market_events:1,golden_cases:200,approved_labels:0,transaction_source_removal:'FAIL',rankability:'BLOCKED',production:'HOLD'},null,2));
