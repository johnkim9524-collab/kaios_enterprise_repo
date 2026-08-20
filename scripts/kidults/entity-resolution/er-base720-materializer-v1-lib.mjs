import { createHash } from 'node:crypto';

export const BASE720_ELIGIBLE_STRATA = Object.freeze([
  'er-stratum-designer-maker-edition',
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset'
]);

export const BASE720_CASE_FIELDS = Object.freeze([
  'case_id','stratum_id','case_class','identity_boundary',
  'source_a_reference','source_b_reference','source_a_payload_sha256','source_b_payload_sha256',
  'license_evidence_refs','rights_state','provenance_refs','case_evidence_binding_sha256'
]);

const SHA_RE=/^sha256:[0-9a-f]{64}$/;
const RESULT_KEYS=new Set([
  'label','labels','expected','expected_label','gold_label','review_label','reviewer_label',
  'model_prediction','model_predictions','model_score','model_scores','model_output','model_outputs',
  'resolver_prediction','resolver_score','resolver_output','other_reviewer_label','adjudicated_label','final_label','benchmark_result'
]);

function fail(code,detail=''){throw new Error(detail?`${code}:${detail}`:code)}
function canonicalize(v){
  if(Array.isArray(v))return v.map(canonicalize);
  if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])]));
  return v;
}
export function canonicalJson(v){return JSON.stringify(canonicalize(v))}
export function digest(v){return `sha256:${createHash('sha256').update(canonicalJson(v)).digest('hex')}`}
function string(v,code){if(typeof v!=='string'||v.trim()==='')fail(code);return v.trim()}
function uniqueStrings(v,code){
  if(!Array.isArray(v)||v.length===0)fail(code);
  const out=v.map(x=>string(x,code)).sort();
  if(new Set(out).size!==out.length)fail(`${code}_DUPLICATE`);
  return out;
}
function scanResultLeakage(v,path='$'){
  if(Array.isArray(v)){for(let i=0;i<v.length;i++){const h=scanResultLeakage(v[i],`${path}[${i}]`);if(h)return h}return null}
  if(!v||typeof v!=='object')return null;
  for(const [k,x] of Object.entries(v)){
    const p=`${path}.${k}`;
    if(RESULT_KEYS.has(k)&&x!==null&&x!==undefined&&x!==false&&x!==''&&!(Array.isArray(x)&&x.length===0))return p;
    const h=scanResultLeakage(x,p);if(h)return h;
  }
  return null;
}
function counts(items,field){const o={};for(const x of items)o[x[field]]=(o[x[field]]||0)+1;return o}
function assertCounts(actual,expected,code){if(canonicalJson(actual)!==canonicalJson(expected))fail(code,`${canonicalJson(actual)}!=${canonicalJson(expected)}`)}
function evidencePairKey(c){
  const sides=[
    {ref:c.source_a_reference,sha:c.source_a_payload_sha256},
    {ref:c.source_b_reference,sha:c.source_b_payload_sha256}
  ].sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)));
  if(canonicalJson(sides[0])===canonicalJson(sides[1]))fail('SELF_EVIDENCE_PAIR_PROHIBITED',c.case_id);
  return digest(sides);
}

export function materializeBase720({manifest,packets,samplingPlan}){
  if(!manifest||manifest.id!=='kidults-er-base720-materialization-manifest-v1'||manifest.production!=='HOLD')fail('BASE720_MANIFEST_INVALID');
  if(!Array.isArray(manifest.packet_paths)||manifest.packet_paths.length===0)fail('BASE720_PACKET_PATHS_REQUIRED');
  if(!Array.isArray(packets)||packets.length!==manifest.packet_paths.length)fail('BASE720_PACKET_INPUT_COUNT_MISMATCH');
  if(samplingPlan?.dataset_target?.total_cases!==840||samplingPlan?.dataset_target?.blind_holdout_cases!==420||!Array.isArray(samplingPlan.strata)||samplingPlan.strata.length!==7)fail('SAMPLING_PLAN_FINAL_GATE_INVALID');

  const plan=new Map(samplingPlan.strata.map(x=>[x.stratum_id,x]));
  const eligible=new Set(BASE720_ELIGIBLE_STRATA);
  const gathered=[];
  for(let i=0;i<packets.length;i++){
    const packet=packets[i];
    if(!packet||typeof packet!=='object'||!Array.isArray(packet.cases))fail('PACKET_CASES_REQUIRED',manifest.packet_paths[i]);
    if(packet.production!==undefined&&packet.production!=='HOLD')fail('PACKET_PRODUCTION_MUST_HOLD',manifest.packet_paths[i]);
    const leak=scanResultLeakage(packet);
    if(leak)fail('NON_NULL_LABEL_MODEL_OR_RESULT_LEAKAGE',`${manifest.packet_paths[i]}:${leak}`);
    for(const raw of packet.cases){
      if(!eligible.has(raw.stratum_id))fail(raw.stratum_id==='er-stratum-graded-population'?'GRADED_POPULATION_PROHIBITED_FROM_BASE720':'UNKNOWN_OR_INELIGIBLE_STRATUM',raw.stratum_id);
      const base={
        case_id:string(raw.case_id,'CASE_ID_REQUIRED'),
        stratum_id:string(raw.stratum_id,'STRATUM_ID_REQUIRED'),
        case_class:string(raw.case_class,'CASE_CLASS_REQUIRED'),
        identity_boundary:string(raw.identity_boundary,'IDENTITY_BOUNDARY_REQUIRED'),
        source_a_reference:string(raw.source_a_reference,'SOURCE_A_REFERENCE_REQUIRED'),
        source_b_reference:string(raw.source_b_reference,'SOURCE_B_REFERENCE_REQUIRED'),
        source_a_payload_sha256:string(raw.source_a_payload_sha256,'SOURCE_A_SHA_REQUIRED'),
        source_b_payload_sha256:string(raw.source_b_payload_sha256,'SOURCE_B_SHA_REQUIRED'),
        license_evidence_refs:uniqueStrings(raw.license_evidence_refs,'LICENSE_EVIDENCE_REFS_REQUIRED'),
        rights_state:raw.rights_state,
        provenance_refs:uniqueStrings(raw.provenance_refs,'PROVENANCE_REFS_REQUIRED')
      };
      if(!SHA_RE.test(base.source_a_payload_sha256)||!SHA_RE.test(base.source_b_payload_sha256))fail('SOURCE_PAYLOAD_SHA256_INVALID',base.case_id);
      if(base.rights_state!=='ALLOW')fail('RIGHTS_NOT_ALLOW',base.case_id);
      const binding=digest(base);
      if(raw.case_evidence_binding_sha256!==undefined&&raw.case_evidence_binding_sha256!==binding)fail('EXISTING_CASE_BINDING_MISMATCH',base.case_id);
      gathered.push({...base,case_evidence_binding_sha256:binding});
    }
  }

  if(gathered.length!==720)fail('EXACT_720_CASES_REQUIRED',String(gathered.length));
  const ids=new Set();const pairs=new Set();
  for(const c of gathered){
    if(ids.has(c.case_id))fail('DUPLICATE_CASE_ID',c.case_id);ids.add(c.case_id);
    const pair=evidencePairKey(c);if(pairs.has(pair))fail('DUPLICATE_EVIDENCE_PAIR_PADDING',c.case_id);pairs.add(pair);
  }

  for(const id of BASE720_ELIGIBLE_STRATA){
    const target=plan.get(id);if(!target||target.cases!==120||target.blind!==60)fail('ELIGIBLE_SAMPLING_TARGET_INVALID',id);
    const cases=gathered.filter(x=>x.stratum_id===id);
    if(cases.length!==120)fail('STRATUM_EXACT_120_REQUIRED',`${id}:${cases.length}`);
    assertCounts(counts(cases,'case_class'),target.case_class_targets,`CASE_CLASS_QUOTA_MISMATCH:${id}`);
    assertCounts(counts(cases,'identity_boundary'),target.identity_boundary_targets,`IDENTITY_BOUNDARY_QUOTA_MISMATCH:${id}`);
  }
  if(gathered.some(x=>x.stratum_id==='er-stratum-graded-population'))fail('GRADED_POPULATION_PROHIBITED_FROM_BASE720');

  const cases=gathered.sort((a,b)=>a.stratum_id.localeCompare(b.stratum_id)||a.case_id.localeCompare(b.case_id));
  const caseSet=cases.map(x=>({case_id:x.case_id,case_evidence_binding_sha256:x.case_evidence_binding_sha256}));
  const dataset={
    id:`kidults-er-base720-v1-${digest(caseSet).slice(7,19)}`,
    version:'1.0.0',
    dataset_class:'REAL_WORLD_EVIDENCE_CASES_UNLABELED',
    state:'BASE_720_MATERIALIZED_UNLABELED_NOT_REVIEWED',
    source_manifest_id:manifest.id,
    packet_count:packets.length,
    stratum_count:6,
    case_count:720,
    graded_population_case_count:0,
    case_set_sha256:digest(caseSet),
    cases,
    reviewer_assignment_state:'ROSTER_READY_PACKET_EXECUTION_SEPARATE',
    labels_state:'NOT_COLLECTED',
    adjudication:'NOT_STARTED',
    final_blind_holdout:'NOT_SEALED',
    empirical_attestation:'NOT_CREATED',
    track_b:'NOT_STARTED',
    public_release:'HOLD',
    production:'HOLD'
  };
  return {...dataset,dataset_sha256:digest(dataset)};
}

export function validateBase720(dataset,samplingPlan){
  if(!dataset||dataset.dataset_class!=='REAL_WORLD_EVIDENCE_CASES_UNLABELED'||dataset.production!=='HOLD'||dataset.public_release!=='HOLD'||dataset.case_count!==720||!Array.isArray(dataset.cases)||dataset.cases.length!==720||dataset.graded_population_case_count!==0)fail('BASE720_DATASET_BOUNDARY_INVALID');
  for(const c of dataset.cases){
    const keys=Object.keys(c).sort();if(canonicalJson(keys)!==canonicalJson([...BASE720_CASE_FIELDS].sort()))fail('BASE720_CASE_FIELD_ALLOWLIST_INVALID',c.case_id);
    const unsigned={...c};delete unsigned.case_evidence_binding_sha256;if(digest(unsigned)!==c.case_evidence_binding_sha256)fail('BASE720_CASE_BINDING_INVALID',c.case_id);
  }
  const expected=materializeBase720({manifest:{id:'kidults-er-base720-materialization-manifest-v1',production:'HOLD',packet_paths:['dataset-self']},packets:[{production:'HOLD',cases:dataset.cases}],samplingPlan});
  if(expected.case_set_sha256!==dataset.case_set_sha256)fail('BASE720_CASE_SET_DIGEST_INVALID');
  if(dataset.labels_state!=='NOT_COLLECTED'||dataset.adjudication!=='NOT_STARTED'||dataset.final_blind_holdout!=='NOT_SEALED'||dataset.empirical_attestation!=='NOT_CREATED'||dataset.track_b!=='NOT_STARTED')fail('BASE720_FALSE_COMPLETION_CLAIM');
  const unsigned={...dataset};delete unsigned.dataset_sha256;if(digest(unsigned)!==dataset.dataset_sha256)fail('BASE720_DATASET_DIGEST_INVALID');
  return {status:'PASS_BASE720_UNLABELED_NOT_REVIEWED',case_count:720,strata:6,graded:0,labels:'NOT_COLLECTED',production:'HOLD'};
}
