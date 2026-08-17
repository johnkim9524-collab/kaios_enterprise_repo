import fs from 'node:fs';

const p='coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json';
const w='coordination/kidults/scope-data/scope-self-collected-poc-wave-v1.json';
const m=JSON.parse(fs.readFileSync(p,'utf8'));
const poc=JSON.parse(fs.readFileSync(w,'utf8'));
const fail=(x)=>{console.error('FAIL',x);process.exit(1)};
if(m.scope_count!==32||m.scopes.length!==32) fail('scope_count');
const ids=new Set();
for(const s of m.scopes){
  if(ids.has(s.scope_id)) fail(`duplicate ${s.scope_id}`); ids.add(s.scope_id);
  for(const k of ['identity_extensions','collectible_qualification_extensions','market_cell_extensions','irreplaceable_metrics','condition_extensions','self_collectable_priority','provider_candidate_after_poc','regions','north_star']){
    if(!Array.isArray(s[k])||s[k].length<3) fail(`${s.scope_id}:${k}`);
  }
  if(!s.freshness||s.freshness.market_days>7) fail(`${s.scope_id}:freshness`);
  for(const g of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) if(!s.north_star.includes(g)) fail(`${s.scope_id}:${g}`);
}
if(poc.scope_count!==32||poc.total_product_floor!==64||poc.parallel_packets.length!==8) fail('poc shape');
const covered=poc.parallel_packets.flatMap(x=>x.scopes);
if(covered.length!==32||new Set(covered).size!==32) fail('poc scope coverage');
for(const x of covered) if(!ids.has(x)) fail(`poc unknown scope ${x}`);
if(poc.program_exit.provider_negotiation!=='HOLD_UNTIL_PROGRAM_EXIT') fail('provider hold');
if(m.common_rules.provider_negotiation!=='HOLD_UNTIL_SCOPE_POC_GAP_MAP') fail('matrix provider hold');
console.log(JSON.stringify({status:'PASS',scopes:32,poc_products_floor:64,packets:8,north_star:'PASS',provider_negotiation:'HOLD'},null,2));