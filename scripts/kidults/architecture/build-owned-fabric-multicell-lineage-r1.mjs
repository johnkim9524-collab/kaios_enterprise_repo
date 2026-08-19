import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const files = {
  identity: 'coordination/kidults/source-intelligence/rights-admitted-pilot-source-pool-r1.json',
  historical: 'coordination/kidults/source-intelligence/rights-admitted-transaction-source-pool-r1.json',
  redundancy: 'coordination/kidults/source-intelligence/source-redundancy-status-r1.json',
  runtime: 'artifacts/agci-os/asi-shadow-operating-evidence-v1.json'
};
const x = {}; for (const [k,p] of Object.entries(files)) x[k] = await read(p);
if (x.identity.production !== 'HOLD' || x.historical.production !== 'HOLD' || x.runtime.production !== 'HOLD') throw new Error('PRODUCTION_BOUNDARY_INVALID');

const met = (x.identity.sources||[]).find(s => s.source_id === 'met-open-access-api' && s.admission_state === 'ADMITTED');
const smithsonian = (x.identity.sources||[]).find(s => s.source_id === 'smithsonian-open-access' && s.admission_state === 'ADMITTED');
const getty = (x.historical.sources||[]).find(s => s.source_id === 'getty-provenance-index' && s.admission_state === 'ADMITTED');
if (!met || !smithsonian || !getty) throw new Error('REQUIRED_ADMITTED_SOURCES_MISSING');
if (!String(x.runtime.status || '').includes('PASS')) throw new Error('BOUNDED_SHADOW_RUNTIME_NOT_PASS');

const cells = [
  {
    cell_id: 'R1_IDENTITY_REFERENCE_MULTISOURCE',
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
    cell_id: 'R1_HISTORICAL_TRANSACTION_PROVENANCE',
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
  }
];

const currentSold = [...(x.identity.sources||[]), ...(x.historical.sources||[])].filter(s => s.admission_state === 'ADMITTED' && (s.allowed_claim_classes||[]).some(c => /CURRENT.*SOLD|SOLD.*CURRENT/.test(String(c)))).length;
const result = {
  id: 'kidults-owned-fabric-multicell-lineage-r1',
  issue: 560,
  production: 'HOLD',
  status: 'PARTIAL_EMPIRICAL_LINEAGE_PROOF',
  bounded_cell_count: cells.length,
  cells,
  deterministic_replay_basis: 'BOUND_TO_EXISTING_ASI_SHADOW_OPERATING_EVIDENCE_PASS',
  current_sold_rights_admitted_source_count: currentSold,
  current_market_cell_status: currentSold > 0 ? 'AVAILABLE_BOUNDED' : 'BLOCKED_NO_STRICT_CURRENT_SOLD_SOURCE',
  immutable_candidate: 'BLOCKED_NOT_CREATED',
  track_b: 'BLOCKED_EXACT_PAIR_ABSENT',
  e2e_exit_complete: false,
  remaining_blockers: ['FINAL_ER_7_OF_7','STRICT_RIGHTS_ADMITTED_CURRENT_SOLD_EVIDENCE','IMMUTABLE_CANDIDATE_AND_EVIDENCE_PACKAGE','TRACK_B_EXACT_PACKAGE_ASSESSMENT'],
  truth_boundary: 'Two bounded evidence cells are lineage-compatible with KIDULTS-owned graph/engine contracts using already rights-admitted sources and existing bounded SHADOW runtime evidence. This does not claim a current-SOLD market cell, full remote runtime, immutable Candidate, Track B assessment, Projection, or Production readiness.'
};
result.fingerprint_sha256 = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
await fs.writeFile(process.argv[2] || '/tmp/kidults-owned-fabric-multicell-lineage-r1.json', JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));