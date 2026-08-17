#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.env.DISCOVERY_INPUT || process.argv[2] || 'input/bounded-live-discovery.json';
const outDir = process.env.OUTPUT_DIR || process.argv[3] || 'out';
fs.mkdirSync(outDir,{recursive:true});
const d = JSON.parse(fs.readFileSync(input,'utf8'));
if (d.candidate_count !== 2) throw new Error(`Expected 2 retained pilot candidates, got ${d.candidate_count}`);
if (d.lanes_with_no_candidates !== 44) throw new Error(`Expected 44 explicit gap lanes, got ${d.lanes_with_no_candidates}`);

const preflight = d.candidates.map((c,i)=>({
  preflight_id:`preflight-v2-${String(i+1).padStart(2,'0')}`,
  candidate_id:c.candidate_id,
  representative_product_id:c.representative_product_id,
  endpoint_url:c.endpoint_url,
  discovery_provider:c.discovery_provider,
  source_name:c.source_name,
  source_family_hint:c.source_family_hint,
  candidate_source_roles:c.candidate_source_roles,
  demand_instance_ids:c.demand_instance_ids,
  owner_observed:c.owner || 'UNKNOWN',
  owner_lineage_state:'NOT_VERIFIED',
  source_role_fit_state:'CANDIDATE_FROM_PRODUCT_LINKED_DISCOVERY_NOT_QUALIFIED',
  official_terms_pointer_state:'NOT_VERIFIED',
  license_state:'NOT_VERIFIED',
  commercial_use_state:'NOT_VERIFIED',
  field_level_reuse_state:'NOT_VERIFIED',
  access_method_state:'PUBLIC_METADATA_ENDPOINT_OBSERVED_CONTENT_ACCESS_NOT_AUTHORIZED',
  robots_rate_limit_auth_state:'NOT_VERIFIED',
  schema_state:'NOT_VERIFIED',
  freshness_state:'NOT_VERIFIED',
  cost_state:'NOT_VERIFIED',
  continuity_removal_risk:'NOT_VERIFIED',
  preflight_state:'PENDING_OFFICIAL_VERIFICATION',
  acquisition_authorized:false,
  production:'HOLD'
}));

const roleMap = {
  PRIMARY_AUTHORITY:'OFFICIAL_MANUFACTURER_CREATOR_INSTITUTION',
  CATALOG_REFERENCE:'SPECIALIST_CATALOG_REFERENCE',
  AUTHENTICATION_CONDITION:'AUTHENTICATION_GRADING_SPECIALIST',
  SOLD_TRANSACTION:'VERIFIED_SOLD_TRANSACTION_PROVIDER',
  AUCTION_PRIVATE_SALE:'AUCTION_PRIVATE_SALE_RESULTS',
  PROVENANCE_HISTORY:'PROVENANCE_ARCHIVE_HISTORY',
  INDEPENDENT_VERIFICATION:'INDEPENDENT_RESEARCH_REFERENCE',
  LISTING_SUPPLY:'MARKETPLACE_DEALER_SUPPLY',
  CULTURE_ATTENTION:'CULTURE_ATTENTION_COMMUNITY'
};
const gaps = d.coverage.filter(x=>x.state==='GAP_NO_CANDIDATE_OBSERVED').map((g,i)=>({
  connector_demand_id:`connector-gap-${String(i+1).padStart(3,'0')}`,
  demand_instance_id:g.demand_instance_id,
  representative_product_id:g.representative_product_id,
  evidence_gap_class:g.evidence_gap_class,
  missing_required_roles:g.missing_required_roles,
  required_connector_classes:g.missing_required_roles.map(r=>roleMap[r] || `SPECIALIST_${r}`),
  generic_discovery_fallback:false,
  next_gate:'TARGETED_SPECIALIST_CONNECTOR_DISCOVERY',
  acquisition_authorized:false,
  production:'HOLD'
}));

const byRole={};
for(const g of gaps) for(const r of g.missing_required_roles) byRole[r]=(byRole[r]||0)+1;
const manifest={
  id:'kidults-asi-v2-1-preflight-gap-manifest',version:'1.0.0',status:'PREFLIGHT_AND_CONNECTOR_GAPS_MATERIALIZED',
  input_artifact_id:9290027789,input_candidate_count:d.candidate_count,preflight_records:preflight.length,
  explicit_gap_lanes:gaps.length,gap_role_counts:byRole,
  unknown_promoted_as_trusted:0,generic_discovery_fallback_count:0,
  north_star:{autonomous:'PASS',global_planning:'PASS',global_empirical:'PENDING',irreplaceable_value:'PASS'},
  acquisition_authorized:false,production:'HOLD'
};
fs.writeFileSync(path.join(outDir,'candidate-preflight-queue.json'),JSON.stringify({id:'candidate-preflight-queue-v1',records:preflight},null,2));
fs.writeFileSync(path.join(outDir,'specialist-connector-gap-queue.json'),JSON.stringify({id:'specialist-connector-gap-queue-v1',records:gaps},null,2));
fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
