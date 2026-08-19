import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = process.argv[2] || '/tmp/provenance-source-corpus-r1.json';
const activityBase = 'https://data.getty.edu/provenance/activity-stream/page';
const licenseRefs = [
  'https://data.getty.edu/provenance/docs/',
  'https://www.getty.edu/databases-tools-and-technologies/provenance/'
];

function sha(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function digest(value) { return sha(JSON.stringify(canonical(value))); }
function typeList(value) { return Array.isArray(value) ? value.map(String) : value ? [String(value)] : []; }
function collectObjectUrls(page) {
  const items = page.orderedItems || page.items || [];
  const urls = [];
  for (const item of items) {
    const obj = item?.object;
    const candidates = [
      typeof obj === 'string' ? obj : null,
      obj?.id,
      obj?.['@id'],
      item?.target?.id,
      item?.target?.['@id']
    ].filter(Boolean);
    for (const u of candidates) if (/^https:\/\/data\.getty\.edu\/provenance\/[0-9a-f-]{20,}$/i.test(String(u))) urls.push(String(u));
  }
  return urls;
}

const candidateUrls = [];
const seen = new Set();
for (let pageNo = 1; pageNo <= 80 && candidateUrls.length < 900; pageNo++) {
  const url = `${activityBase}/${pageNo}`;
  const response = await fetch(url, { headers: { 'user-agent': 'KIDULTS-ER-EMPIRICAL-ACQUISITION/1.0', accept: 'application/json, application/ld+json' } });
  if (!response.ok) throw new Error(`GETTY_ACTIVITY_HTTP_${response.status}:PAGE_${pageNo}`);
  const page = await response.json();
  for (const u of collectObjectUrls(page)) {
    if (!seen.has(u)) { seen.add(u); candidateUrls.push(u); }
  }
}
if (candidateUrls.length < 240) throw new Error(`GETTY_ACTIVITY_UNIQUE_ENTITY_URLS_LT_240:${candidateUrls.length}`);

const records = [];
for (const url of candidateUrls) {
  if (records.length >= 240) break;
  const response = await fetch(url, { headers: { 'user-agent': 'KIDULTS-ER-EMPIRICAL-ACQUISITION/1.0', accept: 'application/json, application/ld+json' } });
  if (response.status === 404 || response.status === 410) continue;
  if (!response.ok) throw new Error(`GETTY_ENTITY_HTTP_${response.status}:${url}`);
  const entity = await response.json();
  const entityId = String(entity.id || entity['@id'] || url);
  if (entityId !== url && !entityId.startsWith('https://data.getty.edu/provenance/')) continue;
  const types = typeList(entity.type || entity['@type']);
  if (!types.length) continue;
  const label = String(entity._label || entity.label || entity.identified_by?.[0]?.content || '').trim();
  const payload = {
    entity_id: entityId,
    entity_types: types,
    source_label: label,
    identified_by: Array.isArray(entity.identified_by) ? entity.identified_by.slice(0, 5) : [],
    referred_to_by: Array.isArray(entity.referred_to_by) ? entity.referred_to_by.slice(0, 5) : [],
    produced_by: entity.produced_by || null,
    current_owner: entity.current_owner || null,
    member_of: Array.isArray(entity.member_of) ? entity.member_of.slice(0, 5) : [],
    part_of: Array.isArray(entity.part_of) ? entity.part_of.slice(0, 5) : []
  };
  records.push({
    source_id: 'getty-provenance-index-linked-open-data',
    source_record_id: entityId.split('/').pop(),
    source_reference: entityId,
    source_payload_sha256: digest(payload),
    license_evidence_refs: licenseRefs,
    rights_state: 'ALLOW',
    provenance_refs: [entityId, 'https://data.getty.edu/provenance/activity-stream'],
    payload
  });
}
if (records.length !== 240) throw new Error(`GETTY_ELIGIBLE_PROVENANCE_RECORDS_NE_240:${records.length}`);
if (new Set(records.map(r => r.source_record_id)).size !== 240) throw new Error('DUPLICATE_SOURCE_RECORD');
if (records.some(r => r.rights_state !== 'ALLOW')) throw new Error('RIGHTS_ALLOW_REQUIRED');
if (records.some(r => !/^sha256:[a-f0-9]{64}$/.test(r.source_payload_sha256))) throw new Error('PAYLOAD_DIGEST_INVALID');

const artifact = {
  id: 'kidults-er-provenance-source-corpus-r1',
  status: 'REAL_SOURCE_RECORD_CORPUS_UNLABELED',
  stratum_id: 'er-stratum-provenance-unique-object',
  source_id: 'getty-provenance-index-linked-open-data',
  acquired_at: new Date().toISOString(),
  record_count: records.length,
  labels_present: false,
  model_predictions_present: false,
  reviewer_assignment_required: true,
  production: 'HOLD',
  public_release: 'HOLD',
  records
};
await fs.writeFile(out, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ id: artifact.id, record_count: artifact.record_count, labels_present: false, model_predictions_present: false, production: 'HOLD' }));
