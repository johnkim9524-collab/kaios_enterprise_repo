const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const EXPECTED_INVALIDATED_STATE = Object.freeze({
  SOURCE_RECORD: 'WITHDRAWN',
  RAW_RECORD: 'TOMBSTONED',
  EVIDENCE: 'TOMBSTONED',
  FACTOR: 'INVALIDATED',
  CLAIM: 'INVALIDATED',
  CANDIDATE: 'HOLD_RECOMPUTE_REQUIRED',
  SNAPSHOT: 'HOLD_RECOMPUTE_REQUIRED',
  PROJECTION: 'HOLD_RECOMPUTE_REQUIRED',
  PORTAL_EOS: 'HOLD_RECOMPUTE_REQUIRED'
});

const baselineGraph = Object.freeze({
  synthetic: true,
  promotable: false,
  empirical_gate_effect: 'NONE',
  nodes: [
    { id: 'source-1', kind: 'SOURCE_RECORD', state: 'ACTIVE', depends_on: [] },
    { id: 'raw-1', kind: 'RAW_RECORD', state: 'ACTIVE', depends_on: ['source-1'] },
    { id: 'evidence-1', kind: 'EVIDENCE', state: 'ACTIVE', depends_on: ['raw-1'] },
    { id: 'factor-1', kind: 'FACTOR', state: 'ACTIVE', depends_on: ['evidence-1'] },
    { id: 'claim-1', kind: 'CLAIM', state: 'ACTIVE', depends_on: ['factor-1'] },
    { id: 'candidate-1', kind: 'CANDIDATE', state: 'ACTIVE', depends_on: ['claim-1'] },
    { id: 'snapshot-1', kind: 'SNAPSHOT', state: 'ACTIVE', depends_on: ['candidate-1'] },
    { id: 'projection-1', kind: 'PROJECTION', state: 'ACTIVE', depends_on: ['snapshot-1'] },
    { id: 'portal-eos-1', kind: 'PORTAL_EOS', state: 'ACTIVE', depends_on: ['projection-1'] }
  ]
});

function clone(value) {
  return structuredClone(value);
}

function validateGraph(graph) {
  assert(graph?.synthetic === true, 'graph must be synthetic');
  assert(graph?.promotable === false, 'graph must remain non-promotable');
  assert(graph?.empirical_gate_effect === 'NONE', 'graph must not affect empirical gates');
  assert(Array.isArray(graph.nodes) && graph.nodes.length > 0, 'graph nodes required');

  const byId = new Map();
  for (const node of graph.nodes) {
    assert(typeof node.id === 'string' && node.id.length > 0, 'node id required');
    assert(!byId.has(node.id), `duplicate node id: ${node.id}`);
    assert(EXPECTED_INVALIDATED_STATE[node.kind], `unsupported node kind: ${node.kind}`);
    assert(Array.isArray(node.depends_on), `depends_on required: ${node.id}`);
    assert(new Set(node.depends_on).size === node.depends_on.length, `duplicate dependency edge: ${node.id}`);
    if (node.kind !== 'SOURCE_RECORD') assert(node.depends_on.length > 0, `non-source node must have dependency: ${node.id}`);
    byId.set(node.id, node);
  }

  for (const node of graph.nodes) {
    for (const dep of node.depends_on) {
      assert(byId.has(dep), `orphan dependency ${dep} referenced by ${node.id}`);
      assert(dep !== node.id, `self cycle: ${node.id}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    assert(!visiting.has(id), `dependency cycle detected at ${id}`);
    visiting.add(id);
    for (const dep of byId.get(id).depends_on) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);

  return byId;
}

function descendants(graph, rootId) {
  const byId = validateGraph(graph);
  assert(byId.has(rootId), `root not found: ${rootId}`);
  const reverse = new Map([...byId.keys()].map(id => [id, []]));
  for (const node of byId.values()) {
    for (const dep of node.depends_on) reverse.get(dep).push(node.id);
  }
  const affected = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift();
    for (const child of reverse.get(current)) {
      if (!affected.has(child)) {
        affected.add(child);
        queue.push(child);
      }
    }
  }
  return affected;
}

function applyTransitiveInvalidation(graph, rootId, eventType) {
  const affected = descendants(graph, rootId);
  const next = clone(graph);
  const tombstones = [];
  for (const node of next.nodes) {
    if (!affected.has(node.id)) continue;
    const previousState = node.state;
    node.state = EXPECTED_INVALIDATED_STATE[node.kind];
    node.invalidation_root_id = rootId;
    node.invalidation_event = eventType;
    tombstones.push({
      object_id: node.id,
      object_kind: node.kind,
      previous_state: previousState,
      invalidated_state: node.state,
      invalidation_root_id: rootId,
      reason: eventType,
      lineage_metadata_only: true,
      raw_content_retained: false
    });
  }
  return { graph: next, affected, tombstones, rootId, eventType };
}

function verifyCascade(original, result) {
  const originalById = validateGraph(original);
  const nextById = validateGraph(result.graph);
  const expectedAffected = descendants(original, result.rootId);
  assert(result.affected.size === expectedAffected.size, 'affected set size drift');
  for (const id of expectedAffected) assert(result.affected.has(id), `missing affected descendant: ${id}`);

  for (const [id, before] of originalById.entries()) {
    const after = nextById.get(id);
    if (expectedAffected.has(id)) {
      assert(after.state === EXPECTED_INVALIDATED_STATE[after.kind], `surviving stale downstream node: ${id}/${after.state}`);
      assert(after.invalidation_root_id === result.rootId, `invalidation root drift: ${id}`);
      assert(after.invalidation_event === result.eventType, `invalidation event drift: ${id}`);
    } else {
      assert(after.state === before.state, `unrelated node changed state: ${id}`);
    }
  }

  assert(result.tombstones.length === expectedAffected.size, 'every affected node needs audit tombstone');
  const tombstoneIds = new Set(result.tombstones.map(t => t.object_id));
  assert(tombstoneIds.size === result.tombstones.length, 'duplicate tombstone');
  for (const id of expectedAffected) assert(tombstoneIds.has(id), `missing tombstone: ${id}`);
  for (const tombstone of result.tombstones) {
    assert(tombstone.lineage_metadata_only === true, `tombstone must be lineage-only: ${tombstone.object_id}`);
    assert(tombstone.raw_content_retained === false, `tombstone retained prohibited raw content: ${tombstone.object_id}`);
    assert(tombstone.invalidation_root_id === result.rootId, `tombstone root drift: ${tombstone.object_id}`);
  }

  for (const node of result.graph.nodes) {
    if (node.kind === 'CLAIM' && node.state === 'ACTIVE') {
      for (const dep of node.depends_on) {
        assert(!expectedAffected.has(dep), `orphan active claim survived invalidated dependency: ${node.id}`);
      }
    }
  }

  return true;
}

const scenarios = [
  { id: 'rights_revocation', rootId: 'source-1', eventType: 'RIGHTS_REVOKED' },
  { id: 'source_withdrawal', rootId: 'source-1', eventType: 'SOURCE_WITHDRAWN' },
  { id: 'source_deletion', rootId: 'source-1', eventType: 'SOURCE_DELETED' },
  { id: 'entity_correction', rootId: 'evidence-1', eventType: 'ENTITY_CORRECTION' }
];
for (const scenario of scenarios) {
  const result = applyTransitiveInvalidation(baselineGraph, scenario.rootId, scenario.eventType);
  verifyCascade(baselineGraph, result);
}

function expectFailure(id, fn) {
  let failed = false;
  try { fn(); } catch { failed = true; }
  assert(failed, `mutation did not fail closed: ${id}`);
}

const mutationCases = [
  ['orphan_dependency', () => {
    const graph = clone(baselineGraph);
    graph.nodes.find(n => n.id === 'claim-1').depends_on = ['missing-factor'];
    validateGraph(graph);
  }],
  ['duplicate_dependency_edge', () => {
    const graph = clone(baselineGraph);
    graph.nodes.find(n => n.id === 'claim-1').depends_on = ['factor-1', 'factor-1'];
    validateGraph(graph);
  }],
  ['cycle_corrupt_lineage', () => {
    const graph = clone(baselineGraph);
    graph.nodes.find(n => n.id === 'source-1').depends_on = ['portal-eos-1'];
    validateGraph(graph);
  }],
  ['surviving_projection', () => {
    const result = applyTransitiveInvalidation(baselineGraph, 'source-1', 'RIGHTS_REVOKED');
    result.graph.nodes.find(n => n.id === 'projection-1').state = 'ACTIVE';
    verifyCascade(baselineGraph, result);
  }],
  ['surviving_portal_eos', () => {
    const result = applyTransitiveInvalidation(baselineGraph, 'source-1', 'RIGHTS_REVOKED');
    result.graph.nodes.find(n => n.id === 'portal-eos-1').state = 'ACTIVE';
    verifyCascade(baselineGraph, result);
  }],
  ['stale_candidate_snapshot', () => {
    const result = applyTransitiveInvalidation(baselineGraph, 'source-1', 'SOURCE_WITHDRAWN');
    result.graph.nodes.find(n => n.id === 'snapshot-1').state = 'ACTIVE';
    verifyCascade(baselineGraph, result);
  }],
  ['orphan_claim_survives', () => {
    const result = applyTransitiveInvalidation(baselineGraph, 'source-1', 'SOURCE_DELETED');
    result.graph.nodes.find(n => n.id === 'claim-1').state = 'ACTIVE';
    verifyCascade(baselineGraph, result);
  }],
  ['missing_tombstone', () => {
    const result = applyTransitiveInvalidation(baselineGraph, 'source-1', 'RIGHTS_REVOKED');
    result.tombstones = result.tombstones.filter(t => t.object_id !== 'evidence-1');
    verifyCascade(baselineGraph, result);
  }],
  ['raw_content_retained_in_tombstone', () => {
    const result = applyTransitiveInvalidation(baselineGraph, 'source-1', 'SOURCE_DELETED');
    result.tombstones.find(t => t.object_id === 'raw-1').raw_content_retained = true;
    verifyCascade(baselineGraph, result);
  }],
  ['disconnected_downstream_node', () => {
    const graph = clone(baselineGraph);
    graph.nodes.find(n => n.id === 'projection-1').depends_on = [];
    validateGraph(graph);
  }]
];
for (const [id, fn] of mutationCases) expectFailure(id, fn);

console.log(JSON.stringify({
  suite: 'KIDULTS_RIGHTS_WITHDRAWAL_TRANSITIVE_INVALIDATION_V1',
  governing_issue: 958,
  parent_pre_partner_gate: 881,
  result: 'PASS',
  synthetic_non_promotable_graph_nodes: baselineGraph.nodes.length,
  scenarios_machine_proven: scenarios.map(s => s.id),
  mutation_cases_fail_closed: mutationCases.length,
  no_orphan_derived_claim_after_upstream_invalidation: true,
  candidate_snapshot_projection_hold_on_upstream_invalidation: true,
  opaque_lineage_tombstones_without_raw_content: true,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
