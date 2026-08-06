import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { calculateSignalConfidence, generateInsights, runInsightCli, writeInsightSnapshot } from './insight-engine.mjs';

const graph = {
  schema_version: 'kidults.graph.v1',
  generated_at: '2026-08-06T00:00:00.000Z',
  nodes: [
    { id: 'item-1', type: 'item', label: 'Item One' },
    { id: 'brand-1', type: 'brand', label: 'Funko' },
    { id: 'category-1', type: 'category', label: 'Figures & Statues' },
    { id: 'source-1', type: 'source', label: 'Provider A' }
  ],
  edges: [
    { from: 'item-1', to: 'brand-1', relation: 'BRANDED_BY', evidence_count: 1, observation_ids: ['obs-1'] },
    { from: 'item-1', to: 'category-1', relation: 'IN_CATEGORY', evidence_count: 1, observation_ids: ['obs-1'] },
    { from: 'item-1', to: 'source-1', relation: 'OBSERVED_AT', evidence_count: 1, observation_ids: ['obs-1'] }
  ]
};

test('calculates bounded signal confidence', () => {
  assert.equal(calculateSignalConfidence({ evidenceCount: 100, averageEdgeEvidence: 10, graphCoverage: 2 }), 1);
});

test('rejects unsupported graph schema', () => {
  assert.throws(() => generateInsights({ schema_version: 'wrong' }), /graph_snapshot_schema_invalid/);
});

test('generates category and brand insights', () => {
  const snapshot = generateInsights(graph, new Date('2026-08-07T00:00:00.000Z'));
  assert.equal(snapshot.schema_version, 'kidults.insights.v1');
  assert.equal(snapshot.counts.insights >= 2, true);
  assert.equal(snapshot.insights.some((item) => item.subject === 'Funko'), true);
  assert.equal(snapshot.insights.some((item) => item.subject === 'Figures & Statues'), true);
});

test('reports concentrated-source risk', () => {
  const snapshot = generateInsights(graph);
  assert.equal(snapshot.insights.some((item) => item.type === 'evidence_risk'), true);
  assert.equal(snapshot.counts.risks, 1);
});

test('preserves explainability and evidence lineage', () => {
  const snapshot = generateInsights(graph);
  const insight = snapshot.insights.find((item) => item.subject === 'Funko');
  assert.deepEqual(insight.evidence, ['obs-1']);
  assert.equal(insight.explainability.metric, 'brand_share');
});

test('produces deterministic IDs for the same graph snapshot', () => {
  const first = generateInsights(graph, new Date('2026-08-07T00:00:00.000Z'));
  const second = generateInsights(graph, new Date('2026-08-08T00:00:00.000Z'));
  assert.equal(first.insights[0].id, second.insights[0].id);
});

test('writes an atomic insight snapshot', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-insight-'));
  const output = writeInsightSnapshot(generateInsights(graph), directory);
  assert.equal(fs.existsSync(output), true);
  assert.equal(fs.existsSync(`${output}.tmp`), false);
});

test('supports build and status CLI flow', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-insight-cli-'));
  const input = path.join(root, 'graph.json');
  const output = path.join(root, 'out');
  fs.writeFileSync(input, JSON.stringify(graph), 'utf8');
  const env = { KIDULTS_INSIGHT_INPUT_FILE: input, KIDULTS_INSIGHT_OUTPUT_DIR: output };
  assert.equal(runInsightCli(['build'], env).ready, true);
  const status = runInsightCli(['status'], env);
  assert.equal(status.ready, true);
  assert.equal(status.counts.insights >= 2, true);
});
