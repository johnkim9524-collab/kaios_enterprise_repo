#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const preflightPath='coordination/kidults/source-intelligence/asi-v2-1-official-preflight-observation-v1.json';
const outDir=process.env.OUTPUT_DIR||process.argv[2]||'out';
fs.mkdirSync(outDir,{recursive:true});
const p=JSON.parse(fs.readFileSync(preflightPath,'utf8'));
const obs=p.observations.find(x=>x.representative_product_id==='rp-automobiles-mobility-bmw-r90s');
if(!obs) throw new Error('BMW R90S preflight observation missing');
if(obs.rights_state!=='VERIFIED_CC0_STRUCTURED_DATA') throw new Error('BMW structured-data rights regression');
if(obs.primary_authority!==false) throw new Error('Wikidata must not be promoted to Primary Authority');

const productId=obs.representative_product_id;
const marketCellId=`pmc:${productId}:global-planning-v1`;
const missingRoles=['PRIMARY_AUTHORITY','AUTHENTICATION_CONDITION','SOLD_TRANSACTION','AUCTION_PRIVATE_SALE'];
const evidencePackage={
  id:'evidence-package-bmw-r90s-failclosed-v1',
  version:'1.0.0',
  status:'PARTIAL_METADATA_ONLY_NOT_QUALIFIED',
  representative_product_id:productId,
  market_cell_id:marketCellId,
  evidence:[{
    evidence_id:'ev-bmw-r90s-wikidata-structured-metadata-v1',
    source_family:obs.source_family,
    source_roles:obs.source_role_fit,
    endpoint_url:obs.endpoint_url,
    rights_state:obs.rights_state,
    commercial_use_state:obs.commercial_use_state,
    field_level_reuse_state:obs.field_level_reuse_state,
    provenance:{preflight_contract:p.id,candidate_id:obs.candidate_id,official_evidence:obs.official_evidence},
    admission_state:'ADMITTED_BOUNDED_STRUCTURED_METADATA_ONLY',
    qualification_weight:'REFERENCE_ONLY_NOT_PRIMARY_AUTHORITY'
  }],
  required_source_role_gaps:missingRoles,
  evidence_sufficiency_state:'INSUFFICIENT',
  collectible_qualification_state:'HOLD_EVIDENCE_INSUFFICIENT',
  representative_qualification_state:'HOLD_EVIDENCE_INSUFFICIENT',
  global_empirical_coverage_state:'PENDING',
  acquisition_authorized:false,
  production:'HOLD'
};

const trackBInput={
  snapshot_id:'candidate-product-centric-bmw-r90s-v1',
  snapshot_status:'DRAFT_CANDIDATE',
  representative_product_id:productId,
  market_cell_id:marketCellId,
  evidence_package_id:evidencePackage.id,
  evidence_sufficiency_state:evidencePackage.evidence_sufficiency_state,
  missing_source_roles:missingRoles,
  rights_coverage_state:'PARTIAL_ONE_REFERENCE_SOURCE_ONLY',
  source_independence_state:'INSUFFICIENT_SINGLE_FAMILY',
  provenance_coverage_state:'PARTIAL',
  production:'HOLD'
};

const assessment={
  assessment_id:'assessment-product-centric-bmw-r90s-v1',
  input_snapshot_id:trackBInput.snapshot_id,
  evidence_package_id:evidencePackage.id,
  track:'B',
  independence_boundary:'ASSESSMENT_FROM_IMMUTABLE_PACKAGE_ONLY',
  collectible_qualification:'BLOCKED',
  representative_qualification:'BLOCKED',
  market_cell_completeness:'BLOCKED',
  evidence_sufficiency:'BLOCKED',
  source_independence:'BLOCKED',
  rights_access:'PARTIAL_PASS_REFERENCE_METADATA_ONLY',
  global_empirical_coverage:'NOT_VERIFIED',
  publication_eligibility:false,
  index_eligibility:false,
  recommendation:'BLOCKED',
  blockers:missingRoles.map(role=>`GAP_SOURCE_ROLE:${role}`),
  production:'HOLD'
};

const projection={
  projection_id:'projection-bmw-r90s-transparency-v1',
  representative_product_id:productId,
  market_cell_id:marketCellId,
  lifecycle_state:'EVIDENCE_PARTIAL_TRACK_B_BLOCKED',
  evidence_sufficiency_state:'INSUFFICIENT',
  missing_source_roles:missingRoles,
  provenance_summary:{evidence_count:1,source_families:1,structured_metadata_rights:'CC0'},
  lineage_summary:{state:obs.owner_lineage_state},
  rights_state:'PARTIAL_REFERENCE_METADATA_ONLY',
  freshness_state:'NOT_VERIFIED',
  confidence_classification:'NOT_VERIFIED',
  limitations:['Primary authority evidence missing','Authentication/condition evidence missing','Sold transaction evidence missing','Auction/private-sale evidence missing','Global empirical coverage pending'],
  contradictions:[],
  track_b_assessment_state:'BLOCKED',
  publication_eligibility:false,
  index_eligibility:false,
  portal_render_state:'PARTIAL_NOT_VERIFIED',
  eos_state:'BLOCKED_EVIDENCE_GAPS',
  provider_direct_access:false,
  missing_to_zero:false,
  production:'HOLD'
};

for(const [name,obj] of Object.entries({'evidence-package.json':evidencePackage,'track-b-input.json':trackBInput,'track-b-assessment.json':assessment,'projection.json':projection})) fs.writeFileSync(path.join(outDir,name),JSON.stringify(obj,null,2));
console.log(JSON.stringify({status:'PASS',product:productId,evidence_package:evidencePackage.status,track_b:assessment.recommendation,projection:projection.portal_render_state,missing_roles:missingRoles,production:'HOLD'},null,2));