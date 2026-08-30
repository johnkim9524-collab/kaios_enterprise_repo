#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const fastLanePath=process.argv[2]||'/tmp/asi-rights-analysis-fast-lane-v1.json';
const decisionsPath=process.argv[3]||'coordination/kidults/source-intelligence/asi-rights-analysis-fast-lane-decisions-v1.json';
const asOfArg=process.argv.indexOf('--as-of');
const asOf=new Date(asOfArg>=0?process.argv[asOfArg+1]:Date.now());
const f=JSON.parse(fs.readFileSync(fastLanePath,'utf8'));
const d=JSON.parse(fs.readFileSync(decisionsPath,'utf8'));
const assert=(value,code)=>{if(!value)throw new Error(code);};
const atoms=['collect','store','derive','commercial_use'];
const allowedDecisions=new Set(['PASS','CONDITIONAL','HOLD','NO_GO']);
const promotableDecisions=new Set(['PASS','CONDITIONAL']);
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
const clone=value=>structuredClone(value);

const evidenceDigest=(record,document)=>{
  const evidence=record.evidence_binding;
  const payload={source_id:record.source_id,decision_scope:document.decision_scope,official_evidence_urls:record.official_evidence_urls,reason_code:record.reason_code,rights:record.rights,reviewed_at:evidence.reviewed_at,recheck_due_at:evidence.recheck_due_at,review_method:evidence.review_method,snapshot_state:evidence.snapshot_state};
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
};

function validate(fastLane,document,validationTime){
  assert(!Number.isNaN(validationTime.getTime()),'AS_OF_INVALID');
  const fastIds=fastLane.items.map(item=>item.source_id).sort();
  const decisionIds=document.records.map(item=>item.source_id).sort();
  assert(document.id==='kidults-asi-rights-analysis-fast-lane-decisions-v1'&&document.version==='1.0.0','IDENTITY');
  assert(document.status==='OFFICIAL_TERMS_TRIAGE_COMPLETE_NO_RIGHTS_PROMOTION','STATUS');
  assert(document.records.length===fastLane.items.length&&document.records.length>0&&new Set(decisionIds).size===document.records.length,'DECISION_SET_DEDUPE');
  assert(JSON.stringify(fastIds)===JSON.stringify(decisionIds),'FAST_LANE_DECISION_SET_DRIFT');
  for(const record of document.records){
    assert(allowedDecisions.has(record.decision),`DECISION:${record.source_id}`);
    assert(['TRACK_Z_COMMERCIAL','COUNSEL_EXCEPTION','AUTOMATED_OFFICIAL_EVIDENCE'].includes(record.route),`ROUTE:${record.source_id}`);
    assert(['ACTIVE','QUEUED'].includes(record.work_state),`WORK_STATE:${record.source_id}`);
    assert(typeof record.reason_code==='string'&&record.reason_code.length>8,`REASON:${record.source_id}`);
    assert(Array.isArray(record.official_evidence_urls)&&record.official_evidence_urls.length>=2&&record.official_evidence_urls.every(url=>url.startsWith('https://')),`EVIDENCE_URLS:${record.source_id}`);
    assert(atoms.every(atom=>typeof record.rights?.[atom]==='string'),`RIGHTS_ATOMS:${record.source_id}`);
    assert(typeof record.next_action==='string'&&record.next_action.length>8,`NEXT_ACTION:${record.source_id}`);
    const evidence=record.evidence_binding;
    assert(evidence&&iso(evidence.reviewed_at)&&iso(evidence.recheck_due_at),`EVIDENCE_TIME_BINDING:${record.source_id}`);
    const reviewedAt=Date.parse(evidence.reviewed_at);const recheckDueAt=Date.parse(evidence.recheck_due_at);
    assert(validationTime.getTime()>=reviewedAt,`EVIDENCE_REVIEWED_IN_FUTURE:${record.source_id}`);
    assert(recheckDueAt>reviewedAt&&recheckDueAt-reviewedAt<=31*24*60*60*1000,`EVIDENCE_RECHECK_WINDOW:${record.source_id}`);
    assert(validationTime.getTime()<=recheckDueAt,`EVIDENCE_RECHECK_OVERDUE:${record.source_id}`);
    assert(evidence.review_method==='OFFICIAL_PAGE_TERMS_TRIAGE',`EVIDENCE_REVIEW_METHOD:${record.source_id}`);
    assert(['MANIFEST_BOUND_SOURCE_CONTENT_SNAPSHOT_PENDING','SOURCE_CONTENT_SNAPSHOT_BOUND'].includes(evidence.snapshot_state),`EVIDENCE_SNAPSHOT_STATE:${record.source_id}`);
    assert(evidence.binding_digest===evidenceDigest(record,document),`EVIDENCE_BINDING_DIGEST:${record.source_id}`);
    if(promotableDecisions.has(record.decision))assert(evidence.snapshot_state==='SOURCE_CONTENT_SNAPSHOT_BOUND',`PROMOTION_WITHOUT_SOURCE_SNAPSHOT:${record.source_id}`);
    if(record.decision==='PASS')assert(atoms.every(atom=>record.rights[atom]==='ALLOW'),`FALSE_PASS:${record.source_id}`);
    if(record.decision==='NO_GO')assert(atoms.some(atom=>String(record.rights[atom]).startsWith('DENY')),`FALSE_NO_GO:${record.source_id}`);
  }
  const counts={PASS:0,CONDITIONAL:0,HOLD:0,NO_GO:0};for(const record of document.records)counts[record.decision]++;
  assert(document.summary.sources_reviewed===document.records.length&&document.summary.pass===counts.PASS&&document.summary.conditional===counts.CONDITIONAL&&document.summary.hold===counts.HOLD&&document.summary.no_go_public_web===counts.NO_GO,'SUMMARY_COUNTS');
  const trackZ=document.records.filter(record=>record.route==='TRACK_Z_COMMERCIAL');
  const trackZActive=trackZ.filter(record=>record.work_state==='ACTIVE').length;
  const trackZQueued=trackZ.filter(record=>record.work_state==='QUEUED').length;
  assert(document.summary.track_z_commercial===trackZ.length&&document.summary.track_z_active===trackZActive&&document.summary.track_z_queued===trackZQueued,'TRACK_Z_DYNAMIC_COUNTS');
  assert(trackZActive<=fastLane.capacity.track_z_commercial_wip_limit,'TRACK_Z_WIP_LIMIT');
  assert(document.summary.rights_clear_for_current_sold===counts.PASS,'RIGHTS_CLEAR_PASS_COUNT_DRIFT');
  assert(document.summary.active_adapters<=document.summary.rights_clear_for_current_sold,'ADAPTER_WITHOUT_RIGHTS_CLEAR_SOURCE');
  assert(document.truth_boundary.official_page_visibility_is_permission===false&&document.truth_boundary.acquisition_authorized===false&&document.truth_boundary.production_authorized===false,'TRUTH_BOUNDARY');
  return counts;
}

const counts=validate(f,d,asOf);
const dynamicCandidate=clone(d);
const dynamicRecord=dynamicCandidate.records.find(item=>item.decision==='NO_GO');
dynamicRecord.decision='HOLD';
dynamicRecord.rights={collect:'UNKNOWN',store:'UNKNOWN',derive:'UNKNOWN',commercial_use:'UNKNOWN'};
dynamicCandidate.summary.no_go_public_web--;
dynamicCandidate.summary.hold++;
dynamicRecord.evidence_binding.binding_digest=evidenceDigest(dynamicRecord,dynamicCandidate);
validate(f,dynamicCandidate,asOf);
const expectFailure=(code,mutate,time=asOf)=>{const candidate=clone(d);mutate(candidate);let error=null;try{validate(f,candidate,time)}catch(caught){error=caught}assert(error?.message?.startsWith(code),`NEGATIVE_TEST_DID_NOT_FAIL:${code}:${error?.message||'NONE'}`);};
expectFailure('EVIDENCE_BINDING_DIGEST:',candidate=>{candidate.records[0].rights.collect='ALLOW'});
expectFailure('EVIDENCE_RECHECK_OVERDUE:',()=>{},new Date('2026-09-29T00:00:00.001Z'));
expectFailure('PROMOTION_WITHOUT_SOURCE_SNAPSHOT:',candidate=>{const record=candidate.records.find(item=>item.decision==='HOLD');record.decision='CONDITIONAL';candidate.summary.hold--;candidate.summary.conditional++;record.evidence_binding.binding_digest=evidenceDigest(record,candidate)});
console.log(JSON.stringify({suite:'KIDULTS_ASI_RIGHTS_ANALYSIS_FAST_LANE_DECISIONS_V1',result:'PASS',sources:d.records.length,decisions:counts,dynamic_decision_counts_verified:true,evidence_bindings:d.records.length,stale_evidence_fail_closed:true,digest_tamper_fail_closed:true,promotion_without_snapshot_fail_closed:true,rights_clear_for_current_sold:d.summary.rights_clear_for_current_sold,production:d.truth_boundary.production}));
