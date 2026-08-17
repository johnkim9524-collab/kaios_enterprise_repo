#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const e=JSON.parse(fs.readFileSync(process.argv[2]||'input/product-evidence-package.json','utf8'));
const a=JSON.parse(fs.readFileSync(process.argv[3]||'input/track-b-assessment.json','utf8'));
const outDir=process.argv[4]||'out/projection';
fs.mkdirSync(outDir,{recursive:true});
if(a.input_evidence_package_id!==e.evidence_package_id) throw new Error('assessment/evidence identity mismatch');
const projection={
  projection_id:'projection-black-lotus-product-qualification-v1',
  representative_product_id:e.representative_product_id,
  display_name:'Wizards of the Coast — Magic: The Gathering Alpha Black Lotus',
  lifecycle_state:a.lifecycle_state,
  collectible_qualification:a.collectible_qualification,
  representative_product_qualification:a.representative_product_qualification,
  index_eligibility:a.index_eligibility,
  intelligence_state:a.representative_product_qualification==='PASS'?'VERIFIED_PRODUCT_MARKET_PARTIAL':'NOT_VERIFIED',
  evidence_summary:{assertions:e.summary.validated_assertion_count,source_families:e.summary.independent_source_family_count},
  confidence_class:a.representative_product_qualification==='PASS'?'HIGH_PRODUCT_IDENTITY_MEDIUM_MARKET':'NOT_VERIFIED',
  market_state:a.index_eligibility==='PASS'?'VERIFIED':'PARTIAL_NOT_INDEX_ELIGIBLE',
  limitations:e.limitations,
  rights_summary:e.source_families.map(x=>({source_family:x.source_family,rights_state:x.rights_state,acquisition_authorized:x.acquisition_authorized})),
  portal:{consume_projection_only:true,render_state:a.representative_product_qualification==='PASS'?'VERIFIED_PRODUCT_MARKET_PARTIAL':'NOT_VERIFIED',local_ranking:false,missing_to_zero:false},
  ih_eos:{consume_canonical_state_only:true,render_state:a.recommendation,blocker:a.index_eligibility==='PASS'?null:'MARKET_EVIDENCE_DEPTH'},
  publication:{product_profile_internal:a.representative_product_qualification==='PASS',kidult_index:false,public_claims:false},
  production:'HOLD'
};
fs.writeFileSync(path.join(outDir,'projection.json'),JSON.stringify(projection,null,2));
