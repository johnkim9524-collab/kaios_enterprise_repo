import fs from 'node:fs';
import path from 'node:path';

const API = process.env.KIDULTS_PREVIEW_API || 'https://kidults-autonomous-intelligence.john-kim9524.workers.dev';
const file = path.resolve('reports/kidult100-wave1/wave1-live-latest.json');
if (!fs.existsSync(file)) throw new Error(`missing Wave1 report: ${file}`);
const report = JSON.parse(fs.readFileSync(file,'utf8'));
const records = Array.isArray(report.records) ? report.records : [];
if (!records.length) throw new Error('Wave1 report has no records');

const familyFor=(source)=>source==='NHTSA_VPIC'?'government_registry':source==='LIBRARY_OF_CONGRESS'?'institutional_archive':'open_knowledge';
const gradeFor=(source)=>source==='WIKIDATA_CC0'?'B':'A';
let accepted=0, duplicates=0, failed=0;
for (const r of records) {
  const body={
    source:{id:`src_${String(r.source).toLowerCase()}`,name:r.source,family:familyFor(r.source),baseUrl:r.sourceUrl,trustTier:gradeFor(r.source)},
    entity:{id:`ent_${String(r.source).toLowerCase()}_${String(r.sourceRecordId).replace(/[^a-zA-Z0-9_-]/g,'_')}`,type:'collectible_candidate',name:r.canonicalTitle,category:r.category,externalKeys:{sourceRecordId:String(r.sourceRecordId)}},
    evidence:{externalId:String(r.sourceRecordId),observedAt:r.observedAt,provenanceUrl:r.sourceUrl,provenanceLabel:r.source,licenseCode:r.license,grade:gradeFor(r.source),confidence:r.source==='WIKIDATA_CC0'?80:90,raw:r},
    metrics:[{key:'discovery_presence',value:1,unit:'record',confidence:r.source==='WIKIDATA_CC0'?80:90}]
  };
  try {
    const res=await fetch(`${API}/internal/ingest`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const out=await res.json().catch(()=>({}));
    if(!res.ok){failed++; console.error('FAIL',r.source,r.sourceRecordId,res.status,out); continue;}
    if(out.duplicate) duplicates++; else accepted++;
  } catch(e) { failed++; console.error('FAIL',r.source,r.sourceRecordId,String(e)); }
}
console.log(JSON.stringify({mode:'WAVE1_D1_PREVIEW_BRIDGE',records:records.length,accepted,duplicates,failed,api:API},null,2));
if(failed) process.exit(1);
