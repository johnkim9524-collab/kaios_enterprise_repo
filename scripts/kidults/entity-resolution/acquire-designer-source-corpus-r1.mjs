import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = process.argv[2] || '/tmp/designer-source-corpus-r1.json';
const url = 'https://media.githubusercontent.com/media/MuseumofModernArt/collection/main/Artworks.csv';
const licenseRefs = [
  'https://github.com/MuseumofModernArt/collection',
  'https://github.com/MuseumofModernArt/collection/blob/main/README.md'
];

function sha(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function digest(value) { return sha(JSON.stringify(canonical(value))); }
function parseCsv(text) {
  const rows=[]; let row=[]; let field=''; let quoted=false;
  const input=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  for(let i=0;i<input.length;i++) {
    const c=input[i];
    if(quoted) {
      if(c==='"' && input[i+1]==='"') { field+='"'; i++; }
      else if(c==='"') quoted=false;
      else field+=c;
    } else if(c==='"') quoted=true;
    else if(c===',') { row.push(field); field=''; }
    else if(c==='\n') { row.push(field); if(row.some(v=>v!=='')) rows.push(row); row=[]; field=''; }
    else field+=c;
  }
  row.push(field); if(row.some(v=>v!=='')) rows.push(row);
  const headers=rows.shift();
  return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}

const response = await fetch(url, { headers: { 'user-agent': 'KIDULTS-ER-EMPIRICAL-ACQUISITION/1.0' } });
if(!response.ok) throw new Error(`MOMA_HTTP_${response.status}`);
const csv = await response.text();
const datasetSha256 = sha(csv);
const rows = parseCsv(csv);
const eligible = rows.filter(r =>
  r.Department === 'Architecture & Design' &&
  String(r.ObjectID||'').trim() && String(r.AccessionNumber||'').trim() &&
  String(r.Title||'').trim() && String(r.Artist||'').trim() &&
  /^https:\/\/www\.moma\.org\/collection\/works\//.test(String(r.URL||''))
).sort((a,b)=>Number(a.ObjectID)-Number(b.ObjectID));
if(eligible.length < 240) throw new Error(`MOMA_ELIGIBLE_RECORDS_LT_240:${eligible.length}`);

const records = eligible.slice(0,240).map(r => {
  const payload = {
    collection_object_identifier: String(r.ObjectID),
    object_number: r.AccessionNumber,
    title: r.Title,
    artist_designer: r.Artist,
    date_made: r.Date,
    medium: r.Medium,
    dimensions: r.Dimensions,
    date_acquired: r.DateAcquired,
    collection_record_url: r.URL
  };
  return {
    source_id:'moma-collection-research-dataset',
    source_record_id:String(r.ObjectID),
    source_reference:r.URL,
    source_payload_sha256:digest(payload),
    source_dataset_sha256:datasetSha256,
    license_evidence_refs:licenseRefs,
    rights_state:'ALLOW',
    provenance_refs:[url,r.URL],
    payload
  };
});
if(new Set(records.map(r=>r.source_record_id)).size !== 240) throw new Error('DUPLICATE_SOURCE_RECORD');
if(records.some(r=>!/^sha256:[a-f0-9]{64}$/.test(r.source_payload_sha256))) throw new Error('PAYLOAD_DIGEST_INVALID');

const artifact = {
  id:'kidults-er-designer-source-corpus-r1',
  status:'REAL_SOURCE_RECORD_CORPUS_UNLABELED',
  stratum_id:'er-stratum-designer-maker-edition',
  source_id:'moma-collection-research-dataset',
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
