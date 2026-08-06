import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutiveSnapshot } from "./executive-dashboard.mjs";

test("aggregates governed operations into executive KPIs", () => {
  const snapshot = buildExecutiveSnapshot({
    crm: { counts: { active: 3 }, generated_at: "2026-08-07T00:00:00.000Z" },
    ai: {
      counts: { high_value: 1, pending_approval: 1, approved: 1, sent: 1 },
      generated_at: "2026-08-07T00:30:00.000Z",
      records: [
        { id: "a", category: "Provider", opportunity_score: 80, approval_status: "draft" },
        { id: "b", category: "API", opportunity_score: 60, approval_status: "approved" },
        { id: "c", category: "Media", opportunity_score: 40, approval_status: "sent" }
      ]
    },
    intelligence: { index_level: 104, coverage: 88, confidence: "Verified" },
    reports: { count: 4 },
    now: new Date("2026-08-07T01:00:00.000Z")
  });
  assert.equal(snapshot.kpis.active_pipeline, 3);
  assert.equal(snapshot.kpis.actionable_inquiries, 3);
  assert.equal(snapshot.kpis.average_opportunity_score, 60);
  assert.equal(snapshot.kpis.conversion_rate, 33);
  assert.equal(snapshot.intelligence.index_level, 104);
});

test("excludes test records from executive action counts", () => {
  const snapshot = buildExecutiveSnapshot({
    crm: { counts: { active: 0 } },
    ai: { records: [{ id: "test", is_test: true, opportunity_score: 100, approval_status: "draft" }], counts: { pending_approval: 0, high_value: 0, approved: 0, sent: 0 } },
    now: new Date("2026-08-07T01:00:00.000Z")
  });
  assert.equal(snapshot.kpis.actionable_inquiries, 0);
  assert.equal(snapshot.kpis.average_opportunity_score, 0);
  assert.match(snapshot.executive_brief, /No actionable enterprise inquiries/);
});

test("groups categories and approval pipeline", () => {
  const snapshot = buildExecutiveSnapshot({
    crm: {},
    ai: { records: [
      { id: "1", category: "Provider", opportunity_score: 70, approval_status: "draft" },
      { id: "2", category: "Provider", opportunity_score: 80, approval_status: "approved" },
      { id: "3", category: "Research", opportunity_score: 50, approval_status: "sent" }
    ], counts: {} },
    now: new Date("2026-08-07T01:00:00.000Z")
  });
  assert.equal(snapshot.categories.Provider, 2);
  assert.equal(snapshot.categories.Research, 1);
  assert.equal(snapshot.pipeline.draft, 1);
  assert.equal(snapshot.pipeline.approved, 1);
  assert.equal(snapshot.pipeline.sent, 1);
});

test("preserves human governance safeguards", () => {
  const snapshot = buildExecutiveSnapshot({ crm: {}, ai: {}, now: new Date("2026-08-07T01:00:00.000Z") });
  assert.equal(snapshot.governance.auto_send, false);
  assert.equal(snapshot.governance.human_approval_required, true);
  assert.equal(snapshot.governance.public_pii_exposure, false);
  assert.equal(snapshot.governance.environment, "staging");
});
