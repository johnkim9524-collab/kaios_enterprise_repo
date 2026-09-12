#!/usr/bin/env node
import fs from 'node:fs';

const DEFAULT_ACCOUNTING = 'coordination/kidults/source-intelligence/asi-global-discovery-channel-accounting-v1.json';
const DEFAULT_UNIVERSE = 'coordination/kidults/source-intelligence/asi-global-source-universe-v1.json';
const MARKET_CORE_ROLES = ['LISTING_SUPPLY', 'SOLD_TRANSACTION', 'AUTHENTICATION_CONDITION'];

export function validateGlobalDiscoveryChannelAccounting(accounting, universe) {
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  const canonicalChannels = universe.discovery_channel_families || [];
  const records = accounting.channels || [];
  const canonicalIds = canonicalChannels.map(channel => channel.channel_id).sort();
  const recordIds = records.map(channel => channel.channel_id).sort();
  const byId = new Map(records.map(record => [record.channel_id, record]));
  const expectedUniqueCells = 32 * 7 * 12;

  check(accounting.canonical_source_universe === DEFAULT_UNIVERSE, 'CANONICAL_UNIVERSE_BINDING');
  check(canonicalIds.length === 12 && new Set(canonicalIds).size === 12, 'CANONICAL_CHANNEL_COUNT');
  check(records.length === 12 && byId.size === 12, 'ACCOUNTED_CHANNEL_COUNT');
  check(JSON.stringify(canonicalIds) === JSON.stringify(recordIds), 'CANONICAL_CHANNEL_SET_MISMATCH');
  check(accounting.frontier?.scope_count === 32 && accounting.frontier?.source_role_count === 7 &&
    accounting.frontier?.region_count === 12 && accounting.frontier?.unique_coverage_cell_count === expectedUniqueCells,
  'FRONTIER_DIMENSIONS');
  check(accounting.frontier?.unique_cells_with_current_measurement + accounting.frontier?.unique_cells_on_explicit_hold === expectedUniqueCells &&
    accounting.frontier?.unique_cells_unaccounted === 0, 'UNIQUE_FRONTIER_CELL_ACCOUNTING');

  let expectedAssignments = 0;
  let measuredAssignments = 0;
  let holdAssignments = 0;
  const aliases = [];
  for (const canonical of canonicalChannels) {
    const record = byId.get(canonical.channel_id);
    if (!record) continue;
    const expectedRoles = canonical.channel_id === 'OPTIONAL_LICENSED_SEARCH_OR_DATA_PROVIDER'
      ? [...MARKET_CORE_ROLES].sort()
      : [...canonical.role_bias].sort();
    const observedRoles = [...(record.eligible_source_roles || [])].sort();
    const expectedCells = expectedRoles.length * 32 * 12;
    expectedAssignments += expectedCells;
    check(JSON.stringify(expectedRoles) === JSON.stringify(observedRoles), `CHANNEL_ROLE_BINDING:${canonical.channel_id}`);
    check(record.eligible_frontier_cell_count === expectedCells, `CHANNEL_CELL_COUNT:${canonical.channel_id}`);
    check(['MEASURED', 'HOLD'].includes(record.measurement_state), `CHANNEL_STATE_ENUM:${canonical.channel_id}`);
    check(record.unaccounted_frontier_cell_count === 0, `CHANNEL_UNACCOUNTED_CELLS:${canonical.channel_id}`);
    check(record.measured_frontier_cell_count + record.hold_frontier_cell_count === expectedCells,
      `CHANNEL_CELL_ACCOUNTING:${canonical.channel_id}`);
    check(record.acquisition_authorized === false, `CHANNEL_ACQUISITION_OVERCLAIM:${canonical.channel_id}`);
    check(typeof record.owner === 'string' && record.owner.length > 0 && typeof record.next_action === 'string' &&
      record.next_action.length > 0 && typeof record.implementation_state === 'string' && record.implementation_state.length > 0,
    `CHANNEL_OPERATING_DIMENSIONS:${canonical.channel_id}`);
    if (record.measurement_state === 'HOLD') {
      check(record.measurement_run_id === null && record.measurement_artifact_ref === null &&
        record.reported_candidate_count === null && record.measured_frontier_cell_count === 0 &&
        record.hold_frontier_cell_count === expectedCells && typeof record.hold_reason === 'string' && record.hold_reason.length > 0,
      `CHANNEL_HOLD_TRUTH:${canonical.channel_id}`);
      holdAssignments += expectedCells;
    } else {
      check(typeof record.measurement_run_id === 'string' && record.measurement_run_id.length > 0 &&
        typeof record.measurement_artifact_ref === 'string' && record.measurement_artifact_ref.length > 0 &&
        Number.isInteger(record.reported_candidate_count) && record.reported_candidate_count >= 0 &&
        record.measured_frontier_cell_count === expectedCells && record.hold_frontier_cell_count === 0,
      `CHANNEL_MEASUREMENT_RECEIPT:${canonical.channel_id}`);
      measuredAssignments += expectedCells;
    }
    for (const alias of record.runtime_aliases || []) {
      check(typeof alias === 'string' && alias.length > 0 && alias === alias.trim(), `CHANNEL_ALIAS_FORMAT:${canonical.channel_id}`);
      aliases.push(alias);
    }
  }
  check(aliases.length === new Set(aliases).size, 'DUPLICATE_RUNTIME_ALIAS');
  check(aliases.every(alias => !canonicalIds.includes(alias)), 'RUNTIME_ALIAS_COLLIDES_WITH_CANONICAL_ID');
  check(byId.get('DATACITE_AND_OPEN_RESEARCH_LANDING_METADATA')?.runtime_aliases?.includes('DATACITE_OPEN_RESEARCH_METADATA'),
    'DATACITE_RUNTIME_ALIAS_NOT_RECONCILED');
  check(accounting.frontier?.channel_applicability_assignments === expectedAssignments &&
    accounting.frontier?.measured_channel_applicability_assignments === measuredAssignments &&
    accounting.frontier?.hold_channel_applicability_assignments === holdAssignments &&
    accounting.frontier?.unaccounted_channel_applicability_assignments === 0, 'CHANNEL_ASSIGNMENT_ACCOUNTING');
  check(accounting.summary?.canonical_channel_count === 12 &&
    accounting.summary?.measured_channel_count === records.filter(record => record.measurement_state === 'MEASURED').length &&
    accounting.summary?.hold_channel_count === records.filter(record => record.measurement_state === 'HOLD').length &&
    accounting.summary?.unaccounted_channel_count === 0, 'CHANNEL_SUMMARY');
  check(accounting.summary?.reported_candidate_count === null && accounting.summary?.live_global_discovery_proven === false,
    'GLOBAL_DISCOVERY_OVERCLAIM');
  const runtime = accounting.runtime_execution_evidence || {};
  check(runtime.durable_consumer_state === 'NOT_IMPLEMENTED_BY_THIS_CONTROL_HOLD' &&
    runtime.first_admission_count === 0 && runtime.ack_count === 0 && runtime.retry_count === 0 &&
    runtime.dead_letter_queue_count === 0 && runtime.runtime_receipt_ref === null &&
    runtime.counts_are_evidence_bound === true && runtime.zero_counts_are_not_readiness === true,
  'RUNTIME_EXECUTION_EVIDENCE_OVERCLAIM');
  check(accounting.authority_boundary?.missing_measurement_is_zero === false &&
    accounting.authority_boundary?.hold_is_measurement === false &&
    accounting.authority_boundary?.rights_or_admission_promoted === false &&
    accounting.authority_boundary?.market_claim_created === false &&
    accounting.authority_boundary?.public_release === 'HOLD' && accounting.authority_boundary?.production === 'HOLD' &&
    accounting.authority_boundary?.g5 === 'HOLD', 'AUTHORITY_BOUNDARY');
  return [...new Set(errors)].sort();
}

const accountingPath = process.argv[2] || DEFAULT_ACCOUNTING;
const accounting = JSON.parse(fs.readFileSync(accountingPath, 'utf8'));
const universe = JSON.parse(fs.readFileSync(DEFAULT_UNIVERSE, 'utf8'));
const errors = validateGlobalDiscoveryChannelAccounting(accounting, universe);
if (errors.length) throw new Error(`GLOBAL_DISCOVERY_CHANNEL_ACCOUNTING_INVALID:${errors.join(',')}`);

const negativeMutations = [];
for (const [name, mutate, expectedCode] of [
  ['drop-canonical-channel', value => value.channels.pop(), 'ACCOUNTED_CHANNEL_COUNT'],
  ['allow-unaccounted-cell', value => { value.channels[0].unaccounted_frontier_cell_count = 1; }, `CHANNEL_UNACCOUNTED_CELLS:${accounting.channels[0].channel_id}`],
  ['mark-measured-without-receipt', value => { value.channels[0].measurement_state = 'MEASURED'; }, `CHANNEL_MEASUREMENT_RECEIPT:${accounting.channels[0].channel_id}`],
  ['hold-without-reason', value => { value.channels[0].hold_reason = ''; }, `CHANNEL_HOLD_TRUTH:${accounting.channels[0].channel_id}`],
  ['lose-datacite-alias', value => { value.channels.find(record => record.channel_id === 'DATACITE_AND_OPEN_RESEARCH_LANDING_METADATA').runtime_aliases = []; }, 'DATACITE_RUNTIME_ALIAS_NOT_RECONCILED'],
  ['inflate-runtime-first-admission', value => { value.runtime_execution_evidence.first_admission_count = 1; }, 'RUNTIME_EXECUTION_EVIDENCE_OVERCLAIM']
]) {
  const candidate = structuredClone(accounting);
  mutate(candidate);
  const observed = validateGlobalDiscoveryChannelAccounting(candidate, universe);
  if (!observed.includes(expectedCode)) throw new Error(`NEGATIVE_MUTATION_NOT_REJECTED:${name}:${observed.join(',')}`);
  negativeMutations.push({ name, rejected_by: expectedCode });
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  canonical_channels: accounting.summary.canonical_channel_count,
  measured_channels: accounting.summary.measured_channel_count,
  hold_channels: accounting.summary.hold_channel_count,
  unique_frontier_cells: accounting.frontier.unique_coverage_cell_count,
  unique_cells_measured: accounting.frontier.unique_cells_with_current_measurement,
  unique_cells_hold: accounting.frontier.unique_cells_on_explicit_hold,
  unique_cells_unaccounted: accounting.frontier.unique_cells_unaccounted,
  channel_applicability_assignments: accounting.frontier.channel_applicability_assignments,
  negative_mutations: negativeMutations,
  acquisition: 'HOLD',
  production: 'HOLD'
}, null, 2));
