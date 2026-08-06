import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublishPlan, evaluatePublicationGate, stableId } from './governed-publisher.mjs';

const normalization = {
  schema: 'kidults.normalization.v1',
  generated_at: '2026-08-07T00:00:00.000Z',
  records: []
};

const baseInsight = {
  insight_id: 'insight-1',
  kind: 'opportunity',
  title: 'Category momentum',
  summary: 'Momentum strengthened across governed observations.',
  recommendation: 'Review for editorial publication.',
  score: 84,
  confidence: 0.88,
  evidence_ids: ['obs-1', 'obs-2']
};

test('stableId is deterministic', () => {
  assert.equal(stableId({ a: 1 }), stableId({ a: 1 }));
});

test('eligible insight passes the publication gate', () => {
  const gate = evaluatePublicationGate(baseInsight);
  assert.equal(gate.eligible, true);
  assert.deepEqual(gate.reasons, []);
});

test('low-confidence insight is held', () => {
  const gate = evaluatePublicationGate({ ...baseInsight, confidence: 0.4 });
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('confidence_below_threshold'));
});

test('insufficient evidence is held', () => {
  const gate = evaluatePublicationGate({ ...baseInsight, evidence_ids: ['obs-1'] });
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('insufficient_evidence'));
});

test('risk insights require human review', () => {
  const gate = evaluatePublicationGate({ ...baseInsight, kind: 'risk' });
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('risk_requires_human_review'));
});

test('buildPublishPlan produces governed candidate outputs', () => {
  const plan = buildPublishPlan({
    schema: 'kidults.insights.v1',
    generated_at: '2026-08-07T00:00:00.000Z',
    insights: [baseInsight]
  }, normalization);

  assert.equal(plan.counts.publish_candidates, 1);
  assert.equal(plan.outputs.archive.length, 1);
  assert.equal(plan.outputs.executive_feed.length, 1);
  assert.equal(plan.outputs.search_documents.length, 1);
  assert.equal(plan.outputs.archive[0].status, 'candidate');
});

test('buildPublishPlan never marks production promotion as authorized by default', () => {
  delete process.env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED;
  const plan = buildPublishPlan({
    schema: 'kidults.insights.v1',
    generated_at: '2026-08-07T00:00:00.000Z',
    insights: [baseInsight]
  }, normalization);
  assert.equal(plan.production_promotion_authorized, false);
});

test('unsupported schemas are rejected', () => {
  assert.throws(() => buildPublishPlan({ schema: 'wrong', insights: [] }, normalization), /unsupported_insight_schema/);
});
