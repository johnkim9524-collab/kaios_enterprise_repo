#!/usr/bin/env node
import fs from 'node:fs';

const fastLanePath=process.argv[2]||'/tmp/asi-rights-analysis-fast-lane-v1.json';
const decisionsPath=process.argv[3]||'coordination/kidults/source-intelligence/asi-rights-analysis-fast-lane-decisions-v1.json';
const f=JSON.parse(fs.readFileSync(fastLanePath,'utf8'));
const d=JSON.parse(fs.readFileSync(decisionsPath,'utf8'));
const assert=(value,code)=>{if(!value)throw new Error(code);};
const atoms=['collect','store','derive','commercial_use'];
const allowedDecisions=new Set(['PASS','CONDITIONAL','HOLD','NO_GO']);
const fastIds=f.items.map(x=>x.source_id).sort();
const decisionIds=d.records.map(x=>x.source_id).sort();

assert(d.id==='kidults-asi-rights-analysis-fast-lane-decisions-v1'&&d.version==='1.0.0','IDENTITY');
assert(d.status==='OFFICIAL_TERMS_TRIAGE_COMPLETE_NO_RIGHTS_PROMOTION','STATUS');
assert(d.records.length===12&&new Set(decisionIds).size===12,'DECISION_12_DEDUPE');
assert(JSON.stringify(fastIds)===JSON.stringify(decisionIds),'FAST_LANE_DECISION_SET_DRIFT');
for(const r of d.records){
  assert(allowedDecisions.has(r.decision),`DECISION:${r.source_id}`);
  assert(['TRACK_Z_COMMERCIAL','COUNSEL_EXCEPTION','AUTOMATED_OFFICIAL_EVIDENCE'].includes(r.route),`ROUTE:${r.source_id}`);
  assert(['ACTIVE','QUEUED'].includes(r.work_state),`WORK_STATE:${r.source_id}`);
  assert(typeof r.reason_code==='string'&&r.reason_code.length>8,`REASON:${r.source_id}`);
  assert(Array.isArray(r.official_evidence_urls)&&r.official_evidence_urls.length>=2&&r.official_evidence_urls.every(u=>u.startsWith('https://')),`EVIDENCE_URLS:${r.source_id}`);
  assert(atoms.every(a=>typeof r.rights?.[a]==='string'),`RIGHTS_ATOMS:${r.source_id}`);
  assert(typeof r.next_action==='string'&&r.next_action.length>8,`NEXT_ACTION:${r.source_id}`);
  if(r.decision==='PASS')assert(atoms.every(a=>r.rights[a]==='ALLOW'),`FALSE_PASS:${r.source_id}`);
  if(r.decision==='NO_GO')assert(atoms.some(a=>String(r.rights[a]).startsWith('DENY')),`FALSE_NO_GO:${r.source_id}`);
}
const counts={PASS:0,CONDITIONAL:0,HOLD:0,NO_GO:0};for(const r of d.records)counts[r.decision]++;
assert(d.summary.sources_reviewed===12&&d.summary.pass===counts.PASS&&d.summary.conditional===counts.CONDITIONAL&&d.summary.hold===counts.HOLD&&d.summary.no_go_public_web===counts.NO_GO,'SUMMARY_COUNTS');
assert(counts.PASS===0&&counts.CONDITIONAL===0&&counts.HOLD===3&&counts.NO_GO===9,'UNSUPPORTED_DECISION_PROMOTION');
assert(d.summary.track_z_commercial===d.records.filter(r=>r.route==='TRACK_Z_COMMERCIAL').length,'TRACK_Z_COUNT');
assert(d.summary.track_z_active===d.records.filter(r=>r.route==='TRACK_Z_COMMERCIAL'&&r.work_state==='ACTIVE').length&&d.summary.track_z_active===6,'TRACK_Z_WIP_LIMIT');
assert(d.summary.track_z_queued===d.records.filter(r=>r.route==='TRACK_Z_COMMERCIAL'&&r.work_state==='QUEUED').length&&d.summary.track_z_queued===6,'TRACK_Z_BACKPRESSURE');
assert(d.summary.rights_clear_for_current_sold===0&&d.summary.active_adapters===0,'FALSE_ACTIVATION');
assert(d.truth_boundary.official_page_visibility_is_permission===false&&d.truth_boundary.acquisition_authorized===false&&d.truth_boundary.production_authorized===false,'TRUTH_BOUNDARY');
console.log(JSON.stringify({suite:'KIDULTS_ASI_RIGHTS_ANALYSIS_FAST_LANE_DECISIONS_V1',result:'PASS',sources:12,pass:counts.PASS,hold:counts.HOLD,no_go:counts.NO_GO,production:d.truth_boundary.production}));
