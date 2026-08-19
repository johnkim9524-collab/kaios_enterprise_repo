import fs from 'node:fs/promises';

const p = process.argv[2] || '/tmp/kidults-owned-fabric-multicell-lineage-r2.json';
const x = JSON.parse(await fs.readFile(p, 'utf8'));

if (x.production !== 'HOLD') throw new Error('PRODUCTION_MUST_HOLD');
if (x.status !== 'PARTIAL_EMPIRICAL_LINEAGE_WITH_DATED_SOLD_NODE') throw new Error('STATUS_INVALID');
if (x.bounded_cell_count !== 3 || !Array.isArray(x.cells) || x.cells.length !== 3) throw new Error('THREE_BOUNDED_CELLS_REQUIRED');

const identity = x.cells.find(c => c.evidence_class === 'IDENTITY_CANONICAL_REFERENCE');
const historical = x.cells.find(c => c.evidence_class === 'HISTORICAL_TRANSACTION_PROVENANCE');
const sold = x.cells.find(c => c.evidence_class === 'DATED_OBSERVED_SOLD_TRANSACTION');

if (!identity || identity.independent_owner_count < 2 || identity.fallback_replacement !== 'PASS_TWO_INDEPENDENT_OWNERS') throw new Error('IDENTITY_REDUNDANCY_NOT_PROVEN');
if (!historical || historical.market_event_graph !== 'PASS_HISTORICAL_ONLY' || historical.fallback_replacement !== 'CONCENTRATION_GAP_SINGLE_OWNER') throw new Error('HISTORICAL_LINEAGE_INVALID');
if (!sold) throw new Error('DATED_SOLD_CELL_MISSING');
if (sold.rights_admission !== 'PASS_DEV_SHADOW_INTERNAL_ONLY') throw new Error('DATED_SOLD_RIGHTS_BOUNDARY_INVALID');
if (sold.canonical_entity_graph !== 'PASS_EXACT_BOUND_ITEM') throw new Error('DATED_SOLD_IDENTITY_NOT_EXACT');
if (sold.market_event_graph !== 'PASS_BOUNDED_DATED_SOLD_INTERNAL_ONLY') throw new Error('DATED_SOLD_MARKET_EVENT_LINEAGE_MISSING');
if (!Number.isInteger(sold.observed_sold_event_count) || sold.observed_sold_event_count < 1) throw new Error('DATED_SOLD_EVENTS_REQUIRED');
if (sold.condition_state !== 'NOT_POPULATED') throw new Error('CONDITION_TRUTH_MUST_REMAIN_EXPLICIT');
if (sold.fallback_replacement !== 'CONCENTRATION_GAP_SINGLE_PROVIDER') throw new Error('SOLD_PROVIDER_CONCENTRATION_MUST_BE_EXPLICIT');

const prohibited = new Set(sold.blocked_claims || []);
for (const claim of ['CURRENT_PRICE','REPRESENTATIVE_PRICE','LIQUIDITY','TIME_TO_SALE','GLOBAL_DEMAND','GLOBAL_REPRESENTATIVENESS','PUBLIC_OR_COMMERCIAL_PROJECTION','RAW_PROVIDER_DATA_REDISTRIBUTION']) {
  if (!prohibited.has(claim)) throw new Error(`MISSING_BLOCKED_CLAIM_${claim}`);
}

if (x.dated_sold_internal_admitted_cell_count !== 1) throw new Error('DATED_SOLD_CELL_COUNT_INVALID');
if (x.dated_sold_internal_admitted_event_count !== sold.observed_sold_event_count) throw new Error('DATED_SOLD_EVENT_COUNT_MISMATCH');
if (x.current_price_claim_sufficient_cell_count !== 0 || x.liquidity_claim_sufficient_cell_count !== 0) throw new Error('CURRENT_MARKET_OVERCLAIM');
if (x.independent_sold_provider_redundancy_count !== 0) throw new Error('SOLD_REDUNDANCY_OVERCLAIM');
if (x.current_market_cell_status !== 'DATED_SOLD_INTERNAL_NODE_AVAILABLE_CURRENT_PRICE_AND_LIQUIDITY_BLOCKED') throw new Error('CURRENT_MARKET_STATUS_INVALID');
if (x.immutable_candidate !== 'BLOCKED_NOT_CREATED' || x.track_b !== 'BLOCKED_EXACT_PAIR_ABSENT') throw new Error('DOWNSTREAM_MUST_FAIL_CLOSED');
if (x.e2e_exit_complete !== false) throw new Error('MUST_NOT_CLAIM_E2E_EXIT');

console.log('KIDULTS_OWNED_FABRIC_MULTICELL_LINEAGE_R2_PASS_DATED_SOLD_INTERNAL_FAIL_CLOSED');
