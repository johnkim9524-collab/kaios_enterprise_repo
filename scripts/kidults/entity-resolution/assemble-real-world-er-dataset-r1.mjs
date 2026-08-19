import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const OUT = process.argv[2] || '/tmp/er-real-world-increment-r1.json';
const SEARCH_URL='https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=painting';
const timeoutMs = 15000;
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0'},signal:controller.signal});
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

const search=await fetchJson(SEARCH_URL);
if (!Array.isArray(search.objectIDs) || search.objectIDs.length===0) throw new Error('Met search returned no object IDs.');
const objects=[];
for (const id of search.objectIDs.slice(0,80)) {
  const r=await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
  if (r?.isPublicDomain===true && r?.objectID && r?.accessionNumber) objects.push(r);
  if (objects.length>=2) break;
}
if (objects.length<2) throw new Error('Could not verify two public-domain authoritative Met records within bounded scan.');
const [a,b]=objects;
if (a.objectID===b.objectID) throw new Error('Distinct authoritative objects required.');

const provenance=(r)=>`met-open-access-api:object:${r.objectID}:cc0`;
const sourceEvidence=(r)=>({
  source_url:`https://collectionapi.metmuseum.org/public/collection/v1/objects/${r.objectID}`,
  source_payload_sha256:digest(r),
  license_evidence_refs:[
    'https://www.metmuseum.org/about-the-met/policies-and-documents/open-access',
    'https://metmuseum.github.io/'
  ]
});
const sourceRecord=(r,variant=false)=>({
  anchors:{SOURCE_RECORD:`met:${r.objectID}`},
  unique_keys:{object_id:String(r.objectID),accession_number:String(r.accessionNumber)},
  title:variant?String(r.title??'').toLowerCase():r.title??null,
  object_name:variant?String(r.objectName??'').toUpperCase():r.objectName??null,
  source:'met-open-access-api'
});
const physicalObject=(r)=>({
  anchors:{PHYSICAL_OBJECT:`met-physical:${r.objectID}`},
  unique_keys:{object_id:String(r.objectID),accession_number:String(r.accessionNumber)},
  title:r.title??null,
  source:'met-open-access-api'
});

const cases=[
  {
    case_id:`met-source-record-normalization-${a.objectID}`,
    case_class:'SAME_OBJECT_NORMALIZATION', identity_boundary:'SOURCE_RECORD', scope_id:'poc-authoritative-object-identity',
    expected:'MATCH', blind_holdout:false,
    left:sourceRecord(a,false), right:sourceRecord(a,true),
    provenance_refs:[provenance(a)], rights_state:'ALLOW',
    label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_AUTHORITATIVE_SAME_MET_OBJECT_ID_AND_ACCESSION_RECORD',
    source_evidence:[sourceEvidence(a)]
  },
  {
    case_id:`met-physical-hard-negative-${a.objectID}-${b.objectID}`,
    case_class:'HARD_NEGATIVE', identity_boundary:'PHYSICAL_OBJECT', scope_id:'poc-authoritative-object-identity',
    expected:'NO_MATCH', blind_holdout:false,
    left:physicalObject(a), right:physicalObject(b),
    provenance_refs:[provenance(a),provenance(b)], rights_state:'ALLOW',
    label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_AUTHORITATIVE_DISTINCT_MET_OBJECT_IDS_AND_ACCESSION_RECORDS',
    source_evidence:[sourceEvidence(a),sourceEvidence(b)]
  }
];

const artifact={
  id:'entity-resolution-real-world-dataset-increment-r1', parent_issue:479,
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL', dataset_scope:'INCREMENTAL_PARTIAL', synthetic:false,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  independent_label_review_complete:false,
  label_adjudication_complete:false,
  holdout_sealed_before_modeling:false,
  generated_at:new Date().toISOString(), source_families:['met-open-access-api'], bounded_scan_count:Math.min(80,search.objectIDs.length), cases,
  truth_boundary:'Real-source-derived constructed control only. Pair labels are generated from the same authoritative identifiers and are not independently reviewed, adjudicated, or blind. Required case classes, all identity boundaries and scope breadth remain incomplete; this cannot satisfy the empirical 99% or #479 completion gate.'
};
await fs.writeFile(OUT,JSON.stringify(artifact,null,2));
console.log(JSON.stringify(artifact,null,2));
