import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const read = async filePath => JSON.parse(await fs.readFile(filePath, 'utf8'));
const input = {
  identity: 'coordination/kidults/source-intelligence/rights-admitted-pilot-source-pool-r1.json',
  historical: 'coordination/kidults/source-intelligence/rights-admitted-transaction-source-pool-r1.json',
  revocation: 'coordination/kidults/source-intelligence/collectaio-exposure-revocation-v1.json',
  runtime: 'artifacts/agci-os/asi-shadow-operating-evidence-v1.json'
};
const data = {};
for (const [key, filePath] of Object.entries(input)) data[key] = await read(filePath);

if (data.identity.production !== 'HOLD' || data.historical.production !== 'HOLD' || data.revocation.production !== 'HOLD') throw new Error('PRODUCTION_BOUNDARY_INVALID');
if (data.revocation.status !== 'ACTIVE_REVOCATION_AND_QUARANTINE') throw new Error('REVOCATION_REQUIRED');
if (data.revocation.active_market_claim?.state !== 'NONE') throw new Error('ACTIVE_MARKET_CLAIM_MUST_BE_NONE');
if (String(data.runtime.status || '') !== 'LOCAL_SHADOW_OPERATING_EVIDENCE_PASS_NOT_DEPLOYED') throw new Error('BOUNDED_SHADOW_RUNTIME_NOT_PASS');
if (data.runtime.execution_truth?.remote_deployment_verified !== false || data.runtime.execution_truth?.full_platform_runtime_verified !== false) throw new Error('RUNTIME_REMOTE_OVERCLAIM');

const findSource = (sources, sourceId) => (sources || []).find(source => source.source_id === sourceId && source.admission_state === 'ADMITTED');
const met = findSource(data.identity.sources, 'met-open-access-api');
const smithsonian = findSource(data.identity.sources, 'smithsonian-open-access');
const getty = findSource(data.historical.sources, 'getty-provenance-index');
if (!met || !smithsonian || !getty) throw new Error('BASE_ADMITTED_SOURCES_MISSING');

const cells = [
  {
    cell_id: 'R3_IDENTITY_REFERENCE_MULTISOURCE',
    evidence_class: 'IDENTITY_CANONICAL_REFERENCE',
    sources: [met.source_id, smithsonian.source_id],
    independent_owner_count: 2,
    claim_ceiling: ['OBJECT_IDENTITY', 'CATALOG_CONTEXT', 'REFERENCE_METADATA'],
    market_event_graph: 'NOT_APPLICABLE_IDENTITY_ONLY'
  },
  {
    cell_id: 'R3_HISTORICAL_TRANSACTION_PROVENANCE',
    evidence_class: 'HISTORICAL_TRANSACTION_PROVENANCE',
    sources: [getty.source_id],
    independent_owner_count: 1,
    claim_ceiling: ['HISTORICAL_SALE_ACTIVITY', 'OWNERSHIP_TRANSFER_CONTEXT', 'HISTORICAL_VALUATION_CONTEXT'],
    market_event_graph: 'PASS_HISTORICAL_ONLY'
  }
];

const result = {
  id: 'kidults-owned-fabric-current-market-quarantine-r3',
  issue: 560,
  status: 'PARTIAL_EMPIRICAL_LINEAGE_CURRENT_MARKET_QUARANTINED',
  scope_boundary: 'COLLECTIBLES_ONLY',
  production: 'HOLD',
  bounded_cell_count: cells.length,
  cells,
  current_market_cell_status: 'NO_ACTIVE_DATED_SOLD_CELL_PENDING_PRIVATE_REACQUISITION',
  dated_sold_cell_status: 'QUARANTINED_NOT_ADMITTED',
  dated_sold_internal_admitted_cell_count: 0,
  current_sold_rights_admitted_source_count: 0,
  strict_dated_sold_lineage_proven: false,
  current_price_claim_sufficient: false,
  liquidity_claim_sufficient: false,
  time_to_sale_claim_sufficient: false,
  independent_current_sold_provider_redundancy: false,
  immutable_candidate: 'BLOCKED_NOT_CREATED',
  track_b: 'BLOCKED_EXACT_PAIR_ABSENT',
  e2e_exit_complete: false,
  remaining_blockers: [
    'P0_HISTORICAL_OUTPUT_CLEANUP',
    'PRIVATE_REACQUISITION_WITH_RIGHTS_RETENTION_TTL_AND_TAMPER_BINDING',
    'FINAL_EMPIRICAL_ER_VALIDATION',
    'IMMUTABLE_CANDIDATE_AND_EVIDENCE_PACKAGE',
    'TRACK_B_EXACT_PACKAGE_ASSESSMENT'
  ],
  truth_boundary: 'The former public CollectAIO dated-SOLD path is revoked and quarantined. This result proves no active current-market transaction claim, Candidate, Track B, public projection or Production state.'
};
result.fingerprint_sha256 = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
await fs.writeFile(process.argv[2] || '/tmp/kidults-owned-fabric-current-market-quarantine-r3.json', JSON.stringify(result, null, 2));
console.log('KIDULTS_OWNED_FABRIC_CURRENT_MARKET_QUARANTINE_R3_BUILT');
