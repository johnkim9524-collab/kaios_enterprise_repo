import { hash, short, stableJson, uniq } from './asi-autonomous-resolution-common-v1.mjs';

export function resolveCurrent({ candidates, bindings, gate1, admissions, actionQueue, contract }) {
  const candidateById = new Map(candidates.candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const actionsByCandidate = new Map();
  for (const action of actionQueue.actions) {
    if (!candidateById.has(action.candidate_id)) throw new Error(`ACTION_CANDIDATE_MISSING:${action.action_id}`);
    if (!actionsByCandidate.has(action.candidate_id)) actionsByCandidate.set(action.candidate_id, []);
    actionsByCandidate.get(action.candidate_id).push(action);
  }
  for (const [candidateId, actions] of actionsByCandidate) {
    const observed = actions.map((action) => action.action_type).sort();
    const required = [...contract.action_types].sort();
    if (JSON.stringify(observed) !== JSON.stringify(required)) throw new Error(`CANDIDATE_ACTION_SET_INVALID:${candidateId}`);
  }

  const candidateIds = [...actionsByCandidate.keys()].sort();
  const semanticType = 'MARKET_SEMANTIC_AND_SOURCE_ROLE_VERIFICATION';
  const semanticRecords = [], rightsRecords = [], originRecords = [], actionRecords = [];
  const graphNodes = [], graphEdges = [], actionNodeIds = new Map();

  for (const candidateId of candidateIds) {
    const candidate = candidateById.get(candidateId);
    const actions = [...actionsByCandidate.get(candidateId)].sort((a, b) => a.sequence - b.sequence || a.action_id.localeCompare(b.action_id));
    const semanticAction = actions.find((action) => action.action_type === semanticType);
    const evidenceClasses = uniq(semanticAction.impacted_mission_ids.map((missionId) => missionId.split('::').at(-1)));
    const applies = candidate.evidence_state === contract.semantic_short_circuit.required_candidate_state
      && candidate.target_content_acquired === contract.semantic_short_circuit.required_target_content_acquired
      && evidenceClasses.every((value) => contract.semantic_short_circuit.affected_evidence_classes.includes(value));
    if (!applies) throw new Error(`SEMANTIC_SHORT_CIRCUIT_NOT_APPLICABLE:${candidateId}`);

    const semanticId = short('semantic_resolution', candidateId);
    semanticRecords.push({
      semantic_resolution_id: semanticId,
      candidate_id: candidateId,
      canonical_host: candidate.canonical_host,
      state: 'TERMINAL_REJECT_FOR_CURRENT_MARKET_EVIDENCE',
      decision: 'REJECT',
      rejection_scope: 'MISSION_EVIDENCE_CLASS_ONLY',
      candidate_globally_retired: false,
      evidence_classes: evidenceClasses,
      observed_candidate_state: candidate.evidence_state,
      target_content_acquired: false,
      terminal_market_state_observed: false,
      exposure_denominator_observed: false,
      claim_ceiling: 'NO_CURRENT_SOLD_OR_LIQUIDITY_CLAIM',
      reason_codes: [
        'DISCOVERY_METADATA_ONLY',
        'TARGET_CONTENT_NOT_ACQUIRED',
        'NO_EXPLICIT_TERMINAL_SOLD_STATE',
        'NO_REALIZED_PRICE_OR_CURRENCY',
        'NO_EXPOSURE_DENOMINATOR',
        'SOURCE_ROLE_UNCLASSIFIED_FOR_CURRENT_MARKET_EVIDENCE'
      ],
      evidence_refs: [`candidate:${candidateId}`, `candidate-registry:${hash(stableJson(candidates))}`, `action:${semanticAction.action_id}`],
      public_release: 'HOLD', production: 'HOLD'
    });
    rightsRecords.push({
      rights_resolution_id: short('rights_resolution', candidateId),
      candidate_id: candidateId,
      canonical_host: candidate.canonical_host,
      state: 'NOT_REQUIRED_AFTER_TERMINAL_SEMANTIC_REJECTION',
      rights_state: 'UNKNOWN',
      collect: 'UNKNOWN_NOT_ADJUDICATED', store: 'UNKNOWN_NOT_ADJUDICATED',
      derive: 'UNKNOWN_NOT_ADJUDICATED', display: 'UNKNOWN_NOT_ADJUDICATED',
      rights_pass_created: false, collection_authorized: false,
      live_terms_or_robots_probe_executed: false,
      reason_codes: ['SEMANTIC_REJECTION_PREVENTS_UNNECESSARY_RIGHTS_PROBE', 'ROBOTS_OR_TERMS_LINK_WOULD_NOT_CREATE_RIGHTS_PASS'],
      evidence_refs: [`candidate:${candidateId}`, `semantic-resolution:${semanticId}`],
      public_release: 'HOLD', production: 'HOLD'
    });
    originRecords.push({
      factual_origin_resolution_id: short('origin_resolution', candidateId),
      candidate_id: candidateId,
      canonical_host: candidate.canonical_host,
      state: 'UNRESOLVED_NOT_REQUIRED_AFTER_TERMINAL_SEMANTIC_REJECTION',
      source_owner_id: null, factual_origin_id: null,
      distinct_host_is_distinct_factual_origin: false,
      factual_origin_independence_proven: false,
      reason_codes: ['HOST_IS_NOT_FACTUAL_ORIGIN', 'DISCOVERY_PROVIDER_IS_NOT_UNDERLYING_FACTUAL_ORIGIN', 'SEMANTICALLY_INCOMPATIBLE_GRAIN_REJECTED'],
      evidence_refs: [`candidate:${candidateId}`, `semantic-resolution:${semanticId}`],
      public_release: 'HOLD', production: 'HOLD'
    });

    for (const action of actions) {
      const isSemantic = action.action_type === semanticType;
      const terminalState = isSemantic ? 'RESOLVED_REJECTED' : 'SUPERSEDED_BY_TERMINAL_SEMANTIC_REJECTION';
      const nodeId = `node:action:${action.action_id}`;
      actionNodeIds.set(action.action_id, nodeId);
      graphNodes.push({
        node_id: nodeId, node_type: 'P1_PREFLIGHT_ACTION', action_id: action.action_id,
        candidate_id: candidateId, action_type: action.action_type,
        original_state: action.state, terminal_state: terminalState,
        public_release: 'HOLD', production: 'HOLD'
      });
      actionRecords.push({
        action_id: action.action_id,
        candidate_id: candidateId,
        action_type: action.action_type,
        original_state: action.state,
        terminal_state: terminalState,
        execution_result: isSemantic ? 'REJECTED_BY_DETERMINISTIC_SEMANTIC_TRIAGE' : 'NOT_EXECUTED_SUPERSEDED',
        network_probe_executed: false,
        rights_pass_created: false,
        evidence_admitted: false,
        reason_codes: isSemantic
          ? ['DISCOVERY_METADATA_ONLY_INCOMPATIBLE_WITH_REQUIRED_EVIDENCE_CLASS']
          : ['TERMINAL_SEMANTIC_REJECTION_SHORT_CIRCUIT'],
        evidence_refs: [`action:${action.action_id}`, `candidate:${candidateId}`, `semantic-resolution:${semanticId}`],
        public_release: 'HOLD', production: 'HOLD'
      });
    }
    for (const action of actions.filter((action) => action.action_type !== semanticType)) {
      graphEdges.push({
        edge_id: short('dependency_edge', `${semanticAction.action_id}::${action.action_id}`),
        edge_type: 'SEMANTIC_SHORT_CIRCUIT_CONTROLS_ACTION',
        from_node_id: actionNodeIds.get(semanticAction.action_id),
        to_node_id: actionNodeIds.get(action.action_id),
        condition: 'ONLY_EXECUTE_IF_SEMANTIC_TRIAGE_DOES_NOT_TERMINALLY_REJECT',
        observed_result: 'SUPERSEDED',
        public_release: 'HOLD', production: 'HOLD'
      });
    }
  }

  const admissionByGrain = new Map(admissions.candidates.map((record) => [record.grain_id, record]));
  const gate1Records = [], admissionRecords = [];
  for (const decision of [...gate1.decisions].sort((a, b) => a.grain_id.localeCompare(b.grain_id))) {
    const actions = actionsByCandidate.get(decision.candidate_id);
    const gateNodeId = `node:gate1-reevaluation:${decision.grain_id}`;
    graphNodes.push({
      node_id: gateNodeId, node_type: 'GATE1_REEVALUATION', grain_id: decision.grain_id,
      candidate_id: decision.candidate_id, mission_id: decision.mission_id,
      original_decision: decision.decision, resolved_decision: 'REJECT',
      public_release: 'HOLD', production: 'HOLD'
    });
    for (const action of actions) graphEdges.push({
      edge_id: short('dependency_edge', `${action.action_id}::${decision.grain_id}`),
      edge_type: 'ACTION_TERMINAL_STATE_REQUIRED_FOR_GATE1_REEVALUATION',
      from_node_id: actionNodeIds.get(action.action_id), to_node_id: gateNodeId,
      condition: 'ACTION_TERMINAL', observed_result: 'SATISFIED',
      public_release: 'HOLD', production: 'HOLD'
    });
    gate1Records.push({
      gate1_resolution_id: short('gate1_resolution', decision.grain_id),
      original_gate1_decision_id: decision.gate1_decision_id,
      grain_id: decision.grain_id, mission_id: decision.mission_id,
      market_cell_id: decision.market_cell_id, candidate_id: decision.candidate_id,
      original_decision: decision.decision, resolved_decision: 'REJECT',
      rights_state: 'UNKNOWN', semantic_state: 'TERMINAL_REJECT_FOR_CURRENT_MARKET_EVIDENCE',
      rejection_scope: 'MISSION_EVIDENCE_CLASS_ONLY', candidate_globally_retired: false,
      collection_authorized: false, evidence_admitted: false, market_claim_authorized: false,
      reason_codes: [
        'SOURCE_CANDIDATE_SEMANTICALLY_INCOMPATIBLE_WITH_REQUIRED_CURRENT_MARKET_EVIDENCE',
        'DISCOVERY_METADATA_IS_NOT_SOLD_TRANSACTION',
        'DISCOVERY_METADATA_IS_NOT_LIQUIDITY_EXPOSURE'
      ],
      evidence_refs: [`gate1:${decision.gate1_decision_id}`, `semantic-resolution:${short('semantic_resolution', decision.candidate_id)}`],
      public_release: 'HOLD', production: 'HOLD'
    });
    const admission = admissionByGrain.get(decision.grain_id);
    if (!admission) throw new Error(`ADMISSION_GRAIN_MISSING:${decision.grain_id}`);
    admissionRecords.push({
      admission_resolution_id: short('admission_resolution', decision.grain_id),
      original_admission_candidate_id: admission.admission_candidate_id,
      grain_id: decision.grain_id, mission_id: decision.mission_id,
      candidate_id: decision.candidate_id, evidence_class: admission.evidence_class,
      original_state: admission.state, resolved_state: 'REJECTED_SOURCE_ROLE_INCOMPATIBLE',
      evidence_admitted: false, admitted_evidence_id: null, market_event_created: false,
      collection_authorized: false,
      reason_codes: ['GATE1_TERMINAL_REJECT', 'SOURCE_CANDIDATE_IS_DISCOVERY_METADATA_ONLY'],
      evidence_refs: [`admission-candidate:${admission.admission_candidate_id}`, `gate1-resolution:${short('gate1_resolution', decision.grain_id)}`],
      public_release: 'HOLD', production: 'HOLD'
    });
  }

  const nodeIds = new Set(graphNodes.map((node) => node.node_id));
  if (nodeIds.size !== graphNodes.length) throw new Error('DEPENDENCY_GRAPH_DUPLICATE_NODE');
  if (new Set(graphEdges.map((edge) => edge.edge_id)).size !== graphEdges.length) throw new Error('DEPENDENCY_GRAPH_DUPLICATE_EDGE');
  if (graphEdges.some((edge) => !nodeIds.has(edge.from_node_id) || !nodeIds.has(edge.to_node_id))) throw new Error('DEPENDENCY_GRAPH_ORPHAN_EDGE');

  return {
    candidateIds,
    semanticRecords,
    rightsRecords,
    originRecords,
    actionRecords,
    gate1Records,
    admissionRecords,
    actionDependencyGraph: {
      id: 'kidults-asi-action-dependency-graph-v1', version: '1.0.0',
      state: 'TERMINAL_SHORT_CIRCUIT_GRAPH_BUILT',
      node_count: graphNodes.length, edge_count: graphEdges.length,
      action_node_count: actionQueue.actions.length,
      gate1_reevaluation_node_count: gate1.decisions.length,
      nodes: graphNodes.sort((a, b) => a.node_id.localeCompare(b.node_id)),
      edges: graphEdges.sort((a, b) => a.edge_id.localeCompare(b.edge_id)),
      orphan_edge_count: 0, public_release: 'HOLD', production: 'HOLD'
    }
  };
}
