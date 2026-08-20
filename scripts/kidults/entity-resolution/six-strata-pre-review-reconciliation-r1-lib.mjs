import { createHash } from 'node:crypto';

const ALLOWED_LABELS=new Set(['MATCH','NO_MATCH','REVIEW_REQUIRED']);
const ELIGIBLE_STRATA=new Set([
  'er-stratum-designer-maker-edition',
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset'
]);
const PROHIBITED_KEYS=new Set(['model_prediction','model_score','model_output','resolver_prediction','resolver_score','resolver_output','other_reviewer_label','adjudicated_label','benchmark_result','gold_label','expected_label']);
const REQUIRED_RECORD_FIELDS=[
  'case_id','reviewer_id','packet_sha256','case_evidence_binding_sha256','reviewer_independence_attestation','label','label_reason_code','evidence_refs_reviewed','reviewed_at','review_record_sha256'
];
const SHA_RE=/^sha256:[0-9a-f]{64}$/;

function fail(code,detail=''){throw new Error(detail?`${code}:${detail}`:code)}
function canonicalize(v){
  if(Array.isArray(v)) return v.map(canonicalize);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])]));
  return v;
}
export function canonicalJson(v){return JSON.stringify(canonicalize(v))}
export function digest(v){return `sha256:${createHash('sha256').update(canonicalJson(v)).digest('hex')}`}
function findProhibited(v,path='$'){
  if(Array.isArray(v)){for(let i=0;i<v.length;i++){const hit=findProhibited(v[i],`${path}[${i}]`);if(hit)return hit}return null}
  if(!v||typeof v!=='object')return null;
  for(const [k,x] of Object.entries(v)){const p=`${path}.${k}`;if(PROHIBITED_KEYS.has(k))return p;const hit=findProhibited(x,p);if(hit)return hit}
  return null;
}
function exactKeys(obj,keys,code){
  if(!obj||typeof obj!=='object'||Array.isArray(obj))fail(code);
  const a=Object.keys(obj).sort(),b=[...keys].sort();
  if(canonicalJson(a)!==canonicalJson(b))fail(code);
}
function validateRecordDigest(record){
  const unsigned={...record};delete unsigned.review_record_sha256;
  if(!SHA_RE.test(record.review_record_sha256)||digest(unsigned)!==record.review_record_sha256)fail('PRE_REVIEW_RECORD_DIGEST_INVALID',record.case_id);
}

export function reconcilePreReviewRecords({finalDataset,preReviewRecords,reviewerSlots={REVIEWER_A:'A',REVIEWER_B:'B'},modelFreezeAt=null}){
  if(!finalDataset||!Array.isArray(finalDataset.cases)||finalDataset.cases.length!==840)fail('FINAL_EXACT_840_DATASET_REQUIRED');
  const byCase=new Map();
  for(const c of finalDataset.cases){
    if(typeof c.case_id!=='string'||!SHA_RE.test(c.case_evidence_binding_sha256))fail('FINAL_CASE_BINDING_INVALID');
    if(byCase.has(c.case_id))fail('FINAL_DUPLICATE_CASE_ID',c.case_id);
    byCase.set(c.case_id,c);
  }
  if(!Array.isArray(preReviewRecords)||preReviewRecords.length>1440)fail('PRE_REVIEW_RECORD_CEILING_EXCEEDED');
  const seen=new Set();
  const counts=new Map();
  const accepted=[];
  for(const r of preReviewRecords){
    exactKeys(r,REQUIRED_RECORD_FIELDS,'PRE_REVIEW_RECORD_FIELD_INVALID');
    const leak=findProhibited(r);if(leak)fail('PRE_REVIEW_PROHIBITED_FIELD_LEAKAGE',leak);
    if(!['REVIEWER_A','REVIEWER_B'].includes(r.reviewer_id)||!reviewerSlots[r.reviewer_id])fail('PRE_REVIEW_REVIEWER_SLOT_INVALID',r.reviewer_id);
    if(!ALLOWED_LABELS.has(r.label))fail('PRE_REVIEW_LABEL_INVALID',r.case_id);
    if(!SHA_RE.test(r.packet_sha256)||!SHA_RE.test(r.case_evidence_binding_sha256))fail('PRE_REVIEW_SHA_INVALID',r.case_id);
    if(r.reviewer_independence_attestation!==true)fail('PRE_REVIEW_INDEPENDENCE_ATTESTATION_REQUIRED',r.case_id);
    if(!Array.isArray(r.evidence_refs_reviewed)||r.evidence_refs_reviewed.length===0)fail('PRE_REVIEW_EVIDENCE_REFS_REQUIRED',r.case_id);
    if(Number.isNaN(Date.parse(r.reviewed_at)))fail('PRE_REVIEW_TIMESTAMP_INVALID',r.case_id);
    if(modelFreezeAt&&Date.parse(r.reviewed_at)>=Date.parse(modelFreezeAt))fail('PRE_REVIEW_AFTER_MODEL_FREEZE',r.case_id);
    validateRecordDigest(r);
    const finalCase=byCase.get(r.case_id);if(!finalCase)fail('PRE_REVIEW_CASE_NOT_IN_FINAL_840',r.case_id);
    if(!ELIGIBLE_STRATA.has(finalCase.stratum_id))fail('PRE_REVIEW_GRADED_OR_UNKNOWN_STRATUM_PROHIBITED',r.case_id);
    if(finalCase.case_evidence_binding_sha256!==r.case_evidence_binding_sha256)fail('PRE_REVIEW_CASE_BINDING_CHANGED_REREVIEW_REQUIRED',r.case_id);
    const key=`${r.case_id}:${r.reviewer_id}`;if(seen.has(key))fail('PRE_REVIEW_DUPLICATE_CASE_REVIEWER',key);seen.add(key);
    counts.set(r.case_id,(counts.get(r.case_id)||0)+1);
    accepted.push(r);
  }
  for(const [caseId,n] of counts)if(n!==2)fail('PRE_REVIEW_REVIEW_PAIR_INCOMPLETE',`${caseId}:${n}`);
  if(accepted.length%2!==0)fail('PRE_REVIEW_RECORD_COUNT_MUST_BE_EVEN');
  return {
    status:'PASS_SUBSET_RECONCILIATION_ONLY_NOT_EMPIRICAL_PASS',
    accepted_records:accepted.length,
    accepted_cases:accepted.length/2,
    maximum_carried_records:1440,
    final_required_records:1680,
    remaining_review_records:1680-accepted.length,
    final_empirical_pass:false,
    final_holdout_sealed:false,
    track_b_started:false,
    production:'HOLD'
  };
}

export function makeReviewRecord(fields){
  const record={
    case_id:fields.case_id,
    reviewer_id:fields.reviewer_id,
    packet_sha256:fields.packet_sha256,
    case_evidence_binding_sha256:fields.case_evidence_binding_sha256,
    reviewer_independence_attestation:true,
    label:fields.label,
    label_reason_code:fields.label_reason_code,
    evidence_refs_reviewed:[...fields.evidence_refs_reviewed].sort(),
    reviewed_at:fields.reviewed_at
  };
  return {...record,review_record_sha256:digest(record)};
}
