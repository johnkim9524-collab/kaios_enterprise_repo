#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  outputDir = '/tmp/kidults-asi-mission-directed-discovery-v1',
  discoveryPath = '/tmp/kidults-asi-mission-directed-discovery-v1/mission-directed-discovery-v1.json',
  gate1Path = '/tmp/asi-gate1-safe-candidate-pool-v1.json',
  gate2Path = '/tmp/asi-gate2-independent-reverification-v1.json',
  gate3Path = '/tmp/asi-gate3-admission-runtime-v1.json',
  strictGatePath = 'coordination/kidults/source-intelligence/strict-current-market-admission-gate-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-mission-directed-discovery-contract-v1.json'
] = process.argv.slice(2);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readOutput = (name) => readJson(path.join(outputDir, name));
const digestFile = (file) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
const unique = (values) => new Set(values).size === values.length;

const discovery = readJson(discoveryPath);
const gate1 = readJson(gate1Path);
const gate2 = readJson(gate2Path);
const gate3 = readJson(gate3Path);
const strictGate = readJson(strictGatePath);
const contract = readJson(contractPath);
const gateSummary = readOutput('mission-directed-gate-summary-v1.json');
const readiness = readOutput('mission-claim-admission-readiness-v1.json');
const adapters = readOutput('mission-source-adapter-requirements-v1.json');
const manifest = readOutput('mission-directed-discovery-manifest-v1.json');
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-mission-directed-discovery-contract-v1', 'CONTRACT_ID');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(strictGate.id === 'kidults-strict-current-market-admission-gate-v1', 'STRICT_GATE_ID');
assert(discovery.id === 'kidults-asi-mission-directed-public-metadata-discovery-v1', 'DISCOVERY_ID');
assert(gate1.id === 'kidults-asi-gate1-safe-candidate-pool-v1' && gate1.input_candidate_count === discovery.candidate_count, 'GATE1_BINDING');
assert(gate2.id === 'kidults-asi-gate2-independent-reverification-v1' && gate2.input_safe_candidate_count === gate1.safe_candidate_count, 'GATE2_BINDING');
assert(gate3.id === 'kidults-asi-gate3-admission-runtime-v1' && gate3.input_verified_for_gate3_count === gate2.verified_for_gate3_count, 'GATE3_BINDING');

assert(gateSummary.id === 'kidults-asi-mission-directed-gate-summary-v1', 'GATE_SUMMARY_ID');
assert(gateSummary.state === 'GATE1_TO_GATE3_METADATA_CONTROL_CHAIN_COMPLETE', 'GATE_SUMMARY_STATE');
assert(gateSummary.discovery_candidates === discovery.candidate_count, 'GATE_SUMMARY_DISCOVERY_COUNT');
assert(gateSummary.gate1?.input === gate1.input_candidate_count && gateSummary.gate1?.safe === gate1.safe_candidate_count &&
  gateSummary.gate1?.review_required === gate1.review_required_count && gateSummary.gate1?.hard_block === gate1.hard_block_count, 'GATE_SUMMARY_GATE1');
assert(gateSummary.gate2?.input === gate2.input_safe_candidate_count && gateSummary.gate2?.verified_for_gate3 === gate2.verified_for_gate3_count &&
  gateSummary.gate2?.needs_clarification === gate2.needs_clarification_count && gateSummary.gate2?.blocked === gate2.blocked_count, 'GATE_SUMMARY_GATE2');
assert(gateSummary.gate3?.input === gate3.input_verified_for_gate3_count && gateSummary.gate3?.metadata_admitted === gate3.admitted_count &&
  gateSummary.gate3?.external_approval_required === gate3.external_approval_required_count && gateSummary.gate3?.conditional_hold === gate3.conditional_hold_count, 'GATE_SUMMARY_GATE3');
assert(gateSummary.metadata_admission_scope === 'DISCOVERY_METADATA_INDEX_ONLY' && gateSummary.metadata_admission_is_market_event_admission === false, 'GATE_SUMMARY_SCOPE');
assert(gateSummary.current_price_eligible_count === 0 && gateSummary.liquidity_eligible_count === 0 && gateSummary.market_event_admitted_count === 0, 'GATE_SUMMARY_CLAIM_OVERCLAIM');
assert(gateSummary.public_release === 'HOLD' && gateSummary.production === 'HOLD', 'GATE_SUMMARY_RELEASE');

const currentSoldCandidates = discovery.candidates.filter((candidate) => candidate.evidence_class === 'CURRENT_SOLD_TRANSACTION').length;
const liquidityCandidates = discovery.candidates.filter((candidate) => candidate.evidence_class === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE').length;
const expectedReadinessRecords = currentSoldCandidates * 2 + liquidityCandidates;
assert(readiness.id === 'kidults-asi-mission-claim-admission-readiness-v1', 'READINESS_ID');
assert(readiness.state === 'CLAIM_ADMISSION_GAPS_COMPILED_ALL_HOLD', 'READINESS_STATE');
assert(readiness.strict_gate_id === strictGate.id && readiness.strict_gate_version === strictGate.version, 'READINESS_STRICT_GATE');
assert(readiness.source_candidate_count === discovery.candidate_count, 'READINESS_SOURCE_COUNT');
assert(readiness.readiness_record_count === expectedReadinessRecords && readiness.records?.length === expectedReadinessRecords, 'READINESS_RECORD_COUNT');
assert(readiness.claim_class_counts?.DATED_OBSERVED_SOLD_TRANSACTION === currentSoldCandidates, 'READINESS_DATED_SOLD_COUNT');
assert(readiness.claim_class_counts?.CURRENT_PRICE === currentSoldCandidates, 'READINESS_CURRENT_PRICE_COUNT');
assert(readiness.claim_class_counts?.LIQUIDITY_OR_TIME_TO_SALE === liquidityCandidates, 'READINESS_LIQUIDITY_COUNT');
assert(readiness.claim_ready_count === 0 && readiness.current_price_eligible_count === 0 && readiness.liquidity_eligible_count === 0 && readiness.dated_observed_sold_transaction_eligible_count === 0, 'READINESS_ELIGIBILITY_OVERCLAIM');
assert(readiness.metadata_candidate_can_pass_claim_admission === false && readiness.gate3_metadata_admission_can_pass_claim_admission === false, 'READINESS_METADATA_BOUNDARY');
assert(unique(readiness.records.map((record) => record.readiness_id)), 'READINESS_DUPLICATE_ID');
for (const record of readiness.records) {
  const policy = strictGate.claim_classes?.[record.claim_class];
  assert(policy && Array.isArray(policy.required), `READINESS_POLICY:${record.readiness_id}`);
  assert(record.claim_state === 'HOLD_DISCOVERY_METADATA_ONLY_ALL_CLAIM_ASSERTIONS_UNSATISFIED', `READINESS_CLAIM_STATE:${record.readiness_id}`);
  assert(record.required_assertion_count === policy.required.length, `READINESS_REQUIRED_COUNT:${record.readiness_id}`);
  assert(record.satisfied_assertion_count === 0 && record.satisfied_assertions?.length === 0, `READINESS_SATISFIED_OVERCLAIM:${record.readiness_id}`);
  assert(record.missing_assertion_count === policy.required.length && JSON.stringify(record.missing_assertions) === JSON.stringify(policy.required), `READINESS_MISSING_ASSERTIONS:${record.readiness_id}`);
  assert(Array.isArray(record.source_metadata_signals) && record.source_metadata_signals.length >= 6, `READINESS_METADATA_SIGNALS:${record.readiness_id}`);
  assert(record.metadata_index_admission_is_claim_admission === false, `READINESS_METADATA_PROMOTION:${record.readiness_id}`);
  assert(record.exposure_denominator_present === false && record.exact_item_identity_present === false && record.realized_price_present === false && record.event_date_present === false, `READINESS_FIELD_OVERCLAIM:${record.readiness_id}`);
  assert(record.field_purpose_rights_complete === false && record.source_owner_independence_verified === false && record.factual_origin_independence_verified === false, `READINESS_RIGHTS_OR_INDEPENDENCE:${record.readiness_id}`);
  assert(record.current_price_eligible === false && record.liquidity_eligible === false && record.market_event_admitted === false, `READINESS_CLAIM_ELIGIBILITY:${record.readiness_id}`);
  assert(record.public_release === 'HOLD' && record.production === 'HOLD', `READINESS_RELEASE:${record.readiness_id}`);
}
assert(readiness.public_release === 'HOLD' && readiness.production === 'HOLD', 'READINESS_GLOBAL_RELEASE');

assert(adapters.id === 'kidults-asi-mission-source-adapter-requirements-v1', 'ADAPTER_ID');
assert(adapters.state === 'SOURCE_SPECIFIC_ADAPTER_BACKLOG_COMPILED', 'ADAPTER_STATE');
assert(adapters.unique_host_evidence_class_count === adapters.requirements?.length && adapters.unique_host_evidence_class_count > 0, 'ADAPTER_COUNT');
assert(adapters.adapter_runtime_implemented_count === 0 && adapters.adapter_runtime_tested_count === 0 && adapters.collection_authorized_count === 0 && adapters.market_event_admitted_count === 0, 'ADAPTER_OVERCLAIM');
assert(unique(adapters.requirements.map((requirement) => requirement.adapter_requirement_id)), 'ADAPTER_DUPLICATE_ID');
for (const requirement of adapters.requirements) {
  assert(requirement.state === 'SOURCE_SPECIFIC_CLAIM_ADAPTER_NOT_IMPLEMENTED', `ADAPTER_REQUIREMENT_STATE:${requirement.adapter_requirement_id}`);
  assert(Array.isArray(requirement.endpoint_examples) && requirement.endpoint_examples.length > 0, `ADAPTER_ENDPOINT:${requirement.adapter_requirement_id}`);
  assert(Array.isArray(requirement.mission_ids) && requirement.mission_ids.length > 0, `ADAPTER_MISSIONS:${requirement.adapter_requirement_id}`);
  assert(Array.isArray(requirement.market_cell_ids) && requirement.market_cell_ids.length > 0, `ADAPTER_CELLS:${requirement.adapter_requirement_id}`);
  assert(Array.isArray(requirement.target_claim_classes) && requirement.target_claim_classes.length > 0, `ADAPTER_CLAIMS:${requirement.adapter_requirement_id}`);
  assert(JSON.stringify(requirement.required_adapter_outputs) === JSON.stringify(contract.claim_readiness.required_adapter_outputs), `ADAPTER_OUTPUTS:${requirement.adapter_requirement_id}`);
  assert(Array.isArray(requirement.required_claim_assertions) && requirement.required_claim_assertions.length > 0, `ADAPTER_ASSERTIONS:${requirement.adapter_requirement_id}`);
  assert(requirement.exact_source_terms_and_rights_review_required === true && requirement.source_owner_independence_verification_required === true && requirement.factual_origin_independence_verification_required === true && requirement.collector_market_representativeness_review_required === true, `ADAPTER_REVIEW_REQUIREMENTS:${requirement.adapter_requirement_id}`);
  assert(requirement.adapter_runtime_implemented === false && requirement.adapter_runtime_tested === false && requirement.collection_authorized === false && requirement.market_event_admitted === false, `ADAPTER_RUNTIME_OVERCLAIM:${requirement.adapter_requirement_id}`);
  assert(requirement.public_release === 'HOLD' && requirement.production === 'HOLD', `ADAPTER_RELEASE:${requirement.adapter_requirement_id}`);
}
assert(adapters.public_release === 'HOLD' && adapters.production === 'HOLD', 'ADAPTER_GLOBAL_RELEASE');

assert(manifest.id === 'kidults-asi-mission-directed-discovery-manifest-v1', 'MANIFEST_ID');
assert(manifest.state === 'LIVE_DISCOVERY_GATE_CHAIN_AND_P1_GAPS_READY', 'MANIFEST_STATE');
assert(JSON.stringify(manifest.platform_principles) === JSON.stringify(principles), 'MANIFEST_PRINCIPLE_ORDER');
for (const [key, file] of Object.entries({ discovery: discoveryPath, gate1: gate1Path, gate2: gate2Path, gate3: gate3Path, strict_gate: strictGatePath, contract: contractPath })) {
  assert(manifest.input_digests?.[key] === digestFile(file), `MANIFEST_INPUT_DIGEST:${key}`);
}
assert(manifest.results?.cycle_number === discovery.cycle_number, 'MANIFEST_CYCLE');
assert(manifest.results?.attempted_intents === discovery.attempted_intent_count, 'MANIFEST_INTENTS');
assert(manifest.results?.candidates === discovery.candidate_count, 'MANIFEST_CANDIDATES');
assert(manifest.results?.gate1_safe === gate1.safe_candidate_count && manifest.results?.gate2_verified === gate2.verified_for_gate3_count && manifest.results?.gate3_metadata_admitted === gate3.admitted_count, 'MANIFEST_GATE_COUNTS');
assert(manifest.results?.claim_readiness_records === readiness.records.length && manifest.results?.claim_ready === 0, 'MANIFEST_READINESS');
assert(manifest.results?.source_specific_adapter_requirements === adapters.requirements.length, 'MANIFEST_ADAPTERS');
assert(manifest.results?.current_price_eligible === 0 && manifest.results?.liquidity_eligible === 0 && manifest.results?.market_event_admitted === 0, 'MANIFEST_CLAIM_OVERCLAIM');
assert(manifest.results?.target_site_body_traversed === false && manifest.results?.source_content_collected === false && manifest.results?.collection_right_created === false, 'MANIFEST_COLLECTION_BOUNDARY');
assert(manifest.output_files?.length === 3, 'MANIFEST_OUTPUT_FILE_COUNT');
for (const output of manifest.output_files) {
  const file = path.join(outputDir, output.name);
  assert(output.sha256 === digestFile(file), `MANIFEST_OUTPUT_DIGEST:${output.name}`);
  assert(output.bytes === fs.statSync(file).size, `MANIFEST_OUTPUT_BYTES:${output.name}`);
}
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE');

console.log(JSON.stringify({
  id: 'kidults-asi-mission-claim-admission-readiness-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  discovery_candidates: discovery.candidate_count,
  gate1_safe: gate1.safe_candidate_count,
  gate2_verified: gate2.verified_for_gate3_count,
  gate3_metadata_admitted: gate3.admitted_count,
  readiness_records: readiness.records.length,
  claim_ready: 0,
  source_adapter_requirements: adapters.requirements.length,
  current_price_eligible: 0,
  liquidity_eligible: 0,
  market_event_admitted: 0,
  target_site_body_traversed: false,
  source_content_collected: false,
  collection_right_created: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
