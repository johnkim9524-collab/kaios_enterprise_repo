#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const fastLanePath=process.argv[2]||'/tmp/asi-rights-analysis-fast-lane-v1.json';
const decisionsPath=process.argv[3]||'coordination/kidults/source-intelligence/asi-rights-analysis-fast-lane-decisions-v1.json';
const snapshotsPath=process.argv[4]&&!process.argv[4].startsWith('--')?process.argv[4]:'coordination/kidults/source-intelligence/asi-rights-source-content-snapshot-manifest-v1.json';
const asOfArg=process.argv.indexOf('--as-of');
const asOf=new Date(asOfArg>=0?process.argv[asOfArg+1]:Date.now());
const f=JSON.parse(fs.readFileSync(fastLanePath,'utf8'));
const d=JSON.parse(fs.readFileSync(decisionsPath,'utf8'));
const s=JSON.parse(fs.readFileSync(snapshotsPath,'utf8'));
const assert=(value,code)=>{if(!value)throw new Error(code);};
const atoms=['collect','store','derive','commercial_use'];
const productRights=['internal_use','display','saas','api','model_and_analytics'];
const operatingScopes=['named_products_and_affiliates','environment','territory','languages','users'];
const lifecycleRights=['retention','deletion','audit','termination','derived_artifact_survival'];
const allowedDecisions=new Set(['PASS','CONDITIONAL','HOLD','NO_GO']);
const promotableDecisions=new Set(['PASS','CONDITIONAL']);
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
const clone=value=>structuredClone(value);

const evidenceDigest=(record,document)=>{
  const evidence=record.evidence_binding;
  const payload={source_id:record.source_id,decision_scope:document.decision_scope,official_evidence_urls:record.official_evidence_urls,reason_code:record.reason_code,rights:record.rights,reviewed_at:evidence.reviewed_at,recheck_due_at:evidence.recheck_due_at,review_method:evidence.review_method,snapshot_state:evidence.snapshot_state};
  if(record.pass_scope)payload.pass_scope=record.pass_scope;
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
};

function validateSnapshots(document,snapshots){
  assert(document.source_content_snapshot_manifest==='coordination/kidults/source-intelligence/asi-rights-source-content-snapshot-manifest-v1.json','DECISION_SNAPSHOT_MANIFEST_REFERENCE');
  assert(snapshots.id==='kidults-asi-rights-source-content-snapshot-manifest-v1'&&snapshots.version==='1.0.0','SNAPSHOT_MANIFEST_IDENTITY');
  assert(snapshots.status==='FAIL_CLOSED_REFERENCE_ONLY_AND_CAPTURE_PERMISSION_EVIDENCE_PENDING','SNAPSHOT_MANIFEST_STATUS');
  assert(snapshots.decision_contract==='coordination/kidults/source-intelligence/asi-rights-analysis-fast-lane-decisions-v1.json','SNAPSHOT_DECISION_CONTRACT_REFERENCE');
  assert(snapshots.snapshot_policy.repository_page_bytes_allowed===false&&snapshots.snapshot_policy.repository_rendered_content_allowed===false,'SNAPSHOT_REPOSITORY_CONTENT_BOUNDARY');
  assert(snapshots.snapshot_policy.bound_snapshot_storage==='EXTERNAL_GOVERNED_OBJECT_ONLY','SNAPSHOT_STORAGE_BOUNDARY');
  const decisionById=new Map(document.records.map(record=>[record.source_id,record]));
  assert(snapshots.records.length===document.records.length&&new Set(snapshots.records.map(record=>record.source_id)).size===snapshots.records.length,'SNAPSHOT_SET_DEDUPE');
  const counts={SOURCE_CONTENT_SNAPSHOT_BOUND:0,CAPTURE_PERMISSION_EVIDENCE_PENDING:0,REFERENCE_ONLY_NOT_CAPTURED_DUE_RESTRICTION:0};
  for(const snapshot of snapshots.records){
    const decision=decisionById.get(snapshot.source_id);assert(decision,`SNAPSHOT_SOURCE_NOT_IN_DECISIONS:${snapshot.source_id}`);
    assert(JSON.stringify(snapshot.official_evidence_urls)===JSON.stringify(decision.official_evidence_urls),`SNAPSHOT_EVIDENCE_URL_DRIFT:${snapshot.source_id}`);
    assert(Object.hasOwn(counts,snapshot.capture_state),`SNAPSHOT_CAPTURE_STATE:${snapshot.source_id}`);counts[snapshot.capture_state]++;
    assert(snapshot.raw_content_in_repository===false,`RAW_SOURCE_CONTENT_IN_REPOSITORY:${snapshot.source_id}`);
    if(snapshot.capture_state==='SOURCE_CONTENT_SNAPSHOT_BOUND'){
      assert(snapshot.capture_authorized===true,`SNAPSHOT_BOUND_WITHOUT_CAPTURE_AUTHORITY:${snapshot.source_id}`);
      assert(iso(snapshot.retrieved_at),`SNAPSHOT_RETRIEVED_AT:${snapshot.source_id}`);
      assert(typeof snapshot.final_url==='string'&&snapshot.final_url.startsWith('https://'),`SNAPSHOT_FINAL_URL:${snapshot.source_id}`);
      assert(Number.isInteger(snapshot.http_status)&&snapshot.http_status>=200&&snapshot.http_status<400,`SNAPSHOT_HTTP_STATUS:${snapshot.source_id}`);
      assert(typeof snapshot.document_version==='string'&&snapshot.document_version.length>4,`SNAPSHOT_DOCUMENT_VERSION:${snapshot.source_id}`);
      assert(typeof snapshot.precise_locator==='string'&&snapshot.precise_locator.length>4,`SNAPSHOT_PRECISE_LOCATOR:${snapshot.source_id}`);
      assert(/^sha256:[a-f0-9]{64}$/.test(snapshot.source_content_sha256||''),`SNAPSHOT_CONTENT_DIGEST:${snapshot.source_id}`);
      assert(typeof snapshot.governed_object_ref==='string'&&snapshot.governed_object_ref.startsWith('governed-object:'),`SNAPSHOT_OBJECT_REF:${snapshot.source_id}`);
      assert(typeof snapshot.retention_and_deletion_class==='string'&&!snapshot.retention_and_deletion_class.startsWith('PENDING_'),`SNAPSHOT_RETENTION_CLASS:${snapshot.source_id}`);
      assert(decision.evidence_binding.snapshot_state==='SOURCE_CONTENT_SNAPSHOT_BOUND',`DECISION_SNAPSHOT_BINDING_DRIFT:${snapshot.source_id}`);
    }else{
      assert(snapshot.capture_authorized===false&&snapshot.decision_promotion_eligible===false,`PENDING_OR_REFERENCE_PROMOTION:${snapshot.source_id}`);
      assert([snapshot.retrieved_at,snapshot.final_url,snapshot.http_status,snapshot.document_version,snapshot.precise_locator,snapshot.source_content_sha256,snapshot.governed_object_ref].every(value=>value===null),`UNBOUND_SNAPSHOT_HAS_CAPTURE_CLAIMS:${snapshot.source_id}`);
      assert(decision.evidence_binding.snapshot_state==='MANIFEST_BOUND_SOURCE_CONTENT_SNAPSHOT_PENDING',`UNBOUND_DECISION_SNAPSHOT_PROMOTION:${snapshot.source_id}`);
      if(snapshot.capture_state==='REFERENCE_ONLY_NOT_CAPTURED_DUE_RESTRICTION')assert(decision.decision==='NO_GO'&&snapshot.retention_and_deletion_class==='REFERENCE_METADATA_ONLY_NO_PAGE_BYTES',`REFERENCE_ONLY_REQUIRES_NO_GO:${snapshot.source_id}`);
      if(snapshot.capture_state==='CAPTURE_PERMISSION_EVIDENCE_PENDING')assert(decision.decision==='HOLD'&&snapshot.retention_and_deletion_class==='PENDING_RIGHTS_APPROVED_CAPTURE_CLASS',`CAPTURE_PERMISSION_EVIDENCE_PENDING_REQUIRES_HOLD:${snapshot.source_id}`);
    }
  }
  assert(snapshots.summary.sources===snapshots.records.length&&snapshots.summary.source_content_snapshot_bound===counts.SOURCE_CONTENT_SNAPSHOT_BOUND&&snapshots.summary.capture_permission_evidence_pending===counts.CAPTURE_PERMISSION_EVIDENCE_PENDING&&snapshots.summary.reference_only_not_captured_due_restriction===counts.REFERENCE_ONLY_NOT_CAPTURED_DUE_RESTRICTION,'SNAPSHOT_SUMMARY_COUNTS');
  assert(snapshots.summary.promotion_eligible===snapshots.records.filter(record=>record.decision_promotion_eligible===true).length,'SNAPSHOT_PROMOTION_COUNT');
  assert(snapshots.truth_boundary.reference_only_is_permission===false&&snapshots.truth_boundary.acquisition_authorized===false&&snapshots.truth_boundary.production==='HOLD','SNAPSHOT_TRUTH_BOUNDARY');
  return counts;
}

function validate(fastLane,document,snapshots,validationTime){
  assert(!Number.isNaN(validationTime.getTime()),'AS_OF_INVALID');
  const fastIds=fastLane.items.map(item=>item.source_id).sort();
  const decisionIds=document.records.map(item=>item.source_id).sort();
  assert(document.id==='kidults-asi-rights-analysis-fast-lane-decisions-v1'&&document.version==='1.0.0','IDENTITY');
  assert(document.status==='OFFICIAL_TERMS_TRIAGE_COMPLETE_NO_RIGHTS_PROMOTION','STATUS');
  assert(JSON.stringify(document.pass_scope_requirements?.required_rights_atoms)===JSON.stringify(atoms)&&JSON.stringify(document.pass_scope_requirements?.required_product_rights)===JSON.stringify(productRights)&&JSON.stringify(document.pass_scope_requirements?.required_operating_scope)===JSON.stringify(operatingScopes)&&JSON.stringify(document.pass_scope_requirements?.required_lifecycle_rights)===JSON.stringify(lifecycleRights)&&document.pass_scope_requirements?.pass_value==='ALLOW'&&document.pass_scope_requirements?.unknown_or_missing_is_hold===true,'PASS_SCOPE_CONTRACT');
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
    if(record.decision==='PASS'){
      assert(atoms.every(atom=>record.rights[atom]==='ALLOW'),`FALSE_PASS:${record.source_id}`);
      assert(productRights.every(key=>record.pass_scope?.product_rights?.[key]==='ALLOW')&&operatingScopes.every(key=>record.pass_scope?.operating_scope?.[key]==='ALLOW')&&lifecycleRights.every(key=>record.pass_scope?.lifecycle_rights?.[key]==='ALLOW'),`FALSE_PASS_SCOPE:${record.source_id}`);
    }
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
  return {decisionCounts:counts,snapshotCounts:validateSnapshots(document,snapshots)};
}

const validated=validate(f,d,s,asOf);const counts=validated.decisionCounts;
const dynamicCandidate=clone(d);
const dynamicSnapshots=clone(s);
const dynamicRecord=dynamicCandidate.records.find(item=>item.decision==='NO_GO');
dynamicRecord.decision='HOLD';
dynamicRecord.rights={collect:'UNKNOWN',store:'UNKNOWN',derive:'UNKNOWN',commercial_use:'UNKNOWN'};
dynamicCandidate.summary.no_go_public_web--;
dynamicCandidate.summary.hold++;
dynamicRecord.evidence_binding.binding_digest=evidenceDigest(dynamicRecord,dynamicCandidate);
const dynamicSnapshot=dynamicSnapshots.records.find(item=>item.source_id===dynamicRecord.source_id);
dynamicSnapshot.capture_state='CAPTURE_PERMISSION_EVIDENCE_PENDING';
dynamicSnapshot.retention_and_deletion_class='PENDING_RIGHTS_APPROVED_CAPTURE_CLASS';
dynamicSnapshots.summary.reference_only_not_captured_due_restriction--;
dynamicSnapshots.summary.capture_permission_evidence_pending++;
validate(f,dynamicCandidate,dynamicSnapshots,asOf);
const expectFailure=(code,mutate,time=asOf)=>{const candidate=clone(d);const snapshotCandidate=clone(s);mutate(candidate,snapshotCandidate);let error=null;try{validate(f,candidate,snapshotCandidate,time)}catch(caught){error=caught}assert(error?.message?.startsWith(code),`NEGATIVE_TEST_DID_NOT_FAIL:${code}:${error?.message||'NONE'}`);};
expectFailure('EVIDENCE_BINDING_DIGEST:',candidate=>{candidate.records[0].rights.collect='ALLOW'});
expectFailure('EVIDENCE_RECHECK_OVERDUE:',()=>{},new Date('2026-09-29T00:00:00.001Z'));
expectFailure('PROMOTION_WITHOUT_SOURCE_SNAPSHOT:',candidate=>{const record=candidate.records.find(item=>item.decision==='HOLD');record.decision='CONDITIONAL';candidate.summary.hold--;candidate.summary.conditional++;record.evidence_binding.binding_digest=evidenceDigest(record,candidate)});
expectFailure('SNAPSHOT_EVIDENCE_URL_DRIFT:',(_candidate,snapshots)=>{snapshots.records[0].official_evidence_urls[0]='https://example.invalid/forged'});
expectFailure('SNAPSHOT_RETRIEVED_AT:',(_candidate,snapshots)=>{const record=snapshots.records.find(item=>item.capture_state==='CAPTURE_PERMISSION_EVIDENCE_PENDING');record.capture_state='SOURCE_CONTENT_SNAPSHOT_BOUND';record.capture_authorized=true;record.decision_promotion_eligible=true;snapshots.summary.capture_permission_evidence_pending--;snapshots.summary.source_content_snapshot_bound++;snapshots.summary.promotion_eligible++});
expectFailure('PENDING_OR_REFERENCE_PROMOTION:',(_candidate,snapshots)=>{snapshots.records[0].decision_promotion_eligible=true;snapshots.summary.promotion_eligible++});
expectFailure('FALSE_PASS_SCOPE:',(candidate,snapshots)=>{const record=candidate.records.find(item=>item.decision==='HOLD');record.decision='PASS';record.rights={collect:'ALLOW',store:'ALLOW',derive:'ALLOW',commercial_use:'ALLOW'};record.evidence_binding.snapshot_state='SOURCE_CONTENT_SNAPSHOT_BOUND';candidate.summary.hold--;candidate.summary.pass++;candidate.summary.rights_clear_for_current_sold++;record.evidence_binding.binding_digest=evidenceDigest(record,candidate);const snapshot=snapshots.records.find(item=>item.source_id===record.source_id);snapshot.capture_state='SOURCE_CONTENT_SNAPSHOT_BOUND';snapshot.capture_authorized=true;snapshot.decision_promotion_eligible=true;snapshot.retrieved_at='2026-08-30T00:00:00Z';snapshot.final_url=snapshot.official_evidence_urls[0];snapshot.http_status=200;snapshot.document_version='test-version-v1';snapshot.precise_locator='section:test';snapshot.source_content_sha256=`sha256:${'a'.repeat(64)}`;snapshot.governed_object_ref='governed-object:test';snapshot.retention_and_deletion_class='TEST_BOUND';snapshots.summary.capture_permission_evidence_pending--;snapshots.summary.source_content_snapshot_bound++;snapshots.summary.promotion_eligible++});
console.log(JSON.stringify({suite:'KIDULTS_ASI_RIGHTS_ANALYSIS_FAST_LANE_DECISIONS_V1',result:'PASS',sources:d.records.length,decisions:counts,snapshots:validated.snapshotCounts,dynamic_decision_counts_verified:true,evidence_bindings:d.records.length,stale_evidence_fail_closed:true,digest_tamper_fail_closed:true,promotion_without_snapshot_fail_closed:true,snapshot_url_drift_fail_closed:true,false_snapshot_binding_fail_closed:true,reference_only_promotion_fail_closed:true,four_atom_only_pass_rejected:true,rights_clear_for_current_sold:d.summary.rights_clear_for_current_sold,production:d.truth_boundary.production}));
