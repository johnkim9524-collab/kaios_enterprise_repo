import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { dispatchPendingNotifications } from "./operations-notify.mjs";

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "kidults-notify-"));
  const submissionsPath = resolve(root, "conversion-submissions.jsonl");
  const statePath = resolve(root, "notification-state.json");
  const auditPath = resolve(root, "conversion-audit.jsonl");
  return { root, submissionsPath, statePath, auditPath };
}

function appendSubmissions(path, submissions) {
  writeFileSync(path, `${submissions.map((value) => JSON.stringify(value)).join("\n")}\n`, "utf8");
}

function submission(id, type = "inquiry") {
  return {
    id,
    type,
    email: `${id}@example.com`,
    organization: "Kidults QA",
    interest: "Operational notification test",
    created_at: "2026-08-06T11:00:00.000Z"
  };
}

test("delivers each pending conversion exactly once", async () => {
  const paths = fixture();
  appendSubmissions(paths.submissionsPath, [submission("one"), submission("two", "newsletter")]);
  const delivered = [];
  const notify = async (value) => {
    delivered.push(value.id);
    return { channel: "test", recipient: "partnerships@kidults.com" };
  };

  const first = await dispatchPendingNotifications({
    ...paths,
    notify,
    now: () => new Date("2026-08-06T11:30:00.000Z")
  });
  assert.equal(first.checked, 2);
  assert.equal(first.delivered, 2);
  assert.deepEqual(delivered, ["one", "two"]);

  const second = await dispatchPendingNotifications({ ...paths, notify });
  assert.equal(second.pending, 0);
  assert.deepEqual(delivered, ["one", "two"]);

  const state = JSON.parse(readFileSync(paths.statePath, "utf8"));
  assert.deepEqual(state.delivered_ids, ["one", "two"]);
  const audit = readFileSync(paths.auditPath, "utf8");
  assert.match(audit, /conversion_notification_delivered/);
  assert.doesNotMatch(audit, /one@example\.com/);
});

test("records failure without marking the conversion delivered", async () => {
  const paths = fixture();
  appendSubmissions(paths.submissionsPath, [submission("retry")]);
  const result = await dispatchPendingNotifications({
    ...paths,
    notify: async () => {
      throw new Error("temporary smtp failure");
    },
    now: () => new Date("2026-08-06T11:30:00.000Z")
  });

  assert.equal(result.failed, 1);
  assert.equal(existsSync(paths.statePath), false);
  const audit = readFileSync(paths.auditPath, "utf8");
  assert.match(audit, /conversion_notification_failed/);
  assert.match(audit, /temporary smtp failure/);
});

test("continues after one failed notification and persists later success", async () => {
  const paths = fixture();
  appendSubmissions(paths.submissionsPath, [submission("bad"), submission("good")]);
  const result = await dispatchPendingNotifications({
    ...paths,
    notify: async (value) => {
      if (value.id === "bad") throw new Error("smtp unavailable");
      return { channel: "test" };
    }
  });

  assert.equal(result.failed, 1);
  assert.equal(result.delivered, 1);
  const state = JSON.parse(readFileSync(paths.statePath, "utf8"));
  assert.deepEqual(state.delivered_ids, ["good"]);
});
