#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  graphPath = '/tmp/p2/owned-source-intelligence-graph-v1.json',
  lineagePath = '/tmp/p2/owned-source-intelligence-lineage-v1.json',
  qualityPath = '/tmp/p2/owned-source-intelligence-quality-v1.json',
  valuePath = '/tmp/p2/owned-source-intelligence-value-receipt-v1.json',
  preflightAssignmentPath = '/tmp/p1/candidate-preflight-assignment-v1.json',
  admissionReadinessPath = '/tmp/p1/candidate-admission-readiness-v1.json',
  missionLedgerPath = '/tmp/p0/mission-consumption-ledger-v1.json',
  laneCoveragePath = '/tmp/p0/mission-lane-coverage-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-contract-v1.json',
  outputDir = '/tmp/kidults-asi-snapshot-readiness-factory-v1'
] = process.argv.slice(2);

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const deterministicId = (prefix, value) => `${prefix}::${crypto.createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 32)}`;
const uniq = (values) => [...new Set(values.filter(Boolean))].sort();
const countBy = (values, keyFn) => {
  const result = new Map();
  for (const value of values) {
    const key = keyFn(value);
    result.set(key, (result.get(key) || 0) + 1);
  }
  return Object.fromEntries([...result.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
};

const graph = await readJson(graphPath);
const lineage = await readJson(lineagePath);
const quality = await readJson(qualityPath);
const value = await readJson(valuePath);
const preflightAssignments = await readJson(preflightAssignmentPath);
const admissionReadiness = await readJson(admissionReadinessPath);
const missionLedger = await readJson(missionLedgerPath);
const laneCoverage = await readJson(laneCoveragePath);
const contract = await readJson(contractPath);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

if (graph.id !== 'kidults-owned-source-intelligence-graph-v1' || graph.evidence_admitted !== 0 || graph.market_evidence_nodes !== 0) throw new Error('SOURCE_GRAPH_INVALID');
if (lineage.id !== 'kidults-owned-source-intelligence-lineage-v1' || lineage.graph?.digest !== digest(stableJson(graph))) throw new Error('SOURCE_GRAPH_LINEAGE_INVALID');
if (quality.id !== 'kidults-owned-source-intelligence-quality-v1' || quality.state !== 'VERIFIED_GRAPH_INTEGRITY_READY') throw new Error('SOURCE_GRAPH_QUALITY_INVALID');
if (value.id !== 'kidults-owned-source-intelligence-value-receipt-v1' || value.source_intelligence_graph_is_market_evidence_graph !== false) throw new Error('SOURCE_GRAPH_VALUE_INVALID');
if (preflightAssignments.id !== 'kidults-asi-candidate-preflight-assignment-v1' || preflightAssignments.evidence_admitted !== 0) throw new Error('PREFLIGHT_ASSIGNMENT_INVALID');
if (admissionReadiness.id !== 'kidults-asi-candidate-admission-readiness-v1' || admissionReadiness.automatic_admission_eligible !== 0 || admissionReadiness.evidence_admitted !== 0) throw new Error('ADMISSION_READINESS_INVALID');
if (missionLedger.id !== 'kidults-asi-mission-consumption-ledger-v1' || missionLedger.entries?.length !== 192) throw new Error('MISSION_LEDGER_INVALID');
if (laneCoverage.id !== 'kidults-asi-mission-lane-coverage-v1' || laneCoverage.mission_count !== 192) throw new Error('LANE_COVERAGE_INVALID');
if (contract.id !== 'kidults-asi-snapshot-readiness-factory-contract-v1' || contract.version !== '1.0.0') throw new Error('SNAPSHOT_FACTORY_CONTRACT_INVALID');
if (JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) throw new Error('SNAPSHOT_FACTORY_PRINCIPLE_ORDER_INVALID');
if (contract.snapshot_creation_gate?.snapshot_candidate_may_be_generated_when_gate_fails !== false) throw new Error('SNAPSHOT_FACTORY_FAIL_CLOSED_INVALID');

await fs.mkdir(outputDir, { recursive: true });

const candidateNodes = graph.nodes.filter((node) => node.node_type === 'SOURCE_CANDIDATE');
const preflightNodes = graph.nodes.filter((node) => node.node_type === 'HOST_PREFLIGHT');
const originNodes = graph.nodes.filter((node) => node.node_type === 'FACTUAL_ORIGIN_CANDIDATE');
const missionNodes = graph.nodes.filter((node) => node.node_type === 'MISSION');
const readinessEdges = graph.edges.filter((edge) => edge.edge_type === 'CANDIDATE_HAS_ADMISSION_READINESS');
const missionCandidateEdges = graph.edges.filter((edge) => edge.edge_type === 'MISSION_HAS_SOURCE_CANDIDATE');
const completedPreflightEdges = graph.edges.filter((edge) => edge.edge_type === 'CANDIDATE_ASSIGNED_PREFLIGHT');
const currentSoldCandidates = candidateNodes.filter((node) => node.properties.evidence_class === 'CURRENT_SOLD_TRANSACTION');
const liquidityCandidates = candidateNodes.filter((node) => node.properties.evidence_class === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE');
const readinessCounts = admissionReadiness.readiness_counts;
const rightsUnknownCount = Number(readinessCounts.NOT_READY_RIGHTS_UNKNOWN || 0);
const semanticHoldCount = Number(readinessCounts.NOT_READY_SEMANTIC_INSUFFICIENT || 0);
const technicalHoldCount = Number(readinessCounts.NOT_READY_TECHNICAL_FAILURE || 0);
const rejectedCount = Number(readinessCounts.REJECTED_AUTOMATION_OR_ACCESS || 0);
const waitingCount = Number(readinessCounts.WAITING_FOR_HOST_PREFLIGHT || 0);
const noCandidateMissions = Number(missionLedger.no_candidate_missions || 0);
const partialCandidateMissions = Number(missionLedger.partial_candidate_coverage_missions || 0);
const completeSlotMissions = Number(missionLedger.complete_candidate_slot_coverage_missions || 0);

const dimensions = [
  {
    dimension: 'SOURCE_CANDIDATE_COVERAGE',
    state: candidateNodes.length > 0 ? (noCandidateMissions === 0 ? 'PASS' : 'PARTIAL') : 'FAIL',
    current_value: candidateNodes.length,
    required_value: '>0_AND_NO_UNCOVERED_MISSIONS',
    blockers: noCandidateMissions > 0 ? ['SOURCE_CANDIDATE_COVERAGE_GAP'] : [],
    evidence_refs: [graph.id, missionLedger.id]
  },
  {
    dimension: 'HOST_PREFLIGHT_COVERAGE',
    state: waitingCount === 0 ? 'PASS' : 'PARTIAL',
    current_value: completedPreflightEdges.length,
    required_value: preflightAssignments.candidate_count,
    blockers: waitingCount > 0 ? ['HOST_PREFLIGHT_COVERAGE_GAP'] : [],
    evidence_refs: [graph.id, preflightAssignments.id]
  },
  {
    dimension: 'PURPOSE_SPECIFIC_RIGHTS',
    state: 'FAIL',
    current_value: 0,
    required_value: 'RIGHTS_CLEARED_FOR_EVERY_MATERIAL_CLAIM',
    blockers: ['PURPOSE_RIGHTS_UNKNOWN'],
    evidence_refs: [admissionReadiness.id]
  },
  {
    dimension: 'SEMANTIC_SUFFICIENCY',
    state: semanticHoldCount === 0 ? 'PARTIAL' : 'FAIL',
    current_value: preflightAssignments.candidate_count - semanticHoldCount,
    required_value: preflightAssignments.candidate_count,
    blockers: semanticHoldCount > 0 ? ['SEMANTIC_HOLD'] : ['SEMANTIC_SUFFICIENCY_NOT_EVIDENCE_ADMISSION'],
    evidence_refs: [preflightAssignments.id]
  },
  {
    dimension: 'FACTUAL_ORIGIN_INDEPENDENCE',
    state: 'FAIL',
    current_value: 0,
    required_value: 'VERIFIED_DISTINCT_FACTUAL_ORIGINS_PER_MATERIAL_FACTOR',
    blockers: ['FACTUAL_ORIGIN_INDEPENDENCE_NOT_PROVEN'],
    evidence_refs: [graph.id]
  },
  {
    dimension: 'EVIDENCE_ADMISSION',
    state: 'FAIL',
    current_value: 0,
    required_value: '>0',
    blockers: ['EVIDENCE_ADMISSION_ZERO'],
    evidence_refs: [graph.id, admissionReadiness.id]
  },
  {
    dimension: 'CURRENT_SOLD_TRANSACTION_EVIDENCE',
    state: 'FAIL',
    current_value: 0,
    required_value: '>0_RIGHTS_ADMITTED_CURRENT_SOLD_TRANSACTION',
    blockers: ['CURRENT_SOLD_TRANSACTION_EVIDENCE_ZERO'],
    evidence_refs: [graph.id]
  },
  {
    dimension: 'LIQUIDITY_EVIDENCE',
    state: 'FAIL',
    current_value: 0,
    required_value: '>0_RIGHTS_ADMITTED_LIQUIDITY_EVIDENCE',
    blockers: ['LIQUIDITY_EVIDENCE_ZERO'],
    evidence_refs: [graph.id]
  },
  {
    dimension: 'MARKET_EVENT_GRAPH',
    state: 'FAIL',
    current_value: 0,
    required_value: '>0_ADMITTED_MARKET_EVENTS',
    blockers: ['MARKET_EVENT_GRAPH_ZERO'],
    evidence_refs: [graph.id]
  },
  {
    dimension: 'IMMUTABLE_EVIDENCE_PACKAGE',
    state: 'FAIL',
    current_value: 0,
    required_value: 1,
    blockers: ['IMMUTABLE_EVIDENCE_PACKAGE_MISSING'],
    evidence_refs: [lineage.id]
  },
  {
    dimension: 'TRACK_B_INPUT_PAIR',
    state: 'FAIL',
    current_value: 0,
    required_value: 1,
    blockers: ['TRACK_B_INPUT_PAIR_MISSING'],
    evidence_refs: [lineage.id]
  }
];

if (dimensions.length !== contract.readiness_dimensions.length || JSON.stringify(dimensions.map((item) => item.dimension)) !== JSON.stringify(contract.readiness_dimensions)) throw new Error('READINESS_DIMENSION_BINDING_INVALID');
const allDimensionsPass = dimensions.every((item) => item.state === 'PASS');
const snapshotReady = allDimensionsPass && candidateNodes.length > 0 && admissionReadiness.automatic_admission_eligible > 0 && graph.evidence_admitted > 0;
if (snapshotReady) throw new Error('UNEXPECTED_SNAPSHOT_READY_STATE_WITH_ZERO_ADMITTED_EVIDENCE');

const byEvidenceClass = Object.fromEntries(['CURRENT_SOLD_TRANSACTION', 'LIQUIDITY_TIME_TO_SALE_EXPOSURE'].map((evidenceClass) => {
  const candidates = candidateNodes.filter((node) => node.properties.evidence_class === evidenceClass);
  const missions = missionLedger.entries.filter((entry) => entry.evidence_class === evidenceClass);
  const missionIds = new Set(missions.map((entry) => entry.mission_id));
  const candidateEdges = missionCandidateEdges.filter((edge) => missionIds.has(graph.nodes.find((node) => node.node_id === edge.from_node_id)?.properties?.mission_id));
  return [evidenceClass, {
    missions: missions.length,
    missions_with_complete_candidate_slots: missions.filter((entry) => entry.candidate_slots_filled === 3).length,
    missions_with_partial_candidate_slots: missions.filter((entry) => entry.candidate_slots_filled > 0 && entry.candidate_slots_filled < 3).length,
    missions_without_candidates: missions.filter((entry) => entry.candidate_assignment_count === 0).length,
    source_candidates: candidates.length,
    mission_candidate_edges: candidateEdges.length,
    admitted_evidence: 0,
    admitted_market_events: 0,
    snapshot_eligible_claims: 0,
    state: 'NOT_READY_NO_ADMITTED_EVIDENCE'
  }];
}));

const readinessLedger = {
  id: 'kidults-asi-snapshot-readiness-ledger-v1',
  version: '1.0.0',
  state: 'NOT_READY_NO_ADMITTED_EVIDENCE',
  as_of: graph.as_of,
  platform_principles: principles,
  source_graph_digest: lineage.graph.digest,
  snapshot_creation_gate_pass: false,
  all_dimensions_pass: false,
  dimensions,
  by_evidence_class: byEvidenceClass,
  counts: {
    missions: missionNodes.length,
    source_candidates: candidateNodes.length,
    current_sold_source_candidates: currentSoldCandidates.length,
    liquidity_source_candidates: liquidityCandidates.length,
    canonical_hosts: value.canonical_host_nodes,
    host_preflights: preflightNodes.length,
    candidate_readiness_edges: readinessEdges.length,
    rights_pass_candidates: 0,
    automatic_admission_eligible: 0,
    admitted_evidence: 0,
    admitted_current_sold_transactions: 0,
    admitted_liquidity_evidence: 0,
    market_events: 0,
    immutable_evidence_packages: 0,
    snapshot_candidates: 0,
    track_b_input_pairs: 0
  },
  snapshot_candidate_generated: false,
  evidence_package_generated: false,
  track_b_assessment_started: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const blockerRecords = [];
function addBlocker(blockerClass, severity, affectedCount, unblockCondition, dependencies, evidenceRefs) {
  blockerRecords.push({
    blocker_id: deterministicId('snapshot-blocker', { blockerClass, dependencies, evidenceRefs }),
    blocker_class: blockerClass,
    severity,
    state: 'OPEN',
    affected_count: affectedCount,
    unblock_condition: unblockCondition,
    dependencies,
    evidence_refs: uniq(evidenceRefs),
    snapshot_gate_effect: 'BLOCK',
    public_release: 'HOLD',
    production: 'HOLD'
  });
}
if (noCandidateMissions > 0) addBlocker('SOURCE_CANDIDATE_COVERAGE_GAP', 'P1', noCandidateMissions, 'At least one defensible preflight candidate for every critical mission.', ['P0_MISSION_CONSUMPTION'], [missionLedger.id, laneCoverage.id]);
if (waitingCount > 0) addBlocker('HOST_PREFLIGHT_COVERAGE_GAP', 'P1', waitingCount, 'Every material candidate receives completed bounded host preflight.', ['P1_CANDIDATE_PREFLIGHT'], [preflightAssignments.id]);
addBlocker('PURPOSE_RIGHTS_UNKNOWN', 'P0', rightsUnknownCount + semanticHoldCount + technicalHoldCount + rejectedCount + waitingCount, 'Purpose-specific collect, store, derive, and display rights are explicitly adjudicated for every material source.', ['P1_RIGHTS_REVIEW', 'LEGAL_AND_POLICY_EVIDENCE'], [admissionReadiness.id]);
if (semanticHoldCount > 0) addBlocker('SEMANTIC_HOLD', 'P1', semanticHoldCount, 'Candidate semantics establish the required evidence class without Listing/Sold or Attention/Demand conflation.', ['P1_SEMANTIC_REVIEW'], [preflightAssignments.id]);
if (technicalHoldCount + rejectedCount > 0) addBlocker('TECHNICAL_OR_ACCESS_HOLD', 'P1', technicalHoldCount + rejectedCount, 'Technical/access failures are resolved or candidates are replaced.', ['P1_TECHNICAL_RECOVERY', 'PROVIDER_REPLACEMENT'], [preflightAssignments.id]);
addBlocker('FACTUAL_ORIGIN_INDEPENDENCE_NOT_PROVEN', 'P0', originNodes.length, 'Distinct underlying factual origins are verified for every independence-sensitive factor.', ['FACTUAL_ORIGIN_VERIFICATION'], [graph.id]);
addBlocker('EVIDENCE_ADMISSION_ZERO', 'P0', 0, 'At least one purpose-rights-cleared, semantically sufficient, fresh, provenance-bound evidence record passes admission.', ['P1_PURPOSE_ADMISSION'], [graph.id, admissionReadiness.id]);
addBlocker('CURRENT_SOLD_TRANSACTION_EVIDENCE_ZERO', 'P0', 0, 'Rights-admitted current SOLD transaction evidence exists for at least one bounded market surface.', ['P1_MARKET_EVIDENCE_ADMISSION'], [graph.id]);
addBlocker('LIQUIDITY_EVIDENCE_ZERO', 'P0', 0, 'Rights-admitted liquidity/time-to-sale evidence exists for at least one bounded market surface.', ['P1_MARKET_EVIDENCE_ADMISSION'], [graph.id]);
addBlocker('MARKET_EVENT_GRAPH_ZERO', 'P0', 0, 'Admitted market events are identity-resolved and bound into the Market Event Graph.', ['P2_MARKET_EVENT_GRAPH'], [graph.id]);
addBlocker('IMMUTABLE_EVIDENCE_PACKAGE_MISSING', 'P0', 0, 'Immutable Evidence Package exists and binds exact evidence, rights, freshness, provenance, confidence, and lineage.', ['P3_EVIDENCE_PACKAGE_FACTORY'], [lineage.id]);
addBlocker('SNAPSHOT_CANDIDATE_NOT_GENERATED', 'P0', 0, 'Every Snapshot creation gate passes and a new immutable snapshot-candidate.json is generated.', ['P3_SNAPSHOT_FACTORY'], [readinessLedger.id]);
addBlocker('TRACK_B_INPUT_PAIR_MISSING', 'P0', 0, 'Exact immutable snapshot-candidate.json and Evidence Package pair exists with matching digests.', ['TRACK_B_INPUT_BOUNDARY'], [readinessLedger.id]);
blockerRecords.sort((a, b) => a.severity.localeCompare(b.severity) || a.blocker_class.localeCompare(b.blocker_class));

const blockerPackageCore = {
  id: 'kidults-asi-immutable-blocker-package-v1',
  version: '1.0.0',
  state: 'OPEN_BLOCKERS_PREVENT_SNAPSHOT_AND_TRACK_B',
  as_of: graph.as_of,
  source_graph_digest: lineage.graph.digest,
  blocker_count: blockerRecords.length,
  p0_blocker_count: blockerRecords.filter((item) => item.severity === 'P0').length,
  p1_blocker_count: blockerRecords.filter((item) => item.severity === 'P1').length,
  blockers: blockerRecords,
  package_is_evidence_package: false,
  snapshot_candidate_generated: false,
  public_release: 'HOLD',
  production: 'HOLD'
};
const blockerPackage = { ...blockerPackageCore, package_digest: digest(stableJson(blockerPackageCore)) };

const assignmentByState = Object.fromEntries(contract.admission_demand_classes.map((demandClass) => [demandClass, []]));
for (const assignment of preflightAssignments.assignments) {
  if (assignment.admission_readiness_state === 'NOT_READY_RIGHTS_UNKNOWN') assignmentByState.RIGHTS_REVIEW_REQUIRED.push(assignment.candidate_id);
  if (assignment.admission_readiness_state === 'NOT_READY_SEMANTIC_INSUFFICIENT') assignmentByState.SEMANTIC_REFINEMENT_REQUIRED.push(assignment.candidate_id);
  if (assignment.admission_readiness_state === 'NOT_READY_TECHNICAL_FAILURE') assignmentByState.TECHNICAL_RECOVERY_REQUIRED.push(assignment.candidate_id);
  if (assignment.admission_readiness_state === 'REJECTED_AUTOMATION_OR_ACCESS') assignmentByState.ACCESS_OR_ROBOTS_REJECTED.push(assignment.candidate_id);
  if (assignment.admission_readiness_state === 'WAITING_FOR_HOST_PREFLIGHT') assignmentByState.HOST_PREFLIGHT_REQUIRED.push(assignment.candidate_id);
}
assignmentByState.SOURCE_DISCOVERY_EXPANSION_REQUIRED = missionLedger.entries.filter((entry) => entry.candidate_assignment_count === 0).map((entry) => entry.mission_id);
assignmentByState.FACTUAL_ORIGIN_VERIFICATION_REQUIRED = originNodes.map((node) => node.properties.factual_origin_candidate_id);
for (const key of Object.keys(assignmentByState)) assignmentByState[key] = uniq(assignmentByState[key]);

const admissionDemandRecords = contract.admission_demand_classes.map((demandClass) => ({
  demand_id: deterministicId('admission-demand', { demandClass, refs: assignmentByState[demandClass] }),
  demand_class: demandClass,
  state: assignmentByState[demandClass].length > 0 ? 'OPEN' : 'NO_CURRENT_ITEMS',
  item_count: assignmentByState[demandClass].length,
  item_refs: assignmentByState[demandClass],
  required_output: demandClass === 'RIGHTS_REVIEW_REQUIRED' ? 'PURPOSE_SPECIFIC_RIGHTS_DECISION'
    : demandClass === 'SEMANTIC_REFINEMENT_REQUIRED' ? 'SEMANTIC_EVIDENCE_CLASS_DECISION'
      : demandClass === 'TECHNICAL_RECOVERY_REQUIRED' ? 'TECHNICAL_RECOVERY_OR_REPLACEMENT_DECISION'
        : demandClass === 'ACCESS_OR_ROBOTS_REJECTED' ? 'REPLACEMENT_SOURCE_DEMAND'
          : demandClass === 'HOST_PREFLIGHT_REQUIRED' ? 'BOUNDED_HOST_PREFLIGHT_RECEIPT'
            : demandClass === 'SOURCE_DISCOVERY_EXPANSION_REQUIRED' ? 'EXPANDED_SOURCE_CANDIDATE_INCREMENT'
              : 'VERIFIED_FACTUAL_ORIGIN_BINDING',
  can_create_evidence_admission: false,
  public_release: 'HOLD',
  production: 'HOLD'
}));

const admissionDemandCore = {
  id: 'kidults-asi-admission-demand-package-v1',
  version: '1.0.0',
  state: 'OPEN_ADMISSION_AND_GAP_DEMANDS',
  as_of: graph.as_of,
  source_graph_digest: lineage.graph.digest,
  demand_count: admissionDemandRecords.length,
  open_demand_classes: admissionDemandRecords.filter((item) => item.state === 'OPEN').length,
  total_open_items: admissionDemandRecords.reduce((total, item) => total + item.item_count, 0),
  demands: admissionDemandRecords,
  package_is_evidence_admission: false,
  evidence_admitted: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};
const admissionDemandPackage = { ...admissionDemandCore, package_digest: digest(stableJson(admissionDemandCore)) };

const nonGenerationReceiptCore = {
  id: 'kidults-asi-snapshot-non-generation-receipt-v1',
  version: '1.0.0',
  state: 'SNAPSHOT_NOT_GENERATED_FAIL_CLOSED',
  as_of: graph.as_of,
  source_graph_digest: lineage.graph.digest,
  snapshot_creation_gate_pass: false,
  snapshot_candidate_generated: false,
  snapshot_candidate_file: null,
  evidence_package_generated: false,
  evidence_package_file: null,
  reason_codes: uniq(blockerRecords.map((item) => item.blocker_class)),
  blocker_package_digest: blockerPackage.package_digest,
  admission_demand_package_digest: admissionDemandPackage.package_digest,
  non_generation_is_expected_safe_behavior: true,
  receipt_is_snapshot_candidate: false,
  public_release: 'HOLD',
  production: 'HOLD'
};
const nonGenerationReceipt = { ...nonGenerationReceiptCore, receipt_digest: digest(stableJson(nonGenerationReceiptCore)) };

const trackBReadiness = {
  id: 'kidults-asi-track-b-handoff-readiness-v1',
  version: '1.0.0',
  state: 'WAITING_FOR_SNAPSHOT_CANDIDATE_AND_EVIDENCE_PACKAGE',
  as_of: graph.as_of,
  required_inputs: [
    { name: 'snapshot-candidate.json', exists: false, digest: null },
    { name: 'Evidence Package', exists: false, digest: null }
  ],
  exact_pair_digest: null,
  independent_assessment_started: false,
  independent_assessment_output_exists: false,
  blocker_package_digest: blockerPackage.package_digest,
  snapshot_non_generation_receipt_digest: nonGenerationReceipt.receipt_digest,
  waiting_state_is_assessment: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

async function writeJson(name, value) {
  const content = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), content);
  return { name, sha256: digest(content), bytes: Buffer.byteLength(content) };
}

const outputFiles = [];
outputFiles.push(await writeJson('snapshot-readiness-ledger-v1.json', readinessLedger));
outputFiles.push(await writeJson('immutable-blocker-package-v1.json', blockerPackage));
outputFiles.push(await writeJson('admission-demand-package-v1.json', admissionDemandPackage));
outputFiles.push(await writeJson('snapshot-non-generation-receipt-v1.json', nonGenerationReceipt));
outputFiles.push(await writeJson('track-b-handoff-readiness-v1.json', trackBReadiness));

const manifest = {
  id: 'kidults-asi-snapshot-readiness-manifest-v1',
  version: '1.0.0',
  state: 'P3_SNAPSHOT_FACTORY_FAIL_CLOSED_NOT_READY',
  as_of: graph.as_of,
  platform_principles: principles,
  input_bindings: {
    source_graph: { id: graph.id, version: graph.version, digest: lineage.graph.digest },
    source_graph_quality: { id: quality.id, version: quality.version, state: quality.state, digest: digest(stableJson(quality)) },
    candidate_preflight_assignments: { id: preflightAssignments.id, version: preflightAssignments.version, digest: digest(stableJson(preflightAssignments)) },
    candidate_admission_readiness: { id: admissionReadiness.id, version: admissionReadiness.version, digest: digest(stableJson(admissionReadiness)) },
    mission_consumption: { id: missionLedger.id, version: missionLedger.version, digest: digest(stableJson(missionLedger)) },
    contract: { id: contract.id, version: contract.version, digest: digest(stableJson(contract)) }
  },
  results: {
    readiness_state: readinessLedger.state,
    readiness_dimensions: dimensions.length,
    pass_dimensions: dimensions.filter((item) => item.state === 'PASS').length,
    partial_dimensions: dimensions.filter((item) => item.state === 'PARTIAL').length,
    fail_dimensions: dimensions.filter((item) => item.state === 'FAIL').length,
    source_candidates: candidateNodes.length,
    host_preflights: preflightNodes.length,
    complete_candidate_slot_missions: completeSlotMissions,
    partial_candidate_missions: partialCandidateMissions,
    no_candidate_missions: noCandidateMissions,
    rights_review_candidates: rightsUnknownCount,
    semantic_hold_candidates: semanticHoldCount,
    technical_hold_candidates: technicalHoldCount,
    rejected_access_candidates: rejectedCount,
    waiting_preflight_candidates: waitingCount,
    blocker_count: blockerPackage.blocker_count,
    open_admission_demand_classes: admissionDemandPackage.open_demand_classes,
    admitted_evidence: 0,
    admitted_current_sold_transactions: 0,
    admitted_liquidity_evidence: 0,
    market_events: 0,
    immutable_evidence_packages: 0,
    snapshot_candidates_generated: 0,
    track_b_input_pairs: 0,
    track_b_assessments_started: 0
  },
  output_files: outputFiles,
  forbidden_output_files_absent: contract.forbidden_outputs,
  autonomous_effect: 'POSITIVE_READINESS_RECALCULATED_AUTOMATICALLY_FROM_LATEST_P0_P1_P2_ARTIFACTS',
  global_effect: 'POSITIVE_ALL_192_MISSIONS_AND_BOTH_CRITICAL_EVIDENCE_CLASSES_REMAIN_VISIBLE_IN_READINESS',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNED_BLOCKER_ADMISSION_DEMAND_AND_HANDOFF_STATE_PACKAGES_CREATED',
  transparency_effect: 'POSITIVE_NO_FALSE_SNAPSHOT_AND_EXACT_REASON_DIGESTS_COUNTS_AND_UNBLOCK_CONDITIONS_PRESERVED',
  public_release: 'HOLD',
  production: 'HOLD'
};
outputFiles.push(await writeJson('snapshot-readiness-manifest-v1.json', manifest));

console.log(JSON.stringify({
  state: manifest.state,
  ...manifest.results,
  blocker_package_digest: blockerPackage.package_digest,
  admission_demand_package_digest: admissionDemandPackage.package_digest,
  snapshot_non_generation_receipt_digest: nonGenerationReceipt.receipt_digest,
  output_dir: outputDir
}, null, 2));
