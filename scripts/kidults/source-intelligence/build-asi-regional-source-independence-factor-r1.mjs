import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const contract=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/asi-regional-source-independence-factor-r1.json','utf8'));
const baseline=JSON.parse(await fs.readFile(process.argv[2]||'/tmp/empirical-regional-baseline-with-data-usability-r1.json','utf8'));
const mb=JSON.parse(await fs.readFile(process.argv[3]||'/tmp/musicbrainz-regional-catalog-observation-r1.json','utf8'));
const wd=JSON.parse(await fs.readFile(process.argv[4]||'/tmp/wikidata-regional-vinyl-catalog-observation-r1.json','utf8'));
const out=process.argv[5]||'/tmp/empirical-regional-baseline-wave2-source-independence-r1.json';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;

if(contract.production!=='HOLD'||baseline.production!=='HOLD'||wd.production!=='HOLD'||mb.production!=='HOLD')throw new Error('PRODUCTION_BOUNDARY');
if(baseline.public_release!=='HOLD'||wd.public_release!=='HOLD'||mb.public_release!=='HOLD')throw new Error('PUBLIC_RELEASE_BOUNDARY');
const req=new Map(contract.required_sources.map(x=>[x.source_id,x]));
for(const src of [mb,wd]){
  const expected=req.get(src.source_id);if(!expected)throw new Error(`UNEXPECTED_SOURCE:${src.source_id}`);
  if(src.source_owner_id!==expected.source_owner_id||src.rights_state!==expected.rights_state||src.purpose!==expected.purpose)throw new Error(`SOURCE_BINDING:${src.source_id}`);
  if(src.factor_eligibility!=='NOT_VERIFIED'||src.market_scale_claim!==false||src.transaction_activity_claim!==false||src.current_market_claim!==false||src.global_weight_claim!==false)throw new Error(`UPSTREAM_OVERCLAIM:${src.source_id}`);
}
if(mb.source_owner_id===wd.source_owner_id)throw new Error('SOURCE_OWNER_COLLISION');
if(mb.query_reference===wd.query_reference||mb.transport_state===wd.transport_state)throw new Error('SEPARATE_TRANSPORT_NOT_PROVEN');

const minObs=Number(contract.verification_rule.minimum_region_observations_per_owner||2);
const mbCounts=mb.macroregion_counts||{},wdCounts=wd.macroregion_counts||{};
const eligibleRegions=[...new Set([...Object.keys(mbCounts),...Object.keys(wdCounts)])].filter(r=>Number(mbCounts[r]||0)>=minObs&&Number(wdCounts[r]||0)>=minObs).sort();
if(!eligibleRegions.length)throw new Error('NO_MULTI_OWNER_REGION_OVERLAP');

const dims={
  INDEPENDENT_SOURCE_OWNERS: new Set([mb.source_owner_id,wd.source_owner_id]).size>=2,
  RIGHTS_AND_REUSE_CLARITY: mb.rights_state==='ALLOW_CORE_CC0'&&wd.rights_state==='ALLOW_CC0',
  EXPLICIT_REGION_BINDING_BY_BOTH: eligibleRegions.length>0,
  SEPARATE_READ_ONLY_TRANSPORTS: mb.query_reference!==wd.query_reference&&mb.transport_state!==wd.transport_state,
  SOURCE_REMOVAL_LEAVES_REAL_OBSERVATIONS: eligibleRegions.every(r=>Number(mbCounts[r]||0)>=minObs&&Number(wdCounts[r]||0)>=minObs),
  UNDERLYING_FACT_LINEAGE_INDEPENDENCE_PROVEN: false
};
let score=0;const scoreDetail={};
for(const [name,cfg] of Object.entries(contract.score_dimensions)){const pass=!!dims[name];const contribution=pass?Number(cfg.weight||0)*Number(cfg.pass_value||1):0;score+=contribution;scoreDetail[name]={pass,weight:Number(cfg.weight||0),contribution:Number(contribution.toFixed(6))};}
score=Number(score.toFixed(6));
if(score<0||score>1)throw new Error('SCORE_RANGE');

let verifiedCells=0;
const updatedCells=(baseline.cells||[]).map(cell=>{
  if(cell.category_scope!==contract.category_scope||!eligibleRegions.includes(cell.macroregion_id))return cell;
  const region=cell.macroregion_id,mbCount=Number(mbCounts[region]||0),wdCount=Number(wdCounts[region]||0);
  const evidenceRefs=[mb.query_response_sha256,mb.query_reference,wd.query_response_sha256,wd.query_reference,`musicbrainz_observations:${mbCount}`,`wikidata_observations:${wdCount}`,`region:${region}`];
  const factor={
    state:'VERIFIED',value:score,confidence:'MEDIUM',classification:'MEDIUM_TWO_OWNER_TRANSPORT_INDEPENDENCE_FACT_LINEAGE_DEPENDENCE_NOT_PROVEN',
    evidence_refs:evidenceRefs,rights_state:'ALLOW_MULTI_OWNER_CC0',provenance_refs:[mb.id,wd.id,...(mb.license_evidence_refs||[]),...(wd.license_evidence_refs||[])],
    methodology_ref:contract.id,score_detail:scoreDetail,source_owner_count:2,source_owner_ids:[mb.source_owner_id,wd.source_owner_id],
    region_observation_count_by_owner:{[mb.source_owner_id]:mbCount,[wd.source_owner_id]:wdCount},
    source_removal_sensitivity:{
      remove_musicbrainz:{remaining_owner_count:1,remaining_observations:wdCount,factor_state:'NOT_VERIFIED_MULTI_OWNER'},
      remove_wikidata:{remaining_owner_count:1,remaining_observations:mbCount,factor_state:'NOT_VERIFIED_MULTI_OWNER'}
    },
    underlying_fact_lineage_independence_proven:false,
    reason:'TWO_SEPARATELY_OWNED_RIGHTS_CLEARED_REGION_BOUND_STRUCTURED_CATALOG_SURFACES;_UNDERLYING_FACT_LINEAGE_INDEPENDENCE_NOT_PROVEN'
  };
  verifiedCells++;
  return {...cell,factors:{...(cell.factors||{}),[contract.canonical_factor]:factor},region_bound_admitted_source_count:Math.max(Number(cell.region_bound_admitted_source_count||0),2),truth_boundary:'This cell verifies bounded two-owner source/transport independence for regional vinyl catalog evidence only; it does not verify market scale, maturity, demand, transaction activity, liquidity, price or regional analytical weight.'};
});
if(!verifiedCells)throw new Error('NO_BASELINE_CELLS_PROMOTED');

const artifact={...baseline,id:'kidults-empirical-regional-baseline-wave2-source-independence-r1',parent_baseline_id:baseline.id,source_independence_contract:contract.id,cells:updatedCells,
  source_independence_summary:{category_scope:contract.category_scope,canonical_factor:contract.canonical_factor,state:'VERIFIED',score,confidence:'MEDIUM',verified_region_cells:verifiedCells,regions:eligibleRegions,source_owner_count:2,source_owner_ids:[mb.source_owner_id,wd.source_owner_id],underlying_fact_lineage_independence_proven:false,market_scale_verified:false,market_maturity_verified:false,transaction_activity_verified:false},
  source_removal_sensitivity_state:'PASS_FAILS_MULTI_OWNER_AS_EXPECTED',factor_overlay_digest:sha(updatedCells.filter(c=>c.category_scope===contract.category_scope&&c.factors?.[contract.canonical_factor])),production:'HOLD',public_release:'HOLD'};
await fs.writeFile(out,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',factor:contract.canonical_factor,score,confidence:'MEDIUM',verified_region_cells:verifiedCells,regions:eligibleRegions,source_owner_count:2,underlying_fact_lineage_independence_proven:false,market_scale_verified:false,transaction_activity_verified:false,production:'HOLD'}));
