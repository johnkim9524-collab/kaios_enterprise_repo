import fs from 'node:fs';

const path = process.argv[2] || '/tmp/global-data-acquisition-master-matrix-v1.json';
const x = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = m => { throw new Error(m); };

if (x.status !== 'STRUCTURE_COMPLETE_OPERATIONAL_STATES_FAIL_CLOSED') fail('STATUS');
if (x.production !== 'HOLD' || x.public_release !== 'HOLD') fail('RELEASE_BOUNDARY');
const c = x.structural_counts || {};
if (c.categories !== 32 || c.macroregions !== 8 || c.sourcing_channels !== 7 || c.evidence_classes !== 8) fail('AXIS_COUNTS');
if (c.base_execution_cells !== 1792) fail(`BASE_CELL_COUNT:${c.base_execution_cells}`);
if (c.evidence_binding_rows !== 4352) fail(`EVIDENCE_BINDING_COUNT:${c.evidence_binding_rows}`);
if (!Array.isArray(x.base_cells) || x.base_cells.length !== c.base_execution_cells) fail('BASE_CELLS');
if (!Array.isArray(x.evidence_bindings) || x.evidence_bindings.length !== c.evidence_binding_rows) fail('EVIDENCE_BINDINGS');
if (new Set(x.base_cells.map(r => r.base_acquisition_cell_id)).size !== x.base_cells.length) fail('DUPLICATE_BASE_CELL');
if (new Set(x.evidence_bindings.map(r => r.acquisition_cell_id)).size !== x.evidence_bindings.length) fail('DUPLICATE_EVIDENCE_BINDING');

const required = [
  'acquisition_cell_id','category_scope','macroregion_id','sourcing_channel','evidence_class','source_role',
  'selection_state','rights_state','admission_state','runtime_state','evidence_state','claim_state','freshness_state',
  'minimum_independent_source_owners','observed_independent_source_owners','coverage_debt_state','priority_score',
  'claim_ceiling','provenance_requirement','next_action'
];
for (const r of x.evidence_bindings) {
  for (const k of required) if (r[k] === undefined || r[k] === null) fail(`MISSING_FIELD:${k}:${r.acquisition_cell_id}`);
  if (r.rights_state !== 'UNASSESSED') fail(`STRUCTURE_MUST_NOT_INVENT_RIGHTS:${r.acquisition_cell_id}`);
  if (r.admission_state !== 'NOT_ADMITTED') fail(`STRUCTURE_MUST_NOT_INVENT_ADMISSION:${r.acquisition_cell_id}`);
  if (r.runtime_state !== 'NOT_CONNECTED') fail(`STRUCTURE_MUST_NOT_INVENT_RUNTIME:${r.acquisition_cell_id}`);
  if (r.evidence_state !== 'GAP' || r.claim_state !== 'NOT_VERIFIED') fail(`STRUCTURE_MUST_NOT_INVENT_EVIDENCE:${r.acquisition_cell_id}`);
  if (r.coverage_debt_state !== 'OPEN') fail(`DEFAULT_COVERAGE_DEBT_MUST_BE_OPEN:${r.acquisition_cell_id}`);
  if (r.raw_record_count_weight !== 0 || r.analytical_weight !== null) fail(`RECORD_COUNT_OR_WEIGHT_DRIFT:${r.acquisition_cell_id}`);
  if (r.production !== 'HOLD') fail(`ROW_PRODUCTION_DRIFT:${r.acquisition_cell_id}`);
}
for (const r of x.base_cells) {
  if (r.bootstrap_is_market_share !== false) fail(`BOOTSTRAP_MARKET_SHARE_DRIFT:${r.base_acquisition_cell_id}`);
  if (r.production !== 'HOLD') fail(`BASE_PRODUCTION_DRIFT:${r.base_acquisition_cell_id}`);
}
if (x.acquisition_state_summary?.rights_allow_rows !== 0 || x.acquisition_state_summary?.admitted_rows !== 0 || x.acquisition_state_summary?.connected_rows !== 0 || x.acquisition_state_summary?.verified_evidence_rows !== 0) fail('STRUCTURAL_BUILD_MUST_NOT_PROMOTE_OPERATIONAL_TRUTH');
if (x.acquisition_state_summary?.open_coverage_debt_rows !== 4352) fail('COVERAGE_DEBT_COUNT');

console.log(JSON.stringify({
  status: 'PASS',
  base_execution_cells: c.base_execution_cells,
  evidence_binding_rows: c.evidence_binding_rows,
  rights_allow_rows: 0,
  admitted_rows: 0,
  verified_evidence_rows: 0,
  open_coverage_debt_rows: x.acquisition_state_summary.open_coverage_debt_rows,
  production: x.production
}, null, 2));
