import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function stableId(type, value) {
  return crypto.createHash('sha256').update(`${type}|${String(value).toLowerCase()}`).digest('hex');
}

function addNode(nodes, type, value, attributes = {}) {
  if (value === null || value === undefined || value === '') return null;
  const id = stableId(type, value);
  if (!nodes.has(id)) nodes.set(id, { id, type, label: String(value), attributes });
  return id;
}

function addEdge(edges, from, relation, to, evidence) {
  if (!from || !to) return;
  const id = stableId('edge', `${from}|${relation}|${to}`);
  const current = edges.get(id);
  const observationIds = new Set(current?.evidence?.observation_ids ?? []);
  if (evidence?.observation_id) observationIds.add(evidence.observation_id);
  edges.set(id, {
    id,
    from,
    relation,
    to,
    confidence: Math.max(current?.confidence ?? 0, evidence?.confidence ?? 0),
    evidence: { observation_ids: [...observationIds].sort() }
  });
}

export function buildIntelligenceGraph(normalizationSnapshot, now = new Date()) {
  if (normalizationSnapshot?.schema_version !== 'kidults.normalized.v1') throw new Error('normalization_snapshot_schema_invalid');
  const nodes = new Map();
  const edges = new Map();

  for (const record of normalizationSnapshot.records) {
    const itemId = addNode(nodes, 'item', record.canonical_title, {
      record_id: record.id,
      publish_candidate: record.publish_candidate,
      review_required: record.review_required,
      confidence: record.confidence
    });
    const brandId = addNode(nodes, 'brand', record.brand?.value, { confidence: record.brand?.confidence ?? 0 });
    const categoryId = addNode(nodes, 'category', record.category?.value, { confidence: record.category?.confidence ?? 0 });
    const sourceId = addNode(nodes, 'source', record.source?.name, { type: record.source?.type, url: record.source?.url });
    const yearId = addNode(nodes, 'year', record.release_year);

    const evidence = { observation_id: record.observation_id, confidence: record.confidence };
    addEdge(edges, itemId, 'BRANDED_BY', brandId, evidence);
    addEdge(edges, itemId, 'IN_CATEGORY', categoryId, evidence);
    addEdge(edges, itemId, 'OBSERVED_AT', sourceId, evidence);
    addEdge(edges, itemId, 'RELEASED_IN', yearId, evidence);
    addEdge(edges, brandId, 'ACTIVE_IN', categoryId, evidence);
  }

  const nodeList = [...nodes.values()].sort((a, b) => `${a.type}|${a.label}`.localeCompare(`${b.type}|${b.label}`));
  const edgeList = [...edges.values()].sort((a, b) => `${a.relation}|${a.from}|${a.to}`.localeCompare(`${b.relation}|${b.from}|${b.to}`));
  return {
    schema_version: 'kidults.graph.v1',
    generated_at: now.toISOString(),
    source_generated_at: normalizationSnapshot.generated_at,
    counts: {
      nodes: nodeList.length,
      edges: edgeList.length,
      items: nodeList.filter((node) => node.type === 'item').length,
      brands: nodeList.filter((node) => node.type === 'brand').length,
      categories: nodeList.filter((node) => node.type === 'category').length,
      sources: nodeList.filter((node) => node.type === 'source').length
    },
    nodes: nodeList,
    edges: edgeList
  };
}

export function findNeighbors(graph, nodeId, relation = null) {
  const edgeMatches = graph.edges.filter((edge) => (edge.from === nodeId || edge.to === nodeId) && (!relation || edge.relation === relation));
  const ids = new Set(edgeMatches.flatMap((edge) => [edge.from, edge.to]).filter((id) => id !== nodeId));
  return graph.nodes.filter((node) => ids.has(node.id));
}

export function writeGraphSnapshot(snapshot, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const outputPath = path.join(directory, 'intelligence-graph.json');
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  return outputPath;
}

export function runGraphCli(argv = process.argv.slice(2), env = process.env) {
  const command = argv[0] ?? 'status';
  const inputPath = env.KIDULTS_GRAPH_INPUT_FILE ?? path.resolve('.local-data/normalization/normalization-snapshot.json');
  const outputDir = env.KIDULTS_GRAPH_OUTPUT_DIR ?? path.resolve('.local-data/graph');
  const outputPath = path.join(outputDir, 'intelligence-graph.json');

  if (command === 'status') {
    if (!fs.existsSync(outputPath)) return { ready: false, output: outputPath };
    const snapshot = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return { ready: true, output: outputPath, counts: snapshot.counts, generated_at: snapshot.generated_at };
  }
  if (command !== 'build') throw new Error('graph_command_unsupported');
  if (!fs.existsSync(inputPath)) throw new Error('normalization_snapshot_missing');
  const normalizationSnapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const snapshot = buildIntelligenceGraph(normalizationSnapshot);
  const output = writeGraphSnapshot(snapshot, outputDir);
  return { ready: true, output, counts: snapshot.counts };
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    console.log(JSON.stringify(runGraphCli()));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}
