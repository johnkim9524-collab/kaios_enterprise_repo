import test from "node:test";
import assert from "node:assert/strict";
import { buildAiOperationsSnapshot, enrichRecord, updateAiRecord } from "./ai-operations.mjs";

test("scores and summarizes a high-value provider inquiry", () => {
  const record = enrichRecord({
    id: "one",
    type: "inquiry",
    email: "partner@example.com",
    organization: "Global Catalog Provider",
    interest: "Urgent enterprise pilot for an exclusive international dataset and API integration."
  });
  assert.equal(record.category, "Provider");
  assert.ok(record.opportunity_score >= 85);
  assert.equal(record.priority, "critical");
  assert.match(record.executive_summary, /Urgent enterprise pilot/);
  assert.match(record.reply_draft, /Kidults Partnerships/);
  assert.equal(record.human_approval_required, true);
});

test("never auto-sends and excludes test records from approval counts", () => {
  const snapshot = buildAiOperationsSnapshot({
    crmSnapshot: { records: [
      { id: "live", email: "live@example.com", organization: "Studio", interest: "Partnership pilot" },
      { id: "test", email: "test@example.com", interest: "notification delivery test", is_test: true }
    ] },
    state: {},
    now: new Date("2026-08-06T14:00:00.000Z")
  });
  assert.equal(snapshot.governance.auto_send, false);
  assert.equal(snapshot.governance.pii_masking, true);
  assert.equal(snapshot.counts.pending_approval, 1);
  assert.equal(snapshot.records[1].opportunity_score, 0);
});

test("records human approval decisions in an audit trail", () => {
  const state = updateAiRecord({ records: {}, audit: [] }, "one", { approval_status: "approved" }, new Date("2026-08-06T15:00:00.000Z"));
  assert.equal(state.records.one.approval_status, "approved");
  assert.equal(state.audit.length, 1);
  assert.equal(state.audit[0].actor, "human-operator");
});

test("rejects unsupported approval values", () => {
  const state = updateAiRecord({ records: {}, audit: [] }, "one", { approval_status: "auto-sent" });
  assert.equal(state.records.one.approval_status, undefined);
});
