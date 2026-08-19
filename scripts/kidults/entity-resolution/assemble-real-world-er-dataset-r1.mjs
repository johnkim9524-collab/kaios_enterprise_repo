import fs from 'node:fs/promises';

const OUT = process.argv[2] || '/tmp/er-real-world-increment-r1.json';
const MET_OBJECTS = [45734, 437133];
const timeoutMs = 15000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0'},signal:controller.signal});
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

const objects=[];
for (const id of MET_OBJECTS) {
  const r=await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
  if (r?.isPublicDomain !== true) throw new Error(`Met object ${id} is not public domain; fail closed.`);
  objects.push(r);
}
const [a,b]=objects;
if (a.objectID===b.objectID) throw new Error('Distinct authoritative objects required.');

const provenance=(r)=>`met-open-access-api:object:${r.objectID}:cc0`;
const sourceRecord=(r,variant=false)=>({
  anchors:{SOURCE_RECORD:`met:${r.objectID}`},
  unique_keys:{object_id:String(r.objectID),accession_number:String(r.accessionNumber??'')},
  title:variant?String(r.title??'').toLowerCase():r.title??null,
  object_name:variant?String(r.objectName??'').toUpperCase():r.objectName??null,
  source:'met-open-access-api'
});
const physicalObject=(r)=>({
  anchors:{PHYSICAL_OBJECT:`met-physical:${r.objectID}`},
  unique_keys:{object_id:String(r.objectID),accession_number:String(r.accessionNumber??'')},
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
    label_basis:'AUTHORITATIVE_SAME_MET_OBJECT_ID_AND_ACCESSION_RECORD'
  },
  {
    case_id:`met-physical-hard-negative-${a.objectID}-${b.objectID}`,
    case_class:'HARD_NEGATIVE', identity_boundary:'PHYSICAL_OBJECT', scope_id:'poc-authoritative-object-identity',
    expected:'NO_MATCH', blind_holdout:true,
    left:physicalObject(a), right:physicalObject(b),
    provenance_refs:[provenance(a),provenance(b)], rights_state:'ALLOW',
    label_basis:'AUTHORITATIVE_DISTINCT_MET_OBJECT_IDS_AND_ACCESSION_RECORDS'
  }
];

const artifact={
  id:'entity-resolution-real-world-dataset-increment-r1', parent_issue:479,
  dataset_class:'REAL_WORLD_LABELED', dataset_scope:'INCREMENTAL_PARTIAL', synthetic:false,
  generated_at:new Date().toISOString(), source_families:['met-open-access-api'], cases,
  truth_boundary:'Real rights/provenance-backed labeled increment only. Required case classes, all identity boundaries and scope breadth remain incomplete; no #479 completion claim.'
};
await fs.writeFile(OUT,JSON.stringify(artifact,null,2));
console.log(JSON.stringify(artifact,null,2));
