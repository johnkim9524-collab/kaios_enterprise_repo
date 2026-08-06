import test from "node:test";
import assert from "node:assert/strict";
import { buildCrmSnapshot, updateCrmRecord } from "./operations-crm.mjs";

test("classifies and prioritizes enterprise submissions", () => {
  const snapshot = buildCrmSnapshot({
    submissions: [{
      id: "one",
      type: "inquiry",
      email: "data@example.com",
      organization: "Global Data Provider",
      interest: "Immediate provider pilot and API integration",
      created_at: "2026-08-06T12:00:00.000Z"
    }],
    state: { records: {} },
    now: new Date("2026-08-06T14:00:00.000Z")
  });
  assert.equal(snapshot.counts.today, 1);
  assert.equal(snapshot.counts.unread, 1);
  assert.equal(snapshot.records[0].category, "Provider");
  assert.equal(snapshot.records[0].priority, "high");
});

test("marks records read and archived without losing metadata", () => {
  const read = updateCrmRecord({ records: {} }, "one", { status: "read", notes: "Qualified" }, new Date("2026-08-06T13:00:00.000Z"));
  assert.equal(read.records.one.status, "read");
  assert.equal(read.records.one.notes, "Qualified");
  const archived = updateCrmRecord(read, "one", { status: "archived" }, new Date("2026-08-06T14:00:00.000Z"));
  assert.equal(archived.records.one.status, "archived");
  assert.equal(archived.records.one.notes, "Qualified");
});

test("rejects unsupported state values", () => {
  const state = updateCrmRecord({ records: {} }, "one", { status: "deleted", priority: "critical" });
  assert.equal(state.records.one.status, undefined);
  assert.equal(state.records.one.priority, undefined);
});
