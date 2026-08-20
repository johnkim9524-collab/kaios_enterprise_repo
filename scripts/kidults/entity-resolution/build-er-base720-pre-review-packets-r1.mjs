import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const [datasetPath='/tmp/er-base720-real-lineage-r2.json',aPath='/tmp/er-base720-pre-review-a-r1.json',bPath='/tmp/er-base720-pre-review-b-r1.json',receiptPath='/tmp/er-base720-pre-review-r1-receipt.json']=process.argv.slice(2);
const dataset=JSON.parse(await fs.readFile(datasetPath,'utf8'));
const SHA=/^sha256:[0-9a-f]{64}$/;
const prohibited=new Set(['case_class','identity_boundary','expected','expected_label','gold_label','label','labels','model_prediction','model_predictions','model_score','model_scores','model_output','resolver_prediction','resolver_score','other_reviewer_label','adjudicated_label','final_label','benchmark_result','reviewer_prompt_context']);
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v}
const digest=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
function fail(c,d=''){throw new Error(d?`${c}:${d}`:c)}
function scan(v,p='$'){if(Array.isArray(v)){for(let i=0;i<v.length;i++){const x=scan(v[i],`${p}[${i}]`);if(x)return x}return null}if(!v||typeof v!=='object')return null;for(const [k,x] of Object.entries(v)){if(prohibited.has(k))return `${p}.${k}`;const h=scan(x,`${p}.${k}`);if(h)return h}return null}
if(dataset.case_count!==720||dataset.stratum_count!==6||dataset.graded_population_case_count!==0||dataset.production!=='HOLD'||dataset.public_release!=='HOLD'||!SHA.test(dataset.dataset_sha256)||!SHA.test(dataset.case_set_sha256))fail('BASE720_DATASET_INVALID');
if(!Array.isArray(dataset.cases)||dataset.cases.length!==720)fail('BASE720_CASES_INVALID');
const cases=dataset.cases.map(c=>({
  case_id:c.case_id,
  stratum_id:c.stratum_id,
  source_a_reference:c.source_a_reference,
  source_b_reference:c.source_b_reference,
  source_a_payload_sha256:c.source_a_payload_sha256,
  source_b_payload_sha256:c.source_b_payload_sha256,
  license_evidence_refs:c.license_evidence_refs,
  rights_state:c.rights_state,
  provenance_refs:c.provenance_refs,
  case_evidence_binding_sha256:c.case_evidence_binding_sha256
}));
for(const c of cases){if(c.rights_state!=='ALLOW'||!SHA.test(c.source_a_payload_sha256)||!SHA.test(c.source_b_payload_sha256)||!SHA.test(c.case_evidence_binding_sha256)||!Array.isArray(c.license_evidence_refs)||!c.license_evidence_refs.length||!Array.isArray(c.provenance_refs)||!c.provenance_refs.length)fail('REVIEW_CASE_EVIDENCE_INVALID',c.case_id)}
const ids=cases.map(c=>c.case_id);if(new Set(ids).size!==720)fail('REVIEW_CASE_ID_DUPLICATE');
function make(slot){
  const unsigned={id:`kidults-er-base720-pre-review-${slot==='REVIEWER_A'?'a':'b'}-r1`,version:'1.0.0',parent_issue:838,status:'READY_FOR_GENUINE_INDEPENDENT_PRE_REVIEW_UNLABELED',reviewer_slot:slot,reviewer_identity_binding:'NOT_ASSIGNED_EXACT_840_BINDING_PENDING',dataset_id:dataset.id,dataset_sha256:dataset.dataset_sha256,case_set_sha256:dataset.case_set_sha256,case_count:720,stratum_count:6,graded_population_case_count:0,cases,labels_present:false,model_predictions_present:false,other_reviewer_labels_present:false,adjudication:'NOT_STARTED',final_blind_holdout:'NOT_SEALED',empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'Reviewer-safe six-strata pre-review input only. Case class, identity boundary, expected/gold labels, model outputs, other-reviewer labels, adjudication and benchmark results are omitted. Reviewer identity is not bound here; only the A/B slot is fixed for later exact-840 reconciliation.'};
  const leak=scan(unsigned);if(leak)fail('PRE_REVIEW_PROHIBITED_FIELD_LEAKAGE',leak);return {...unsigned,packet_sha256:digest(unsigned)};
}
const a=make('REVIEWER_A'),b=make('REVIEWER_B');if(a.packet_sha256===b.packet_sha256)fail('A_B_PACKET_DIGEST_MUST_DIFFER_BY_SLOT');
await fs.writeFile(aPath,JSON.stringify(a,null,2)+'\n');await fs.writeFile(bPath,JSON.stringify(b,null,2)+'\n');
const receipt={id:'kidults-er-base720-pre-review-r1-receipt',version:'1.0.0',parent_issue:838,status:'PASS_REVIEWER_SAFE_A_B_PACKETS_READY_NO_HUMAN_REVIEW_CLAIM',dataset_id:dataset.id,dataset_sha256:dataset.dataset_sha256,case_set_sha256:dataset.case_set_sha256,reviewer_a_packet_sha256:a.packet_sha256,reviewer_b_packet_sha256:b.packet_sha256,case_count_per_packet:720,total_pre_review_records_if_both_completed:1440,graded_population_cases_remaining:120,reviewer_identity_binding:'NOT_ASSIGNED_EXACT_840_BINDING_PENDING',labels:'NOT_COLLECTED',adjudication:'NOT_STARTED',final_blind_holdout:'NOT_SEALED',empirical_pass:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD'};
await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
