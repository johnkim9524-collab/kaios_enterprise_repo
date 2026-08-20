import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, makeReviewRecord, reconcilePreReviewRecords } from '../../../scripts/kidults/entity-resolution/six-strata-pre-review-reconciliation-r1-lib.mjs';

const eligible='er-stratum-designer-maker-edition';
const graded='er-stratum-graded-population';
const sha=n=>`sha256:${n.repeat(64).slice(0,64)}`;
function finalDataset(){
  const cases=[];
  for(let i=0;i<720;i++)cases.push({case_id:`eligible-${String(i).padStart(3,'0')}`,stratum_id:eligible,case_evidence_binding_sha256:sha((i%10).toString())});
  for(let i=0;i<120;i++)cases.push({case_id:`graded-${String(i).padStart(3,'0')}`,stratum_id:graded,case_evidence_binding_sha256:sha(((i+1)%10).toString())});
  return {cases};
}
function pair(caseId,binding){
  const base={case_id:caseId,packet_sha256:sha('a'),case_evidence_binding_sha256:binding,label:'MATCH',label_reason_code:'EVIDENCE_CONSISTENT',evidence_refs_reviewed:['EV-1'],reviewed_at:'2026-08-20T12:00:00Z'};
  return [makeReviewRecord({...base,reviewer_id:'REVIEWER_A'}),makeReviewRecord({...base,reviewer_id:'REVIEWER_B'})];
}

test('accepts a digest-bound two-reviewer subset without claiming final empirical pass',()=>{
  const d=finalDataset();
  const records=pair('eligible-000',d.cases[0].case_evidence_binding_sha256);
  const out=reconcilePreReviewRecords({finalDataset:d,preReviewRecords:records,modelFreezeAt:'2026-08-21T00:00:00Z'});
  assert.equal(out.status,'PASS_SUBSET_RECONCILIATION_ONLY_NOT_EMPIRICAL_PASS');
  assert.equal(out.accepted_records,2);
  assert.equal(out.accepted_cases,1);
  assert.equal(out.remaining_review_records,1678);
  assert.equal(out.final_empirical_pass,false);
  assert.equal(out.final_holdout_sealed,false);
  assert.equal(out.track_b_started,false);
  assert.equal(out.production,'HOLD');
});

test('invalidates a pre-review when final case evidence binding changes',()=>{
  const d=finalDataset();
  const records=pair('eligible-000',sha('f'));
  assert.throws(()=>reconcilePreReviewRecords({finalDataset:d,preReviewRecords:records}),/PRE_REVIEW_CASE_BINDING_CHANGED_REREVIEW_REQUIRED/);
});

test('rejects GRADED_POPULATION from the six-strata lane',()=>{
  const d=finalDataset();
  const g=d.cases[720];
  const records=pair(g.case_id,g.case_evidence_binding_sha256);
  assert.throws(()=>reconcilePreReviewRecords({finalDataset:d,preReviewRecords:records}),/PRE_REVIEW_GRADED_OR_UNKNOWN_STRATUM_PROHIBITED/);
});

test('requires a complete A+B review pair per carried case',()=>{
  const d=finalDataset();
  const one=pair('eligible-000',d.cases[0].case_evidence_binding_sha256)[0];
  assert.throws(()=>reconcilePreReviewRecords({finalDataset:d,preReviewRecords:[one]}),/PRE_REVIEW_REVIEW_PAIR_INCOMPLETE/);
});

test('rejects review chronology at or after model freeze',()=>{
  const d=finalDataset();
  const records=pair('eligible-000',d.cases[0].case_evidence_binding_sha256);
  assert.throws(()=>reconcilePreReviewRecords({finalDataset:d,preReviewRecords:records,modelFreezeAt:'2026-08-20T11:59:59Z'}),/PRE_REVIEW_AFTER_MODEL_FREEZE/);
});

test('enforces the 1,440-record carry-forward ceiling before reconciliation',()=>{
  const d=finalDataset();
  const template=pair('eligible-000',d.cases[0].case_evidence_binding_sha256)[0];
  const records=Array.from({length:1441},(_,i)=>({...template,case_id:`x-${i}`,review_record_sha256:digest({...template,case_id:`x-${i}`,review_record_sha256:undefined})}));
  assert.throws(()=>reconcilePreReviewRecords({finalDataset:d,preReviewRecords:records}),/PRE_REVIEW_RECORD_CEILING_EXCEEDED/);
});
