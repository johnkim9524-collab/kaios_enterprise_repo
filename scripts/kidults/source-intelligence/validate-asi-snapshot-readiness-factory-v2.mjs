#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  PRINCIPLES, deriveReadiness, digestObject, hashText, stableJson,
} from './lib/asi-snapshot-readiness-factory-v2.mjs';

const args = process.argv.slice(2);
if (args.length !== 14) throw new Error('P3_VALIDATION_ARGUMENTS_REQUIRED');
const [out, p0r, p0b, p0m, p1g, p1a, p1q, p1m, p2g, p2l, p2q, p2v, p2m, cp] = args;
const fail = (message) => { throw new Error(message); };
const ok = (condition, message) => { if (!condition) fail(message); };
const text = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(text(file));
const outputPath = (name) => path.join(out, name);
const outputText = (name) => text(outputPath(name));
const outputJson = (name) => json(outputPath(name));
const exists = (name) => fs.existsSync(outputPath(name));

const contract = json(cp);
const inputs = {
  p0Registry: json(p0r),
  p0Bindings: json(p0b),
  p0Manifest: json(p0m),
  p1Gate: json(p1g),
  p1Admission: json(p1a),
  p1Actions: json(p1q),
  p1Manifest: json(p1m),
  p2Graph: json(p2g),
  p2Lineage: json(p2l),
  p2Quality: json(p2q),
  p2Value: json(p2v),
  p2Manifest: json(p2m),
};
const derived = deriveReadiness(inputs, contract);

ok(contract.id === 'kidults-asi-snapshot-readiness-factory-contract-v2' && contract.version === '2.1.0', 'CONTRACT_ID_VERSION');
ok(JSON.stringify(contract.platform_principles) === JSON.stringify(PRINCIPLES), 'CONTRACT_PRINCIPLES');
ok(contract.prerequisite_dimensions?.length === 10 && contract.output_assertion_dimensions?.length === 2 && contract.readiness_dimensions?.length === 12, 'CONTRACT_DIMENSION_COUNTS');
ok(contract.snapshot_creation_gate?.snapshot_candidate_may_be_generated_when_gate_fails === false, 'CONTRACT_FAIL_CLOSED');
ok(contract.snapshot_creation_gate?.output_existence_is_prerequisite === false, 'CONTRACT_LIVENESS_BOUNDARY');
ok(contract.snapshot_creation_gate?.blocker_package_may_be_called_evidence_package === false, 'CONTRACT_BLOCKER_BOUNDARY');
ok(contract.snapshot_creation_gate?.track_b_may_start_without_exact_immutable_pair === false, 'CONTRACT_TRACK_B_BOUNDARY');
ok(JSON.stringify(contract.always_required_outputs) === JSON.stringify([
  'snapshot-readiness-ledger-v2.json', 'immutable-blocker-package-v2.json',
  'admission-demand-package-v2.json', 'track-b-handoff-readiness-v2.json',
  'snapshot-readiness-manifest-v2.json',
]), 'CONTRACT_ALWAYS_OUTPUTS');
ok(JSON.stringify(contract.outputs_when_gate_fails) === JSON.stringify(['snapshot-non-generation-receipt-v2.json']), 'CONTRACT_GATE_FAIL_OUTPUTS');
ok(JSON.stringify(contract.outputs_when_gate_passes) === JSON.stringify(['snapshot-candidate.json', 'evidence-package.json', 'snapshot-pair-generation-receipt-v2.json']), 'CONTRACT_GATE_PASS_OUTPUTS');
for (const name of contract.always_required_outputs) ok(exists(name), `MISSING_ALWAYS_OUTPUT:${name}`);
for (const name of contract.forbidden_outputs_always) ok(!exists(name), `ALWAYS_FORBIDDEN_OUTPUT_PRESENT:${name}`);

const readiness = outputJson('snapshot-readiness-ledger-v2.json');
const blockers = outputJson('immutable-blocker-package-v2.json');
const demand = outputJson('admission-demand-package-v2.json');
const trackB = outputJson('track-b-handoff-readiness-v2.json');
const manifest = outputJson('snapshot-readiness-manifest-v2.json');

ok(readiness.id === 'kidults-asi-snapshot-readiness-ledger-v2' && readiness.version === '2.1.0', 'READINESS_ID_VERSION');
ok(JSON.stringify(readiness.platform_principles) === JSON.stringify(PRINCIPLES) && readiness.source_graph_digest === derived.sourceGraphDigest, 'READINESS_BINDING');
ok(readiness.snapshot_creation_prerequisites_pass === derived.prerequisitesPass && readiness.snapshot_creation_gate_pass === derived.prerequisitesPass, 'READINESS_GATE');
ok(stableJson(readiness.prerequisite_dimensions) === stableJson(derived.prerequisiteDimensions), 'READINESS_PREREQUISITE_DIMENSIONS');
ok(readiness.dimensions?.length === 12 && JSON.stringify(readiness.dimensions.map((value) => value.dimension)) === JSON.stringify(contract.readiness_dimensions), 'READINESS_DIMENSIONS');
ok(readiness.counts.missions === derived.missionCount && readiness.counts.source_candidates === derived.candidateCount && readiness.counts.unique_hosts === derived.uniqueHosts, 'READINESS_P0_COUNTS');
ok(readiness.counts.gate1_pass === derived.actualGatePass && readiness.counts.gate1_hold === derived.actualGateHold && readiness.counts.gate1_reject === derived.actualGateReject, 'READINESS_GATE1_COUNTS');
ok(readiness.counts.preflight_actions === inputs.p1Actions.action_count && readiness.counts.preflight_actions_completed === derived.completedActions, 'READINESS_ACTION_COUNTS');
ok(readiness.counts.rights_pass_candidates === derived.rightsPass && readiness.counts.semantic_verified_grains === derived.semanticVerified, 'READINESS_RIGHTS_SEMANTIC_COUNTS');
ok(readiness.counts.regional_coverage_verified_missions === derived.regionalCoverageVerified && readiness.counts.factual_origin_independence_verified_missions === derived.factualOriginVerified, 'READINESS_COVERAGE_COUNTS');
ok(readiness.counts.evidence_admitted === derived.evidenceRecords.length && readiness.counts.admitted_current_sold === derived.admittedSold && readiness.counts.admitted_liquidity === derived.admittedLiquidity, 'READINESS_EVIDENCE_COUNTS');
ok(readiness.counts.market_events === derived.marketEvents.length, 'READINESS_MARKET_EVENT_COUNTS');
ok(readiness.track_b_assessment_started === false && readiness.public_release === 'HOLD' && readiness.production === 'HOLD', 'READINESS_RELEASE_BOUNDARY');

ok(blockers.id === 'kidults-asi-immutable-blocker-package-v2' && blockers.version === '2.1.0', 'BLOCKER_ID_VERSION');
ok(blockers.source_graph_digest === derived.sourceGraphDigest && blockers.blocker_count === derived.blockers.length && blockers.blockers?.length === derived.blockers.length, 'BLOCKER_COUNT');
ok(blockers.p0_blocker_count === derived.blockers.filter((value) => value.severity === 'P0').length && blockers.p1_blocker_count === derived.blockers.filter((value) => value.severity === 'P1').length, 'BLOCKER_SEVERITY_COUNT');
ok(JSON.stringify(blockers.blockers.map((value) => value.blocker_class)) === JSON.stringify(derived.blockers.map((value) => value.blocker_class)), 'BLOCKER_CLASSES');
ok(blockers.output_absence_is_not_a_prerequisite_blocker === true && blockers.package_is_evidence_package === false && blockers.package_is_snapshot_candidate === false, 'BLOCKER_PACKAGE_BOUNDARY');
ok(!blockers.blockers.some((value) => ['IMMUTABLE_EVIDENCE_PACKAGE_MISSING', 'TRACK_B_INPUT_PAIR_MISSING'].includes(value.blocker_class)), 'OUTPUT_EXISTENCE_CYCLE_REINTRODUCED');

ok(demand.id === 'kidults-asi-admission-demand-package-v2' && demand.version === '2.1.0', 'DEMAND_ID_VERSION');
ok(demand.source_graph_digest === derived.sourceGraphDigest && demand.action_count === inputs.p1Actions.action_count && demand.queued_action_count === derived.queuedActions && demand.completed_action_count === derived.completedActions, 'DEMAND_ACTION_COUNTS');
ok(demand.action_demands?.length === inputs.p1Actions.action_count && Object.values(demand.action_type_counts).reduce((left, right) => left + right, 0) === inputs.p1Actions.action_count, 'DEMAND_ACTION_BINDING');
ok(demand.evidence_admitted === derived.evidenceRecords.length && demand.package_is_evidence_package === false, 'DEMAND_BOUNDARY');

ok(trackB.id === 'kidults-track-b-handoff-readiness-v2' && trackB.version === '2.1.0', 'TRACK_B_ID_VERSION');
ok(trackB.independent_assessment_started === false && trackB.track_b_submission_eligible === false, 'TRACK_B_NO_PREAUTHORIZATION');
ok(trackB.blocker_package_is_not_track_b_input === true && trackB.required_inputs?.length === 2, 'TRACK_B_BOUNDARY');

if (derived.prerequisitesPass) {
  for (const name of contract.outputs_when_gate_passes) ok(exists(name), `MISSING_GATE_PASS_OUTPUT:${name}`);
  for (const name of contract.forbidden_outputs_when_gate_passes) ok(!exists(name), `GATE_PASS_FORBIDDEN_OUTPUT_PRESENT:${name}`);
  const snapshot = outputJson('snapshot-candidate.json');
  const evidence = outputJson('evidence-package.json');
  const receipt = outputJson('snapshot-pair-generation-receipt-v2.json');
  const computedEvidenceDigest = digestObject(Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'package_payload_sha256')));
  const computedSnapshotDigest = digestObject(Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'snapshot_payload_sha256')));
  const pairDigest = digestObject({ snapshot, evidence });
  ok(evidence.package_status === 'IMMUTABLE' && evidence.package_id === evidence.evidence_package_id, 'EVIDENCE_PACKAGE_ID_STATUS');
  ok(evidence.bound_snapshot_id === snapshot.snapshot_id && snapshot.bound_evidence_package_id === evidence.package_id, 'PAIR_CROSS_BINDING');
  ok(evidence.package_payload_sha256 === computedEvidenceDigest && snapshot.snapshot_payload_sha256 === computedSnapshotDigest, 'PAIR_PAYLOAD_DIGESTS');
  ok(stableJson(evidence.evidence_records) === stableJson(derived.evidenceRecords), 'EVIDENCE_RECORD_BINDING');
  ok(snapshot.snapshot_status === 'DRAFT_CANDIDATE' && snapshot.as_of === derived.asOf && snapshot.source_graph_digest === derived.sourceGraphDigest, 'SNAPSHOT_STATE_BINDING');
  ok(snapshot.publication_eligible === false && snapshot.production_authorized === false && evidence.publication_authorized === false && evidence.production_authorized === false, 'PAIR_RELEASE_BOUNDARY');
  ok(trackB.state === 'PAIR_GENERATED_HANDOFF_PREFLIGHT_REQUIRED' && trackB.snapshot_candidate_present === true && trackB.evidence_package_present === true && trackB.exact_pair_digest_present === true, 'TRACK_B_PAIR_FLAGS');
  ok(trackB.exact_pair_digest === pairDigest && trackB.canonical_handoff_preflight === 'REQUIRED_NOT_PERFORMED', 'TRACK_B_PAIR_DIGEST');
  ok(receipt.state === 'IMMUTABLE_PAIR_ATOMICALLY_GENERATED' && receipt.exact_pair_digest === pairDigest && receipt.atomic_directory_commit === true, 'PAIR_GENERATION_RECEIPT');
  ok(receipt.snapshot_file_sha256 === hashText(outputText('snapshot-candidate.json')) && receipt.evidence_file_sha256 === hashText(outputText('evidence-package.json')), 'PAIR_FILE_DIGESTS');
  ok(readiness.state === 'READY_PAIR_GENERATED' && readiness.all_dimensions_pass === true, 'READY_STATE');
  ok(readiness.output_assertion_dimensions.every((value) => value.state === 'PASS') && readiness.counts.snapshot_candidates === 1 && readiness.counts.immutable_evidence_packages === 1 && readiness.counts.track_b_input_pairs === 1, 'READY_OUTPUT_ASSERTIONS');
  ok(readiness.exact_pair_digest === pairDigest, 'READINESS_PAIR_DIGEST');
} else {
  for (const name of contract.outputs_when_gate_fails) ok(exists(name), `MISSING_GATE_FAIL_OUTPUT:${name}`);
  for (const name of contract.forbidden_outputs_when_gate_fails) ok(!exists(name), `GATE_FAIL_FORBIDDEN_OUTPUT_PRESENT:${name}`);
  const nonGeneration = outputJson('snapshot-non-generation-receipt-v2.json');
  ok(nonGeneration.id === 'kidults-asi-snapshot-non-generation-receipt-v2' && nonGeneration.state === 'VERIFIED_NOT_GENERATED_FAIL_CLOSED', 'NON_GENERATION_ID_STATE');
  ok(nonGeneration.source_graph_digest === derived.sourceGraphDigest && nonGeneration.snapshot_creation_prerequisites_pass === false, 'NON_GENERATION_GRAPH_GATE');
  ok(nonGeneration.snapshot_candidate_generated === false && nonGeneration.evidence_package_generated === false && nonGeneration.rankability_assessment_generated === false && nonGeneration.forbidden_output_absence_required === true, 'NON_GENERATION_FLAGS');
  ok(trackB.state === 'WAITING_FOR_SNAPSHOT_PREREQUISITES' && trackB.snapshot_candidate_present === false && trackB.evidence_package_present === false && trackB.exact_pair_digest_present === false, 'TRACK_B_WAITING_FLAGS');
  ok(readiness.state === 'NOT_READY_EXACT_PREREQUISITE_BLOCKERS_OPEN' && readiness.all_dimensions_pass === false, 'BLOCKED_READINESS_STATE');
  ok(readiness.output_assertion_dimensions.every((value) => value.state === 'NOT_EVALUATED'), 'BLOCKED_OUTPUT_ASSERTIONS');
  ok(readiness.counts.snapshot_candidates === 0 && readiness.counts.immutable_evidence_packages === 0 && readiness.counts.track_b_input_pairs === 0, 'BLOCKED_OUTPUT_COUNTS');
}

ok(manifest.id === 'kidults-asi-snapshot-readiness-manifest-v2' && manifest.version === '2.1.0', 'MANIFEST_ID_VERSION');
ok(JSON.stringify(manifest.platform_principles) === JSON.stringify(PRINCIPLES), 'MANIFEST_PRINCIPLES');
ok(manifest.input_bindings.p0b.candidate_count === derived.candidateCount && manifest.input_bindings.p0b.mission_count === derived.missionCount, 'MANIFEST_P0');
ok(manifest.input_bindings.p1.gate1_hold === derived.actualGateHold && manifest.input_bindings.p1.actions_queued === derived.queuedActions, 'MANIFEST_P1');
ok(manifest.input_bindings.p2.graph_digest === derived.sourceGraphDigest && manifest.input_bindings.p2.node_count === inputs.p2Graph.node_count && manifest.input_bindings.p2.edge_count === inputs.p2Graph.edge_count, 'MANIFEST_P2');
ok(manifest.results.readiness_dimensions === 12 && manifest.results.prerequisite_dimensions === 10 && manifest.results.output_assertion_dimensions === 2, 'MANIFEST_DIMENSIONS');
ok(manifest.results.open_blockers === derived.blockers.length && manifest.results.preflight_actions_queued === derived.queuedActions && manifest.results.evidence_admitted === derived.evidenceRecords.length && manifest.results.market_events_created === derived.marketEvents.length, 'MANIFEST_PIPELINE_COUNTS');
ok(manifest.results.snapshot_candidates_created === (derived.prerequisitesPass ? 1 : 0) && manifest.results.evidence_packages_created === (derived.prerequisitesPass ? 1 : 0) && manifest.results.track_b_input_pairs_created === (derived.prerequisitesPass ? 1 : 0), 'MANIFEST_OUTPUT_COUNTS');
ok(manifest.results.track_b_assessments_started === 0 && manifest.atomic_directory_commit === true, 'MANIFEST_ATOMIC_TRACK_B_BOUNDARY');
for (const output of manifest.output_files) {
  ok(exists(output.name), `MANIFEST_FILE_MISSING:${output.name}`);
  const content = outputText(output.name);
  ok(output.sha256 === hashText(content) && output.bytes === Buffer.byteLength(content), `MANIFEST_FILE_DIGEST:${output.name}`);
}
ok(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE_BOUNDARY');

console.log(JSON.stringify({
  id: 'kidults-asi-snapshot-readiness-factory-validation-v2',
  state: 'VERIFIED_PASS',
  prerequisites_pass: derived.prerequisitesPass,
  readiness_dimensions: 12,
  prerequisite_dimensions: 10,
  output_assertion_dimensions: 2,
  open_blockers: derived.blockers.length,
  evidence_admitted: derived.evidenceRecords.length,
  market_events_created: derived.marketEvents.length,
  snapshot_candidates_created: derived.prerequisitesPass ? 1 : 0,
  evidence_packages_created: derived.prerequisitesPass ? 1 : 0,
  track_b_input_pairs_created: derived.prerequisitesPass ? 1 : 0,
  atomic_directory_commit: true,
  public_release: 'HOLD',
  production: 'HOLD',
}, null, 2));
