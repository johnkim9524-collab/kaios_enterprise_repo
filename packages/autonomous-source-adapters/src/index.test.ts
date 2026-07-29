import { describe, expect, it } from "vitest";
import {
  calculateRetryDelay,
  decideExecutionState,
  detectSchemaDrift,
  scoreSourceHealth,
  type SourceAdapterDefinition,
} from "./index.js";

const source: SourceAdapterDefinition = {
  sourceId: "kidults-google-news-rss",
  vertical: "kidults",
  sourceName: "Kidults Discovery Feed",
  sourceType: "rss",
  endpoint: "https://example.test/feed",
  lifecycle: "approved",
  expectedSchemaVersion: "1.0.0",
  requiredFields: ["title", "url", "publishedAt"],
  timeoutMs: 15000,
  retryPolicy: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    multiplier: 2,
    maxDelayMs: 5000,
  },
  rightsApproved: true,
};

describe("autonomous source framework", () => {
  it("calculates capped exponential retry delays", () => {
    expect(calculateRetryDelay(source.retryPolicy, 1)).toBe(1000);
    expect(calculateRetryDelay(source.retryPolicy, 2)).toBe(2000);
    expect(calculateRetryDelay(source.retryPolicy, 4)).toBe(5000);
  });

  it("detects missing required fields as critical drift", () => {
    const result = detectSchemaDrift(source.requiredFields, { title: "A" }, "1.0.0");
    expect(result.severity).toBe("critical");
    expect(result.missingFields).toEqual(["url", "publishedAt"]);
  });

  it("scores a healthy source as active grade A", () => {
    const result = scoreSourceHealth({
      successRate: 99,
      freshnessScore: 95,
      schemaStabilityScore: 98,
      rightsScore: 100,
      latencyScore: 90,
    });
    expect(result.grade).toBe("A");
    expect(result.lifecycle).toBe("active");
  });

  it("quarantines a source when rights are not approved", () => {
    const drift = detectSchemaDrift(source.requiredFields, {
      title: "A",
      url: "https://example.test/a",
      publishedAt: "2026-07-29T00:00:00Z",
    }, "1.0.0");
    const health = scoreSourceHealth({
      successRate: 99,
      freshnessScore: 95,
      schemaStabilityScore: 98,
      rightsScore: 0,
      latencyScore: 90,
    });
    const result = decideExecutionState({
      source: { ...source, rightsApproved: false },
      attempts: 1,
      durationMs: 80,
      drift,
      health,
      transportSucceeded: true,
    });
    expect(result.status).toBe("quarantined");
    expect(result.quarantineReason).toBe("rights_not_approved");
  });

  it("returns partial for noncritical schema expansion", () => {
    const drift = detectSchemaDrift(source.requiredFields, {
      title: "A",
      url: "https://example.test/a",
      publishedAt: "2026-07-29T00:00:00Z",
      author: "Example",
    }, "1.0.0");
    const health = scoreSourceHealth({
      successRate: 95,
      freshnessScore: 90,
      schemaStabilityScore: 90,
      rightsScore: 100,
      latencyScore: 85,
    });
    const result = decideExecutionState({
      source,
      attempts: 1,
      durationMs: 120,
      drift,
      health,
      transportSucceeded: true,
    });
    expect(result.status).toBe("partial");
    expect(result.retryable).toBe(false);
  });
});
