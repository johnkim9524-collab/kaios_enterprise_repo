import assert from "node:assert/strict";
import {
  fingerprint,
  validateFingerprint,
  validateGraphIntegrity,
  validateQuarantineIntegrity,
  validateUniqueRecordArray
} from "./structured-evidence-integrity-v1.mjs";

const graphOptions = {
  label: "Test Graph",
  nodeTypes: ["SOURCE", "SOURCE_RECORD"],
  edgeTypes: ["PUBLISHED_SOURCE_RECORD"]
};

function graphFixture() {
  const graph = {
    node_count: 2,
    edge_count: 1,
    node_counts: { SOURCE: 1, SOURCE_RECORD: 1 },
    edge_counts: { PUBLISHED_SOURCE_RECORD: 1 },
    nodes: [
      { node_id: "source:a", node_type: "SOURCE" },
      { node_id: "record:a:1", node_type: "SOURCE_RECORD" }
    ],
    edges: [
      { from: "source:a", to: "record:a:1", edge_type: "PUBLISHED_SOURCE_RECORD" }
    ]
  };
  graph.graph_fingerprint = fingerprint(graph, "graph_fingerprint");
  return graph;
}

function quarantineFixture() {
  const quarantine = {
    quarantined_record_count: 2,
    reason_counts: { RIGHTS_MISSING: 1, STALE_OBSERVATION: 2 },
    quarantined_records: [
      { record_id: "record:a", reasons: ["STALE_OBSERVATION"] },
      { record_id: "record:b", reasons: ["RIGHTS_MISSING", "STALE_OBSERVATION"] }
    ]
  };
  quarantine.report_fingerprint = fingerprint(quarantine, "report_fingerprint");
  return quarantine;
}

function clone(value) {
  return structuredClone(value);
}

function graphErrors(graph) {
  return [
    ...validateFingerprint(graph, "graph_fingerprint", "Test Graph"),
    ...validateGraphIntegrity(graph, graphOptions)
  ];
}

const validGraph = graphFixture();
assert.deepEqual(graphErrors(validGraph), [], "valid graph fixture must pass");

const missingNode = clone(validGraph);
missingNode.nodes.pop();
missingNode.graph_fingerprint = fingerprint(missingNode, "graph_fingerprint");
assert(graphErrors(missingNode).some(error => error.includes("node_count")), "missing materialized node must fail");

const duplicateNode = clone(validGraph);
duplicateNode.nodes[1] = clone(duplicateNode.nodes[0]);
duplicateNode.node_counts = { SOURCE: 2, SOURCE_RECORD: 0 };
duplicateNode.graph_fingerprint = fingerprint(duplicateNode, "graph_fingerprint");
assert(graphErrors(duplicateNode).some(error => error.includes("node_id values must be unique")), "duplicate node identity must fail");

const undeclaredCountPair = clone(validGraph);
undeclaredCountPair.node_counts.UNDECLARED_POSITIVE = 1;
undeclaredCountPair.node_counts.UNDECLARED_NEGATIVE = -1;
undeclaredCountPair.graph_fingerprint = fingerprint(undeclaredCountPair, "graph_fingerprint");
const undeclaredErrors = graphErrors(undeclaredCountPair);
assert(undeclaredErrors.some(error => error.includes("classes must exactly match")), "undeclared count classes must fail");
assert(undeclaredErrors.some(error => error.includes("non-negative integer")), "negative count value must fail");

const duplicateEdge = clone(validGraph);
duplicateEdge.edges.push(clone(duplicateEdge.edges[0]));
duplicateEdge.edge_count = 2;
duplicateEdge.edge_counts.PUBLISHED_SOURCE_RECORD = 2;
duplicateEdge.graph_fingerprint = fingerprint(duplicateEdge, "graph_fingerprint");
assert(graphErrors(duplicateEdge).some(error => error.includes("edge identities must be unique")), "duplicate edge identity must fail");

const danglingEdge = clone(validGraph);
danglingEdge.edges[0].to = "record:missing";
danglingEdge.graph_fingerprint = fingerprint(danglingEdge, "graph_fingerprint");
assert(graphErrors(danglingEdge).some(error => error.includes("endpoint is absent")), "dangling edge must fail");

const staleFingerprint = clone(validGraph);
staleFingerprint.nodes[0].node_id = "source:tampered";
assert(validateFingerprint(staleFingerprint, "graph_fingerprint", "Test Graph").length === 1,
  "stale document fingerprint must fail");

const validQuarantine = quarantineFixture();
assert.deepEqual(validateQuarantineIntegrity(validQuarantine, 2), [], "valid quarantine fixture must pass");

const duplicateQuarantine = clone(validQuarantine);
duplicateQuarantine.quarantined_records[1].record_id = duplicateQuarantine.quarantined_records[0].record_id;
duplicateQuarantine.report_fingerprint = fingerprint(duplicateQuarantine, "report_fingerprint");
assert(validateQuarantineIntegrity(duplicateQuarantine, 2).some(error => error.includes("record_id values must be unique")),
  "duplicate quarantine identity must fail");

const malformedReasons = clone(validQuarantine);
malformedReasons.reason_counts = { RIGHTS_MISSING: 2, STALE_OBSERVATION: 2, UNDECLARED: -1 };
malformedReasons.report_fingerprint = fingerprint(malformedReasons, "report_fingerprint");
const reasonErrors = validateQuarantineIntegrity(malformedReasons, 2);
assert(reasonErrors.some(error => error.includes("classes must exactly match")), "undeclared reason class must fail");
assert(reasonErrors.some(error => error.includes("non-negative integer")), "negative reason count must fail");

assert.deepEqual(validateUniqueRecordArray([{ id: "a" }, { id: "b" }], {
  label: "Records", idKey: "id", expectedCount: 2
}), [], "unique materialized records must pass");
assert(validateUniqueRecordArray([{ id: "a" }, { id: "a" }], {
  label: "Records", idKey: "id", expectedCount: 2
}).some(error => error.includes("must be unique")), "duplicate materialized record identity must fail");

console.log("Candidate R2 structured evidence integrity mutations: PASS (10/10)");
