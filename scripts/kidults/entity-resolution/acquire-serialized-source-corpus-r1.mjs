import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = process.argv[2] || '/tmp/serialized-source-corpus-r1.json';
const datasetUrl = 'https://media.githubusercontent.com/media/metmuseum/openaccess/master/MetObjects.csv';
const licenseRefs = [
  'https://github.com/metmuseum/openaccess',
  'https://github.com/metmuseum/openaccess/blob/master/LICENSE'
];
const fit = /(watch|clock|camera|instrument|chronometer|timepiece|mechanical)/i;

function sha(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function digest(value) { return sha(JSON.stringify(canonical(value))); }
function* csvRows(text) {
  let row=[]; let field=''; let quoted=false;
  const input=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++) {
    const c=input[i];
    if(quoted) {
      if(c==='"' && input[i+1]==='"') { field+='"'; i++; }
      else if(c==='"') quoted=false;
      else field+=c;
    } else if(c==='"') quoted=true;
    else if(c===',') { row.push(field); field=''; }
    else if(c==='\n') { row.push(field.replace(/\r$/,'')); yield row; row=[]; field=''; }
    else field+=c;
  }
  if(field.length || row.length) { row.push(field.replace(/\r$/,'')); yield row; }
}

const response = await fetch(datasetUrl, { headers: { 'user-agent': 'KIDULTS-ER-EMPIRICAL-ACQUISITION/1.0' } });
if(!response.ok) throw new Error(`MET_CSV_HTTP_${response.status}`);
const csv = await response.text();
const datasetSha256 = sha(csv);
const iter = csvRows(csv);
const first = iter.next();
if(first.done) throw new Error('MET_CSV_EMPTY');
const headers = first.value;
const idx = Object.fromEntries(headers.map((h,i)=>[h,i]));
for(const required of ['Object Number','Object ID','Object Name','Title','Artist Display Name','Classification','Medium','Culture','Period','Object Date']) {
  if(idx[required] === undefined) throw new Error(`MET_CSV_HEADER_MISSING:${required}`);
}

const records=[];
const ids=new Set();
const sourceIdentifiers=new Set();
for(const values of iter) {
  if(records.length >= 240) break;
  const get = name => String(values[idx[name]] ?? '').trim();
  const objectId=get('Object ID');
  const accession=get('Object Number');
  const title=get('Title');
  const objectName=get('Object Name');
  const classification=get('Classification');
  const maker=get('Artist Display Name');
  if(!objectId || !accession || !title) continue;
  if(!fit.test(`${objectName} ${title} ${classification}`)) continue;
  if(ids.has(objectId) || sourceIdentifiers.has(accession)) continue;
  const sourceUrl=`https://www.metmuseum.org/art/collection/search/${encodeURIComponent(objectId)}`;
  const payload={
    collection_object_identifier:objectId,
    authoritative_source_identifier:accession,
    title,
    object_name:objectName,
    maker_creator:maker,
    culture:get('Culture'),
    period:get('Period'),
    date_made:get('Object Date'),
    medium:get('Medium'),
    classification,
    source_record_url:sourceUrl
  };
  ids.add(objectId); sourceIdentifiers.add(accession);
  records.push({
    source_id:'met-open-access-csv',
    source_record_id:objectId,
    source_reference:sourceUrl,
    source_payload_sha256:digest(payload),
    source_dataset_sha256:datasetSha256,
    license_evidence_refs:licenseRefs,
    rights_state:'ALLOW',
    provenance_refs:[datasetUrl,sourceUrl],
    payload
  });
}
if(records.length !== 240) throw new Error(`MET_ELIGIBLE_SERIALIZED_RECORDS_NE_240:${records.length}`);
if(new Set(records.map(r=>r.source_record_id)).size !== 240) throw new Error('DUPLICATE_SOURCE_RECORD');
if(new Set(records.map(r=>r.payload.authoritative_source_identifier)).size !== 240) throw new Error('DUPLICATE_AUTHORITATIVE_SOURCE_IDENTIFIER');
if(records.some(r=>r.rights_state!=='ALLOW')) throw new Error('RIGHTS_ALLOW_REQUIRED');
if(records.some(r=>!/^sha256:[a-f0-9]{64}$/.test(r.source_payload_sha256))) throw new Error('PAYLOAD_DIGEST_INVALID');

const artifact={
  id:'kidults-er-serialized-source-corpus-r1',
  status:'REAL_SOURCE_RECORD_CORPUS_UNLABELED',
  stratum_id:'er-stratum-serialized-reference',
  source_id:'met-open-access-csv',
  source_dataset_sha256:datasetSha256,
  acquired_at:new Date().toISOString(),
  record_count:records.length,
  labels_present:false,
  model_predictions_present:false,
  reviewer_assignment_required:true,
  production:'HOLD',
  public_release:'HOLD',
  records
};
await fs.writeFile(out, JSON.stringify(artifact,null,2));
console.log(JSON.stringify({id:artifact.id,record_count:artifact.record_count,dataset_sha256:datasetSha256,labels_present:false,model_predictions_present:false,production:'HOLD'}));
