import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const files = {
  r1: 'scripts/kidults/architecture/build-owned-fabric-multicell-lineage-r1.mjs',
  identity: 'coordination/kidults/source-intelligence/rights-admitted-pilot-source-pool-r1.json',
  historical: 'coordination/kidults/source-intelligence/rights-admitted-transaction-source-pool-r1.json',
  sold: 'coordination/kidults/source-intelligence/collectaio-shadow-sold-admission-r1.json',
  runtime: 'artifacts/agci-os/asi-shadow-operating-evidence-v1.json'
};
const x = {};
for (const [k,p] of Object.entries(files)) if (k !== 'r1') x[k] = await read(p);

if (x.identity.production !== 'HOLD' || x.historical.production !== 'HOLD' || x.sold.production !== 'HOLD') throw new Error('SOURCE_PRODUCTION_BOUNDARY_INVALID');
if (x.sold.status !== 'ADMITTED_SHADOW_INTERNAL_ONLY' || x.sold.execution_mode !== 'DEV_SHADOW_ONLY') throw new Error('SOLD_SHADOW_ADMISSION_REQUIRED');
if (String(x.runtime.status || '') !== 'LOCAL_SHADOW_OPERATING_EVIDENCE_PASS_NOT_DEPLOYED') throw new Error('BOUNDED_SHADOW_RUNTIME_NOT_PASS');
if (x.runtime.execution_truth?.remote_deployment_verified !== false || x.runtime.execution_truth?.full_platform_runtime_verified !== false) throw new Error('RUNTIME_REMOTE_OVERCLAIM');

const met = (x.identity.sources||[]).find(s => s.source_id === 'met-open-access-api' && s.admission_state === 'ADMITTED');
const smithsonian = (x.identity.sources||[]).find(s => s.source_id === 'smithsonian-open-access' && s.admission_state === 'ADMITTED');
const getty = (x.historical.sources||[]).find(s => s.source_id === 'getty-provenance-index' && s.admission_state === 'ADMITTED');
if (!met || !smithsonian || !getty) throw new Error('REQUIRED_ADMITTED_SOURCES_MISSING');

const soldCell = x.sold.admitted_cell;
if (!soldCell || soldCell.admitted_evidence_class !== 'DATED_OBSERVED_SOLD_TRANSACTION') throw new Error('DATED_SOLD_CELL_REQUIRED');
if (x.sold.admission_decision?.internal_market_analysis !== 'PASS_FOR_DATED_TRANSACTION_EVENT_ONLY') throw new Error('SOLD_INTERNAL_MARKET_EVENT_NOT_ADMITTED');
if (x.sold.admission_decision?.public_or_commercial_projection !== 'HOLD') throw new Error('PUBLIC_PROJECTION_MUST_HOLD');

const cells = [
  {
    cell_id: 'R2_IDENTITY_REFERENCE_MULTISOURCE',
    evidence_class: 'IDENTITY_CANONICAL_REFERENCE',
    sources: [met.source_id, smithsonian.source_id],
    independent_owner_count: 2,
    rights_admission: 'PASS_BOUNDED',
    canonical_entity_graph: 'PASS_BOUNDED_INPUT',
    evidence_graph: 'PASS_BOUNDED',
    market_event_graph: 'NOT_APPLICABLE_IDENTITY_ONLY',
    engine_mesh: 'PASS_BOUNDED_SHADOW_RUNTIME_EVIDENCE_BOUND',
    fallback_replacement: 'PASS_TWO_INDEPENDENT_OWNERS',
    claim_ceiling: ['OBJECT_IDENTITY','CATALOG_CONTEXT','REFERENCE_METADATA'],
    blocked_claims: ['SOLD_TRANSACTION','CURRENT_MARKET_PRICE','LIQUIDITY','DEMAND']
  },
  {
    cell_id: 'R2_HISTORICAL_TRANSACTION_PROVENANCE',
    evidence_class: 'HISTORICAL_TRANSACTION_PROVENANCE',
    sources: [getty.source_id],
    independent_owner_count: 1,
    rights_admission: 'PASS_BOUNDED_CC0',
    canonical_entity_graph: 'REQUIRES_OBJECT_IDENTITY_BINDING',
    evidence_graph: 'PASS_BOUNDED_HISTORICAL',
    market_event_graph: 'PASS_HISTORICAL_ONLY',
    engine_mesh: 'PASS_BOUNDED_SHADOW_RUNTIME_EVIDENCE_BOUND',
    fallback_replacement: 'CONCENTRATION_GAP_SINGLE_OWNER',
    claim_ceiling: ['HISTORICAL_SALE_ACTIVITY','OWNERSHIP_TRANSFER_CONTEXT','HISTORICAL_VALUATION_CONTEXT'],
    blocked_claims: ['CURRENT_MARKET_PRICE','CURRENT_LIQUIDITY','CURRENT_DEMAND','CURRENT_RANKING']
  },
  {
    cell_id: 'R2_DATED_OBSERVED_SOLD_TRANSACTION',
    evidence_class: 'DATED_OBSERVED_SOLD_TRANSACTION',
    sources: [x.sold.source.provider_id],
    independent_owner_count: 1,
    anchor: soldCell.anchor,
    canonical_item_slug: soldCell.canonical_item_slug,
    observed_sold_event_count: soldCell.observed_sold_event_count,
    latest_event_date: soldCell.latest_event_date,
    latest_event_age_days_at_probe: soldCell.latest_event_age_days_at_probe,
    condition_state: soldCell.condition_state,
    rights_admission: 'PASS_DEV_SHADOW_INTERNAL_ONLY',
    canonical_entity_graph: soldCell.identity_state === 'EXACT_MATCH' ? 'PASS_EXACT_BOUND_ITEM' : 'BLOCKED_IDENTITY',
    evidence_graph: 'PASS_BOUNDED_DATED_SOLD',
    market_event_graph: 'PASS_BOUNDED_DATED_SOLD_INTERNAL_ONLY',
    engine_mesh: 'READY_FOR_BOUNDED_SHADOW_LINEAGE',
    fallback_replacement: 'CONCENTRATION_GAP_SINGLE_PROVIDER',
    claim_ceiling: [soldCell.claim_ceiling],
    blocked_claims: x.sold.prohibited_claims
  }
];

const result = {
  id: 'kidults-owned-fabric-multicell-lineage-r2',
  issue: 560,
  production: 'HOLD',
  status: 'PARTIAL_EMPIRICAL_LINEAGE_WITH_DATED_SOLD_NODE',
  bounded_cell_count: cells.length,
  cells,
  dated_sold_internal_admitted_cell_count: 1,
  dated_sold_internal_admitted_event_count: soldCell.observed_sold_event_count,
  current_price_claim_sufficient_cell_count: 0,
  liquidity_claim_sufficient_cell_count: 0,
  independent_sold_provider_redundancy_count: 0,
  deterministic_replay_basis: 'BOUND_TO_EXISTING_ASI_SHADOW_OPERATING_EVIDENCE_PASS',
  current_market_cell_status: 'DATED_SOLD_INTERNAL_NODE_AVAILABLE_CURRENT_PRICE_AND_LIQUIDITY_BLOCKED',
  immutable_candidate: 'BLOCKED_NOT_CREATED',
  track_b: 'BLOCKED_EXACT_PAIR_ABSENT',
  e2e_exit_complete: false,
  remaining_blockers: ['FINAL_ER_7_OF_7','CLAIM_SUFFICIENT_CURRENT_MARKET_EVIDENCE','INDEPENDENT_SOLD_REDUNDANCY_OR_EXPLICIT_CONCENTRATION_DECISION','IMMUTABLE_CANDIDATE_AND_EVIDENCE_PACKAGE','TRACK_B_EXACT_PACKAGE_ASSESSMENT'],
  truth_boundary: 'R2 adds one lawfully admitted bounded dated-SOLD internal Market Event node to the existing identity and historical lineage. It does not establish current price, representative price, liquidity, time-to-sale, global demand, independent SOLD redundancy, immutable Candidate, Track B assessment, Projection, remote runtime, or Production readiness.'
};
result.fingerprint_sha256 = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
await fs.writeFile(process.argv[2] || '/tmp/kidults-owned-fabric-multicell-lineage-r2.json', JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));