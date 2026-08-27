#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildSourceChannelControlPlane } from './build-source-channel-control-plane-v1.mjs';

const DEFAULT_CONTRACT = 'coordination/kidults/source-intelligence/source-channel-control-plane-contract-v1.json';
const DEFAULT_LEDGER = 'coordination/kidults/source-intelligence/source-channel-control-plane-v1.json';
const canonicalJson = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

export function validateSourceChannelControlPlane(ledger, contract) {
  const errors = [];
  const fail = (condition, code) => { if (!condition) errors.push(code); };
  const expected = contract.expected_boundaries;
  const records = ledger.source_records || [];
  const packages = ledger.source_purpose_records || [];
  const byId = new Map(records.map(record => [record.canonical_source_id, record]));
  const allAliases = records.flatMap(record => record.aliases || []);
  const frontierIds = records.flatMap(record => record.curated_frontier_ids || []);

  fail(records.length === new Set(records.map(record => record.canonical_source_id)).size, 'DUPLICATE_CANONICAL_SOURCE_ID');
  fail(allAliases.length === new Set(allAliases).size, 'DUPLICATE_SOURCE_ALIAS');
  fail(allAliases.every(alias => !byId.has(alias)), 'ALIAS_COLLIDES_WITH_CANONICAL_SOURCE_ID');
  fail(frontierIds.length === expected.curated_candidate_rows, 'CURATED_FRONTIER_ACCOUNTING_COUNT');
  fail(new Set(frontierIds).size === expected.curated_candidate_rows, 'CURATED_FRONTIER_ROW_NOT_ACCOUNTED_EXACTLY_ONCE');
  fail(ledger.summary.curated_candidate_rows === expected.curated_candidate_rows, 'SUMMARY_CURATED_ROW_COUNT');
  fail(ledger.summary.curated_candidate_canonical_sources === expected.curated_candidate_rows, 'SUMMARY_CURATED_CANONICAL_COUNT');
  fail(ledger.summary.core_domain_count === expected.core_domains, 'CORE_DOMAIN_COUNT');
  fail(Object.values(ledger.summary.candidates_per_core_domain || {}).every(count => count >= expected.minimum_candidates_per_core_domain), 'CORE_DOMAIN_MINIMUM_COVERAGE');
  fail(ledger.summary.implemented_adapter_profiles === expected.implemented_adapter_profiles, 'IMPLEMENTED_ADAPTER_PROFILE_COUNT');
  fail(records.filter(record => record.adapter_implemented_fixture_verified).length === expected.implemented_adapter_profiles, 'IMPLEMENTED_ADAPTER_RECORD_COUNT');
  fail(records.filter(record => record.adapter_active).length === expected.empirically_active_adapters, 'ADAPTER_ACTIVE_OVERCLAIM');
  fail(ledger.summary.unique_bounded_admitted_sources === expected.unique_bounded_admitted_sources, 'BOUNDED_ADMISSION_UNIQUE_COUNT');
  fail(ledger.summary.rights_clear_collector_current_sold_sources === expected.rights_clear_collector_current_sold_sources, 'CURRENT_SOLD_RIGHTS_OVERCLAIM');
  fail(ledger.summary.activation_backlog_eligible === 0, 'ACTIVATION_BACKLOG_WITHOUT_EXIT_EVIDENCE');
  fail(ledger.summary.evidence_admitted === expected.evidence_admitted, 'EVIDENCE_ADMISSION_OVERCLAIM');
  fail(ledger.summary.candidate_created === expected.candidate_created, 'CANDIDATE_CREATION_OVERCLAIM');
  fail(ledger.summary.track_b_started === expected.track_b_started, 'TRACK_B_OVERCLAIM');
  fail(ledger.summary.approved_projection === expected.approved_projection, 'PROJECTION_OVERCLAIM');
  fail(ledger.production === expected.production && ledger.public_release === expected.public_release && ledger.g5 === expected.g5, 'PROTECTED_RELEASE_BOUNDARY');
  fail(records.every(record => record.acquisition_authorized === false && record.evidence_admitted === false && record.current_market_event_created === false), 'SOURCE_EXECUTION_AUTHORITY_OVERCLAIM');
  fail(records.every(record => record.adapter_active === false && record.activation_eligible === false), 'SOURCE_ACTIVATION_OVERCLAIM');
  fail(packages.length > 0 && packages.every(record => record.decision && record.claim_ceiling && Array.isArray(record.reason_codes)), 'SOURCE_PURPOSE_DECISION_INCOMPLETE');
  fail(packages.every(record => record.acquisition_authorized === false && record.public_release === 'HOLD' && record.production === 'HOLD'), 'SOURCE_PURPOSE_PROTECTED_BOUNDARY');

  const currentSoldPackages = packages.filter(record => record.purpose === 'CURRENT_SOLD_TRANSACTION');
  fail(currentSoldPackages.every(record => record.decision === 'RIGHTS_HOLD'), 'CURRENT_SOLD_NON_HOLD_DECISION');
  const boundedCurrentSold = currentSoldPackages.filter(record => record.decision === 'BOUNDED_CONTEXT_ALLOWED');
  fail(boundedCurrentSold.length === 0, 'BOUNDED_CONTEXT_WIDENED_TO_CURRENT_SOLD');

  const methodologyDeclarations = records.flatMap(record => record.admission_declarations || [])
    .filter(declaration => declaration.admission_class === 'REPOSITORY_DECLARED_BOUNDED_SHADOW');
  fail(methodologyDeclarations.every(declaration => declaration.strict_r1_evidence_bound_admission === false), 'METHODOLOGY_DECLARATION_PROMOTED_TO_STRICT_R1');

  const seattle = byId.get('seattle-sold-fleet-equipment-open-data');
  fail(Boolean(seattle), 'SEATTLE_REFERENCE_MISSING');
  if (seattle) {
    fail(seattle.current_sold_reference_rights.decision === 'RIGHTS_CLEAR_FOR_PURPOSE', 'SEATTLE_REFERENCE_RIGHTS_NOT_BOUND');
    fail(seattle.current_sold_rights.decision === 'RIGHTS_HOLD', 'SEATTLE_REFERENCE_WIDENED_TO_CURRENT_SOLD');
    fail(seattle.activation_eligible === false, 'SEATTLE_REFERENCE_ACTIVATION_OVERCLAIM');
  }
  const stateDepartment = byId.get('us-state-department-online-auction');
  fail(Boolean(stateDepartment), 'STATE_DEPARTMENT_BOUNDED_SOURCE_MISSING');
  if (stateDepartment) {
    fail(stateDepartment.current_sold_rights.decision === 'RIGHTS_HOLD', 'STATE_DEPARTMENT_WIDENED_TO_COLLECTOR_CURRENT_SOLD');
    fail(stateDepartment.activation_eligible === false, 'STATE_DEPARTMENT_ACTIVATION_OVERCLAIM');
  }
  const getty = byId.get('getty-provenance-index');
  fail(Boolean(getty), 'GETTY_HISTORICAL_SOURCE_MISSING');
  if (getty) {
    fail(getty.admission_declarations.some(declaration => declaration.purpose === 'HISTORICAL_TRANSACTION_CONTEXT'), 'GETTY_HISTORICAL_PURPOSE_MISSING');
    fail(getty.current_sold_rights.decision === 'RIGHTS_HOLD', 'GETTY_HISTORICAL_WIDENED_TO_CURRENT');
  }

  const digestBasis = structuredClone(ledger);
  delete digestBasis.ledger_digest;
  fail(ledger.ledger_digest === sha256(canonicalJson(digestBasis)), 'LEDGER_DIGEST_MISMATCH');
  return [...new Set(errors)].sort();
}

function requireRejected(name, mutate, pristine, contract) {
  const candidate = structuredClone(pristine);
  mutate(candidate);
  const errors = validateSourceChannelControlPlane(candidate, contract);
  if (!errors.length) throw new Error(`NEGATIVE_MUTATION_ACCEPTED:${name}`);
  return { name, rejected: true, errors };
}

const root = process.cwd();
const ledgerPath = process.argv[2] || DEFAULT_LEDGER;
const contract = JSON.parse(fs.readFileSync(path.join(root, DEFAULT_CONTRACT), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.join(root, ledgerPath), 'utf8'));
const rebuilt = buildSourceChannelControlPlane({ root, contractPath: DEFAULT_CONTRACT });
if (canonicalJson(ledger) !== canonicalJson(rebuilt)) throw new Error('COMMITTED_LEDGER_NOT_REPRODUCIBLE_FROM_REGISTERED_INPUTS');
const errors = validateSourceChannelControlPlane(ledger, contract);
if (errors.length) throw new Error(`SOURCE_CHANNEL_CONTROL_PLANE_INVALID:${errors.join(',')}`);

const mutations = [
  requireRejected('duplicate-alias', candidate => {
    candidate.source_records[1].aliases.push(candidate.source_records[0].aliases[0] || 'bricklink-price-guide-api');
  }, ledger, contract),
  requireRejected('drop-curated-source', candidate => {
    const source = candidate.source_records.find(record => record.curated_frontier_ids.length);
    source.curated_frontier_ids = [];
  }, ledger, contract),
  requireRejected('activate-rights-hold-adapter', candidate => {
    const source = candidate.source_records.find(record => record.adapter_implemented_fixture_verified);
    source.adapter_active = true;
    source.activation_eligible = true;
  }, ledger, contract),
  requireRejected('widen-getty-to-current-sold', candidate => {
    const row = candidate.source_purpose_records.find(record => record.canonical_source_id === 'getty-provenance-index');
    row.purpose = 'CURRENT_SOLD_TRANSACTION';
    row.decision = 'BOUNDED_CONTEXT_ALLOWED';
    row.source_purpose_id = 'getty-provenance-index::CURRENT_SOLD_TRANSACTION';
  }, ledger, contract),
  requireRejected('promote-methodology-to-strict-r1', candidate => {
    const declaration = candidate.source_records.flatMap(record => record.admission_declarations)
      .find(row => row.admission_class === 'REPOSITORY_DECLARED_BOUNDED_SHADOW');
    declaration.strict_r1_evidence_bound_admission = true;
  }, ledger, contract)
];

process.stdout.write(`${JSON.stringify({
  state: 'VERIFIED_PASS',
  ledger: ledgerPath,
  ledger_digest: ledger.ledger_digest,
  summary: ledger.summary,
  negative_mutations: mutations
}, null, 2)}\n`);
