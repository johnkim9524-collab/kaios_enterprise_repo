import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = process.argv[2] || '/tmp/serialized-source-corpus-r1.json';
const base = 'https://collectionapi.metmuseum.org/public/collection/v1';
const licenseRefs = [
  'https://github.com/metmuseum/openaccess',
  'https://github.com/metmuseum/openaccess/blob/master/LICENSE',
  'https://metmuseum.github.io/'
];
const queryTerms = ['watch', 'clock', 'camera', 'instrument', 'mechanical'];

function sha(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function digest(value) { return sha(JSON.stringify(canonical(value))); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const ids = [];
const seenIds = new Set();
for (const term of queryTerms) {
  const response = await fetch(`${base}/search?q=${encodeURIComponent(term)}`, { headers: { 'user-agent': 'KIDULTS-ER-EMPIRICAL-ACQUISITION/1.0' } });
  if (!response.ok) throw new Error(`MET_SEARCH_HTTP_${response.status}:${term}`);
  const data = await response.json();
  for (const id of data.objectIDs || []) {
    if (!seenIds.has(id)) { seenIds.add(id); ids.push(id); }
  }
}
if (ids.length < 240) throw new Error(`MET_SEARCH_UNIQUE_IDS_LT_240:${ids.length}`);

const records = [];
for (const id of ids) {
  if (records.length >= 240) break;
  await sleep(30);
  const response = await fetch(`${base}/objects/${id}`, { headers: { 'user-agent': 'KIDULTS-ER-EMPIRICAL-ACQUISITION/1.0' } });
  if (response.status === 404) continue;
  if (!response.ok) throw new Error(`MET_OBJECT_HTTP_${response.status}:${id}`);
  const r = await response.json();
  if (!String(r.objectID ?? '').trim()) continue;
  if (!String(r.accessionNumber ?? '').trim()) continue;
  if (!String(r.title ?? '').trim()) continue;
  if (!String(r.objectURL ?? '').startsWith('https://www.metmuseum.org/art/collection/search/')) continue;
  const payload = {
    collection_object_identifier: String(r.objectID),
    authoritative_source_identifier: String(r.accessionNumber),
    title: String(r.title || ''),
    object_name: String(r.objectName || ''),
    maker_creator: String(r.artistDisplayName || ''),
    maker_role: String(r.artistRole || ''),
    culture: String(r.culture || ''),
    period: String(r.period || ''),
    date_made: String(r.objectDate || ''),
    medium: String(r.medium || ''),
    classification: String(r.classification || ''),
    source_record_url: String(r.objectURL)
  };
  records.push({
    source_id: 'met-open-access-api',
    source_record_id: String(r.objectID),
    source_reference: String(r.objectURL),
    source_payload_sha256: digest(payload),
    license_evidence_refs: licenseRefs,
    rights_state: 'ALLOW',
    provenance_refs: [`${base}/objects/${id}`, String(r.objectURL)],
    payload
  });
}
if (records.length !== 240) throw new Error(`MET_ELIGIBLE_SERIALIZED_RECORDS_NE_240:${records.length}`);
if (new Set(records.map(r => r.source_record_id)).size !== 240) throw new Error('DUPLICATE_SOURCE_RECORD');
if (new Set(records.map(r => r.payload.authoritative_source_identifier)).size !== 240) throw new Error('DUPLICATE_AUTHORITATIVE_SOURCE_IDENTIFIER');
if (records.some(r => r.rights_state !== 'ALLOW')) throw new Error('RIGHTS_ALLOW_REQUIRED');
if (records.some(r => !/^sha256:[a-f0-9]{64}$/.test(r.source_payload_sha256))) throw new Error('PAYLOAD_DIGEST_INVALID');

const artifact = {
  id: 'kidults-er-serialized-source-corpus-r1',
  status: 'REAL_SOURCE_RECORD_CORPUS_UNLABELED',
  stratum_id: 'er-stratum-serialized-reference',
  source_id: 'met-open-access-api',
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
