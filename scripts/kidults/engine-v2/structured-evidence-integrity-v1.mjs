import crypto from "node:crypto";

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item?.[key];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

export function fingerprint(document, field) {
  if (!plainObject(document)) return null;
  const unsigned = { ...document };
  delete unsigned[field];
  return `sha256:${crypto.createHash("sha256").update(stableJson(unsigned)).digest("hex")}`;
}

export function validateFingerprint(document, field, label) {
  const errors = [];
  const expected = fingerprint(document, field);
  if (!expected || document?.[field] !== expected) errors.push(`${label} ${field} does not bind the exact document bytes.`);
  return errors;
}

export function validateExactCountMap(value, expectedCounts, label) {
  const errors = [];
  if (!plainObject(value)) return [`${label} must be an object.`];
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expectedCounts).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    errors.push(`${label} classes must exactly match the materialized records.`);
  }
  for (const key of actualKeys) {
    if (!nonNegativeInteger(value[key])) errors.push(`${label}.${key} must be a non-negative integer.`);
  }
  for (const key of expectedKeys) {
    if (value[key] !== expectedCounts[key]) errors.push(`${label}.${key} does not match the materialized record count.`);
  }
  return errors;
}

export function validateGraphIntegrity(graph, { label, nodeTypes, edgeTypes }) {
  const errors = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  if (!Array.isArray(graph?.nodes)) errors.push(`${label} nodes must be an array.`);
  if (!Array.isArray(graph?.edges)) errors.push(`${label} edges must be an array.`);
  if (!nonNegativeInteger(graph?.node_count) || graph.node_count !== nodes.length) {
    errors.push(`${label} node_count must equal the materialized node array length.`);
  }
  if (!nonNegativeInteger(graph?.edge_count) || graph.edge_count !== edges.length) {
    errors.push(`${label} edge_count must equal the materialized edge array length.`);
  }

  const nodeIds = nodes.map(node => node?.node_id);
  if (!nodeIds.every(nonEmptyString)) errors.push(`${label} every node must carry a non-empty node_id.`);
  if (new Set(nodeIds).size !== nodeIds.length) errors.push(`${label} node_id values must be unique.`);
  for (const node of nodes) {
    if (!nodeTypes.includes(node?.node_type)) errors.push(`${label} contains undeclared node type ${String(node?.node_type)}.`);
  }
  errors.push(...validateExactCountMap(graph?.node_counts, countBy(nodes, "node_type"), `${label} node_counts`));

  const nodeSet = new Set(nodeIds);
  const edgeIds = edges.map(edge => `${String(edge?.from)}|${String(edge?.to)}|${String(edge?.edge_type)}`);
  if (new Set(edgeIds).size !== edgeIds.length) errors.push(`${label} edge identities must be unique.`);
  for (const edge of edges) {
    if (!nonEmptyString(edge?.from) || !nonEmptyString(edge?.to)) errors.push(`${label} every edge must carry non-empty endpoints.`);
    if (!edgeTypes.includes(edge?.edge_type)) errors.push(`${label} contains undeclared edge type ${String(edge?.edge_type)}.`);
    if (!nodeSet.has(edge?.from) || !nodeSet.has(edge?.to)) errors.push(`${label} edge endpoint is absent from the materialized node set.`);
  }
  errors.push(...validateExactCountMap(graph?.edge_counts, countBy(edges, "edge_type"), `${label} edge_counts`));
  return errors;
}

export function validateQuarantineIntegrity(quarantine, expectedCount) {
  const errors = [];
  const records = Array.isArray(quarantine?.quarantined_records) ? quarantine.quarantined_records : [];
  if (!Array.isArray(quarantine?.quarantined_records)) errors.push("Raw Quarantine records must be an array.");
  if (!nonNegativeInteger(expectedCount) || records.length !== expectedCount) {
    errors.push("Raw Quarantine record array length must equal the declared quarantined count.");
  }
  const recordIds = records.map(record => record?.record_id);
  if (!recordIds.every(nonEmptyString)) errors.push("Every quarantined record must carry a non-empty record_id.");
  if (new Set(recordIds).size !== recordIds.length) errors.push("Quarantined record_id values must be unique.");

  const reasons = [];
  for (const record of records) {
    if (!Array.isArray(record?.reasons) || record.reasons.length === 0 || !record.reasons.every(nonEmptyString)) {
      errors.push(`${record?.record_id ?? "unknown"}: quarantine reasons must be a non-empty string array.`);
      continue;
    }
    if (new Set(record.reasons).size !== record.reasons.length) {
      errors.push(`${record.record_id}: quarantine reasons must be unique within the record.`);
    }
    reasons.push(...record.reasons.map(reason => ({ reason })));
  }
  errors.push(...validateExactCountMap(quarantine?.reason_counts, countBy(reasons, "reason"), "Raw Quarantine reason_counts"));
  return errors;
}

export function validateUniqueRecordArray(records, { label, idKey, expectedCount }) {
  const errors = [];
  const items = Array.isArray(records) ? records : [];
  if (!Array.isArray(records)) errors.push(`${label} must be an array.`);
  if (!nonNegativeInteger(expectedCount) || items.length !== expectedCount) errors.push(`${label} length must equal its declared count.`);
  const ids = items.map(item => item?.[idKey]);
  if (!ids.every(nonEmptyString)) errors.push(`${label} every record must carry a non-empty ${idKey}.`);
  if (new Set(ids).size !== ids.length) errors.push(`${label} ${idKey} values must be unique.`);
  return errors;
}
