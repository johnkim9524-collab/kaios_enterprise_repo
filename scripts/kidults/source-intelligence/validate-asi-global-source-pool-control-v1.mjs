#!/usr/bin/env node
import fs from 'node:fs';
const path=process.argv[2]||'coordination/kidults/source-intelligence/asi-global-source-pool-control-v1.json';
const v=JSON.parse(fs.readFileSync(path,'utf8'));
const assert=(x,c)=>{if(!x)throw new Error(c)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
assert(v.id==='kidults-asi-global-source-pool-control-v1'&&v.version==='1.2.0','IDENTITY');
assert(v.owner==='KPMO','OWNER');
assert(v.authoritative_baseline.registered_source_profiles===16,'REGISTERED');
assert(v.authoritative_baseline.source_profile_discovery_requirements===120,'DISCOVERY');
assert(v.authoritative_baseline.schema_bound_claim_parser_requirements===33,'SCHEMA');
assert(v.authoritative_baseline.accountable_gap_records===153,'GAP_TOTAL');
assert(v.authoritative_baseline.rights_clear_for_purpose===0&&v.authoritative_baseline.live_activated_adapters===0,'NO_FALSE_ACTIVATION');
assert(v.pool_layers.reduce((n,x)=>n+(['DISCOVERY_DEMAND','SCHEMA_BOUND_DEMAND'].includes(x.layer)?x.count:0),0)===153,'DEMAND_RECONCILIATION');
assert(v.pool_layers.find(x=>x.layer==='QUARANTINED_OBSERVATION')?.count===50,'QUARANTINE_COUNT');
const fields=new Set(v.mandatory_source_record_fields);
for(const f of ['source_id','vertical','official_owner','official_url','freshness_class','rights.collect','rights.store','rights.derive','rights.commercial_use','decision','claim_ceiling','accountable_owner','ack_sla','resolution_sla','fallback_source_ids'])assert(fields.has(f),'MISSING_FIELD:'+f);
assert(v.product_value_gate?.gate_order==='PRODUCT_VALUE_BEFORE_ACQUISITION_PRIORITY','VALUE_GATE_ORDER');
assert(same(v.product_value_gate?.eligible_verticals,['toys-models','watches-jewelry','automobiles-mobility','fashion-accessories','design-furniture','technology-cameras','gaming-music-screen','cards-comics-memorabilia']),'VALUE_GATE_CANONICAL_VERTICALS');
assert(v.product_value_gate?.canonical_domain_source==='coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv','VALUE_GATE_DOMAIN_SOURCE');
assert(v.product_value_gate?.weighted_score?.minimum_active_pool_score===70,'VALUE_GATE_THRESHOLD');
assert(Object.values(v.product_value_gate.weighted_score).filter(Number.isFinite).reduce((a,b)=>a+b,0)===170,'VALUE_GATE_WEIGHT_AND_THRESHOLD_ACCOUNTING');
assert(Object.entries(v.product_value_gate.weighted_score).filter(([k])=>k!=='minimum_active_pool_score').reduce((n,[,x])=>n+x,0)===100,'VALUE_GATE_WEIGHTS');
assert(v.product_value_gate?.hard_minimum?.primary_object_identifier_required===true&&v.product_value_gate?.hard_minimum?.provenance_required===true,'VALUE_HARD_MINIMUM');
assert(v.product_value_gate?.forbidden_proxy_metrics?.includes('open_access_alone'),'OPEN_ACCESS_PROXY_FORBIDDEN');
assert(v.product_value_gate?.portfolio_rules?.minimum_independent_sources_per_active_vertical===2,'SOURCE_RESILIENCE_MINIMUM');
for(const f of ['customer_decisions','product_surfaces','value_score','marginal_value_vs_existing_pool','coverage_gap_ids'])assert(fields.has(f),'MISSING_VALUE_FIELD:'+f);
assert(v.queue_policy?.priority_order?.[0]==='PRODUCT_VALUE_SCORE_DESC','VALUE_PRIORITY');
assert(v.truth_boundary?.open_source_is_product_value===false,'OPEN_NOT_VALUE');
assert(same(v.operationalization?.stage_order,['DISCOVERY_METADATA','PRODUCT_VALUE_ENRICHMENT','PRODUCT_VALUE_GATE','RIGHTS_REVIEW','SCHEMA_REVIEW','BOUNDED_COHORT','EVIDENCE','TRACK_B','PROJECTION']),'STAGE_ORDER');
assert(v.operationalization?.hourly_gate_position==='AFTER_DISCOVERY_BEFORE_GATE1_RIGHTS','HOURLY_GATE_POSITION');
assert(v.operationalization?.baseline_backfill?.curated_rows===64&&v.operationalization?.baseline_backfill?.adapter_profiles===16&&v.operationalization?.baseline_backfill?.discovery_requirements===120&&v.operationalization?.baseline_backfill?.schema_requirements===33,'BACKFILL_SCOPE');
assert(v.operationalization?.portfolio_target?.minimum_total_value_eligible_sources===16&&v.operationalization?.portfolio_target?.preferred_total_value_eligible_sources===24,'PORTFOLIO_TARGET');
assert(v.operationalization?.durable_ledger?.backend==='POSTGRESQL'&&v.operationalization?.durable_ledger?.state==='ACTIVATION_HOLD'&&v.operationalization?.durable_ledger?.artifact_only_is_durable===false,'DURABLE_LEDGER_TRUTH');
assert(same(v.decisions,['PASS','CONDITIONAL','HOLD','NO_GO']),'DECISIONS');
for(const atom of ['collect','store','derive','commercial_use'])assert(v.provider_operation_receipt.required_fields.includes(atom),'RECEIPT_RIGHT:'+atom);
for(const f of ['exact_head_sha','workflow_run_id','workflow_run_attempt','approval_nonce','expires_at'])assert(v.provider_operation_receipt.required_fields.includes(f),'RECEIPT_BINDING:'+f);
assert(v.provider_operation_receipt.independent_issuer_required===true&&v.provider_operation_receipt.self_authored_receipt_forbidden===true,'INDEPENDENT_RECEIPT');
assert(v.provider_operation_receipt.expiry_fail_closed===true&&v.provider_operation_receipt.replay_fail_closed===true,'RECEIPT_FAIL_CLOSED');
assert(v.seaport_boundary.prior_pr===1626&&v.seaport_boundary.state==='QUARANTINED_CONTROL_ONLY','SEAPORT_STATE');
assert(v.seaport_boundary.recurring_external_lane_authorized===false&&v.seaport_boundary.promotable===false&&v.seaport_boundary.sold_claim===false,'SEAPORT_PROMOTION');
for(const marker of ['eth_chainId equals pinned chain','exact receipt-log tuple match','block hash match','minimum finality met','no network call on unauthorized path'])assert(v.seaport_boundary.reactivation_requirements.includes(marker),'SEAPORT_GATE:'+marker);
assert(v.queue_policy.canonical_key==='source_id:purpose:claim_class'&&v.queue_policy.duplicate_active_work_forbidden===true,'DEDUPE');
assert(v.queue_policy.resolution_runs.DISCOVERY_DEMAND===5&&v.queue_policy.resolution_runs.SCHEMA_BOUND_DEMAND===3,'SLA');
assert(v.truth_boundary.main_scope_validated===true&&v.truth_boundary.production_authorized===false,'AUTHORITY');
assert(v.truth_boundary.public==='HOLD'&&v.truth_boundary.production==='HOLD'&&v.truth_boundary.g5==='HOLD','RELEASE');
const mutate=x=>JSON.parse(JSON.stringify(x));
for(const [code,fn] of [
 ['SELF_AUTHORED_RECEIPT',x=>x.provider_operation_receipt.self_authored_receipt_forbidden=false],
 ['LIVE_LANE_PROMOTION',x=>x.seaport_boundary.recurring_external_lane_authorized=true],
 ['SOLD_RELABEL',x=>x.seaport_boundary.sold_claim=true],
 ['PRODUCTION_ESCALATION',x=>x.truth_boundary.production_authorized=true],
]){
 const m=mutate(v); fn(m);
 let rejected=false;
 try{
  assert(m.provider_operation_receipt.self_authored_receipt_forbidden===true,'SELF_AUTHORED_RECEIPT');
  assert(m.seaport_boundary.recurring_external_lane_authorized===false,'LIVE_LANE_PROMOTION');
  assert(m.seaport_boundary.sold_claim===false,'SOLD_RELABEL');
  assert(m.truth_boundary.production_authorized===false,'PRODUCTION_ESCALATION');
 }catch{rejected=true}
 assert(rejected,'NEGATIVE_MUTATION_ACCEPTED:'+code);
}
{
 const m=mutate(v);m.product_value_gate.weighted_score.minimum_active_pool_score=0;
 let rejected=false;try{assert(m.product_value_gate.weighted_score.minimum_active_pool_score===70,'VALUE_THRESHOLD_WEAKENED')}catch{rejected=true}
 assert(rejected,'VALUE_THRESHOLD_MUTATION_ACCEPTED');
}
console.log(JSON.stringify({suite:'KIDULTS_ASI_GLOBAL_SOURCE_POOL_CONTROL_V1',result:'PASS',managed_profiles:16,managed_gap_requirements:153,quarantined_observations:50,rights_clear:0,live_adapters:0,public:'HOLD',production:'HOLD',g5:'HOLD'},null,2));
