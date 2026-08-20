import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { digest, materializeBase720, validateBase720, BASE720_ELIGIBLE_STRATA } from '../../../scripts/kidults/entity-resolution/er-base720-materializer-v1-lib.mjs';

const sampling=JSON.parse(fs.readFileSync('coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json','utf8'));
const byId=new Map(sampling.strata.map(x=>[x.stratum_id,x]));

function expanded(targets){return Object.entries(targets).flatMap(([k,n])=>Array.from({length:n},()=>k))}
function packetFor(stratumId){
  const target=byId.get(stratumId);const classes=expanded(target.case_class_targets);const boundaries=expanded(target.identity_boundary_targets);
  const cases=Array.from({length:120},(_,i)=>{
    const id=`${stratumId.replace('er-stratum-','')}-${String(i+1).padStart(3,'0')}`;
    return {
      case_id:id,
      stratum_id:stratumId,
      case_class:classes[i],
      identity_boundary:boundaries[i],
      source_a_reference:`https://source-a.example/${id}`,
      source_b_reference:`https://source-b.example/${id}`,
      source_a_payload_sha256:digest(`source-a:${id}`),
      source_b_payload_sha256:digest(`source-b:${id}`),
      license_evidence_refs:[`LICENSE:${stratumId}`],
      rights_state:'ALLOW',
      provenance_refs:[`PROV:A:${id}`,`PROV:B:${id}`],
      label:null,
      model_prediction:null,
      reviewer_assignment:'PENDING_REAL_REVIEWER'
    };
  });
  return {production:'HOLD',case_count:120,cases,labels_present:false,model_predictions_present:false};
}
function fixture(){
  const packets=BASE720_ELIGIBLE_STRATA.map(packetFor);
  const manifest={id:'kidults-er-base720-materialization-manifest-v1',production:'HOLD',packet_paths:packets.map((_,i)=>`/tmp/packet-${i}.json`)};
  return {manifest,packets};
}

test('materializes exact sanitized six-strata 720 and validates deterministic digests',()=>{
  const {manifest,packets}=fixture();
  const out=materializeBase720({manifest,packets,samplingPlan:sampling});
  assert.equal(out.case_count,720);assert.equal(out.stratum_count,6);assert.equal(out.graded_population_case_count,0);
  assert.equal(out.labels_state,'NOT_COLLECTED');assert.equal(out.production,'HOLD');
  assert.equal(out.cases.some(c=>'label' in c||'model_prediction' in c||'reviewer_assignment' in c),false);
  assert.deepEqual(validateBase720(out,sampling),{status:'PASS_BASE720_UNLABELED_NOT_REVIEWED',case_count:720,strata:6,graded:0,labels:'NOT_COLLECTED',production:'HOLD'});
  const again=materializeBase720({manifest,packets,samplingPlan:sampling});
  assert.equal(again.dataset_sha256,out.dataset_sha256);assert.equal(again.case_set_sha256,out.case_set_sha256);
});

test('rejects any real human/model result leakage rather than silently stripping it',()=>{
  const {manifest,packets}=fixture();packets[0].cases[0].label='MATCH';
  assert.throws(()=>materializeBase720({manifest,packets,samplingPlan:sampling}),/NON_NULL_LABEL_MODEL_OR_RESULT_LEAKAGE/);
});

test('rejects graded population contamination',()=>{
  const {manifest,packets}=fixture();packets[0].cases[0].stratum_id='er-stratum-graded-population';
  assert.throws(()=>materializeBase720({manifest,packets,samplingPlan:sampling}),/GRADED_POPULATION_PROHIBITED_FROM_BASE720/);
});

test('rejects non-ALLOW rights',()=>{
  const {manifest,packets}=fixture();packets[0].cases[0].rights_state='HOLD';
  assert.throws(()=>materializeBase720({manifest,packets,samplingPlan:sampling}),/RIGHTS_NOT_ALLOW/);
});

test('rejects duplicate case IDs and evidence-pair padding',()=>{
  const {manifest,packets}=fixture();packets[1].cases[0].case_id=packets[0].cases[0].case_id;
  assert.throws(()=>materializeBase720({manifest,packets,samplingPlan:sampling}),/DUPLICATE_CASE_ID/);
  const f=fixture();f.packets[1].cases[0].source_a_reference=f.packets[0].cases[0].source_a_reference;f.packets[1].cases[0].source_b_reference=f.packets[0].cases[0].source_b_reference;f.packets[1].cases[0].source_a_payload_sha256=f.packets[0].cases[0].source_a_payload_sha256;f.packets[1].cases[0].source_b_payload_sha256=f.packets[0].cases[0].source_b_payload_sha256;
  assert.throws(()=>materializeBase720({manifest:f.manifest,packets:f.packets,samplingPlan:sampling}),/DUPLICATE_EVIDENCE_PAIR_PADDING/);
});

test('rejects quota drift even when total remains 720',()=>{
  const {manifest,packets}=fixture();packets[0].cases[0].case_class=packets[0].cases[1].case_class;
  assert.throws(()=>materializeBase720({manifest,packets,samplingPlan:sampling}),/CASE_CLASS_QUOTA_MISMATCH/);
});
