import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function stableId(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}

export function calculateSignalConfidence({ evidenceCount, averageEdgeEvidence = 1, graphCoverage = 1 }) {
  const countScore = Math.min(1, evidenceCount / 5);
  const edgeScore = Math.min(1, averageEdgeEvidence / 3);
  return Number(clamp(countScore * 0.45 + edgeScore * 0.25 + graphCoverage * 0.3).toFixed(4));
}

export function generateInsights(graph, now = new Date()) {
  if (graph?.schema_version !== 'kidults.graph.v1') throw new Error('graph_snapshot_schema_invalid');

  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const itemNodes = nodes.filter((node) => node.type === 'item');
  const categoryEdges = edges.filter((edge) => edge.relation === 'IN_CATEGORY');
  const brandEdges = edges.filter((edge) => edge.relation === 'BRANDED_BY');
  const sourceEdges = edges.filter((edge) => edge.relation === 'OBSERVED_AT');

  const categoryGroups = groupBy(categoryEdges, (edge) => edge.to);
  const brandGroups = groupBy(brandEdges, (edge) => edge.to);
  const sourceGroups = groupBy(sourceEdges, (edge) => edge.to);
  const insights = [];

  for (const [categoryId, group] of categoryGroups.entries()) {
    const node = byId.get(categoryId);
    const share = itemNodes.length ? group.length / itemNodes.length : 0;
    const confidence = calculateSignalConfidence({
      evidenceCount: group.length,
      averageEdgeEvidence: group.reduce((sum, edge) => sum + (edge.evidence_count ?? 1), 0) / group.length,
      graphCoverage: share
    });
    insights.push({
      id: stableId(`category|${categoryId}|${graph.generated_at}`),
      type: share >= 0.5 ? 'category_momentum' : 'category_signal',
      subject: node?.label ?? 'Unknown category',
      headline: `${node?.label ?? 'Category'} represents ${Math.round(share * 100)}% of observed items`,
      summary: `${group.length} of ${itemNodes.length} governed items are connected to this category.`,
      score: Math.round(share * 100),
      confidence,
      recommendation: share >= 0.5 ? 'Prioritize deeper evidence collection and market validation.' : 'Continue monitoring before allocation decisions.',
      evidence: group.flatMap((edge) => edge.evidence?.observation_ids ?? edge.observation_ids ?? []).filter(Boolean),
      explainability: { metric: 'category_share', numerator: group.length, denominator: itemNodes.length }
    });
  }

  for (const [brandId, group] of brandGroups.entries()) {
    const node = byId.get(brandId);
    const share = itemNodes.length ? group.length / itemNodes.length : 0;
    insights.push({
      id: stableId(`brand|${brandId}|${graph.generated_at}`),
      type: share >= 0.4 ? 'brand_opportunity' : 'brand_signal',
      subject: node?.label ?? 'Unknown brand',
      headline: `${node?.label ?? 'Brand'} has ${group.length} governed item connection${group.length === 1 ? '' : 's'}`,
      summary: `Brand concentration is ${Math.round(share * 100)}% across the current graph snapshot.`,
      score: Math.round(share * 100),
      confidence: calculateSignalConfidence({ evidenceCount: group.length, graphCoverage: share }),
      recommendation: share >= 0.4 ? 'Evaluate partnership, coverage expansion and comparable evidence.' : 'Maintain observation until evidence density improves.',
      evidence: group.flatMap((edge) => edge.evidence?.observation_ids ?? edge.observation_ids ?? []).filter(Boolean),
      explainability: { metric: 'brand_share', numerator: group.length, denominator: itemNodes.length }
    });
  }

  const sourceConcentration = [...sourceGroups.values()].reduce((max, group) => Math.max(max, group.length), 0);
  const sourceShare = itemNodes.length ? sourceConcentration / itemNodes.length : 0;
  if (sourceShare > 0.7) {
    insights.push({
      id: stableId(`risk|source-concentration|${graph.generated_at}`),
      type: 'evidence_risk',
      subject: 'Source diversity',
      headline: 'Evidence is concentrated in a limited source set',
      summary: `${Math.round(sourceShare * 100)}% of item observations depend on the most concentrated source.`,
      score: Math.round(sourceShare * 100),
      confidence: calculateSignalConfidence({ evidenceCount: itemNodes.length, graphCoverage: sourceShare }),
      recommendation: 'Add independent primary or high-tier sources before publication.',
      evidence: sourceEdges.flatMap((edge) => edge.evidence?.observation_ids ?? edge.observation_ids ?? []).filter(Boolean),
      explainability: { metric: 'source_concentration', numerator: sourceConcentration, denominator: itemNodes.length }
    });
  }

  const ranked = insights.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  const top = ranked[0];
  const executiveBrief = top
    ? `${top.headline}. ${top.recommendation}`
    : 'No decision-ready insight is available from the current graph snapshot.';

  return {
    schema_version: 'kidults.insights.v1',
    generated_at: now.toISOString(),
    source_generated_at: graph.generated_at,
    counts: {
      insights: ranked.length,
      opportunities: ranked.filter((item) => item.type.includes('opportunity') || item.type.includes('momentum')).length,
      risks: ranked.filter((item) => item.type.includes('risk')).length,
      decision_ready: ranked.filter((item) => item.confidence >= 0.7).length
    },
    executive_brief: executiveBrief,
    insights: ranked
  };
}

export function writeInsightSnapshot(snapshot, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const outputPath = path.join(directory, 'insight-snapshot.json');
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  return outputPath;
}

export function runInsightCli(argv = process.argv.slice(2), env = process.env) {
  const command = argv[0] ?? 'status';
  const inputPath = env.KIDULTS_INSIGHT_INPUT_FILE ?? path.resolve('.local-data/graph/intelligence-graph.json');
  const outputDir = env.KIDULTS_INSIGHT_OUTPUT_DIR ?? path.resolve('.local-data/insights');
  const outputPath = path.join(outputDir, 'insight-snapshot.json');

  if (command === 'status') {
    if (!fs.existsSync(outputPath)) return { ready: false, output: outputPath };
    const snapshot = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return { ready: true, output: outputPath, counts: snapshot.counts, generated_at: snapshot.generated_at, executive_brief: snapshot.executive_brief };
  }
  if (command !== 'build') throw new Error('insight_command_unsupported');
  if (!fs.existsSync(inputPath)) throw new Error('graph_snapshot_missing');
  const graph = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const snapshot = generateInsights(graph);
  const output = writeInsightSnapshot(snapshot, outputDir);
  return { ready: true, output, counts: snapshot.counts, executive_brief: snapshot.executive_brief };
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    console.log(JSON.stringify(runInsightCli()));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}
