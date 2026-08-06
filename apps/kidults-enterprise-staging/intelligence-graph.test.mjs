import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIntelligenceGraph, findNeighbors } from './intelligence-graph.mjs';

const snapshot = {
  schema_version: 'kidults.normalized.v1',
  generated_at: '2026-08-07T00:00:00.000Z',
  records: [{
    id: 'record-1',
    observation_id: 'observation-1',
    canonical_title: 'LEGO 2026 Collector Set',
    brand: { value: 'LEGO', confidence: 0.95 },
    category: { value: 'Figures & Statues', confidence: 0.92 },
    release_year: 2026,
    source: { name: 'lego.com', type: 'brand', url: 'https://lego.com/item', observed_at: '2026-08-07T00:00:00.000Z' },
    confidence: 0.94,
    publish_candidate: true,
    review_required: false
  }]
};

test('rejects incompatible normalization schema', () => {
  assert.throws(() => buildIntelligenceGraph({ schema_version: 'wrong' }), /normalization_snapshot_schema_invalid/);
});

test('creates typed graph nodes', () => {
  const graph = buildIntelligenceGraph(snapshot, new Date('2026-08-07T01:00:00.000Z'));
  assert.equal(graph.schema_version, 'kidults.graph.v1');
  assert.equal(graph.counts.items, 1);
  assert.equal(graph.counts.brands, 1);
  assert.equal(graph.counts.categories, 1);
  assert.equal(graph.counts.sources, 1);
  assert.ok(graph.nodes.some((node) => node.type === 'year' && node.label === '2026'));
});

test('creates governed semantic relationships', () => {
  const graph = buildIntelligenceGraph(snapshot);
  const relations = new Set(graph.edges.map((edge) => edge.relation));
  assert.deepEqual(relations, new Set(['ACTIVE_IN', 'BRANDED_BY', 'IN_CATEGORY', 'OBSERVED_AT', 'RELEASED_IN']));
});

test('preserves observation lineage on every edge', () => {
  const graph = buildIntelligenceGraph(snapshot);
  assert.ok(graph.edges.every((edge) => edge.evidence.observation_ids.includes('observation-1')));
});

test('uses stable identifiers for repeatable builds', () => {
  const first = buildIntelligenceGraph(snapshot);
  const second = buildIntelligenceGraph(snapshot);
  assert.deepEqual(first.nodes.map((node) => node.id), second.nodes.map((node) => node.id));
  assert.deepEqual(first.edges.map((edge) => edge.id), second.edges.map((edge) => edge.id));
});

test('finds relation-scoped neighbors', () => {
  const graph = buildIntelligenceGraph(snapshot);
  const item = graph.nodes.find((node) => node.type === 'item');
  const neighbors = findNeighbors(graph, item.id, 'BRANDED_BY');
  assert.equal(neighbors.length, 1);
  assert.equal(neighbors[0].label, 'LEGO');
});
