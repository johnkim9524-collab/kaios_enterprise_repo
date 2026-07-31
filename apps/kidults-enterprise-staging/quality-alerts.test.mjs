import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { evaluateQuality, restoreLastGood } from "./quality-alerts.mjs";

function json(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fixture(overrides = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "kidults-quality-"));
  const publicDir = resolve(root, "public");
  const operationsDir = resolve(root, "operations");
  mkdirSync(resolve(publicDir, "data"), { recursive: true });
  mkdirSync(operationsDir, { recursive: true });
  for (const name of ["kidult-100.json", "monthly-intelligence.json", "archive.json"]) {
    json(resolve(publicDir, "data", name), { name });
  }
  const signals = Array.from({ length: overrides.records ?? 25 }, (_, index) => ({
    name: `Signal ${index + 1}`,
    category: `Category ${(index % 4) + 1}`,
    confidence: overrides.confidence ?? 82,
    freshness_hours: overrides.freshness ?? 12
  }));
  json(resolve(operationsDir, "validated-signals.json"), {
    signals,
    evidence_summary: { source_ids: overrides.sources ?? ["official_rss"] }
  });
  json(resolve(operationsDir, "latest-run.json"), {
    run_id: "run-1",
    status: overrides.runStatus ?? "completed",
    updated_at: overrides.updatedAt ?? "2026-07-31T05:00:00.000Z",
    outputs: ["kidult-100.json", "monthly-intelligence.json", "archive.json"].map((name) => ({
      path: name,
      sha256: hash(resolve(publicDir, "data", name))
    }))
  });
  const policyPath = resolve(root, "policy.json");
  json(policyPath, {
    version: "KQ-1.0",
    maximum_run_age_hours: 30,
    minimum_records: 20,
    minimum_categories: 4,
    minimum_sources: 1,
    minimum_average_confidence: 70,
    maximum_signal_freshness_hours: 168
  });
  return { root, publicDir, operationsDir, policyPath };
}

test("reports an operational quality state and saves last-good evidence", () => {
  const paths = fixture();
  const result = evaluateQuality({ ...paths, now: new Date("2026-07-31T06:00:00.000Z") });
  assert.equal(result.status, "operational");
  assert.equal(result.metrics.records, 25);
  assert.equal(result.metrics.categories, 4);
  assert.match(readFileSync(resolve(paths.operationsDir, "last-good-quality.json"), "utf8"), /operational/);
});

test("reports degraded confidence and freshness without discarding outputs", () => {
  const paths = fixture({ confidence: 60, freshness: 180 });
  const result = evaluateQuality({ ...paths, now: new Date("2026-07-31T06:00:00.000Z") });
  assert.equal(result.status, "degraded");
  assert.deepEqual(result.alerts.map((item) => item.code), ["CONFIDENCE_LOW", "SIGNAL_STALE"]);
});

test("reports critical output integrity failure", () => {
  const paths = fixture();
  writeFileSync(resolve(paths.publicDir, "data/kidult-100.json"), "changed\n");
  const result = evaluateQuality({ ...paths, now: new Date("2026-07-31T06:00:00.000Z") });
  assert.equal(result.status, "critical");
  assert.ok(result.alerts.some((item) => item.code === "OUTPUT_INTEGRITY_FAILED"));
});

test("deduplicates unchanged alert transitions", () => {
  const paths = fixture({ confidence: 60 });
  const options = { ...paths, now: new Date("2026-07-31T06:00:00.000Z") };
  evaluateQuality(options);
  evaluateQuality({ ...options, now: new Date("2026-07-31T06:10:00.000Z") });
  const lines = readFileSync(resolve(paths.operationsDir, "quality-alerts.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
});

test("restores the last-good public status after a critical evaluation", () => {
  const paths = fixture();
  evaluateQuality({ ...paths, now: new Date("2026-07-31T06:00:00.000Z") });
  writeFileSync(resolve(paths.publicDir, "data/archive.json"), "tampered\n");
  evaluateQuality({ ...paths, now: new Date("2026-07-31T06:20:00.000Z") });
  restoreLastGood(paths);
  const restored = JSON.parse(readFileSync(resolve(paths.publicDir, "data/quality-status.json"), "utf8"));
  assert.equal(restored.status, "operational");
});

test("public status excludes operational paths and source details", () => {
  const paths = fixture();
  evaluateQuality({ ...paths, now: new Date("2026-07-31T06:00:00.000Z") });
  const text = readFileSync(resolve(paths.publicDir, "data/quality-status.json"), "utf8");
  assert.doesNotMatch(text, /\/opt\//);
  assert.doesNotMatch(text, /source_ids/);
  assert.equal((chmodSync(resolve(paths.publicDir, "data/quality-status.json"), 0o644), true), true);
});
