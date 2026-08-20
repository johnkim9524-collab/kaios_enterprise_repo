import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const contract=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/asi-regional-data-usability-factor-r1.json','utf8'));
const baseline=JSON.parse(await fs.readFile(process.argv[2]||'/tmp/empirical-regional-baseline-wave1-r1.json','utf8'));
const obs=JSON.parse(await fs.readFile(process.argv[3]||'/tmp/musicbrainz-regional-catalog-observation-r1.json','utf8'));
const out=process.argv[4]||'/tmp/empirical-regional-baseline-with-data-usability-r1.json';
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
if(baseline.production!=='HOLD'||obs.production!=='HOLD'||contract.production!=='HOLD')throw new Error('PRODUCTION_BOUNDARY');
if(obs.source_id!==contract.source_id||obs.purpose!==contract.source_purpose||obs.rights_state!==contract.verification_rule.rights_state_required)throw new Error('SOURCE_PURPOSE_RIGHTS_BOUNDARY');
if(obs.factor_eligibility!=='NOT_VERIFIED'||obs.market_scale_claim!==false||obs.transaction_activity_claim!==false||obs.current_market_claim!==false||obs.global_weight_claim!==false)throw new Error('UPSTREAM_OBSERVATION_OVERCLAIM');
const dims={
  RIGHTS_AND_REUSE_CLARITY: obs.rights_state==='ALLOW_CORE_CC0',
  MACHINE_READABLE_STRUCTURED_ACCESS: /^https:\/\/musicbrainz\.org\/ws\/2\/release\//.test(String(obs.query_reference||'')),
  EXPLICIT_COUNTRY_REGION_BINDING: Number(obs.region_bound_observation_count||0)>0,
  CANONICAL_IDENTITY_FIELDS: (obs.observations||[]).length>0&&(obs.observations||[]).every(o=>o.release_mbid&&o.release_group_mbid&&o.title&&o.format==='Vinyl'),
  PROVENANCE_AND_PAYLOAD_DIGEST: /^sha256:/.test(String(obs.query_response_sha256||''))&&(obs.observations||[]).every(o=>/^sha256:/.test(String(o.source_projection_sha256||''))&&o.source_reference),
  DATED_OBSERVATION_OR_RELEASE_TIME: (obs.observations||[]).length>0&&(obs.observations||[]).every(o=>/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(String(o.release_date||''))),
  TRANSACTION_PRICE_CURRENCY_VENUE_COMPLETENESS: false
};
for(const d of contract.verification_rule.required_present_dimensions)if(!dims[d])throw new Error(`REQUIRED_USABILITY_DIMENSION_MISSING:${d}`);
let score=0;const scoreDetail={};
for(const [name,cfg] of Object.entries(contract.score_dimensions)){const pass=!!dims[name];const contribution=pass?Number(cfg.weight||0)*Number(cfg.pass_value||1):0;score+=contribution;scoreDetail[name]={pass,weight:cfg.weight,contribution:Number(contribution.toFixed(6))};}
score=Number(score.toFixed(6));
if(score<0||score>1)throw new Error('SCORE_RANGE');
const regionCounts=obs.macroregion_counts||{};
const canonicalRegions=new Set((baseline.cells||[]).map(c=>c.macroregion_id));
const exactCells=[];
for(const [region,countRaw] of Object.entries(regionCounts)){
  const count=Number(countRaw||0);if(count<contract.verification_rule.minimum_region_observations||!canonicalRegions.has(region))continue;
  const evidenceRefs=[obs.query_response_sha256,obs.query_reference,`source:${obs.source_id}`,`region:${region}`,`observations:${count}`];
  const canonicalFactor={state:'VERIFIED',value:score,confidence:'MEDIUM',classification:'MEDIUM_SINGLE_SOURCE_OWNER_CEILING',evidence_refs:evidenceRefs,rights_state:'ALLOW_CORE_CC0',provenance_refs:[obs.id,...(obs.license_evidence_refs||[])],methodology_ref:contract.id,score_detail:scoreDetail,source_owner_count:1,region_observation_count:count,reason:'RIGHTS_CLEARED_STRUCTURED_REGION_BOUND_VINYL_CATALOG_EVIDENCE_WITH_TRANSACTION_FIELDS_EXPLICITLY_ABSENT'};
  exactCells.push({category_scope:contract.category_scope,macroregion_id:region,country_scope:[],factors:{[contract.canonical_factor]:canonicalFactor,[contract.feedback_alias]:{...canonicalFactor,alias_of:contract.canonical_factor}},collection_quota:null,analytical_weight:null,coverage_debt:null,eligibility:'VERIFIED_BOUNDED_DATA_USABILITY_ONLY',structural_bootstrap_target:null,bootstrap_is_market_share:false,region_bound_admitted_source_count:1,region_bound_observation_count:count,truth_boundary:'This cell verifies bounded data usability only; it does not verify market scale, maturity, demand, transaction activity, liquidity or regional weight.'});
}
if(!exactCells.length)throw new Error('NO_CANONICAL_REGION_FACTOR_CELLS');
const artifact={...baseline,id:'kidults-empirical-regional-baseline-with-data-usability-r1',parent_baseline_id:baseline.snapshot_id||baseline.id,category_specific_factor_contract:contract.id,cells:[...(baseline.cells||[]),...exactCells],category_specific_factor_summary:{category_scope:contract.category_scope,canonical_factor:contract.canonical_factor,feedback_alias:contract.feedback_alias,state:'VERIFIED',score,confidence:'MEDIUM',verified_region_cells:exactCells.length,regions:exactCells.map(c=>c.macroregion_id),source_owner_count:1,market_scale_verified:false,market_maturity_verified:false,transaction_activity_verified:false},factor_overlay_digest:sha(exactCells),production:'HOLD',public_release:'HOLD'};
await fs.writeFile(out,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',category:contract.category_scope,factor:contract.canonical_factor,feedback_alias:contract.feedback_alias,score,confidence:'MEDIUM',verified_region_cells:exactCells.length,regions:exactCells.map(c=>c.macroregion_id),market_scale_verified:false,transaction_activity_verified:false,production:'HOLD'}));
