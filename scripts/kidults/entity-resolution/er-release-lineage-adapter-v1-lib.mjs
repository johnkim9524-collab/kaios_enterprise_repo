import { createHash } from 'node:crypto';

const RELEASE_STRATA=new Set([
  'er-stratum-pressing-edition-media',
  'er-stratum-variant-release-heavy'
]);
const SHA_RE=/^sha256:[0-9a-f]{64}$/;
const LEGACY_EXPECTED_BY_CLASS={CROSS_MARKET_ALIAS:'MATCH',HARD_NEGATIVE:'NO_MATCH'};
const RESULT_FIELDS=['label','labels','model_prediction','model_predictions','model_score','model_scores','review_label','reviewer_label','adjudicated_label','final_label','benchmark_result'];

function fail(code,detail=''){throw new Error(detail?`${code}:${detail}`:code)}
function sha(value){return `sha256:${createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex')}`}
function requiredString(v,code){if(typeof v!=='string'||v.trim()==='')fail(code);return v.trim()}
function strings(v,code){if(!Array.isArray(v)||v.length===0)fail(code);const out=[...new Set(v.map(x=>requiredString(x,code)))].sort();if(out.length!==v.length)fail(`${code}_DUPLICATE`);return out}
function counts(cases,field){const out={};for(const c of cases)out[c[field]]=(out[c[field]]||0)+1;return out}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v}
function same(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b))}
function stratumKey(stratumId){return stratumId==='er-stratum-pressing-edition-media'?'pressing':'variant'}
function extractCases(fragment,stratumId){
  if(fragment&&Array.isArray(fragment.cases))return fragment.cases;
  const nested=fragment?.packets?.[stratumKey(stratumId)]?.cases;
  if(Array.isArray(nested))return nested;
  fail('LINEAGE_FRAGMENT_CASES_MISSING',stratumId);
}
function assertNoResultLeakage(raw){
  for(const key of RESULT_FIELDS){const v=raw?.[key];if(v!==undefined&&v!==null&&v!==false&&v!==''&&!(Array.isArray(v)&&v.length===0))fail('LINEAGE_RESULT_LEAKAGE',`${raw?.case_id||'UNKNOWN'}:${key}`)}
  if(raw?.expected!==undefined&&raw.expected!==null&&raw.expected!==''){
    const allowed=LEGACY_EXPECTED_BY_CLASS[raw.case_class];
    if(!allowed||raw.expected!==allowed)fail('LEGACY_EXPECTED_SEMANTICS_INVALID',`${raw?.case_id||'UNKNOWN'}:${raw.expected}`);
  }
}
function normalizeCase(raw,stratumId){
  assertNoResultLeakage(raw);
  const caseId=requiredString(raw.case_id,'CASE_ID_REQUIRED');
  if(raw.stratum_id!==stratumId)fail('CASE_STRATUM_MISMATCH',caseId);
  const caseClass=requiredString(raw.case_class,'CASE_CLASS_REQUIRED');
  const identityBoundary=requiredString(raw.identity_boundary,'IDENTITY_BOUNDARY_REQUIRED');
  const sourceA=raw.source_a_reference??raw.source_reference;
  const sourceB=raw.source_b_reference??raw.source_reference;
  const shaA=raw.source_a_payload_sha256??raw.source_payload_sha256;
  const shaB=raw.source_b_payload_sha256??raw.source_payload_sha256;
  const a=requiredString(sourceA,'SOURCE_A_REFERENCE_REQUIRED'),b=requiredString(sourceB,'SOURCE_B_REFERENCE_REQUIRED');
  const da=requiredString(shaA,'SOURCE_A_SHA_REQUIRED'),db=requiredString(shaB,'SOURCE_B_SHA_REQUIRED');
  if(!SHA_RE.test(da)||!SHA_RE.test(db))fail('SOURCE_PAYLOAD_SHA256_INVALID',caseId);
  if(raw.rights_state!=='ALLOW')fail('RIGHTS_NOT_ALLOW',caseId);
  if(a===b&&da===db&&!['SAME_OBJECT_NORMALIZATION','CROSS_MARKET_ALIAS'].includes(caseClass))fail('UNSAFE_SINGLE_RECORD_EVIDENCE',caseId);
  return {
    case_id:caseId,
    stratum_id:stratumId,
    case_class:caseClass,
    identity_boundary:identityBoundary,
    source_a_reference:a,
    source_b_reference:b,
    source_a_payload_sha256:da,
    source_b_payload_sha256:db,
    license_evidence_refs:strings(raw.license_evidence_refs,'LICENSE_EVIDENCE_REFS_REQUIRED'),
    rights_state:'ALLOW',
    provenance_refs:strings(raw.provenance_refs,'PROVENANCE_REFS_REQUIRED')
  };
}

export function adaptReleaseLineageForBase720({stratumId,fragments,samplingPlan}){
  if(!RELEASE_STRATA.has(stratumId))fail('RELEASE_LINEAGE_STRATUM_UNSUPPORTED',stratumId);
  if(!Array.isArray(fragments)||fragments.length===0)fail('LINEAGE_FRAGMENTS_REQUIRED');
  const target=(samplingPlan?.strata||[]).find(x=>x.stratum_id===stratumId);
  if(!target||target.cases!==120||target.blind!==60)fail('SAMPLING_TARGET_INVALID',stratumId);
  if(samplingPlan.production!=='HOLD')fail('SAMPLING_PRODUCTION_BOUNDARY_WEAKENED');

  const rawCases=fragments.flatMap(x=>extractCases(x,stratumId));
  if(rawCases.length!==120)fail('EXACT_120_ACCEPTED_LINEAGE_CASES_REQUIRED',String(rawCases.length));
  const cases=rawCases.map(x=>normalizeCase(x,stratumId));
  const ids=new Set();for(const c of cases){if(ids.has(c.case_id))fail('DUPLICATE_CASE_ID',c.case_id);ids.add(c.case_id)}
  if(!same(counts(cases,'case_class'),target.case_class_targets))fail('CASE_CLASS_QUOTA_MISMATCH',JSON.stringify(counts(cases,'case_class')));

  const before=counts(cases,'identity_boundary');
  const wanted=target.identity_boundary_targets;
  let repaired=[];
  if(!same(before,wanted)){
    const legacyReleaseShape=before.SOURCE_RECORD===80&&before.PHYSICAL_OBJECT===40&&Object.keys(before).length===2&&wanted.SOURCE_RECORD===60&&wanted.PHYSICAL_OBJECT===60&&Object.keys(wanted).length===2;
    if(!legacyReleaseShape)fail('IDENTITY_BOUNDARY_MISMATCH_NOT_REPAIRABLE',`${JSON.stringify(before)}!=${JSON.stringify(wanted)}`);
    const normalization=cases.filter(c=>c.case_class==='SAME_OBJECT_NORMALIZATION'&&c.identity_boundary==='SOURCE_RECORD').sort((a,b)=>a.case_id.localeCompare(b.case_id));
    if(normalization.length!==40)fail('NORMALIZATION_REPAIR_POOL_NOT_EXACT_40',String(normalization.length));
    repaired=normalization.slice(0,20).map(c=>c.case_id);
    const repairSet=new Set(repaired);
    for(const c of cases)if(repairSet.has(c.case_id))c.identity_boundary='PHYSICAL_OBJECT';
  }
  const after=counts(cases,'identity_boundary');
  if(!same(after,wanted))fail('IDENTITY_BOUNDARY_QUOTA_MISMATCH_AFTER_REPAIR',`${JSON.stringify(after)}!=${JSON.stringify(wanted)}`);

  cases.sort((a,b)=>a.case_id.localeCompare(b.case_id));
  const caseProjection=cases.map(c=>({case_id:c.case_id,case_class:c.case_class,identity_boundary:c.identity_boundary,source_a_reference:c.source_a_reference,source_b_reference:c.source_b_reference,source_a_payload_sha256:c.source_a_payload_sha256,source_b_payload_sha256:c.source_b_payload_sha256}));
  return {
    id:`kidults-er-${stratumKey(stratumId)}-accepted-lineage-adapter-v1`,
    version:'1.0.0',
    parent_issue:838,
    status:'EXACT_120_ACCEPTED_LINEAGE_NORMALIZED_UNLABELED_NOT_REVIEWED',
    stratum_id:stratumId,
    case_count:120,
    fragment_count:fragments.length,
    case_class_counts:counts(cases,'case_class'),
    identity_boundary_counts:after,
    boundary_repair:{
      applied:repaired.length>0,
      from_counts:before,
      to_counts:after,
      rule:repaired.length?'LEXICOGRAPHIC_FIRST_20_SAME_OBJECT_NORMALIZATION_SOURCE_RECORD_TO_PHYSICAL_OBJECT':'NONE',
      repaired_case_count:repaired.length,
      repaired_case_ids:repaired,
      semantic_ceiling:'Release/edition manifestation identity only; reclassification changes the frozen identity-boundary view of already source-bound normalization cases and creates no new evidence, label, match result, market claim, or individual-copy provenance claim.'
    },
    legacy_expected_fields_removed_only_after_class_consistency_check:true,
    lineage_case_projection_sha256:sha(caseProjection),
    labels_present:false,
    model_predictions_present:false,
    reviewer_a:'NOT_ASSIGNED',
    reviewer_b:'NOT_ASSIGNED',
    adjudication:'NOT_STARTED',
    blind_partition:'CANDIDATE_NOT_SEALED',
    empirical_pass:false,
    track_b:'NOT_STARTED',
    public_release:'HOLD',
    production:'HOLD',
    cases
  };
}
