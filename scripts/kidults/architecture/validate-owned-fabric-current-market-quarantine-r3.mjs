import fs from 'node:fs/promises';

const filePath = process.argv[2] || '/tmp/kidults-owned-fabric-current-market-quarantine-r3.json';
const result = JSON.parse(await fs.readFile(filePath, 'utf8'));

const requireValue = (condition, code) => {
  if (!condition) throw new Error(code);
};

requireValue(result.status === 'PARTIAL_EMPIRICAL_LINEAGE_CURRENT_MARKET_QUARANTINED', 'STATUS_INVALID');
requireValue(result.scope_boundary === 'COLLECTIBLES_ONLY', 'SCOPE_BOUNDARY_INVALID');
requireValue(result.production === 'HOLD', 'PRODUCTION_BOUNDARY_INVALID');
requireValue(result.bounded_cell_count === 2 && Array.isArray(result.cells) && result.cells.length === 2, 'TWO_NON_MARKET_CELLS_REQUIRED');
requireValue(result.cells.some(cell => cell.evidence_class === 'IDENTITY_CANONICAL_REFERENCE'), 'IDENTITY_CELL_MISSING');
requireValue(result.cells.some(cell => cell.evidence_class === 'HISTORICAL_TRANSACTION_PROVENANCE'), 'HISTORICAL_CELL_MISSING');
requireValue(!result.cells.some(cell => cell.evidence_class === 'DATED_OBSERVED_SOLD_TRANSACTION'), 'DATED_SOLD_CELL_MUST_NOT_BE_ACTIVE');
requireValue(result.current_market_cell_status === 'NO_ACTIVE_DATED_SOLD_CELL_PENDING_PRIVATE_REACQUISITION', 'CURRENT_MARKET_STATUS_INVALID');
requireValue(result.dated_sold_cell_status === 'QUARANTINED_NOT_ADMITTED', 'QUARANTINE_STATUS_INVALID');
requireValue(result.dated_sold_internal_admitted_cell_count === 0, 'DATED_SOLD_COUNT_NOT_ZERO');
requireValue(result.current_sold_rights_admitted_source_count === 0, 'CURRENT_SOLD_SOURCE_COUNT_NOT_ZERO');
requireValue(result.strict_dated_sold_lineage_proven === false, 'DATED_SOLD_LINEAGE_MUST_BE_FALSE');
requireValue(result.current_price_claim_sufficient === false && result.liquidity_claim_sufficient === false && result.time_to_sale_claim_sufficient === false, 'MARKET_CLAIM_MUST_BE_FALSE');
requireValue(result.immutable_candidate === 'BLOCKED_NOT_CREATED' && result.track_b === 'BLOCKED_EXACT_PAIR_ABSENT' && result.e2e_exit_complete === false, 'DOWNSTREAM_MUST_FAIL_CLOSED');

console.log('KIDULTS_OWNED_FABRIC_CURRENT_MARKET_QUARANTINE_R3_PASS');
