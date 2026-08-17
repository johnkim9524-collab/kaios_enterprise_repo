#!/usr/bin/env node
import fs from 'node:fs';

const p='coordination/kidults/e2e/canonical-product-vertical-slice-contract-v1.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(c.production!=='HOLD') fail('Production must remain HOLD');
if(c.g5_requested!==false) fail('G5 must not be requested');
for(const k of ['autonomous','global','irreplaceable_value','transparent']) if(!c.north_star?.[k]) fail(`missing north-star ${k}`);
for(const s of ['SPECIALIST_CONNECTOR','RIGHTS_ACCESS_PREFLIGHT','EVIDENCE_ADMISSION','TRACK_B_INDEPENDENT_ASSESSMENT','PROJECTION_REGISTRY','PORTAL_IH_EOS_API_REPORTS']) if(!c.canonical_flow.includes(s)) fail(`missing flow ${s}`);
for(const f of ['representative_product_id','market_cell_id','assertion_id','demand_instance_id','source_id','evidence_id','snapshot_id','assessment_id','projection_id']) if(!c.immutable_identity_chain.includes(f)) fail(`missing identity ${f}`);
for(const x of ['DISCOVERY_TO_EVIDENCE_WITHOUT_ADMISSION','UNKNOWN_RIGHTS_TO_PASS','MISSING_TO_ZERO','PORTAL_LOCAL_RANKING_OR_QUALIFICATION','TRACK_A_SELF_APPROVAL_AS_TRACK_B']) if(!c.prohibited_promotions.includes(x)) fail(`missing prohibition ${x}`);
if(c.consumer_rules?.portal_projection_only!==true) fail('Portal must be Projection-only');
if(c.consumer_rules?.eos_canonical_lifecycle_only!==true) fail('EOS must consume canonical lifecycle only');
if(c.consumer_rules?.missing_to_zero!==false) fail('missing-to-zero regression');
if(c.track_b_input_boundary?.length!==2 || c.track_b_output_boundary?.length!==1) fail('Track B boundary regression');
console.log(JSON.stringify({status:'PASS',flow_steps:c.canonical_flow.length,north_star:c.north_star,production:c.production},null,2));