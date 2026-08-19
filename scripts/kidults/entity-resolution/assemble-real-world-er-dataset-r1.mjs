import fs from 'node:fs/promises';

const OUT = process.argv[2] || '/tmp/er-real-world-increment-r1.json';
const MET_OBJECTS = [45734, 437133];
const timeoutMs = 15000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizedVariant(record) {
  return {
    title: cleanText(record.title).toLowerCase(),
    object_name: cleanText(record.objectName).toUpperCase(),
    accession_number: cleanText(record.accessionNumber).replace(/\s+/g, ''),
    object_id: String(record.objectID),
    source: 'met-open-access-api'
  };
}

const objects = [];
for (const id of MET_OBJECTS) {
  const record = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
  if (record?.isPublicDomain !== true) throw new Error(`Met object ${id} is not public domain; fail closed.`);
  objects.push(record);
}

const [a, b] = objects;
if (a.objectID === b.objectID) throw new Error('Hard-negative controls require distinct authoritative object IDs.');

const provenance = (record) => ({
  source_id: 'met-open-access-api',
  source_record_id: String(record.objectID),
  source_url: `https://collectionapi.metmuseum.org/public/collection/v1/objects/${record.objectID}`,
  rights_basis: 'CC0_OPEN_ACCESS',
  rights_reference: 'https://www.metmuseum.org/hubs/open-access',
  authoritative_identity_fields: ['objectID', 'accessionNumber', 'objectURL']
});

const cases = [
  {
    case_id: `met-source-record-normalization-${a.objectID}`,
    case_class: 'SAME_OBJECT_NORMALIZATION',
    identity_boundary: 'SOURCE_RECORD',
    expected: 'MATCH',
    left: {
      title: a.title ?? null,
      object_name: a.objectName ?? null,
      accession_number: a.accessionNumber ?? null,
      object_id: String(a.objectID),
      source: 'met-open-access-api'
    },
    right: normalizedVariant(a),
    label_basis: 'AUTHORITATIVE_SAME_SOURCE_RECORD_ID',
    label_evidence: [`met:objectID:${a.objectID}`, `met:accessionNumber:${a.accessionNumber}`],
    provenance_refs: [provenance(a)],
    rights_state: 'ALLOW',
    blind_holdout_eligible: true
  },
  {
    case_id: `met-physical-object-hard-negative-${a.objectID}-${b.objectID}`,
    case_class: 'HARD_NEGATIVE',
    identity_boundary: 'PHYSICAL_OBJECT',
    expected: 'NO_MATCH',
    left: {
      title: a.title ?? null,
      accession_number: a.accessionNumber ?? null,
      object_id: String(a.objectID)
    },
    right: {
      title: b.title ?? null,
      accession_number: b.accessionNumber ?? null,
      object_id: String(b.objectID)
    },
    label_basis: 'AUTHORITATIVE_DISTINCT_MUSEUM_OBJECT_IDS_AND_ACCESSION_RECORDS',
    label_evidence: [`met:objectID:${a.objectID}`, `met:objectID:${b.objectID}`, `met:accessionNumber:${a.accessionNumber}`, `met:accessionNumber:${b.accessionNumber}`],
    provenance_refs: [provenance(a), provenance(b)],
    rights_state: 'ALLOW',
    blind_holdout_eligible: true
  }
];

const artifact = {
  id: 'entity-resolution-real-world-dataset-increment-r1',
  parent_issue: 479,
  execution_mode: 'DEV_SHADOW_DATASET_ASSEMBLY',
  dataset_class: 'REAL_WORLD_LABELED_INCREMENT',
  synthetic: false,
  generated_at: new Date().toISOString(),
  source_families: ['met-open-access-api'],
  case_count: cases.length,
  cases,
  coverage: {
    case_classes_present: [...new Set(cases.map(x => x.case_class))],
    identity_boundaries_present: [...new Set(cases.map(x => x.identity_boundary))],
    provenance_coverage: cases.every(x => x.provenance_refs?.length > 0) ? 1 : 0,
    rights_coverage: cases.every(x => x.rights_state === 'ALLOW') ? 1 : 0,
    full_contract_case_class_coverage: false,
    full_contract_identity_boundary_coverage: false,
    scope_stratification_complete: false
  },
  promotion: {
    eligible: false,
    reason: 'FIRST_REAL_WORLD_INCREMENT_ONLY; REQUIRED_CASE_CLASSES_BOUNDARIES_SCOPE_STRATIFICATION_AND_FROZEN_BLIND_HOLDOUT_REMAIN_INCOMPLETE'
  },
  truth_boundary: 'This is the first real rights/provenance-backed labeled increment for #479. It must not be represented as empirical >=99% benchmark completion.'
};

await fs.writeFile(OUT, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify(artifact, null, 2));
