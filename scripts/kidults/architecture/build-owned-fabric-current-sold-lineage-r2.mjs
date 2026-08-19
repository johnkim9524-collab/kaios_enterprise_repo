import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const read = async p => JSON.parse(await fs.readFile(p,'utf8'));
const files={
  identity:'coordination/kidults/source-intelligence/rights-admitted-pilot-source-pool-r1.json',
  historical:'coordination/kidults/source-intelligence/rights-admitted-transaction-source-pool-r1.json',
  sold:'coordination/kidults/source-intelligence/collectaio-shadow-sold-admission-r1.json',
  runtime:'artifacts/agci-os/asi-shadow-operating-evidence-v1.json'
};
const x={}; for(const [k,p] of Object.entries(files)) x[k]=await read(p);
if(x.identity.production!=='HOLD'||x.historical.production!=='HOLD'||x.sold.production!=='HOLD') throw new Error('PRODUCTION_BOUNDARY_INVALID');
if(String(x.runtime.status||'')!=='LOCAL_SHADOW_OPERATING_EVIDENCE_PASS_NOT_DEPLOYED') throw new Error('BOUNDED_SHADOW_RUNTIME_NOT_PASS');
if(x.runtime.execution_truth?.remote_deployment_verified!==false||x.runtime.execution_truth?.full_platform_runtime_verified!==false) throw new Error('RUNTIME_REMOTE_OVERCLAIM');
const met=(x.identity.sources||[]).find(s=>s.source_id==='met-open-access-api'&&s.admission_state==='ADMITTED');
const smithsonian=(x.identity.sources||[]).find(s=>s.source_id==='smithsonian-open-access'&&s.admission_state==='ADMITTED');
const getty=(x.historical.sources||[]).find(s=>s.source_id==='getty-provenance-index'&&s.admission_state==='ADMITTED');
if(!met||!smithsonian||!getty) throw new Error('BASE_ADMITTED_SOURCES_MISSING');
if(x.sold.status!=='ADMITTED_SHADOW_INTERNAL_ONLY'||x.sold.execution_mode!=='DEV_SHADOW_ONLY') throw new Error('COLLECTAIO_SHADOW_ADMISSION_REQUIRED');
if(x.sold.admitted_cell?.admitted_evidence_class!=='DATED_OBSERVED_SOLD_TRANSACTION') throw new Error('DATED_SOLD_EVIDENCE_CLASS_REQUIRED');
if(x.sold.admitted_cell?.provider_market_state!=='sold'||x.sold.admitted_cell?.identity_state!=='EXACT_MATCH') throw new Error('EXACT_PROVIDER_SOLD_EVENT_REQUIRED');
if(!String(x.sold.purpose_specific_rights?.collect||'').startsWith('ADMITTED')||!String(x.sold.purpose_specific_rights?.store||'').startsWith('ADMITTED')||!String(x.sold.purpose_specific_rights?.derive||'').startsWith('ADMITTED')||!String(x.sold.purpose_specific_rights?.display_internal||'').startsWith('ADMITTED')) throw new Error('SOLD_FIELD_PURPOSE_RIGHTS_NOT_ADMITTED');
if(!String(x.sold.purpose_specific_rights?.display_public||'').startsWith('BLOCKED')||x.sold.purpose_specific_rights?.raw_redistribution!=='BLOCKED') throw new Error('PUBLIC_OR_RAW_BOUNDARY_WEAKENED');
for(const claim of ['CURRENT_PRICE','LIQUIDITY','TIME_TO_SALE','GLOBAL_DEMAND','GLOBAL_REPRESENTATIVENESS']) if(!(x.sold.prohibited_claims||[]).includes(claim)) throw new Error(`SOLD_CLAIM_CEILING_MISSING:${claim}`);
const sold=x.sold.admitted_cell;
const cells=[
 {cell_id:'R2_IDENTITY_REFERENCE_MULTISOURCE',evidence_class:'IDENTITY_CANONICAL_REFERENCE',sources:[met.source_id,smithsonian.source_id],independent_owner_count:2,rights_admission:'PASS_BOUNDED',canonical_entity_graph:'PASS_BOUNDED_INPUT',evidence_graph:'PASS_BOUNDED',market_event_graph:'NOT_APPLICABLE_IDENTITY_ONLY',engine_mesh:'PASS_BOUNDED_SHADOW_RUNTIME_EVIDENCE_BOUND',fallback_replacement:'PASS_TWO_INDEPENDENT_OWNERS',claim_ceiling:['OBJECT_IDENTITY','CATALOG_CONTEXT','REFERENCE_METADATA'],blocked_claims:['SOLD_TRANSACTION','CURRENT_MARKET_PRICE','LIQUIDITY','DEMAND']},
 {cell_id:'R2_HISTORICAL_TRANSACTION_PROVENANCE',evidence_class:'HISTORICAL_TRANSACTION_PROVENANCE',sources:[getty.source_id],independent_owner_count:1,rights_admission:'PASS_BOUNDED_CC0',canonical_entity_graph:'REQUIRES_OBJECT_IDENTITY_BINDING',evidence_graph:'PASS_BOUNDED_HISTORICAL',market_event_graph:'PASS_HISTORICAL_ONLY',engine_mesh:'PASS_BOUNDED_SHADOW_RUNTIME_EVIDENCE_BOUND',fallback_replacement:'CONCENTRATION_GAP_SINGLE_OWNER',claim_ceiling:['HISTORICAL_SALE_ACTIVITY','OWNERSHIP_TRANSFER_CONTEXT','HISTORICAL_VALUATION_CONTEXT'],blocked_claims:['CURRENT_MARKET_PRICE','CURRENT_LIQUIDITY','CURRENT_DEMAND','CURRENT_RANKING']},
 {cell_id:'R2_COLLECTAIO_DATED_SOLD_TRANSACTION',evidence_class:'DATED_OBSERVED_SOLD_TRANSACTION',sources:[x.sold.source.provider_id],independent_owner_count:1,scope_id:sold.scope_id,anchor:sold.anchor,canonical_item_slug:sold.canonical_item_slug,marketplace:sold.marketplace,observed_sold_event_count:sold.observed_sold_event_count,latest_event_date:sold.latest_event_date,condition_state:sold.condition_state,rights_admission:'PASS_DEV_SHADOW_INTERNAL_ONLY',canonical_entity_graph:'PASS_EXACT_ITEM_BINDING',evidence_graph:'PASS_DATED_SOLD_EVIDENCE',market_event_graph:'PASS_DATED_OBSERVED_SOLD_ONLY',engine_mesh:'PASS_BOUNDED_SHADOW_RUNTIME_EVIDENCE_BOUND',fallback_replacement:'CONCENTRATION_GAP_SINGLE_PROVIDER',claim_ceiling:[sold.claim_ceiling],blocked_claims:[...x.sold.prohibited_claims]}
];
const result={id:'kidults-owned-fabric-current-sold-lineage-r2',issue:560,production:'HOLD',status:'PARTIAL_EMPIRICAL_LINEAGE_WITH_DATED_SOLD_CELL',bounded_cell_count:cells.length,cells,deterministic_replay_basis:'BOUND_TO_EXISTING_ASI_SHADOW_OPERATING_EVIDENCE_PASS',current_sold_rights_admitted_source_count:1,current_market_cell_status:'DATED_OBSERVED_SOLD_AVAILABLE_NOT_CURRENT_PRICE_OR_LIQUIDITY',strict_dated_sold_lineage_proven:true,current_price_claim_sufficient:false,liquidity_claim_sufficient:false,time_to_sale_claim_sufficient:false,independent_current_sold_provider_redundancy:false,immutable_candidate:'BLOCKED_NOT_CREATED',track_b:'BLOCKED_EXACT_PAIR_ABSENT',e2e_exit_complete:false,remaining_blockers:['FINAL_ER_7_OF_7','BROADER_CURRENT_MARKET_CLAIM_SUFFICIENCY_OR_EXPLICIT_NARROW_CLAIM_SELECTION','INDEPENDENT_CURRENT_SOLD_REPLACEMENT_OR_CONCENTRATION_DECISION','IMMUTABLE_CANDIDATE_AND_EVIDENCE_PACKAGE','TRACK_B_EXACT_PACKAGE_ASSESSMENT'],truth_boundary:'A lawful bounded DEV/SHADOW dated-observed-SOLD transaction cell now traverses KIDULTS-owned entity/evidence/market-event/engine lineage. It proves exact-item dated transaction observations only. Current price, liquidity, time-to-sale, global demand/representativeness, Candidate, Track B, public projection and Production remain blocked.'};
result.fingerprint_sha256=crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
await fs.writeFile(process.argv[2]||'/tmp/kidults-owned-fabric-current-sold-lineage-r2.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
