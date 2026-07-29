import { describe, expect, it } from "vitest";
import {
  ArtfundAuctionFeedAdapter,
  InMemorySourceExecutionRepository,
  KidultsNewsRssAdapter,
  calculateRetryInstruction,
  canAttemptRecovery,
  evolveSourceHealth,
} from "./index";

describe("source execution control", () => {
  it("persists audit and health records deterministically", async () => {
    const repository = new InMemorySourceExecutionRepository();
    await repository.appendAudit({
      executionId: "exec-1",
      sourceId: "source-1",
      vertical: "kidults",
      attempt: 1,
      status: "succeeded",
      startedAt: "2026-07-29T00:00:00.000Z",
      completedAt: "2026-07-29T00:00:01.000Z",
      durationMs: 1000,
      recordsReceived: 10,
      recordsAccepted: 9,
      recordsRejected: 1,
      createdAt: "2026-07-29T00:00:01.000Z",
    });
    expect((await repository.listAudits("source-1"))[0]?.executionId).toBe("exec-1");
  });

  it("schedules deterministic capped retries", () => {
    const now = new Date("2026-07-29T00:00:00.000Z");
    expect(calculateRetryInstruction(1, true, now).retryAt).toBe("2026-07-29T00:00:15.000Z");
    expect(calculateRetryInstruction(4, true, now).shouldRetry).toBe(false);
    expect(calculateRetryInstruction(1, false, now).reason).toBe("failure_not_retryable");
  });

  it("quarantines unknown rights and critical drift", () => {
    const rights = evolveSourceHealth(undefined, {
      sourceId: "s1",
      vertical: "kidults",
      executionId: "e1",
      succeeded: false,
      rightsApproved: false,
      now: "2026-07-29T00:00:00.000Z",
    });
    expect(rights.lifecycle).toBe("quarantined");
    expect(rights.quarantineReason).toBe("rights_not_approved");

    const drift = evolveSourceHealth(undefined, {
      sourceId: "s2",
      vertical: "artfund",
      executionId: "e2",
      succeeded: false,
      criticalDrift: true,
      rightsApproved: true,
      now: "2026-07-29T00:00:00.000Z",
    });
    expect(drift.quarantineReason).toBe("critical_schema_drift");
  });

  it("quarantines repeated failures and permits timed recovery", () => {
    let health = evolveSourceHealth(undefined, {
      sourceId: "s1",
      vertical: "kidults",
      executionId: "e1",
      succeeded: false,
      rightsApproved: true,
      now: "2026-07-29T00:00:00.000Z",
    });
    health = evolveSourceHealth(health, {
      sourceId: "s1",
      vertical: "kidults",
      executionId: "e2",
      succeeded: false,
      rightsApproved: true,
      now: "2026-07-29T00:01:00.000Z",
    });
    health = evolveSourceHealth(health, {
      sourceId: "s1",
      vertical: "kidults",
      executionId: "e3",
      succeeded: false,
      rightsApproved: true,
      now: "2026-07-29T00:02:00.000Z",
    });
    expect(health.lifecycle).toBe("quarantined");
    expect(canAttemptRecovery(health, new Date("2026-07-29T01:02:00.000Z"))).toBe(true);
  });

  it("activates a source after repeated successful executions", () => {
    let health = evolveSourceHealth(undefined, {
      sourceId: "s1",
      vertical: "kidults",
      executionId: "e1",
      succeeded: true,
      rightsApproved: true,
      now: "2026-07-29T00:00:00.000Z",
    });
    health = evolveSourceHealth(health, {
      sourceId: "s1",
      vertical: "kidults",
      executionId: "e2",
      succeeded: true,
      rightsApproved: true,
      now: "2026-07-29T00:01:00.000Z",
    });
    expect(health.lifecycle).toBe("active");
  });

  it("provides vertical-specific staging adapters", async () => {
    const kidults = new KidultsNewsRssAdapter(async () => [{ title: "A" }]);
    const artfund = new ArtfundAuctionFeedAdapter(async () => [{ artist: "A" }]);
    expect((await kidults.collect({ sourceId: kidults.sourceId, vertical: "kidults", endpoint: "fixture", expectedFields: [], rightsApproved: true })).records).toHaveLength(1);
    expect((await artfund.collect({ sourceId: artfund.sourceId, vertical: "artfund", endpoint: "fixture", expectedFields: [], rightsApproved: true })).records).toHaveLength(1);
  });
});
