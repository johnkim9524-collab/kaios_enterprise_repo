#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const inPath=process.argv[2]||'input/product-evidence-package.json';
const outDir=process.argv[3]||'out/assessment';
fs.mkdirSync(outDir,{recursive:true});
const p=JSON.parse(fs.readFileSync(inPath,'utf8'));
const productChecks={
  assertions_40:p.summary.validated_assertion_count>=40,
  independent_families_5:p.summary.independent_source_family_count>=5,
  identity_families_3:p.summary.canonical_identity_family_count>=3,
  identity_resolvable:p.product_gate_inputs.identity_resolvable===true,
  collectible_thesis:p.product_gate_inputs.collectible_thesis_explicit===true,
  non_utility:p.product_gate_inputs.non_utility_differentiation_material===true,
  scarcity_significance:p.product_gate_inputs.scarcity_or_significance_axis_present===true,
  authentication_model:p.product_gate_inputs.authentication_model_present===true,
  condition_model:p.product_gate_inputs.condition_grade_model_present===true,
  market_or_institutional:p.product_gate_inputs.market_or_institutional_evidence_present===true,
  commodity_only_false:p.product_gate_inputs.commodity_only===false,
  no_raw_republication:p.summary.raw_content_republished===false,
  no_shortcut:p.summary.discovery_to_qualification_shortcut===false
};
const productPass=Object.values(productChecks).every(Boolean);
const m=p.market_gate_inputs;
const indexChecks={
  market_observations:m.verified_sold_market_observation_count>=m.required_minimum_market_observations,
  regions:m.empirical_region_count>=m.required_minimum_regions,
  time_depth:m.empirical_time_depth_months>=m.required_minimum_time_depth_months,
  transaction_families:m.sold_transaction_family_count>=m.required_transaction_family_floor
};
const indexPass=Object.values(indexChecks).every(Boolean);
const assessment={
  assessment_id:'assessment-black-lotus-product-qualification-v1',
  input_evidence_package_id:p.evidence_package_id,
  track:'TRACK_B',
  independence_boundary:'EVIDENCE_PACKAGE_ONLY_NO_PORTAL_OR_BUSINESS_INPUT',
  product_checks:productChecks,
  index_checks:indexChecks,
  collectible_qualification:productPass?'PASS':'BLOCKED',
  representative_product_qualification:productPass?'PASS':'BLOCKED',
  lifecycle_state:productPass?'REPRESENTATIVE_QUALIFIED':'COLLECTIBLE_CANDIDATE',
  index_eligibility:indexPass?'PASS':'HOLD_MARKET_EVIDENCE',
  public_index_eligible:indexPass,
  portal_projection_eligible_internal:productPass,
  recommendation:productPass?(indexPass?'QUALIFIED_AND_INDEX_ELIGIBLE':'QUALIFIED_PRODUCT_INDEX_HOLD'):'BLOCKED',
  thresholds_relaxed:false,
  production:'HOLD'
};
fs.writeFileSync(path.join(outDir,'track-b-assessment.json'),JSON.stringify(assessment,null,2));
console.log(JSON.stringify({recommendation:assessment.recommendation,index:assessment.index_eligibility}));
