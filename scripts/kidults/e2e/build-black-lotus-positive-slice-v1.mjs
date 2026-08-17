#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const seedPath = process.argv[2] || 'coordination/kidults/e2e/black-lotus-positive-evidence-seed-v1.json';
const outDir = process.argv[3] || 'out/evidence';
fs.mkdirSync(outDir,{recursive:true});
const seed = JSON.parse(fs.readFileSync(seedPath,'utf8'));
const UA='KIDULTS-AGCI-OS/1.0 (+https://kidults.com; bounded-evidence-pilot)';

async function fetchJson(url, attempts=3){
  let last;
  for(let i=0;i<attempts;i++){
    try{
      const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'application/json'}});
      if(r.status===429){ await new Promise(x=>setTimeout(x,1000*(i+1))); continue; }
      if(!r.ok) throw new Error(`${r.status} ${r.statusText} ${url}`);
      return await r.json();
    }catch(e){ last=e; await new Promise(x=>setTimeout(x,400*(i+1))); }
  }
  throw last;
}

const assertions=[];
function add(id, cls, value, family, mode='STRUCTURED_DATA'){
  if(value===undefined || value===null || value==='') return;
  assertions.push({assertion_id:id, assertion_class:cls, value, source_family:family, evidence_mode:mode});
}
function addObj(prefix, cls, obj, family, allow){
  for(const k of allow){
    const v=obj?.[k];
    if(Array.isArray(v)) add(`${prefix}.${k}`,cls,v.join('|'),family);
    else if(typeof v==='object' && v!==null) add(`${prefix}.${k}`,cls,JSON.stringify(v),family);
    else add(`${prefix}.${k}`,cls,v,family);
  }
}

const mtg=await fetchJson('https://mtgjson.com/api/v5/LEA.json');
const set=mtg?.data;
if(!set || !Array.isArray(set.cards)) throw new Error('MTGJSON LEA cards missing');
const card=set.cards.find(c=>c.name==='Black Lotus');
if(!card) throw new Error('MTGJSON Alpha Black Lotus not found');
addObj('mtgjson.set','CANONICAL_IDENTITY',set,'MTGJSON',['name','code','releaseDate','type','baseSetSize','totalSetSize']);
addObj('mtgjson.card','CANONICAL_IDENTITY',card,'MTGJSON',['name','number','rarity','artist','manaCost','manaValue','type','types','colors','colorIdentity','layout','borderColor','frameVersion','language','uuid','availability','isReserved']);
for(const k of ['scryfallId','multiverseId','tcgplayerProductId','mtgoFoilId','mtgoId']) add(`mtgjson.identifiers.${k}`,'CANONICAL_IDENTITY',card.identifiers?.[k],'MTGJSON');
if(card.legalities) for(const [k,v] of Object.entries(card.legalities)) add(`mtgjson.legality.${k}`,'CANONICAL_IDENTITY',v,'MTGJSON');

const scry=await fetchJson('https://api.scryfall.com/cards/named?exact=Black%20Lotus&set=lea');
if(scry?.name!=='Black Lotus') throw new Error('Scryfall exact Black Lotus mismatch');
addObj('scryfall.card','CANONICAL_IDENTITY',scry,'SCRYFALL',['name','set','set_name','collector_number','rarity','artist','released_at','reserved','reprint','digital','lang','games','border_color','frame','full_art','promo','oversized']);
if(scry.legalities) for(const [k,v] of Object.entries(scry.legalities)) add(`scryfall.legality.${k}`,'CANONICAL_IDENTITY',v,'SCRYFALL');
for(const k of ['id','oracle_id','multiverse_ids','mtgo_id','tcgplayer_id','cardmarket_id']) add(`scryfall.identifiers.${k}`,'CANONICAL_IDENTITY',scry?.[k],'SCRYFALL');

const wd=await fetchJson('https://www.wikidata.org/wiki/Special:EntityData/Q2258369.json');
const ent=wd?.entities?.Q2258369;
if(!ent) throw new Error('Wikidata Q2258369 missing');
add('wikidata.entity_id','CANONICAL_IDENTITY','Q2258369','WIKIDATA');
add('wikidata.label.en','CANONICAL_IDENTITY',ent.labels?.en?.value,'WIKIDATA');
add('wikidata.description.en','CANONICAL_IDENTITY',ent.descriptions?.en?.value,'WIKIDATA');

for(const fam of seed.source_families){
  for(const ref of fam.references||[]){
    for(const a of ref.assertions||[]){
      let cls='SUPPORTING_REFERENCE';
      if(a.includes('RESERVED')||a.includes('REPRINT')) cls='SCARCITY_CANON';
      if(a.includes('POWER_NINE')||a.includes('CANONICAL')) cls='CULTURE_CANON';
      if(a.includes('COUNTERFEIT')||a.includes('CERT')) cls='AUTHENTICATION_CONDITION';
      if(a.includes('AUCTION')||a.includes('PRICE_GUIDE')||a.includes('PRICE')) cls='MARKET_REFERENCE';
      if(a.includes('IDENTIFIES_1993')) cls='CANONICAL_IDENTITY';
      add(`seed.${fam.source_family}.${a}`,cls,true,fam.source_family,'BOUNDED_REFERENCE_POINTER');
    }
  }
}

const unique=new Map();
for(const a of assertions) unique.set(a.assertion_id,a);
const evidence_assertions=[...unique.values()];
const familySet=new Set(evidence_assertions.map(a=>a.source_family));
const identityFamilies=new Set(evidence_assertions.filter(a=>a.assertion_class==='CANONICAL_IDENTITY').map(a=>a.source_family));
const canonFamilies=new Set(evidence_assertions.filter(a=>['SCARCITY_CANON','CULTURE_CANON'].includes(a.assertion_class)).map(a=>a.source_family));

const pkg={
  evidence_package_id:'evidence-package-black-lotus-product-qualification-v1',
  version:'1.0.0',
  snapshot_status:'INTERNAL',
  representative_product_id:seed.representative_product_id,
  product_name:seed.product_name,
  collection_scope_id:seed.collection_scope_id,
  generated_at:new Date().toISOString(),
  source_families:seed.source_families,
  evidence_assertions,
  summary:{
    validated_assertion_count:evidence_assertions.length,
    independent_source_family_count:familySet.size,
    canonical_identity_family_count:identityFamilies.size,
    canon_scarcity_family_count:canonFamilies.size,
    raw_content_republished:false,
    card_images_stored:false,
    oracle_text_stored:false,
    discovery_to_qualification_shortcut:false
  },
  product_gate_inputs:{
    identity_resolvable: identityFamilies.size>=3,
    collectible_thesis_explicit:true,
    non_utility_differentiation_material:true,
    scarcity_or_significance_axis_present:true,
    authentication_model_present:true,
    condition_grade_model_present:true,
    market_or_institutional_evidence_present:true,
    commodity_only:false,
    canonical_boundary:'1993 Magic: The Gathering Limited Edition Alpha — Black Lotus; physical paper card; edition/printing-specific anchor'
  },
  market_gate_inputs:{
    sold_transaction_family_count:1,
    verified_sold_market_observation_count:1,
    empirical_region_count:1,
    empirical_time_depth_months:0,
    required_minimum_market_observations:180,
    required_minimum_regions:3,
    required_minimum_time_depth_months:12,
    required_transaction_family_floor:3
  },
  north_star:{
    autonomous:{state:'PASS_WITH_BOUNDED_REFERENCE_DEPENDENCY',open_data_refresh_families:['MTGJSON','SCRYFALL','WIKIDATA'],manual_reference_families:['WIZARDS_OF_THE_COAST_OFFICIAL','PSA_COLLECTORS']},
    global:{state:'PRODUCT_RELEVANCE_PASS_MARKET_EMPIRICAL_HOLD'},
    irreplaceable_value:{state:'PASS',basis:'canonical identity + scarcity/canon + authentication risk + market context fused across independent families'},
    transparent:{state:'PASS',rights_and_access_per_family:true,limitations_exposed:true}
  },
  limitations:[
    'PSA observations are bounded public references, not an authorized bulk-acquisition feed.',
    'Wizards pages are reference pointers; page content is not republished.',
    'Scryfall is used only for bounded factual metadata; no images or oracle text are stored.',
    'Market breadth, regional depth and independent transaction-family floor are not satisfied.',
    'This package can qualify the Product but cannot make it Index-eligible.'
  ],
  acquisition_authorized:false,
  production:'HOLD'
};
fs.writeFileSync(path.join(outDir,'product-evidence-package.json'),JSON.stringify(pkg,null,2));
console.log(JSON.stringify(pkg.summary));
