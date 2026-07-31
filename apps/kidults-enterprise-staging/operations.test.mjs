import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  backupOperations,
  enforceRetention,
  exportConversions,
  operationsStatus,
  refreshIntelligence,
  verifyBackup
} from "./operations.mjs";

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "kidults-operations-"));
  const publicDir = resolve(root, "public");
  const dataDir = resolve(root, "conversions");
  const operationsDir = resolve(root, "operations");
  mkdirSync(resolve(publicDir, "data"), { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(operationsDir, { recursive: true });
  writeFileSync(resolve(publicDir, "data/archive.json"), JSON.stringify({ reports: [] }));
  writeFileSync(resolve(operationsDir, "validated-signals.json"), JSON.stringify({
    batch_id: "collector-2026-08-01",
    generated_at: "2026-08-01T00:00:00.000Z",
    source_report_sha256: "a".repeat(64),
    eligibility: "staging-research",
    evidence_summary: { accepted_records: 3, categories: 3, source_ids: ["official_rss"] },
    signals: [
      { name: "Cards", category: "Cards", score: 82, momentum_30d: 3, confidence: 91, freshness_hours: 2 },
      { name: "Designer Toys", category: "Art Toys", score: 90, momentum_30d: 6, confidence: 95, freshness_hours: 1 },
      { name: "Figures", category: "Figures", score: 84, momentum_30d: 2, confidence: 92, freshness_hours: 3 }
    ]
  }));
  return { root, publicDir, dataDir, operationsDir };
}

test("refreshes K100, monthly intelligence, archive, and manifest atomically", () => {
  const paths = fixture();
  const result = refreshIntelligence({
    ...paths,
    sourcePath: resolve(paths.operationsDir, "validated-signals.json"),
    issue: "2026-08",
    now: new Date("2026-08-01T00:00:00Z")
  });
  assert.equal(result.records, 3);
  assert.equal(JSON.parse(readFileSync(resolve(paths.publicDir, "data/kidult-100.json"))).items[0].name, "Designer Toys");
  assert.equal(JSON.parse(readFileSync(resolve(paths.publicDir, "data/monthly-intelligence.json"))).status, "published");
  assert.equal(JSON.parse(readFileSync(resolve(paths.publicDir, "data/archive.json"))).reports[0].id, "monthly-intelligence-2026-08");
  assert.equal(result.outputs.length, 3);
});

test("rejects invalid collector evidence without replacing outputs", () => {
  const paths = fixture();
  writeFileSync(resolve(paths.operationsDir, "validated-signals.json"), JSON.stringify({ signals: [] }));
  assert.throws(() => refreshIntelligence({
    ...paths,
    sourcePath: resolve(paths.operationsDir, "validated-signals.json")
  }), /at least three/);
});

test("exports conversions to a reviewable CSV", () => {
  const paths = fixture();
  writeFileSync(resolve(paths.dataDir, "conversion-submissions.jsonl"), `${JSON.stringify({
    id: "one", type: "inquiry", email: "qa@example.com", organization: "KAIOS",
    interest: "Cards, toys and figures", consent_version: "2026-08",
    created_at: "2026-08-01T00:00:00Z", environment: "staging"
  })}\n`);
  const outputPath = resolve(paths.root, "exports/conversions.csv");
  assert.equal(exportConversions({ dataDir: paths.dataDir, outputPath }).records, 1);
  assert.match(readFileSync(outputPath, "utf8"), /"Cards, toys and figures"/);
});

test("enforces the conversion retention window", () => {
  const paths = fixture();
  writeFileSync(resolve(paths.dataDir, "conversion-submissions.jsonl"), [
    { id: "old", type: "newsletter", created_at: "2025-01-01T00:00:00Z" },
    { id: "current", type: "newsletter", created_at: "2026-07-01T00:00:00Z" }
  ].map(JSON.stringify).join("\n") + "\n");
  assert.deepEqual(enforceRetention({
    dataDir: paths.dataDir,
    retentionDays: 365,
    now: new Date("2026-08-01T00:00:00Z")
  }), { removed: 1, retained: 1, retention_days: 365 });
  assert.doesNotMatch(readFileSync(resolve(paths.dataDir, "conversion-submissions.jsonl"), "utf8"), /"old"/);
});

test("backs up and verifies public intelligence and conversion records", () => {
  const paths = fixture();
  refreshIntelligence({
    ...paths,
    sourcePath: resolve(paths.operationsDir, "validated-signals.json"),
    issue: "2026-08",
    now: new Date("2026-08-01T00:00:00Z")
  });
  writeFileSync(resolve(paths.dataDir, "conversion-submissions.jsonl"), "");
  const backup = backupOperations({
    ...paths,
    backupRoot: resolve(paths.root, "backups"),
    now: new Date("2026-08-01T01:00:00Z")
  });
  assert.equal(backup.files, 4);
  assert.deepEqual(verifyBackup(backup.backup_path), { ok: true, files: 4, failures: [] });
});

test("reports non-PII operational counts", () => {
  const paths = fixture();
  writeFileSync(resolve(paths.dataDir, "conversion-submissions.jsonl"), [
    { type: "newsletter" }, { type: "newsletter" }, { type: "inquiry" }
  ].map(JSON.stringify).join("\n") + "\n");
  const status = operationsStatus(paths);
  assert.deepEqual(status.conversion_counts, { newsletter: 2, inquiry: 1 });
  assert.equal(status.collector_evidence.eligibility, "staging-research");
  assert.equal(status.collector_evidence.evidence_summary.categories, 3);
  assert.equal(status.production_promotion_authorized, false);
});
