import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = process.argv[2] || '/tmp/serialized-wikidata-capacity-r1.json';
const endpoint = 'https://query.wikidata.org/sparql';
const query = `SELECT ?item ?itemLabel ?serial ?manufacturer ?manufacturerLabel ?model ?class ?classLabel WHERE {
  ?item wdt:P176 ?manufacturer ;
        wdt:P2598 ?serial ;
        wdt:P13351 ?model .
  OPTIONAL { ?item wdt:P31 ?class . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 500`;
function sha(v){return `sha256:${createHash('sha256').update(v).digest('hex')}`;}

const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
const response = await fetch(url, {
  headers: {
    'accept':'application/sparql-results+json',
    'user-agent':'KIDULTS-ER-SERIALIZED-CAPACITY-PROBE/1.0 (bounded preproduction diagnostic)'
  },
  signal: AbortSignal.timeout(120000)
});
if(!response.ok) throw new Error(`WDQS_HTTP_${response.status}`);
const raw = await response.text();
const data = JSON.parse(raw);
const bindings = data?.results?.bindings || [];
const byItem = new Map();
for(const b of bindings){
  const item = b.item?.value || '';
  const manufacturer = b.manufacturer?.value || '';
  const serial = b.serial?.value || '';
  const model = b.model?.value || '';
  if(!/^http:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(item) || !manufacturer || !serial || !model) continue;
  if(!byItem.has(item)) byItem.set(item,{item,item_label:b.itemLabel?.value||'',manufacturers:new Set(),serials:new Set(),models:new Set(),classes:new Map()});
  const r=byItem.get(item);
  r.manufacturers.add(manufacturer); r.serials.add(serial); r.models.add(model);
  const cls=b.class?.value||'';
  if(cls) r.classes.set(cls,b.classLabel?.value||'');
}
const records=[...byItem.values()].map(r=>({
  item:r.item,
  item_label:r.item_label,
  manufacturer_count:r.manufacturers.size,
  serial_count:r.serials.size,
  model_count:r.models.size,
  class_refs:[...r.classes.entries()].map(([id,label])=>({id,label})),
  source_record_sha256:sha(JSON.stringify({item:r.item,manufacturers:[...r.manufacturers].sort(),serials:[...r.serials].sort(),models:[...r.models].sort(),classes:[...r.classes.keys()].sort()}))
}));
const classCounts=new Map();
for(const r of records) for(const c of r.class_refs){const key=`${c.id}|${c.label}`;classCounts.set(key,(classCounts.get(key)||0)+1);}
const class_distribution=[...classCounts.entries()].map(([key,count])=>{const [id,label]=key.split('|');return{id,label,count};}).sort((a,b)=>b.count-a.count).slice(0,50);
const distinct_item_count=records.length;
const disposition=distinct_item_count>=120?'RAW_GRAMMAR_CAPACITY_GE_120_SCOPE_RELEVANCE_NOT_YET_PROVEN':'INSUFFICIENT_RAW_GRAMMAR_CAPACITY_LT_120';
const artifact={
  id:'kidults-er-serialized-wikidata-capacity-probe-r1',
  status:'DIAGNOSTIC_COMPLETE',
  source_id:'wikidata-structured-data-cc0',
  observed_at:new Date().toISOString(),
  query_sha256:sha(query),
  response_sha256:sha(raw),
  required_properties:{manufacturer:'P176',serial_number:'P2598',model_number:'P13351'},
  capacity_floor:120,
  raw_binding_count:bindings.length,
  distinct_item_count,
  disposition,
  collectible_scope_representativeness_verified:false,
  independent_alias_coverage_verified:false,
  labels_present:false,
  empirical_pass_claimed:false,
  track_b_started:false,
  production:'HOLD',
  public_release:'HOLD',
  class_distribution,
  records
};
await fs.writeFile(out,JSON.stringify(artifact,null,2));
console.log(JSON.stringify({distinct_item_count,disposition,top_classes:class_distribution.slice(0,10),production:'HOLD'}));
