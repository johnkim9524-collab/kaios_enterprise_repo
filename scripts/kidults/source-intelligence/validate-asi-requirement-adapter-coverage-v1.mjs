#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildPurposeRightsIndex, RIGHTS_CLEAR } from './lib/source-purpose-rights-gate-v1.mjs';

const [outputDir, queuePath, manifestPath, receiptPath, artifactBindingPath, contractPath, purposeRightsPreflightPath] = process.argv.slice(2);
if (![outputDir, queuePath, manifestPath, receiptPath, artifactBindingPath, contractPath, purposeRightsPreflightPath].every(Boolean)) {
  throw new Error('REQUIREMENT_ADAPTER_COVERAGE_VALIDATION_ARGUMENTS_REQUIRED');
}

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const same = (left, right) => stableJson(left) === stableJson(right);
const hash = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const shaId = (prefix, value) => `${prefix}::${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
const uniq = (values) => [...new Set((values || []).filter(Boolean))].sort();
const assertRuntimeHold = (runtime, label) => {
  assert(runtime?.state === 'NOT_EXECUTED_NO_DURABLE_CONSUMER_RECEIPT' &&
    runtime?.durable_consumer_implemented === false && runtime?.first_admission_count === 0 &&
    runtime?.acknowledgement_count === 0 && runtime?.retry_count === 0 &&
    runtime?.dead_letter_queue_count === 0 && runtime?.runtime_receipt_ref === null &&
    runtime?.zero_counts_are_not_readiness === true, `GAP_RUNTIME_EXECUTION_OVERCLAIM:${label}`);
};
const countBy = (values, keyFn) => Object.fromEntries([...values.reduce((map, value) => {
  const key = keyFn(value);
  map.set(key, (map.get(key) || 0) + 1);
  return map;
}, new Map()).entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
const file = (name) => path.join(outputDir, name);
const required = [
  'requirement-adapter-coverage-ledger-v1.json',
  'requirement-adapter-family-coverage-v1.json',
  'source-adapter-claim-ceiling-registry-v1.json',
  'requirement-adapter-gap-queue-v1.json',
  'requirement-adapter-coverage-manifest-v1.json',
];
for (const name of required) assert(fs.existsSync(file(name)), `OUTPUT_FILE_MISSING:${name}`);
assert(same(fs.readdirSync(outputDir).filter((name) => name.endsWith('.json')).sort(), [...required].sort()), 'OUTPUT_FILE_SET_INVALID');

const contract = json(contractPath);
const artifactBindingSchema = json(contract.authoritative_inputs?.artifact_binding_schema);
const purposeRightsPreflight = json(purposeRightsPreflightPath);
const artifactBinding = json(artifactBindingPath);
const queue = json(queuePath);
const ledger = json(file(required[0]));
const familyCoverage = json(file(required[1]));
const claimCeilings = json(file(required[2]));
const gapQueue = json(file(required[3]));
const outputManifest = json(file(required[4]));
const baseline = contract.expected_current_main_baseline;
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-requirement-adapter-coverage-contract-v1' && contract.version === '1.2.0', 'CONTRACT_ID_VERSION');
assert(same(contract.platform_principles, principles), 'CONTRACT_PRINCIPLES');
assert(same(contract.required_outputs, required), 'CONTRACT_REQUIRED_OUTPUTS');
const artifactBindingValidator = new Ajv2020({ allErrors: true, strict: true }).compile(artifactBindingSchema);
assert(artifactBindingValidator(artifactBinding), `ARTIFACT_BINDING_SCHEMA_INVALID:${JSON.stringify(artifactBindingValidator.errors || [])}`);
assert(!Object.hasOwn(artifactBinding, 'production_eligible'), 'ARTIFACT_BINDING_LEGACY_PRODUCTION_ELIGIBLE_FORBIDDEN');
assert(contract.canonical_fanout?.upstream_class === 'ASI_AUTONOMOUS_RESOLUTION' && contract.canonical_fanout?.canonical_run_key === 'head_sha:upstream_class', 'CONTRACT_CANONICAL_FANOUT');
assert(artifactBinding.upstream_class === contract.canonical_fanout.upstream_class, 'ARTIFACT_BINDING_UPSTREAM_CLASS');
assert(artifactBinding.canonical_run_key === `${artifactBinding.head_sha}:${artifactBinding.upstream_class}`, 'ARTIFACT_BINDING_CANONICAL_RUN_KEY');
assert(purposeRightsPreflight.id === 'kidults-top16-empirical-activation-preflight-v1' && purposeRightsPreflight.rows?.length === 16, 'PURPOSE_RIGHTS_PREFLIGHT_INPUT');
const purposeRightsIndex = buildPurposeRightsIndex(
  purposeRightsPreflight,
  purposeRightsPreflight.rows.map((row) => row.source_id),
  'CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION'
);
const expectedRightsClear = [...purposeRightsIndex.values()].filter((value) => value.decision === RIGHTS_CLEAR).length;

const expectedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-requirement-adapter-coverage-expected-'));
try {
  const replay = spawnSync(process.execPath, [
    'scripts/kidults/source-intelligence/build-asi-requirement-adapter-coverage-v1.mjs',
    queuePath,
    manifestPath,
    receiptPath,
    artifactBindingPath,
    contractPath,
    purposeRightsPreflightPath,
    expectedDir,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert(replay.status === 0, `EXPECTED_REBUILD_FAILED:${replay.stderr || replay.stdout}`);
  for (const name of required) {
    assert(read(file(name)) === read(path.join(expectedDir, name)), `OUTPUT_REBUILD_MISMATCH:${name}`);
  }
} finally {
  fs.rmSync(expectedDir, { recursive: true, force: true });
}

assert(ledger.id === 'kidults-asi-requirement-adapter-coverage-ledger-v1' && ledger.version === contract.version, 'LEDGER_ID_VERSION');
assert(ledger.state === 'ALL_AUTHORITATIVE_REQUIREMENTS_CROSSWALKED_TO_CURRENT_CLAIM_CEILINGS', 'LEDGER_STATE');
assert(same(ledger.platform_principles, principles), 'LEDGER_PRINCIPLES');
assert(ledger.authoritative_requirement_grain === 'AUTONOMOUS_RESOLUTION_MISSION_V1', 'LEDGER_GRAIN');
assert(ledger.requirement_count === 192 && ledger.records?.length === 192, 'LEDGER_REQUIREMENT_COUNT');
assert(ledger.unique_mission_count === 192 && uniq(ledger.records.map((record) => record.mission_id)).length === 192, 'LEDGER_MISSION_UNIQUENESS');
assert(ledger.unique_market_cell_count === 192 && uniq(ledger.records.map((record) => record.market_cell_id)).length === 192, 'LEDGER_MARKET_CELL_UNIQUENESS');
assert(ledger.scope_count === 32 && ledger.region_count === 3 && ledger.domain_count === 8 && ledger.family_count === 16, 'LEDGER_DIMENSION_COUNTS');
assert(ledger.evidence_class_counts?.CURRENT_SOLD_TRANSACTION === 96 && ledger.evidence_class_counts?.LIQUIDITY_TIME_TO_SALE_EXPOSURE === 96, 'LEDGER_EVIDENCE_DENOMINATOR');
assert(ledger.software_coverage_counts?.SOFTWARE_IMPLEMENTED === baseline.software_implemented_requirements, 'LEDGER_SOFTWARE_IMPLEMENTED_COUNT');
assert(ledger.software_coverage_counts?.CONTEXT_ONLY === baseline.context_only_requirements, 'LEDGER_CONTEXT_ONLY_COUNT');
assert(ledger.software_coverage_counts?.NO_IMPLEMENTED_CLAIM_PARSER === baseline.claim_parser_not_implemented_requirements, 'LEDGER_CLAIM_PARSER_NOT_IMPLEMENTED_COUNT');
assert(ledger.source_discovery_or_schema_activation_hold_count === baseline.source_discovery_or_schema_activation_hold_requirements, 'LEDGER_SOURCE_OR_SCHEMA_HOLD_COUNT');
assert(ledger.rights_schema_activation_hold_count === 192, 'LEDGER_EMPIRICAL_HOLD_COUNT');
assert(ledger.legacy_v2_adapter_requirement_ids_available === 0 && ledger.legacy_v2_adapter_requirement_ids_synthesized === 0, 'LEDGER_V2_ID_SYNTHESIS');
assert(ledger.evidence_admitted === 0 && ledger.market_events_created === 0, 'LEDGER_EMPIRICAL_PROMOTION');
assert(ledger.public_release === 'HOLD' && ledger.production === 'HOLD' && ledger.g5 === 'HOLD', 'LEDGER_RELEASE_BOUNDARY');

assert(uniq(ledger.records.map((record) => record.coverage_record_id)).length === 192, 'COVERAGE_RECORD_ID_DUPLICATE');
for (const record of ledger.records) {
  assert(/^requirement-adapter-coverage::[a-f0-9]{64}$/.test(record.coverage_record_id), `COVERAGE_RECORD_ID_FORMAT:${record.mission_id}`);
  assert(record.authoritative_requirement_grain === 'AUTONOMOUS_RESOLUTION_MISSION_V1', `COVERAGE_GRAIN:${record.mission_id}`);
  assert(record.legacy_v2_adapter_requirement_id === null && record.legacy_v2_identifier_synthesized === false, `COVERAGE_V2_ID_SYNTHESIS:${record.mission_id}`);
  assert(record.mission_id === `mission::${record.market_cell_id}`, `COVERAGE_MISSION_FORMAT:${record.mission_id}`);
  assert(record.market_cell_id === `${record.scope_id}::${record.region}::${record.evidence_class}`, `COVERAGE_MARKET_CELL_FORMAT:${record.mission_id}`);
  assert(record.producer_source_sha === artifactBinding.execution_sha && record.consumer_source_sha === artifactBinding.consumer_sha, `COVERAGE_SOURCE_SHA:${record.mission_id}`);
  assert(/^sha256:[a-f0-9]{64}$/.test(record.upstream_digests?.replacement_queue) && /^sha256:[a-f0-9]{64}$/.test(record.upstream_digests?.resolution_manifest), `COVERAGE_UPSTREAM_DIGEST:${record.mission_id}`);
  assert(record.selected_source_ids.every((sourceId) => record.eligible_source_ids.includes(sourceId)), `COVERAGE_SELECTED_NOT_ELIGIBLE:${record.mission_id}`);
  assert(record.acquisition_eligible_source_ids.every((sourceId) => record.rights_clear_source_ids.includes(sourceId)), `COVERAGE_ACQUISITION_RIGHTS:${record.mission_id}`);
  assert(record.rights_hold_source_ids.every((sourceId) => purposeRightsIndex.get(sourceId)?.decision !== RIGHTS_CLEAR), `COVERAGE_RIGHTS_HOLD_SET:${record.mission_id}`);
  assert(record.qualifying_software_adapter_ids.every((sourceId) => record.eligible_source_ids.includes(sourceId)), `COVERAGE_QUALIFYING_NOT_ELIGIBLE:${record.mission_id}`);
  assert(record.selected_qualifying_software_adapter_ids.every((sourceId) => record.selected_source_ids.includes(sourceId) && record.qualifying_software_adapter_ids.includes(sourceId)), `COVERAGE_SELECTED_QUALIFYING_INVALID:${record.mission_id}`);
  assert(record.source_evaluations?.length === record.eligible_source_ids.length, `COVERAGE_EVALUATION_COUNT:${record.mission_id}`);
  for (const evaluation of record.source_evaluations) {
    const rights = purposeRightsIndex.get(evaluation.source_id);
    assert(rights && evaluation.purpose_rights_decision === rights.decision && same(evaluation.purpose_rights_reason_codes, rights.reason_codes), `COVERAGE_PURPOSE_RIGHTS_BINDING:${record.mission_id}:${evaluation.source_id}`);
    assert(evaluation.acquisition_or_adapter_backlog_eligible === (rights.decision === RIGHTS_CLEAR), `COVERAGE_PURPOSE_RIGHTS_ELIGIBILITY:${record.mission_id}:${evaluation.source_id}`);
    const literalMatch = evaluation.implemented_claim_parsers.includes(record.required_adapter_claim);
    assert(evaluation.required_claim_parser_match === literalMatch, `COVERAGE_LITERAL_CLAIM_MATCH:${record.mission_id}:${evaluation.source_id}`);
    assert(evaluation.adapter_implemented === true, `COVERAGE_ADAPTER_IMPLEMENTATION:${record.mission_id}:${evaluation.source_id}`);
    assert(evaluation.empirical_state === 'RIGHTS_SCHEMA_ACTIVATION_HOLD', `COVERAGE_EVALUATION_EMPIRICAL_STATE:${record.mission_id}:${evaluation.source_id}`);
    assert(evaluation.rights_verified === false && evaluation.live_schema_verified === false && evaluation.adapter_activated === false && evaluation.evidence_admitted === false, `COVERAGE_EVALUATION_PROMOTION:${record.mission_id}:${evaluation.source_id}`);
    if (evaluation.adapter_kind === 'CONTEXT_ONLY_CLASSIFIER') {
      assert(evaluation.implemented_claim_parsers.length === 0 && evaluation.context_only_claims.length > 0 && evaluation.required_claim_parser_match === false, `CONTEXT_COUNTED_AS_PARSER:${record.mission_id}:${evaluation.source_id}`);
    }
    for (const claim of evaluation.unimplemented_registered_claims) {
      assert(!evaluation.implemented_claim_parsers.includes(claim), `REGISTERED_CLAIM_INHERITED:${record.mission_id}:${evaluation.source_id}:${claim}`);
    }
  }
  if (record.software_coverage_state === 'SOFTWARE_IMPLEMENTED') {
    assert(record.qualifying_software_adapter_ids.length > 0, `SOFTWARE_IMPLEMENTED_WITHOUT_MATCH:${record.mission_id}`);
  } else if (record.software_coverage_state === 'CONTEXT_ONLY') {
    assert(record.qualifying_software_adapter_ids.length === 0 && record.source_evaluations.some((evaluation) => evaluation.adapter_kind === 'CONTEXT_ONLY_CLASSIFIER'), `CONTEXT_ONLY_STATE_INVALID:${record.mission_id}`);
  } else {
    assert(record.software_coverage_state === 'NO_IMPLEMENTED_CLAIM_PARSER' && record.qualifying_software_adapter_ids.length === 0, `CLAIM_PARSER_NOT_IMPLEMENTED_STATE_INVALID:${record.mission_id}`);
  }
  assert(record.empirical_state === 'RIGHTS_SCHEMA_ACTIVATION_HOLD' && same(record.empirical_hold_reasons, contract.empirical_hold_reasons), `COVERAGE_EMPIRICAL_HOLD:${record.mission_id}`);
  assert(record.rights_verified === false && record.live_schema_verified === false && record.adapter_activated === false && record.evidence_admitted === false, `COVERAGE_EMPIRICAL_PROMOTION:${record.mission_id}`);
  assert(record.market_event_created === false && record.snapshot_candidate_created === false && record.track_b_result_created === false && record.projection_created === false, `COVERAGE_DOWNSTREAM_PROMOTION:${record.mission_id}`);
  assert(record.public_release === 'HOLD' && record.production === 'HOLD' && record.g5 === 'HOLD', `COVERAGE_RELEASE_BOUNDARY:${record.mission_id}`);
}

assert(familyCoverage.id === 'kidults-asi-requirement-adapter-family-coverage-v1' && familyCoverage.family_count === 16, 'FAMILY_LEDGER_ID_COUNT');
assert(familyCoverage.version === contract.version, 'FAMILY_LEDGER_VERSION');
assert(familyCoverage.requirement_count === 192 && familyCoverage.software_implemented_requirement_count === 39, 'FAMILY_LEDGER_REQUIREMENT_COUNTS');
assert(familyCoverage.fully_software_covered_families === 1 && familyCoverage.partially_software_covered_families === 5 && familyCoverage.zero_software_covered_families === 10, 'FAMILY_STATE_COUNTS');
assert(familyCoverage.families?.length === 16 && uniq(familyCoverage.families.map((family) => family.adapter_family_id)).length === 16, 'FAMILY_ID_UNIQUENESS');
for (const family of familyCoverage.families) {
  assert(family.requirement_count === 12 && family.scope_count === 4 && family.region_count === 3, `FAMILY_DIMENSIONS:${family.adapter_family_id}`);
  assert(family.software_implemented_count + family.context_only_count + family.claim_parser_not_implemented_count === 12, `FAMILY_COVERAGE_SUM:${family.adapter_family_id}`);
  assert(family.source_discovery_or_schema_activation_hold_count === 12 - family.software_implemented_count, `FAMILY_GAP_SUM:${family.adapter_family_id}`);
  assert(family.rights_schema_activation_hold_count === 12 && family.evidence_admitted === 0 && family.market_events_created === 0, `FAMILY_EMPIRICAL_BOUNDARY:${family.adapter_family_id}`);
  assert(family.public_release === 'HOLD' && family.production === 'HOLD' && family.g5 === 'HOLD', `FAMILY_RELEASE_BOUNDARY:${family.adapter_family_id}`);
}

assert(claimCeilings.id === 'kidults-asi-source-adapter-claim-ceiling-registry-v1' && claimCeilings.source_profile_count === 16, 'CLAIM_CEILING_ID_SOURCE_COUNT');
assert(claimCeilings.implemented_source_adapter_count === 16, 'CLAIM_CEILING_IMPLEMENTED_COUNT');
assert(claimCeilings.transaction_parser_count === 9 && claimCeilings.exposure_parser_count === 3 && claimCeilings.context_only_classifier_count === 4, 'CLAIM_CEILING_KIND_COUNTS');
assert(claimCeilings.verified_assignment_count_metadata_sum === 156 && claimCeilings.verified_assignment_count_is_requirement_denominator === false, 'CLAIM_CEILING_DENOMINATOR_SUBSTITUTION');
assert(claimCeilings.sources?.length === 16 && uniq(claimCeilings.sources.map((source) => source.source_id)).length === 16, 'CLAIM_CEILING_SOURCE_UNIQUENESS');
for (const source of claimCeilings.sources) {
  assert(source.adapter_implemented === true, `CLAIM_CEILING_ADAPTER_NOT_IMPLEMENTED:${source.source_id}`);
  assert(source.implemented_claim_parsers.every((claim) => source.registered_claims.includes(claim)), `CLAIM_CEILING_UNREGISTERED_IMPLEMENTATION:${source.source_id}`);
  assert(source.unimplemented_registered_claims.every((claim) => source.registered_claims.includes(claim) && !source.implemented_claim_parsers.includes(claim)), `CLAIM_CEILING_INHERITANCE:${source.source_id}`);
  if (source.adapter_kind === 'CONTEXT_ONLY_CLASSIFIER') assert(source.implemented_claim_parsers.length === 0 && source.context_only_claims.length > 0, `CLAIM_CEILING_CONTEXT_KIND:${source.source_id}`);
  assert(source.live_source_snapshots_verified === 0 && source.field_purpose_rights_verified === false && source.adapter_activated === false && source.empirical_market_events_admitted === 0, `CLAIM_CEILING_EMPIRICAL_PROMOTION:${source.source_id}`);
}
assert(claimCeilings.live_source_snapshots_verified === 0 && claimCeilings.field_purpose_rights_verified_sources === 0 && claimCeilings.source_specific_adapters_activated === 0, 'CLAIM_CEILING_PORTFOLIO_PROMOTION');
assert(claimCeilings.evidence_admitted === 0 && claimCeilings.market_events_created === 0, 'CLAIM_CEILING_EVENTS_PROMOTION');

const expectedGapIds = ledger.records.filter((record) => record.software_coverage_state !== 'SOFTWARE_IMPLEMENTED').map((record) => record.coverage_record_id);
assert(gapQueue.id === 'kidults-asi-requirement-adapter-gap-queue-v1' && gapQueue.state === 'CURRENT_GAPS_BOUND_TO_ACCOUNTABLE_WORK_UNITS_EXTERNAL_ACTIVATION_HOLD' && gapQueue.gap_count === 153 && gapQueue.records?.length === 153, 'GAP_QUEUE_ID_COUNT');
assert(gapQueue.version === contract.version, 'GAP_QUEUE_VERSION');
assert(gapQueue.context_only_count === 15 && gapQueue.claim_parser_not_implemented_count === 138, 'GAP_QUEUE_STATE_COUNTS');
assert(gapQueue.source_profile_discovery_count === 120 && gapQueue.schema_bound_claim_parser_count === 33 && gapQueue.internally_unbound_execution_queue_count === 0, 'GAP_QUEUE_CLASS_COUNTS');
assert(gapQueue.accountable_owner_bound_count === 153 && gapQueue.sla_bound_count === 153 && gapQueue.idempotency_key_bound_count === 153 && gapQueue.generic_fallback_bound_count === 153, 'GAP_QUEUE_ACCOUNTABILITY_COVERAGE');
assert(gapQueue.unique_record_idempotency_key_count === 153 && gapQueue.duplicate_record_idempotency_key_count === 0, 'GAP_QUEUE_IDEMPOTENCY_COUNTS');
assert(gapQueue.work_unit_count === 52 && gapQueue.source_discovery_work_unit_count === 42 && gapQueue.schema_bound_source_claim_work_unit_count === 10, 'GAP_QUEUE_WORK_UNIT_COUNTS');
assert(gapQueue.work_unit_owner_sla_fallback_bound_count === 52 && gapQueue.work_units?.length === 52, 'GAP_QUEUE_WORK_UNIT_ACCOUNTABILITY');
const operatingModel = contract.gap_queue_operating_model;
const workUnitById = new Map(gapQueue.work_units.map((unit) => [unit.work_unit_id, unit]));
assert(workUnitById.size === 52, 'GAP_WORK_UNIT_ID_DUPLICATE');
assert(uniq(gapQueue.work_units.map((unit) => unit.idempotency_key)).length === 52, 'GAP_WORK_UNIT_IDEMPOTENCY_DUPLICATE');
const discoveryGroupKeys = new Set();
const schemaGroupKeys = new Set();
for (const record of gapQueue.records) {
  const expectedClass = record.eligible_source_ids.length === 0 ? 'SOURCE_PROFILE_DISCOVERY_REQUIRED' : 'SCHEMA_BOUND_CLAIM_PARSER_NOT_AVAILABLE';
  assert(record.gap_class === expectedClass, `GAP_CLASS:${record.coverage_record_id}`);
  const policy = expectedClass === 'SOURCE_PROFILE_DISCOVERY_REQUIRED' ? operatingModel.source_discovery_bundle : operatingModel.schema_bound_source_claim_unit;
  assert(record.queue_record_id === shaId('requirement-adapter-gap-queue-record', { coverage_record_id: record.coverage_record_id, gap_class: record.gap_class }), `GAP_QUEUE_RECORD_ID:${record.coverage_record_id}`);
  assert(record.idempotency_key === shaId('requirement-adapter-gap-idempotency', { coverage_record_id: record.coverage_record_id, gap_class: record.gap_class, required_adapter_claim: record.required_adapter_claim }), `GAP_IDEMPOTENCY_KEY:${record.coverage_record_id}`);
  assert(record.accountable_owner === operatingModel.record_accountable_owner && record.execution_owner === policy.execution_owner, `GAP_OWNER:${record.coverage_record_id}`);
  assert(record.queue_state === operatingModel.record_queue_state && record.priority === operatingModel.record_priority, `GAP_QUEUE_STATE_PRIORITY:${record.coverage_record_id}`);
  assert(record.sla?.policy_id === policy.sla_policy_id && record.sla?.clock === 'SUCCESSFUL_CANONICAL_COVERAGE_RUNS' && record.sla?.start_event === 'FIRST_CANONICAL_QUEUE_ADMISSION', `GAP_SLA_ID_CLOCK:${record.coverage_record_id}`);
  assert(record.sla?.acknowledgement_due_after_successful_canonical_runs === policy.ack_due_after_successful_canonical_runs && record.sla?.resolution_due_after_successful_canonical_runs === policy.resolution_due_after_successful_canonical_runs && record.sla?.protected_gate_wait_pauses_resolution_clock === true, `GAP_SLA_WINDOW:${record.coverage_record_id}`);
  assert(record.fallback_path?.path_id === policy.fallback_path_id && same(record.fallback_path?.steps, operatingModel.fallback_paths[policy.fallback_path_id]), `GAP_FALLBACK_PATH:${record.coverage_record_id}`);
  assert(record.fallback_path?.external_contact_authorized === false && record.fallback_path?.live_source_request_authorized === false && record.fallback_path?.adapter_activation_authorized === false && record.fallback_path?.terminal_state_without_prerequisites === 'HOLD', `GAP_FALLBACK_AUTHORITY:${record.coverage_record_id}`);
  assert(record.external_contact_authorized === false && record.live_source_request_authorized === false && record.adapter_activation_authorized === false && record.production_authorized === false, `GAP_RECORD_AUTHORITY:${record.coverage_record_id}`);
  assertRuntimeHold(record.runtime_execution, `RECORD:${record.coverage_record_id}`);
  assert(record.work_unit_ids?.length > 0 && record.work_unit_ids.every((workUnitId) => workUnitById.has(workUnitId)), `GAP_WORK_UNIT_BINDING:${record.coverage_record_id}`);
  if (expectedClass === 'SOURCE_PROFILE_DISCOVERY_REQUIRED') {
    discoveryGroupKeys.add(`${record.domain}::${record.region}::${record.evidence_class}`);
    assert(record.work_unit_ids.length === 1 && workUnitById.get(record.work_unit_ids[0])?.unit_class === 'SOURCE_PROFILE_DISCOVERY_BUNDLE', `GAP_DISCOVERY_WORK_UNIT:${record.coverage_record_id}`);
  } else {
    for (const sourceId of record.eligible_source_ids) schemaGroupKeys.add(`${sourceId}::${record.required_adapter_claim}`);
    assert(record.work_unit_ids.length === record.eligible_source_ids.length && record.work_unit_ids.every((workUnitId) => workUnitById.get(workUnitId)?.unit_class === 'SCHEMA_BOUND_SOURCE_CLAIM_UNIT'), `GAP_SCHEMA_WORK_UNIT:${record.coverage_record_id}`);
  }
}
assert(discoveryGroupKeys.size === 42 && schemaGroupKeys.size === 10, 'GAP_RECOMPUTED_WORK_UNIT_COUNTS');
const forwardMembership = gapQueue.records.flatMap((record) => record.work_unit_ids.map((workUnitId) => `${record.coverage_record_id}::${workUnitId}`)).sort();
const reverseMembership = gapQueue.work_units.flatMap((unit) => unit.coverage_record_ids.map((coverageRecordId) => `${coverageRecordId}::${unit.work_unit_id}`)).sort();
assert(same(forwardMembership, reverseMembership), 'GAP_RECORD_WORK_UNIT_BIDIRECTIONAL_MEMBERSHIP');
assert(gapQueue.record_to_work_unit_membership_count === forwardMembership.length, 'GAP_RECORD_WORK_UNIT_MEMBERSHIP_COUNT');
for (const unit of gapQueue.work_units) {
  const policy = unit.unit_class === 'SOURCE_PROFILE_DISCOVERY_BUNDLE' ? operatingModel.source_discovery_bundle : operatingModel.schema_bound_source_claim_unit;
  assert(['SOURCE_PROFILE_DISCOVERY_BUNDLE', 'SCHEMA_BOUND_SOURCE_CLAIM_UNIT'].includes(unit.unit_class), `GAP_WORK_UNIT_CLASS:${unit.work_unit_id}`);
  assert(unit.work_unit_id === shaId('requirement-adapter-gap-work-unit', { unit_class: unit.unit_class, ...unit.grouping }) && unit.idempotency_key === shaId('requirement-adapter-gap-work-unit-idempotency', { unit_class: unit.unit_class, ...unit.grouping }), `GAP_WORK_UNIT_ID_FORMAT:${unit.work_unit_id}`);
  assert(unit.requirement_count === unit.coverage_record_ids?.length && unit.requirement_count > 0 && unit.coverage_record_ids.every((coverageRecordId) => expectedGapIds.includes(coverageRecordId)), `GAP_WORK_UNIT_MEMBERSHIP:${unit.work_unit_id}`);
  assert(unit.accountable_owner === 'KPMO' && unit.execution_owner === policy.execution_owner && unit.queue_state === 'QUEUED_PREREQUISITES_PENDING' && unit.priority === 'P1', `GAP_WORK_UNIT_OWNER_STATE:${unit.work_unit_id}`);
  assert(unit.sla?.policy_id === policy.sla_policy_id && unit.fallback_path?.path_id === policy.fallback_path_id && unit.fallback_path?.external_contact_authorized === false && unit.fallback_path?.terminal_state_without_prerequisites === 'HOLD', `GAP_WORK_UNIT_SLA_FALLBACK:${unit.work_unit_id}`);
  assertRuntimeHold(unit.runtime_execution, `WORK_UNIT:${unit.work_unit_id}`);
  assert(unit.public_release === 'HOLD' && unit.production === 'HOLD' && unit.g5 === 'HOLD', `GAP_WORK_UNIT_RELEASE_BOUNDARY:${unit.work_unit_id}`);
}
assert(same(uniq(gapQueue.records.map((record) => record.coverage_record_id)), uniq(expectedGapIds)), 'GAP_QUEUE_RECORD_SET');
assertRuntimeHold(gapQueue.runtime_execution, 'QUEUE');
assert(gapQueue.evidence_admitted === 0 && gapQueue.public_release === 'HOLD' && gapQueue.production === 'HOLD' && gapQueue.g5 === 'HOLD', 'GAP_QUEUE_BOUNDARY');

assert(outputManifest.id === 'kidults-asi-requirement-adapter-coverage-manifest-v1' && outputManifest.version === contract.version, 'OUTPUT_MANIFEST_ID_VERSION');
assert(outputManifest.state === 'ACCOUNTABLE_INTERNAL_GAP_QUEUE_READY_EXTERNAL_ACTIVATION_HOLD', 'OUTPUT_MANIFEST_STATE');
assert(same(outputManifest.platform_principles, principles), 'OUTPUT_MANIFEST_PRINCIPLES');
assert(outputManifest.source_sha === artifactBinding.execution_sha && outputManifest.producer_head_sha === artifactBinding.head_sha &&
  outputManifest.consumer_sha === artifactBinding.consumer_sha, 'OUTPUT_MANIFEST_SHA_BINDING');
assert(outputManifest.input_bindings?.upstream_artifact?.artifact_binding_id === artifactBinding.id && outputManifest.input_bindings?.upstream_artifact?.artifact_binding_version === artifactBinding.version && outputManifest.input_bindings?.upstream_artifact?.artifact_id === artifactBinding.artifact_id && outputManifest.input_bindings?.upstream_artifact?.workflow_run_id === artifactBinding.workflow_run_id, 'OUTPUT_MANIFEST_ARTIFACT_BINDING');
assert(outputManifest.input_bindings?.upstream_artifact?.head_sha === artifactBinding.head_sha &&
  outputManifest.input_bindings?.upstream_artifact?.upstream_class === artifactBinding.upstream_class &&
  outputManifest.input_bindings?.upstream_artifact?.canonical_run_key === artifactBinding.canonical_run_key &&
  outputManifest.input_bindings?.upstream_artifact?.expected_source_sha === artifactBinding.expected_source_sha &&
  outputManifest.input_bindings?.upstream_artifact?.execution_sha === artifactBinding.execution_sha &&
  outputManifest.input_bindings?.upstream_artifact?.expected_head_branch === artifactBinding.expected_head_branch &&
  outputManifest.input_bindings?.upstream_artifact?.validation_scope === artifactBinding.validation_scope &&
  outputManifest.input_bindings?.upstream_artifact?.main_scope_validated === artifactBinding.main_scope_validated &&
  outputManifest.input_bindings?.upstream_artifact?.production_authorized === false,
  'OUTPUT_MANIFEST_ARTIFACT_SCOPE_BINDING');
assert(outputManifest.input_bindings?.artifact_binding_schema?.path === contract.authoritative_inputs.artifact_binding_schema && outputManifest.input_bindings?.artifact_binding_schema?.digest === hash(read(contract.authoritative_inputs.artifact_binding_schema)), 'OUTPUT_MANIFEST_ARTIFACT_SCHEMA_BINDING');
assert(outputManifest.input_bindings?.upstream_artifact?.source_sha_ancestor_of_consumer === true &&
  outputManifest.input_bindings?.upstream_artifact?.execution_sha_ancestor_of_consumer === true &&
  outputManifest.input_bindings?.upstream_artifact?.expired === false, 'OUTPUT_MANIFEST_ARTIFACT_TRUST');
assert(outputManifest.results?.requirements_accounted_for === 192 && outputManifest.results?.duplicate_requirements === 0 && outputManifest.results?.silently_dropped_requirements === 0, 'OUTPUT_MANIFEST_ACCOUNTING');
assert(outputManifest.results?.registered_source_profiles === 16 && outputManifest.results?.implemented_source_adapters === 16, 'OUTPUT_MANIFEST_SOURCE_DENOMINATOR');
assert(outputManifest.results?.software_implemented_requirements === 39 && outputManifest.results?.context_only_requirements === 15 && outputManifest.results?.claim_parser_not_implemented_requirements === 138, 'OUTPUT_MANIFEST_COVERAGE_COUNTS');
assert(outputManifest.results?.source_discovery_or_schema_activation_hold_requirements === 153 && outputManifest.results?.rights_schema_activation_hold_requirements === 192, 'OUTPUT_MANIFEST_GAP_HOLD_COUNTS');
assert(outputManifest.results?.source_profile_discovery_requirements === 120 && outputManifest.results?.schema_bound_claim_parser_requirements === 33, 'OUTPUT_MANIFEST_GAP_CLASS_COUNTS');
assert(outputManifest.results?.accountable_gap_records === 153 && outputManifest.results?.gap_records_with_sla === 153 && outputManifest.results?.gap_records_with_idempotency_key === 153 && outputManifest.results?.gap_records_with_generic_fallback === 153, 'OUTPUT_MANIFEST_GAP_ACCOUNTABILITY_COUNTS');
assert(outputManifest.results?.gap_work_units === 52 && outputManifest.results?.source_discovery_work_units === 42 && outputManifest.results?.schema_bound_source_claim_work_units === 10, 'OUTPUT_MANIFEST_GAP_WORK_UNIT_COUNTS');
assert(outputManifest.results?.gap_record_to_work_unit_memberships === gapQueue.record_to_work_unit_membership_count &&
  outputManifest.results?.durable_consumer_implemented === false && outputManifest.results?.first_admission_count === 0 &&
  outputManifest.results?.acknowledgement_count === 0 && outputManifest.results?.retry_count === 0 &&
  outputManifest.results?.dead_letter_queue_count === 0, 'OUTPUT_MANIFEST_RUNTIME_EXECUTION_OVERCLAIM');
assert(!Object.hasOwn(outputManifest.results, 'software_gap_requirements') && !Object.hasOwn(outputManifest.results, 'unmapped_requirements'), 'OUTPUT_MANIFEST_LEGACY_METRICS_NOT_ISOLATED');
assert(outputManifest.deprecated_compatibility_metrics?.status === 'READ_ONLY_TRANSLATION_NOT_CANONICAL_STATUS', 'OUTPUT_MANIFEST_DEPRECATED_METRICS_STATUS');
assert(outputManifest.deprecated_compatibility_metrics?.software_gap_requirements?.value === 153 && outputManifest.deprecated_compatibility_metrics?.software_gap_requirements?.interpretation_forbidden === 'MISSING_INTERNAL_CODE_MODULES', 'OUTPUT_MANIFEST_DEPRECATED_SOFTWARE_GAP_TRANSLATION');
assert(outputManifest.deprecated_compatibility_metrics?.unmapped_requirements?.value === 138 && outputManifest.deprecated_compatibility_metrics?.unmapped_requirements?.canonical_replacement === 'claim_parser_not_implemented_requirements', 'OUTPUT_MANIFEST_DEPRECATED_UNMAPPED_TRANSLATION');
assert(outputManifest.results?.original_preflight_actions === 672 && outputManifest.results?.terminal_preflight_actions === 672 && outputManifest.results?.unresolved_preflight_actions === 0, 'OUTPUT_MANIFEST_PREFLIGHT_TERMINALIZATION');
assert(outputManifest.results?.gate1_remaining_hold === 0 && outputManifest.results?.internal_unbound_execution_queue_count === 0, 'OUTPUT_MANIFEST_INTERNAL_QUEUE_CLOSED');
assert(outputManifest.results?.rights_clear_registered_profiles === expectedRightsClear, 'OUTPUT_MANIFEST_RIGHTS_CLEAR_COUNT');
assert(outputManifest.results?.rights_hold_registered_profiles === purposeRightsIndex.size - expectedRightsClear, 'OUTPUT_MANIFEST_RIGHTS_HOLD_COUNT');
assert(outputManifest.results?.rights_preflight_queue_items === outputManifest.results?.rights_hold_registered_profiles, 'OUTPUT_MANIFEST_RIGHTS_QUEUE_COUNT');
const expectedRightsMissionCount = new Set(ledger.records.filter((record) => record.selected_source_ids.length > 0).map((record) => record.mission_id)).size;
const expectedRightsSlots = ledger.records.reduce((total, record) => total + record.selected_source_ids.length, 0);
const expectedRightsSelected = uniq(ledger.records.flatMap((record) => record.selected_source_ids)).length;
assert(outputManifest.results?.replacement_missions_with_rights_clear_profiles === expectedRightsMissionCount && outputManifest.results?.replacement_source_slots_filled === expectedRightsSlots && outputManifest.results?.unique_rights_clear_profiles_selected === expectedRightsSelected, 'OUTPUT_MANIFEST_REPLACEMENT_RIGHTS_COUNTS');
assert(outputManifest.results?.rights_clear_gate === 'RIGHTS_CLEAR_FOR_PURPOSE_REQUIRED_BEFORE_ADAPTER_BACKLOG_OR_REPLACEMENT_PROFILE_SELECTION', 'OUTPUT_MANIFEST_RIGHTS_GATE');
assert(outputManifest.results?.legacy_v2_adapter_requirement_ids_synthesized === 0 && outputManifest.results?.duplicate_sdk_or_runtime_introduced === 0, 'OUTPUT_MANIFEST_FORBIDDEN_ASSETS');
for (const key of ['live_source_requests_executed', 'provider_contacts_executed', 'rights_passes_created', 'adapters_activated', 'evidence_admitted', 'market_events_created', 'snapshot_candidates_created', 'track_b_results_created', 'projections_created']) {
  assert(outputManifest.results?.[key] === 0, `OUTPUT_MANIFEST_PROMOTION:${key}`);
}
assert(outputManifest.output_files?.length === 4, 'OUTPUT_MANIFEST_FILE_COUNT');
for (const output of outputManifest.output_files) {
  assert(required.includes(output.name) && output.name !== 'requirement-adapter-coverage-manifest-v1.json', `OUTPUT_MANIFEST_FILE_NAME:${output.name}`);
  const text = read(file(output.name));
  assert(output.sha256 === hash(text) && output.bytes === Buffer.byteLength(text), `OUTPUT_MANIFEST_FILE_DIGEST:${output.name}`);
}
assert(outputManifest.public_release === 'HOLD' && outputManifest.production === 'HOLD' && outputManifest.g5 === 'HOLD', 'OUTPUT_MANIFEST_RELEASE_BOUNDARY');
assert(outputManifest.upstream_class === artifactBinding.upstream_class && outputManifest.canonical_run_key === artifactBinding.canonical_run_key, 'OUTPUT_MANIFEST_CANONICAL_RUN_BINDING');
assert(outputManifest.main_scope_validated === artifactBinding.main_scope_validated && outputManifest.production_authorized === false, 'OUTPUT_MANIFEST_PRODUCTION_AUTHORITY_BOUNDARY');
assert(!Object.hasOwn(outputManifest.input_bindings?.upstream_artifact || {}, 'production_eligible'), 'OUTPUT_MANIFEST_LEGACY_PRODUCTION_ELIGIBLE_FORBIDDEN');

const stateCounts = countBy(ledger.records, (record) => record.software_coverage_state);
console.log(JSON.stringify({
  id: 'kidults-asi-requirement-adapter-coverage-validation-v1',
  version: contract.version,
  state: 'VERIFIED_PASS',
  source_sha: outputManifest.source_sha,
  consumer_sha: outputManifest.consumer_sha,
  upstream_class: outputManifest.upstream_class,
  canonical_run_key: outputManifest.canonical_run_key,
  requirements_accounted_for: ledger.requirement_count,
  duplicate_requirements: 0,
  silently_dropped_requirements: 0,
  family_count: familyCoverage.family_count,
  registered_source_profiles: claimCeilings.source_profile_count,
  implemented_source_adapters: claimCeilings.implemented_source_adapter_count,
  software_implemented_requirements: stateCounts.SOFTWARE_IMPLEMENTED || 0,
  context_only_requirements: stateCounts.CONTEXT_ONLY || 0,
  claim_parser_not_implemented_requirements: stateCounts.NO_IMPLEMENTED_CLAIM_PARSER || 0,
  source_discovery_or_schema_activation_hold_requirements: gapQueue.gap_count,
  source_profile_discovery_requirements: gapQueue.source_profile_discovery_count,
  schema_bound_claim_parser_requirements: gapQueue.schema_bound_claim_parser_count,
  accountable_gap_records: gapQueue.accountable_owner_bound_count,
  gap_work_units: gapQueue.work_unit_count,
  source_discovery_work_units: gapQueue.source_discovery_work_unit_count,
  schema_bound_source_claim_work_units: gapQueue.schema_bound_source_claim_work_unit_count,
  unresolved_preflight_actions: outputManifest.results.unresolved_preflight_actions,
  internal_unbound_execution_queue_count: outputManifest.results.internal_unbound_execution_queue_count,
  rights_schema_activation_hold_requirements: ledger.rights_schema_activation_hold_count,
  legacy_v2_adapter_requirement_ids_synthesized: 0,
  duplicate_sdk_or_runtime_introduced: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  main_scope_validated: outputManifest.main_scope_validated,
  production_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
