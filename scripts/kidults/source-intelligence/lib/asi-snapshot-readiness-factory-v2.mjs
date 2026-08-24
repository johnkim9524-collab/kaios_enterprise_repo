import crypto from 'node:crypto';

export const PRINCIPLES = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

export const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;

export const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
export const hashText = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
export const digestObject = (value) => hashText(JSON.stringify(stable(value)));
export const uniq = (values) => [...new Set((values || []).filter(Boolean))].sort();
export const countBy = (values, keyFn) => Object.fromEntries(
  [...values.reduce((map, value) => map.set(keyFn(value), (map.get(keyFn(value)) || 0) + 1), new Map())]
    .sort(([left], [right]) => String(left).localeCompare(String(right))),
);
export const idFor = (prefix, value) => `${prefix}_${crypto.createHash('sha256')
  .update(JSON.stringify(stable(value))).digest('hex').slice(0, 32)}`;

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const secureHttps = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
};
const validTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };

function validateAdmittedRecord(candidate, snapshotAsOf, maximumWindowDays) {
  const record = candidate.admitted_evidence;
  requireCondition(record && typeof record === 'object' && !Array.isArray(record), `ADMITTED_EVIDENCE_RECORD_MISSING:${candidate.admission_candidate_id}`);
  requireCondition(candidate.state === 'ADMITTED_VERIFIED', `ADMISSION_STATE_INVALID:${candidate.admission_candidate_id}`);
  requireCondition(candidate.gate1_decision === 'PASS', `ADMISSION_GATE1_NOT_PASS:${candidate.admission_candidate_id}`);
  requireCondition(candidate.rights_state === 'ALLOW' && candidate.collection_authorized === true, `ADMISSION_RIGHTS_NOT_ALLOW:${candidate.admission_candidate_id}`);
  requireCondition(['CURRENT_SOLD_TRANSACTION', 'LIQUIDITY_TIME_TO_SALE_EXPOSURE'].includes(candidate.evidence_class), `ADMISSION_EVIDENCE_CLASS_INVALID:${candidate.admission_candidate_id}`);
  requireCondition(typeof candidate.admitted_evidence_id === 'string' && candidate.admitted_evidence_id === record.evidence_id, `ADMISSION_EVIDENCE_ID_MISMATCH:${candidate.admission_candidate_id}`);
  requireCondition(record.evidence_class === candidate.evidence_class, `ADMISSION_EVIDENCE_CLASS_MISMATCH:${candidate.admission_candidate_id}`);
  for (const [field, value] of [
    ['evidence_id', record.evidence_id],
    ['purpose_binding_id', record.purpose_binding_id],
    ['source_owner_id', record.source_owner_id],
    ['factual_origin_id', record.factual_origin_id],
  ]) requireCondition(typeof value === 'string' && value.length > 0, `ADMITTED_EVIDENCE_FIELD_MISSING:${field}`);
  for (const field of ['purpose_binding_id', 'source_owner_id', 'factual_origin_id']) {
    requireCondition(candidate[field] === record[field], `ADMISSION_EVIDENCE_BINDING_MISMATCH:${field}:${record.evidence_id}`);
  }
  requireCondition(record.rights_state === 'ALLOW', `ADMITTED_EVIDENCE_RIGHTS_NOT_ALLOW:${record.evidence_id}`);
  requireCondition(secureHttps(record.source_url), `ADMITTED_EVIDENCE_SOURCE_URL_INVALID:${record.evidence_id}`);
  requireCondition(SHA256.test(record.source_payload_sha256 || '') && !/^sha256:0{64}$/.test(record.source_payload_sha256), `ADMITTED_EVIDENCE_SOURCE_DIGEST_INVALID:${record.evidence_id}`);
  requireCondition(Array.isArray(record.license_evidence_refs) && record.license_evidence_refs.length > 0 && record.license_evidence_refs.every(secureHttps), `ADMITTED_EVIDENCE_LICENSE_REFS_INVALID:${record.evidence_id}`);
  requireCondition(validTime(record.observed_at) && validTime(record.valid_until), `ADMITTED_EVIDENCE_TIME_INVALID:${record.evidence_id}`);
  const observedAt = Date.parse(record.observed_at);
  const validUntil = Date.parse(record.valid_until);
  const maximumWindowMs = maximumWindowDays * 24 * 60 * 60 * 1000;
  requireCondition(observedAt <= snapshotAsOf && snapshotAsOf <= validUntil && validUntil > observedAt && validUntil - observedAt <= maximumWindowMs, `ADMITTED_EVIDENCE_FRESHNESS_INVALID:${record.evidence_id}`);
  requireCondition(Number.isFinite(record.evidence_strength) && record.evidence_strength > 0 && record.evidence_strength <= 1, `ADMITTED_EVIDENCE_STRENGTH_INVALID:${record.evidence_id}`);
  requireCondition(record.unresolved_critical_contradiction_count === 0, `ADMITTED_EVIDENCE_CONTRADICTION_OPEN:${record.evidence_id}`);
  if (candidate.evidence_class === 'CURRENT_SOLD_TRANSACTION') {
    requireCondition(record.temporality === 'CURRENT_MARKET' && record.market_observation_type === 'SOLD_TRANSACTION', `CURRENT_SOLD_SEMANTICS_INVALID:${record.evidence_id}`);
  } else if (candidate.evidence_class === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE') {
    requireCondition(record.temporality === 'CURRENT_MARKET' && record.market_observation_type === 'LIQUIDITY_EXPOSURE', `LIQUIDITY_SEMANTICS_INVALID:${record.evidence_id}`);
  }
  return stable(record);
}

export function deriveReadiness(inputs, contract) {
  const {
    p0Registry, p0Bindings, p0Manifest, p1Gate, p1Admission, p1Actions, p1Manifest,
    p2Graph, p2Lineage, p2Quality, p2Value, p2Manifest,
  } = inputs;
  requireCondition(p0Registry.id === 'kidults-asi-p0b-source-candidate-registry-v1' && p0Registry.canonical_candidate_count > 0, 'P0B_REGISTRY_INVALID');
  requireCondition(p0Bindings.id === 'kidults-asi-p0b-mission-candidate-binding-ledger-v1' && p0Bindings.mission_count === 192 && p0Bindings.bindings?.length === 192, 'P0B_BINDINGS_INVALID');
  requireCondition(p0Manifest.id === 'kidults-asi-p0b-bounded-discovery-manifest-v1', 'P0B_MANIFEST_INVALID');
  requireCondition(p1Gate.id === 'kidults-asi-p1-gate1-source-safety-decisions-v1' && p1Gate.decision_count === 576 && p1Gate.decisions?.length === 576, 'P1_GATE_INVALID');
  requireCondition(p1Admission.id === 'kidults-asi-p1-evidence-admission-candidate-register-v1' && p1Admission.candidate_count === 576 && p1Admission.candidates?.length === 576, 'P1_ADMISSION_INVALID');
  requireCondition(p1Actions.id === 'kidults-asi-p1-preflight-action-queue-v1' && p1Actions.action_count === 672 && p1Actions.actions?.length === 672, 'P1_ACTIONS_INVALID');
  requireCondition(p1Manifest.id === 'kidults-asi-p1-source-preflight-manifest-v1', 'P1_MANIFEST_INVALID');
  requireCondition(p2Graph.id === 'kidults-owned-source-intelligence-graph-v2' && p2Graph.version === '2.0.0', 'P2_GRAPH_INVALID');
  requireCondition(p2Lineage.id === 'kidults-owned-source-intelligence-lineage-v2' && p2Lineage.graph?.digest === hashText(stableJson(p2Graph)), 'P2_LINEAGE_INVALID');
  requireCondition(p2Quality.id === 'kidults-owned-source-intelligence-quality-v2' && p2Quality.state === 'VERIFIED_GRAPH_INTEGRITY_READY', 'P2_QUALITY_INVALID');
  requireCondition(p2Value.id === 'kidults-owned-source-intelligence-value-receipt-v2', 'P2_VALUE_INVALID');
  requireCondition(p2Manifest.id === 'kidults-owned-source-intelligence-manifest-v2' && p2Manifest.graph_digest === p2Lineage.graph.digest, 'P2_MANIFEST_INVALID');
  requireCondition(contract.id === 'kidults-asi-snapshot-readiness-factory-contract-v2' && contract.version === '2.1.0' && JSON.stringify(contract.platform_principles) === JSON.stringify(PRINCIPLES), 'P3_CONTRACT_INVALID');

  const lineageInputs = new Map((p2Lineage.inputs || []).map((entry) => [entry.id, entry.digest]));
  for (const value of [p0Registry, p0Bindings, p1Gate, p1Admission, p1Actions]) {
    requireCondition(lineageInputs.get(value.id) === hashText(stableJson(value)), `P2_INPUT_LINEAGE_MISMATCH:${value.id}`);
  }

  const missionCount = p0Bindings.mission_count;
  const candidateCount = p0Registry.canonical_candidate_count;
  const uniqueHosts = p0Registry.unique_host_count;
  const actualGatePass = p1Gate.decisions.filter((value) => value.decision === 'PASS').length;
  const actualGateHold = p1Gate.decisions.filter((value) => value.decision === 'HOLD').length;
  const actualGateReject = p1Gate.decisions.filter((value) => value.decision === 'REJECT').length;
  requireCondition(p1Gate.pass_count === actualGatePass && p1Gate.hold_count === actualGateHold && p1Gate.reject_count === actualGateReject, 'P1_GATE_COUNT_DRIFT');
  const rightsPass = p1Admission.candidates.filter((value) => value.rights_state === 'ALLOW' && value.collection_authorized === true).length;
  const semanticVerified = p1Gate.decisions.filter((value) => value.decision === 'PASS' && value.market_semantics_verified === true).length;
  const factualOriginVerified = p0Bindings.bindings.filter((value) => value.factual_origin_independence_proven === true).length;
  const regionalCoverageVerified = p0Bindings.bindings.filter((value) => value.regional_coverage_proven === true).length;
  const completedActions = p1Actions.actions.filter((value) => ['COMPLETED', 'PASS', 'VERIFIED_PASS'].includes(value.state)).length;
  const queuedActions = p1Actions.actions.length - completedActions;
  const admittedCandidates = p1Admission.candidates.filter((value) => value.evidence_admitted === true);
  requireCondition(p1Admission.admitted_count === admittedCandidates.length, 'P1_ADMISSION_COUNT_DRIFT');

  const snapshotAsOf = Date.parse(p2Graph.as_of);
  requireCondition(Number.isFinite(snapshotAsOf), 'P2_AS_OF_INVALID');
  const maximumWindowDays = Number(contract.snapshot_creation_gate.current_evidence_maximum_window_days);
  requireCondition(Number.isInteger(maximumWindowDays) && maximumWindowDays > 0, 'P3_CURRENT_WINDOW_INVALID');
  const evidenceRecords = admittedCandidates.map((candidate) => validateAdmittedRecord(candidate, snapshotAsOf, maximumWindowDays));
  requireCondition(new Set(evidenceRecords.map((value) => value.evidence_id)).size === evidenceRecords.length, 'ADMITTED_EVIDENCE_ID_DUPLICATE');

  const admittedSold = admittedCandidates.filter((value) => value.evidence_class === 'CURRENT_SOLD_TRANSACTION').length;
  const admittedLiquidity = admittedCandidates.filter((value) => value.evidence_class === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE').length;
  const marketEvents = Array.isArray(p2Graph.market_events) ? p2Graph.market_events : [];
  requireCondition((p2Graph.market_events_created || 0) === marketEvents.length, 'P2_MARKET_EVENT_COUNT_DRIFT');
  requireCondition((p2Graph.evidence_admitted || 0) === evidenceRecords.length, 'P2_EVIDENCE_ADMISSION_COUNT_DRIFT');
  requireCondition(p2Manifest.results?.market_events_created === marketEvents.length && p2Manifest.results?.evidence_admitted === evidenceRecords.length, 'P2_MANIFEST_EVIDENCE_COUNT_DRIFT');
  requireCondition(p2Value.source_intelligence_graph_is_market_evidence_graph === (marketEvents.length > 0), 'P2_VALUE_MARKET_GRAPH_TRUTH_DRIFT');
  requireCondition(marketEvents.length === evidenceRecords.length, 'P2_MARKET_EVENT_ADMISSION_CARDINALITY_MISMATCH');
  const eventByEvidence = new Map();
  const eventIds = new Set();
  const evidenceRecordIds = new Set(evidenceRecords.map((record) => record.evidence_id));
  for (const event of marketEvents) {
    requireCondition(typeof event.event_id === 'string' && event.event_id.length > 0 && typeof event.evidence_id === 'string', 'P2_MARKET_EVENT_ID_INVALID');
    requireCondition(!eventIds.has(event.event_id), `P2_MARKET_EVENT_ID_DUPLICATE:${event.event_id}`);
    requireCondition(evidenceRecordIds.has(event.evidence_id), `P2_MARKET_EVENT_WITHOUT_ADMITTED_EVIDENCE:${event.evidence_id}`);
    eventIds.add(event.event_id);
    requireCondition(!eventByEvidence.has(event.evidence_id), `P2_MARKET_EVENT_EVIDENCE_DUPLICATE:${event.evidence_id}`);
    eventByEvidence.set(event.evidence_id, event);
  }
  const marketEventBindingComplete = evidenceRecords.every((record) => {
    const event = eventByEvidence.get(record.evidence_id);
    return event && event.rights_state === 'ALLOW' && event.observed_at === record.observed_at
      && event.source_payload_sha256 === record.source_payload_sha256
      && event.evidence_record_digest === digestObject(record);
  });
  if (evidenceRecords.length > 0) requireCondition(marketEventBindingComplete, 'P2_MARKET_EVENT_EVIDENCE_BINDING_INVALID');

  const coveragePass = p0Bindings.missions_with_at_least_one_candidate === missionCount;
  const replacementCoveragePass = p0Bindings.missions_with_primary_and_fallback_candidates === missionCount
    && p0Bindings.missions_with_three_candidate_hosts === missionCount
    && regionalCoverageVerified === missionCount;
  const gate1Pass = actualGatePass === p1Gate.decision_count && actualGateHold === 0 && actualGateReject === 0 && queuedActions === 0;
  const rightsPassAll = rightsPass === p1Admission.candidate_count;
  const semanticsPass = semanticVerified === p1Gate.decision_count;
  const originPass = factualOriginVerified === missionCount;
  const admissionPass = evidenceRecords.length >= contract.snapshot_creation_gate.admitted_evidence_minimum && marketEventBindingComplete;
  const soldPass = admittedSold >= contract.snapshot_creation_gate.admitted_current_sold_minimum;
  const liquidityPass = admittedLiquidity >= contract.snapshot_creation_gate.admitted_liquidity_minimum;
  const eventPass = marketEvents.length >= contract.snapshot_creation_gate.market_event_graph_nodes_minimum && marketEventBindingComplete;

  const dimensions = [
    { dimension: 'MISSION_SOURCE_CANDIDATE_COVERAGE', state: coveragePass ? 'PASS' : 'FAIL', current_value: p0Bindings.missions_with_at_least_one_candidate, required_value: missionCount, evidence_refs: [p0Registry.id, p0Bindings.id] },
    { dimension: 'PRIMARY_FALLBACK_REPLACEMENT_COVERAGE', state: replacementCoveragePass ? 'PASS' : 'FAIL', current_value: { primary_and_fallback: p0Bindings.missions_with_primary_and_fallback_candidates, three_candidate_hosts: p0Bindings.missions_with_three_candidate_hosts, regional_coverage_verified: regionalCoverageVerified }, required_value: { primary_and_fallback: missionCount, three_candidate_hosts: missionCount, regional_coverage_verified: missionCount }, evidence_refs: [p0Bindings.id] },
    { dimension: 'GATE1_SOURCE_SAFETY', state: gate1Pass ? 'PASS' : 'FAIL', current_value: { pass: actualGatePass, hold: actualGateHold, reject: actualGateReject, completed_actions: completedActions }, required_value: { pass: p1Gate.decision_count, hold: 0, reject: 0, completed_actions: p1Actions.action_count }, evidence_refs: [p1Gate.id, p1Actions.id] },
    { dimension: 'PURPOSE_SPECIFIC_RIGHTS', state: rightsPassAll ? 'PASS' : 'FAIL', current_value: rightsPass, required_value: p1Admission.candidate_count, evidence_refs: [p1Admission.id] },
    { dimension: 'MARKET_SEMANTIC_SUFFICIENCY', state: semanticsPass ? 'PASS' : 'FAIL', current_value: semanticVerified, required_value: p1Gate.decision_count, evidence_refs: [p1Gate.id] },
    { dimension: 'FACTUAL_ORIGIN_INDEPENDENCE', state: originPass ? 'PASS' : 'FAIL', current_value: factualOriginVerified, required_value: missionCount, evidence_refs: [p0Bindings.id, p2Graph.id] },
    { dimension: 'EVIDENCE_ADMISSION', state: admissionPass ? 'PASS' : 'FAIL', current_value: evidenceRecords.length, required_value: contract.snapshot_creation_gate.admitted_evidence_minimum, evidence_refs: [p1Admission.id, p2Graph.id] },
    { dimension: 'CURRENT_SOLD_TRANSACTION_EVIDENCE', state: soldPass ? 'PASS' : 'FAIL', current_value: admittedSold, required_value: contract.snapshot_creation_gate.admitted_current_sold_minimum, evidence_refs: [p1Admission.id] },
    { dimension: 'LIQUIDITY_TIME_TO_SALE_EVIDENCE', state: liquidityPass ? 'PASS' : 'FAIL', current_value: admittedLiquidity, required_value: contract.snapshot_creation_gate.admitted_liquidity_minimum, evidence_refs: [p1Admission.id] },
    { dimension: 'MARKET_EVENT_GRAPH', state: eventPass ? 'PASS' : 'FAIL', current_value: marketEvents.length, required_value: contract.snapshot_creation_gate.market_event_graph_nodes_minimum, evidence_refs: [p2Graph.id, p2Lineage.id] },
  ];
  requireCondition(JSON.stringify(dimensions.map((value) => value.dimension)) === JSON.stringify(contract.prerequisite_dimensions), 'P3_PREREQUISITE_DIMENSION_ORDER_INVALID');
  const prerequisitesPass = dimensions.every((value) => value.state === 'PASS');

  const blockerSpecs = [
    [coveragePass, 'MISSION_SOURCE_CANDIDATE_COVERAGE_INCOMPLETE', 'P0', missionCount - p0Bindings.missions_with_at_least_one_candidate, 'Bind at least one governed source candidate to every mission.'],
    [replacementCoveragePass, 'REPLACEMENT_OR_REGIONAL_COVERAGE_INCOMPLETE', 'P1', missionCount - Math.min(p0Bindings.missions_with_three_candidate_hosts || 0, regionalCoverageVerified), 'Complete primary, fallback, replacement-host and regional relevance coverage for every mission.'],
    [gate1Pass, 'GATE1_OR_PREFLIGHT_ACTIONS_OPEN', 'P0', actualGateHold + actualGateReject + queuedActions, 'Complete every required preflight action and recompute every Gate 1 decision to PASS.'],
    [rightsPassAll, 'PURPOSE_SPECIFIC_RIGHTS_UNKNOWN', 'P0', p1Admission.candidate_count - rightsPass, 'Admit explicit collect, store, derive and display rights for every source-purpose grain.'],
    [semanticsPass, 'MARKET_SEMANTICS_UNVERIFIED', 'P0', p1Gate.decision_count - semanticVerified, 'Verify market semantics without Listing/Sold or Attention/Demand conflation.'],
    [originPass, 'FACTUAL_ORIGIN_INDEPENDENCE_UNPROVEN', 'P0', missionCount - factualOriginVerified, 'Verify distinct factual origins and source-removal resilience for every mission.'],
    [admissionPass, 'EVIDENCE_ADMISSION_ZERO_OR_UNBOUND', 'P0', Math.max(0, contract.snapshot_creation_gate.admitted_evidence_minimum - evidenceRecords.length), 'Admit rights-cleared, fresh, provenance-bound evidence and bind each record to one market event.'],
    [soldPass, 'CURRENT_SOLD_TRANSACTION_EVIDENCE_ZERO', 'P0', Math.max(0, contract.snapshot_creation_gate.admitted_current_sold_minimum - admittedSold), 'Admit at least one dated current SOLD transaction record.'],
    [liquidityPass, 'LIQUIDITY_TIME_TO_SALE_EVIDENCE_ZERO', 'P0', Math.max(0, contract.snapshot_creation_gate.admitted_liquidity_minimum - admittedLiquidity), 'Admit at least one censoring-aware liquidity exposure record.'],
    [eventPass, 'MARKET_EVENT_GRAPH_ZERO_OR_UNBOUND', 'P0', Math.max(0, contract.snapshot_creation_gate.market_event_graph_nodes_minimum - marketEvents.length), 'Materialize admitted evidence as digest-bound governed market events.'],
  ];
  const blockers = blockerSpecs.filter(([passed]) => !passed).map(([, blockerClass, severity, affectedCount, unblockCondition]) => ({
    blocker_id: idFor('blocker', { blocker_class: blockerClass, source_graph_digest: p2Lineage.graph.digest }),
    blocker_class: blockerClass,
    severity,
    state: 'OPEN',
    affected_count: Math.max(0, affectedCount),
    unblock_condition: unblockCondition,
    dependencies: uniq(dimensions.filter((value) => value.state === 'FAIL').flatMap((value) => value.evidence_refs)),
    evidence_refs: uniq([p0Bindings.id, p1Gate.id, p1Admission.id, p1Actions.id, p2Graph.id, p2Lineage.id]),
    snapshot_gate_effect: 'BLOCK',
    public_release: 'HOLD',
    production: 'HOLD',
  })).sort((left, right) => left.severity.localeCompare(right.severity) || left.blocker_class.localeCompare(right.blocker_class));

  return {
    missionCount, candidateCount, uniqueHosts, actualGatePass, actualGateHold, actualGateReject,
    rightsPass, semanticVerified, factualOriginVerified, regionalCoverageVerified, completedActions, queuedActions,
    evidenceRecords: evidenceRecords.sort((left, right) => left.evidence_id.localeCompare(right.evidence_id)),
    admittedSold, admittedLiquidity, marketEvents: stable(marketEvents), marketEventBindingComplete,
    prerequisiteDimensions: dimensions, prerequisitesPass, blockers,
    asOf: new Date(snapshotAsOf).toISOString(), sourceGraphDigest: p2Lineage.graph.digest,
  };
}
