import fs from 'node:fs';

const base='coordination/kidults/scope-data';
const core=JSON.parse(fs.readFileSync(`${base}/global-collectibles-common-core-v1.json`,'utf8'));
const archetypes=JSON.parse(fs.readFileSync(`${base}/market-archetypes-v1.json`,'utf8'));
const matrix=JSON.parse(fs.readFileSync(`${base}/collection-scope-data-requirement-matrix-v1.json`,'utf8'));
const contract=JSON.parse(fs.readFileSync(`${base}/scope-intelligence-contract-v1.json`,'utf8'));

const fail=(m)=>{throw new Error(m)};
if(matrix.scope_count!==32 || matrix.scopes.length!==32) fail('scope_count must be 32');
const ids=new Set(matrix.scopes.map(s=>s.id));
if(ids.size!==32) fail('scope IDs must be unique');
const domains={};
for(const s of matrix.scopes){
  domains[s.domain]=(domains[s.domain]||0)+1;
  if(!s.question || s.question.length<40) fail(`irreplaceable question too weak: ${s.id}`);
}
if(Object.keys(domains).length!==8) fail('must have 8 core domains');
for(const [d,n] of Object.entries(domains)) if(n!==4) fail(`${d} must contain 4 scopes`);
const allowed=new Set(archetypes.archetypes.map(a=>a.archetype_id));
if(allowed.size!==7) fail('must define exactly 7 reusable archetypes');
for(const s of matrix.scopes) if(!allowed.has(s.archetype)) fail(`unknown archetype: ${s.id}`);
if(core.common_core.north_star.join('|')!=='AUTONOMOUS|GLOBAL|IRREPLACEABLE_VALUE|TRANSPARENT') fail('north-star contract mismatch');
if(!contract.execution_order.includes('irreplaceable_output')) fail('output-first contract missing');
if(!contract.required_scope_fields.includes('provider_candidate_fields')) fail('provider gap field missing');
if(core.quality_gate.overall_min<85) fail('quality gate too weak');
console.log(JSON.stringify({status:'PASS',scopes:32,domains:8,archetypes:7,north_star:core.common_core.north_star,quality_gate:core.quality_gate.overall_min},null,2));