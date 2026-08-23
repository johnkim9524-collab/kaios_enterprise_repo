#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  outputDir = '/tmp/kidults-asi-snapshot-readiness-factory-v1',
  graphPath = '/tmp/p2/owned-source-intelligence-graph-v1.json',
  lineagePath = '/tmp/p2/owned-source-intelligence-lineage-v1.json',
  qualityPath = '/tmp/p2/owned-source-intelligence-quality-v1.json',
  valuePath = '/tmp/p2/owned-source-intelligence-value-receipt-v1.json',
  preflightAssignmentPath = '/tmp/p1/candidate-preflight-assignment-v1.json',
  admissionReadinessPath = '/tmp/p1/candidate-admission-readiness-v1.json',
  missionLedgerPath = '/tmp/p0/mission-consumption-ledger-v1.json',
  laneCoveragePath = '/tmp/p0/mission-lane-coverage-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-contract-v1.json'
] = process.argv.slice(2);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readOutputText = (name) => fs.readFileSync(path.join(outputDir, name), 'utf8');
const readOutputJson = (name) => JSON.parse(readOutputText(name));
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const unique = (values) => new Set(values).size === values.length;
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

const graph = readJson(graphPath);
const lineage = readJson(lineagePath);
const quality = readJson(qualityPath);
const value = readJson(valuePath);
const preflightAssignments = readJson(preflightAssignmentPath);
const admissionReadiness = readJson(admissionReadinessPath);
const missionLedger = readJson(missionLedgerPath);
const laneCoverage = readJson(laneCoveragePath);
const contract = readJson(contractPath);

assert(contract.id === 'kidults-asi-snapshot-readiness-factory-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO' && contract.priority === 'P3', 'CONTRACT_OWNER_PRIORITY');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(contract.readiness_dimensions?.length === 11 && unique(contract.readiness_dimensions), 'CONTRACT_READINESS_DIMENSIONS');
assert(contract.snapshot_creation_gate?.all_dimensions_pass_required === true, 'CONTRACT_ALL_DIMENSIONS');
assert(contract.snapshot_creation_gate?.admitted_evidence_greater_than_zero_required === true, 'CONTRACT_ADMITTED_EVIDENCE');
assert(contract.snapshot_creation_gate?.admitted_current_sold_transactions_greater_than_zero_required === true, 'CONTRACT_CURRENT_SOLD');
assert(contract.snapshot_creation_gate?.admitted_liquidity_evidence_greater_than_zero_required === true, 'CONTRACT_LIQUIDITY');
assert(contract.snapshot_creation_gate?.market_events_greater_than_zero_required === true, 'CONTRACT_MARKET_EVENTS');
assert(contract.snapshot_creation_gate?.immutable_evidence_package_required === true, 'CONTRACT_EVIDENCE_PACKAGE');
assert(contract.snapshot_creation_gate?.snapshot_candidate_may_be_generated_when_gate_fails === false, 'CONTRACT_FAIL_CLOSED');
assert(contract.blocker_classes?.length === 13 && unique(contract.blocker_classes), 'CONTRACT_BLOCKER_CLASSES');
assert(contract.admission_demand_classes?.length === 7 && unique(contract.admission_demand_classes), 'CONTRACT_DEMAND_CLASSES');
assert(contract.required_outputs?.length === 6, 'CONTRACT_OUTPUT_COUNT');
assert(JSON.stringify(contract.forbidden_outputs) === JSON.stringify(['snapshot-candidate.json', 'evidence-package.json', 'rankability-assessment.json']), 'CONTRACT_FORBIDDEN_OUTPUTS');
for (const [key, expected] of Object.entries({
  assesses_snapshot_readiness: true,
  creates_blocker_package: true,
  creates_admission_demand_package: true,
  creates_snapshot_candidate_when_not_ready: false,
  creates_evidence_package_when_not_ready: false,
  starts_track_b_assessment_when_not_ready: false,
  admits_evidence: false,
  creates_market_event: false,
  creates_market_claim: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(contract.truth_boundary?.[key] === expected, `CONTRACT_TRUTH_BOUNDARY:${key}`);

assert(graph.id === 'kidults-owned-source-intelligence-graph-v1' && graph.evidence_admitted === 0 && graph.market_evidence_nodes === 0, 'GRAPH_INPUT_INVALID');
assert(lineage.id === 'kidults-owned-source-intelligence-lineage-v1' && lineage.graph?.digest === digest(stableJson(graph)), 'LINEAGE_INPUT_INVALID');
assert(quality.id === 'kidults-owned-source-intelligence-quality-v1' && quality.state === 'VERIFIED_GRAPH_INTEGRITY_READY', 'QUALITY_INPUT_INVALID');
assert(value.id === 'kidults-owned-source-intelligence-value-receipt-v1' && value.source_intelligence_graph_is_market_evidence_graph === false, 'VALUE_INPUT_INVALID');
assert(preflightAssignments.id === 'kidults-asi-candidate-preflight-assignment-v1' && preflightAssignments.evidence_admitted === 0, 'PREFLIGHT_INPUT_INVALID');
assert(admissionReadiness.id === 'kidults-asi-candidate-admission-readiness-v1' && admissionReadiness.automatic_admission_eligible === 0 && admissionReadiness.evidence_admitted === 0, 'READINESS_INPUT_INVALID');
assert(missionLedger.id === 'kidults-asi-mission-consumption-ledger-v1' && missionLedger.entries?.length === 192, 'MISSION_INPUT_INVALID');
assert(laneCoverage.id === 'kidults-asi-mission-lane-coverage-v1' && laneCoverage.mission_count === 192, 'LANE_INPUT_INVALID');

for (const name of contract.required_outputs) {
  assert(fs.existsSync(path.join(outputDir, name)), `MISSING_OUTPUT:${name}`);
  JSON.parse(readOutputText(name));
}
for (const name of contract.forbidden_outputs) assert(!fs.existsSync(path.join(outputDir, name)), `FORBIDDEN_OUTPUT_EXISTS:${name}`);

const ledger = readOutputJson('snapshot-readiness-ledger-v1.json');
const blockers = readOutputJson('immutable-blocker-package-v1.json');
const demands = readOutputJson('admission-demand-package-v1.json');
const nonGeneration = readOutputJson('snapshot-non-generation-receipt-v1.json');
const trackB = readOutputJson('track-b-handoff-readiness-v1.json');
const manifest = readOutputJson('snapshot-readiness-manifest-v1.json');

assert(ledger.id === 'kidults-asi-snapshot-readiness-ledger-v1', 'LEDGER_ID');
assert(ledger.version === '1.0.0' && ledger.state === 'NOT_READY_NO_ADMITTED_EVIDENCE', 'LEDGER_STATE');
assert(JSON.stringify(ledger.platform_principles) === JSON.stringify(principles), 'LEDGER_PRINCIPLE_ORDER');
assert(ledger.source_graph_digest === lineage.graph.digest, 'LEDGER_GRAPH_DIGEST');
assert(ledger.snapshot_creation_gate_pass === false && ledger.all_dimensions_pass === false, 'LEDGER_GATE_STATE');
assert(ledger.dimensions?.length === contract.readiness_dimensions.length, 'LEDGER_DIMENSION_COUNT');
assert(JSON.stringify(ledger.dimensions.map((item) => item.dimension)) === JSON.stringify(contract.readiness_dimensions), 'LEDGER_DIMENSION_ORDER');
assert(unique(ledger.dimensions.map((item) => item.dimension)), 'LEDGER_DIMENSION_DUPLICATE');
for (const item of ledger.dimensions) {
  assert(['PASS', 'PARTIAL', 'FAIL'].includes(item.state), `LEDGER_DIMENSION_STATE:${item.dimension}`);
  assert(Array.isArray(item.blockers) && Array.isArray(item.evidence_refs), `LEDGER_DIMENSION_EVIDENCE:${item.dimension}`);
  if (item.state !== 'PASS') assert(item.blockers.length > 0, `LEDGER_DIMENSION_BLOCKER:${item.dimension}`);
}
assert(ledger.dimensions.find((item) => item.dimension === 'PURPOSE_SPECIFIC_RIGHTS')?.state === 'FAIL', 'LEDGER_RIGHTS_GATE');
assert(ledger.dimensions.find((item) => item.dimension === 'FACTUAL_ORIGIN_INDEPENDENCE')?.state === 'FAIL', 'LEDGER_ORIGIN_GATE');
for (const dimension of ['EVIDENCE_ADMISSION', 'CURRENT_SOLD_TRANSACTION_EVIDENCE', 'LIQUIDITY_EVIDENCE', 'MARKET_EVENT_GRAPH', 'IMMUTABLE_EVIDENCE_PACKAGE', 'TRACK_B_INPUT_PAIR']) {
  const item = ledger.dimensions.find((entry) => entry.dimension === dimension);
  assert(item?.state === 'FAIL' && Number(item.current_value) === 0, `LEDGER_ZERO_GATE:${dimension}`);
}
assert(Object.keys(ledger.by_evidence_class || {}).length === 2, 'LEDGER_EVIDENCE_CLASS_COUNT');
for (const evidenceClass of ['CURRENT_SOLD_TRANSACTION', 'LIQUIDITY_TIME_TO_SALE_EXPOSURE']) {
  const item = ledger.by_evidence_class[evidenceClass];
  assert(item?.missions === 96, `LEDGER_EVIDENCE_MISSIONS:${evidenceClass}`);
  assert(item.admitted_evidence === 0 && item.admitted_market_events === 0 && item.snapshot_eligible_claims === 0, `LEDGER_EVIDENCE_PROMOTION:${evidenceClass}`);
  assert(item.state === 'NOT_READY_NO_ADMITTED_EVIDENCE', `LEDGER_EVIDENCE_STATE:${evidenceClass}`);
}
const candidateNodes = graph.nodes.filter((node) => node.node_type === 'SOURCE_CANDIDATE');
const preflightNodes = graph.nodes.filter((node) => node.node_type === 'HOST_PREFLIGHT');
assert(ledger.counts?.missions === 192, 'LEDGER_MISSION_COUNT');
assert(ledger.counts?.source_candidates === candidateNodes.length, 'LEDGER_CANDIDATE_COUNT');
assert(ledger.counts?.host_preflights === preflightNodes.length, 'LEDGER_PREFLIGHT_COUNT');
for (const key of ['rights_pass_candidates', 'automatic_admission_eligible', 'admitted_evidence', 'admitted_current_sold_transactions', 'admitted_liquidity_evidence', 'market_events', 'immutable_evidence_packages', 'snapshot_candidates', 'track_b_input_pairs']) {
  assert(ledger.counts?.[key] === 0, `LEDGER_ZERO_COUNT:${key}`);
}
assert(ledger.snapshot_candidate_generated === false && ledger.evidence_package_generated === false && ledger.track_b_assessment_started === false, 'LEDGER_OUTPUT_OVERCLAIM');
assert(ledger.public_release === 'HOLD' && ledger.production === 'HOLD', 'LEDGER_RELEASE_BOUNDARY');

assert(blockers.id === 'kidults-asi-immutable-blocker-package-v1', 'BLOCKER_ID');
assert(blockers.state === 'OPEN_BLOCKERS_PREVENT_SNAPSHOT_AND_TRACK_B', 'BLOCKER_STATE');
assert(blockers.source_graph_digest === lineage.graph.digest, 'BLOCKER_GRAPH_DIGEST');
assert(blockers.blocker_count === blockers.blockers?.length && blockers.blocker_count >= 10, 'BLOCKER_COUNT');
assert(blockers.p0_blocker_count + blockers.p1_blocker_count === blockers.blocker_count, 'BLOCKER_SEVERITY_PARTITION');
assert(unique(blockers.blockers.map((item) => item.blocker_id)), 'BLOCKER_ID_DUPLICATE');
assert(unique(blockers.blockers.map((item) => item.blocker_class)), 'BLOCKER_CLASS_DUPLICATE');
for (const required of ['PURPOSE_RIGHTS_UNKNOWN', 'FACTUAL_ORIGIN_INDEPENDENCE_NOT_PROVEN', 'EVIDENCE_ADMISSION_ZERO', 'CURRENT_SOLD_TRANSACTION_EVIDENCE_ZERO', 'LIQUIDITY_EVIDENCE_ZERO', 'MARKET_EVENT_GRAPH_ZERO', 'IMMUTABLE_EVIDENCE_PACKAGE_MISSING', 'SNAPSHOT_CANDIDATE_NOT_GENERATED', 'TRACK_B_INPUT_PAIR_MISSING']) {
  assert(blockers.blockers.some((item) => item.blocker_class === required), `BLOCKER_REQUIRED:${required}`);
}
for (const item of blockers.blockers) {
  assert(contract.blocker_classes.includes(item.blocker_class), `BLOCKER_CLASS:${item.blocker_id}`);
  assert(['P0', 'P1'].includes(item.severity) && item.state === 'OPEN' && item.snapshot_gate_effect === 'BLOCK', `BLOCKER_METADATA:${item.blocker_id}`);
  assert(typeof item.unblock_condition === 'string' && item.unblock_condition.length > 20, `BLOCKER_UNBLOCK:${item.blocker_id}`);
  assert(Array.isArray(item.dependencies) && item.dependencies.length > 0 && Array.isArray(item.evidence_refs) && item.evidence_refs.length > 0, `BLOCKER_LINEAGE:${item.blocker_id}`);
  assert(item.public_release === 'HOLD' && item.production === 'HOLD', `BLOCKER_RELEASE:${item.blocker_id}`);
}
assert(blockers.package_is_evidence_package === false && blockers.snapshot_candidate_generated === false, 'BLOCKER_PACKAGE_BOUNDARY');
const blockerCore = { ...blockers };
delete blockerCore.package_digest;
assert(blockers.package_digest === digest(stableJson(blockerCore)), 'BLOCKER_PACKAGE_DIGEST');

assert(demands.id === 'kidults-asi-admission-demand-package-v1', 'DEMAND_ID');
assert(demands.state === 'OPEN_ADMISSION_AND_GAP_DEMANDS', 'DEMAND_STATE');
assert(demands.source_graph_digest === lineage.graph.digest, 'DEMAND_GRAPH_DIGEST');
assert(demands.demand_count === contract.admission_demand_classes.length && demands.demands?.length === demands.demand_count, 'DEMAND_COUNT');
assert(unique(demands.demands.map((item) => item.demand_id)), 'DEMAND_ID_DUPLICATE');
assert(JSON.stringify(demands.demands.map((item) => item.demand_class)) === JSON.stringify(contract.admission_demand_classes), 'DEMAND_CLASS_ORDER');
assert(demands.open_demand_classes === demands.demands.filter((item) => item.state === 'OPEN').length, 'DEMAND_OPEN_CLASSES');
assert(demands.total_open_items === demands.demands.reduce((total, item) => total + item.item_count, 0), 'DEMAND_ITEM_COUNT');
for (const item of demands.demands) {
  assert(['OPEN', 'NO_CURRENT_ITEMS'].includes(item.state), `DEMAND_STATE_ITEM:${item.demand_id}`);
  assert(item.item_count === item.item_refs.length && unique(item.item_refs), `DEMAND_REFS:${item.demand_id}`);
  assert(typeof item.required_output === 'string' && item.required_output.length > 10, `DEMAND_OUTPUT:${item.demand_id}`);
  assert(item.can_create_evidence_admission === false, `DEMAND_ADMISSION:${item.demand_id}`);
}
assert(demands.package_is_evidence_admission === false && demands.evidence_admitted === 0, 'DEMAND_PACKAGE_BOUNDARY');
const demandCore = { ...demands };
delete demandCore.package_digest;
assert(demands.package_digest === digest(stableJson(demandCore)), 'DEMAND_PACKAGE_DIGEST');

assert(nonGeneration.id === 'kidults-asi-snapshot-non-generation-receipt-v1', 'NON_GENERATION_ID');
assert(nonGeneration.state === 'SNAPSHOT_NOT_GENERATED_FAIL_CLOSED', 'NON_GENERATION_STATE');
assert(nonGeneration.source_graph_digest === lineage.graph.digest, 'NON_GENERATION_GRAPH_DIGEST');
assert(nonGeneration.snapshot_creation_gate_pass === false, 'NON_GENERATION_GATE');
assert(nonGeneration.snapshot_candidate_generated === false && nonGeneration.snapshot_candidate_file === null, 'NON_GENERATION_SNAPSHOT');
assert(nonGeneration.evidence_package_generated === false && nonGeneration.evidence_package_file === null, 'NON_GENERATION_EVIDENCE_PACKAGE');
assert(Array.isArray(nonGeneration.reason_codes) && nonGeneration.reason_codes.length === blockers.blocker_count, 'NON_GENERATION_REASONS');
assert(unique(nonGeneration.reason_codes), 'NON_GENERATION_REASON_DUPLICATE');
assert(nonGeneration.blocker_package_digest === blockers.package_digest && nonGeneration.admission_demand_package_digest === demands.package_digest, 'NON_GENERATION_PACKAGE_BINDING');
assert(nonGeneration.non_generation_is_expected_safe_behavior === true && nonGeneration.receipt_is_snapshot_candidate === false, 'NON_GENERATION_BOUNDARY');
const nonGenerationCore = { ...nonGeneration };
delete nonGenerationCore.receipt_digest;
assert(nonGeneration.receipt_digest === digest(stableJson(nonGenerationCore)), 'NON_GENERATION_DIGEST');

assert(trackB.id === 'kidults-asi-track-b-handoff-readiness-v1', 'TRACK_B_ID');
assert(trackB.state === 'WAITING_FOR_SNAPSHOT_CANDIDATE_AND_EVIDENCE_PACKAGE', 'TRACK_B_STATE');
assert(trackB.required_inputs?.length === 2, 'TRACK_B_INPUT_COUNT');
assert(trackB.required_inputs[0].name === 'snapshot-candidate.json' && trackB.required_inputs[0].exists === false && trackB.required_inputs[0].digest === null, 'TRACK_B_SNAPSHOT_INPUT');
assert(trackB.required_inputs[1].name === 'Evidence Package' && trackB.required_inputs[1].exists === false && trackB.required_inputs[1].digest === null, 'TRACK_B_EVIDENCE_INPUT');
assert(trackB.exact_pair_digest === null, 'TRACK_B_PAIR_DIGEST');
assert(trackB.independent_assessment_started === false && trackB.independent_assessment_output_exists === false, 'TRACK_B_ASSESSMENT_OVERCLAIM');
assert(trackB.blocker_package_digest === blockers.package_digest && trackB.snapshot_non_generation_receipt_digest === nonGeneration.receipt_digest, 'TRACK_B_LINEAGE');
assert(trackB.waiting_state_is_assessment === false, 'TRACK_B_WAITING_ASSESSMENT');

assert(manifest.id === 'kidults-asi-snapshot-readiness-manifest-v1', 'MANIFEST_ID');
assert(manifest.state === 'P3_SNAPSHOT_FACTORY_FAIL_CLOSED_NOT_READY', 'MANIFEST_STATE');
assert(JSON.stringify(manifest.platform_principles) === JSON.stringify(principles), 'MANIFEST_PRINCIPLE_ORDER');
assert(manifest.input_bindings?.source_graph?.digest === lineage.graph.digest, 'MANIFEST_GRAPH_BINDING');
assert(manifest.results?.readiness_state === ledger.state, 'MANIFEST_READINESS_STATE');
assert(manifest.results?.readiness_dimensions === 11, 'MANIFEST_DIMENSIONS');
assert(manifest.results?.pass_dimensions + manifest.results?.partial_dimensions + manifest.results?.fail_dimensions === 11, 'MANIFEST_DIMENSION_PARTITION');
assert(manifest.results?.source_candidates === candidateNodes.length && manifest.results?.host_preflights === preflightNodes.length, 'MANIFEST_SOURCE_COUNTS');
assert(manifest.results?.blocker_count === blockers.blocker_count, 'MANIFEST_BLOCKER_COUNT');
assert(manifest.results?.open_admission_demand_classes === demands.open_demand_classes, 'MANIFEST_DEMAND_COUNT');
for (const key of ['admitted_evidence', 'admitted_current_sold_transactions', 'admitted_liquidity_evidence', 'market_events', 'immutable_evidence_packages', 'snapshot_candidates_generated', 'track_b_input_pairs', 'track_b_assessments_started']) {
  assert(manifest.results?.[key] === 0, `MANIFEST_ZERO_COUNT:${key}`);
}
assert(manifest.output_files?.length === 5, 'MANIFEST_OUTPUT_FILE_COUNT');
for (const output of manifest.output_files) {
  const content = readOutputText(output.name);
  assert(output.sha256 === digest(content), `MANIFEST_OUTPUT_DIGEST:${output.name}`);
  assert(output.bytes === Buffer.byteLength(content), `MANIFEST_OUTPUT_BYTES:${output.name}`);
}
assert(JSON.stringify(manifest.forbidden_output_files_absent) === JSON.stringify(contract.forbidden_outputs), 'MANIFEST_FORBIDDEN_OUTPUTS');
for (const name of manifest.forbidden_output_files_absent) assert(!fs.existsSync(path.join(outputDir, name)), `MANIFEST_FORBIDDEN_EXISTS:${name}`);
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE_BOUNDARY');

console.log(JSON.stringify({
  id: 'kidults-asi-snapshot-readiness-factory-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  snapshot_readiness_state: ledger.state,
  readiness_dimensions: ledger.dimensions.length,
  pass_dimensions: manifest.results.pass_dimensions,
  partial_dimensions: manifest.results.partial_dimensions,
  fail_dimensions: manifest.results.fail_dimensions,
  source_candidates: manifest.results.source_candidates,
  host_preflights: manifest.results.host_preflights,
  blocker_count: blockers.blocker_count,
  p0_blockers: blockers.p0_blocker_count,
  p1_blockers: blockers.p1_blocker_count,
  open_admission_demand_classes: demands.open_demand_classes,
  total_admission_demand_items: demands.total_open_items,
  snapshot_candidate_generated: false,
  evidence_package_generated: false,
  track_b_state: trackB.state,
  track_b_assessment_started: false,
  admitted_evidence: 0,
  market_events: 0,
  forbidden_output_files_absent: contract.forbidden_outputs,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
