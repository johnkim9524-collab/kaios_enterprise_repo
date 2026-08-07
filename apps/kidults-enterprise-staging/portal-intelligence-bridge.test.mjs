import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBridgePayload } from './scripts/build-portal-intelligence-bridge.mjs';

const publishSnapshot = {
  schema_version: 'kidults.publish-plan.v1',
  generated_at: '2026-08-07T00:00:00.000Z',
  counts: { evaluated: 2, publish_candidates: 1, held: 1 },
  production_promotion_authorized: false,
  candidates: [
    {
      publication_id: 'held-1',
      insight_id: 'risk-1',
      title: 'Evidence concentration risk',
      status: 'held',
      gate: { reasons: ['risk_requires_human_review'] }
    }
  ],
  outputs: {
    archive: [{ id: 'pub-1', title: 'Brand momentum improved', summary: 'Evidence strengthened.', status: 'candidate' }],
    executive_feed: [{ id: 'pub-1', headline: 'Brand momentum improved', executive_summary: 'Evidence strengthened.', status: 'candidate' }],
    search_documents: [{ id: 'pub-1', title: 'Brand momentum improved', text: 'Evidence strengthened.', type: 'insight', status: 'candidate' }]
  }
};

const intelligence = { status: 'governed', headline: { score: 88 } };
const search = [{ title: 'Kidult 100', href: 'intelligence.html', type: 'Intelligence', text: 'benchmark' }];

test('portal bridge accepts governed publish plan', () => {
  const result = buildBridgePayload(publishSnapshot, intelligence, search);
  assert.equal(result.bridge.schema_version, 'kidults.portal-bridge.v1');
  assert.equal(result.bridge.counts.publish_candidates, 1);
  assert.equal(result.bridge.counts.held, 1);
});

test('portal bridge preserves existing intelligence and adds governed feed', () => {
  const result = buildBridgePayload(publishSnapshot, intelligence, search);
  assert.equal(result.intelligence.status, 'governed');
  assert.equal(result.intelligence.headline.score, 88);
  assert.equal(result.intelligence.governed.executive_feed.length, 1);
});

test('portal bridge appends governed search documents without removing existing search', () => {
  const result = buildBridgePayload(publishSnapshot, intelligence, search);
  assert.equal(result.search[0].title, 'Kidult 100');
  assert.equal(result.search.length, 2);
  assert.equal(result.search[1].type, 'Governed Intelligence');
});

test('portal bridge never authorizes production when publish plan is not authorized', () => {
  const result = buildBridgePayload(publishSnapshot, intelligence, search);
  assert.equal(result.bridge.production_promotion_authorized, false);
  assert.equal(result.intelligence.governed.production_promotion_authorized, false);
});

test('portal bridge rejects unsupported publish schema', () => {
  assert.throws(() => buildBridgePayload({ ...publishSnapshot, schema_version: 'wrong' }, intelligence, search), /publish_snapshot_schema_invalid/);
});
