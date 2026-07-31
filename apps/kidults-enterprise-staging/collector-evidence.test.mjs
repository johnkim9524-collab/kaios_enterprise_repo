import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { validateCollectorEvidence } from "./collector-evidence.mjs";

const NOW = new Date("2026-08-01T04:00:00Z");
const HASH = "a".repeat(64);

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "kidults-evidence-"));
  const inputPath = resolve(root, "latest_signals.json");
  const registryPath = resolve(root, "registry.json");
  const outputPath = resolve(root, "validated-signals.json");
  const auditPath = resolve(root, "evidence-audit.jsonl");
  writeFileSync(registryPath, JSON.stringify({
    maximum_batch_age_hours: 24,
    minimum_categories: 3,
    minimum_evidence_records: 3,
    sources: [{
      id: "official_rss",
      enabled: true,
      environment: "staging",
      tier: "T3",
      maximum_age_hours: 48,
      rights: { collect: "allowed", store: "allowed", transform: "allowed" }
    }]
  }));
  return { root, inputPath, registryPath, outputPath, auditPath };
}

function signal(category, externalId, overrides = {}) {
  return {
    collected_at: "2026-08-01T03:30:00Z",
    source_id: "official_rss",
    source_weight: 0.3,
    source_url: "https://example.com/feed",
    payload_hash: HASH,
    external_id: externalId,
    evidence_url: `https://example.com/${externalId}`,
    published_at: "2026-08-01T02:00:00Z",
    brand_id: externalId,
    category,
    signal: 85,
    sentiment: 80,
    visibility: 82,
    confidence: 90,
    mode: "live",
    ...overrides
  };
}

function report(signals) {
  return {
    collected_at: "2026-08-01T03:30:00Z",
    mode: "live",
    status: "operational",
    signals
  };
}

test("accepts allowlisted live evidence and produces category aggregates", () => {
  const paths = fixture();
  writeFileSync(paths.inputPath, JSON.stringify(report([
    signal("Designer Toys", "one"),
    signal("Trading Cards", "two"),
    signal("Action Figures", "three")
  ])));
  const result = validateCollectorEvidence({ ...paths, now: NOW });
  assert.equal(result.signals.length, 3);
  assert.equal(result.evidence_summary.accepted_records, 3);
  assert.equal(result.production_promotion_authorized, false);
  assert.match(readFileSync(paths.auditPath, "utf8"), /collector_evidence_accepted/);
});

test("deduplicates identical source, external id, and brand evidence", () => {
  const paths = fixture();
  writeFileSync(paths.inputPath, JSON.stringify(report([
    signal("Designer Toys", "one"),
    signal("Designer Toys", "one"),
    signal("Trading Cards", "two"),
    signal("Action Figures", "three")
  ])));
  const result = validateCollectorEvidence({ ...paths, now: NOW });
  assert.equal(result.evidence_summary.duplicate_records, 1);
  assert.equal(result.evidence_summary.accepted_records, 3);
});

test("excludes synthetic coverage assignments from reference inputs", () => {
  const paths = fixture();
  writeFileSync(paths.inputPath, JSON.stringify(report([
    signal("Designer Toys", "one"),
    signal("Trading Cards", "two"),
    signal("Action Figures", "three"),
    signal("Synthetic", "four", { coverage_assigned: true })
  ])));
  const result = validateCollectorEvidence({ ...paths, now: NOW });
  assert.equal(result.signals.length, 3);
  assert.ok(!result.signals.some((item) => item.category === "Synthetic"));
});

test("fails closed for stale, non-live, unknown, or malformed evidence", () => {
  for (const mutation of [
    (value) => { value.mode = "fixture"; },
    (value) => { value.signals[0].source_id = "unknown"; },
    (value) => { value.signals[0].payload_hash = "invalid"; },
    (value) => { value.collected_at = "2026-07-01T00:00:00Z"; }
  ]) {
    const paths = fixture();
    const value = report([
      signal("Designer Toys", "one"),
      signal("Trading Cards", "two"),
      signal("Action Figures", "three")
    ]);
    mutation(value);
    writeFileSync(paths.inputPath, JSON.stringify(value));
    assert.throws(() => validateCollectorEvidence({ ...paths, now: NOW }));
    assert.equal(existsSync(paths.outputPath), false);
    assert.match(readFileSync(paths.auditPath, "utf8"), /collector_evidence_rejected/);
  }
});

test("preserves the last valid output when a later batch fails", () => {
  const paths = fixture();
  writeFileSync(paths.inputPath, JSON.stringify(report([
    signal("Designer Toys", "one"),
    signal("Trading Cards", "two"),
    signal("Action Figures", "three")
  ])));
  validateCollectorEvidence({ ...paths, now: NOW });
  const previous = readFileSync(paths.outputPath, "utf8");
  writeFileSync(paths.inputPath, JSON.stringify(report([
    signal("Designer Toys", "one", { signal: 1000 })
  ])));
  assert.throws(() => validateCollectorEvidence({ ...paths, now: NOW }));
  assert.equal(readFileSync(paths.outputPath, "utf8"), previous);
});
