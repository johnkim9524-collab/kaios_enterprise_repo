import { describe, expect, it } from "vitest";
import {
  applyCooldown,
  evaluateAlert,
  markDelivered,
  type AlertPolicy,
  type AlertSignal,
} from "./index.js";

const policy: AlertPolicy = {
  policyId: "POL-KIDULTS-LIQUIDITY-01",
  vertical: "kidults",
  alertType: "liquidity_drop",
  minimumSeverity: "warning",
  minimumConfidence: 75,
  cooldownSeconds: 3600,
  channels: ["portal", "email", "archive", "portal"],
  enabled: true,
};

const signal: AlertSignal = {
  signalId: "SIG-001",
  vertical: "kidults",
  subjectType: "brand",
  subjectId: "KID-BRAND-0001",
  alertType: "liquidity_drop",
  severity: "warning",
  value: -18,
  threshold: 15,
  direction: "change",
  confidence: 91,
  evidenceIds: ["EV-002", "EV-001"],
  methodologyId: "METH-KID-LIQ-1.0",
  methodologyStatus: "active",
  rightsStatus: "approved",
  freshnessStatus: "current",
  observedAt: "2026-07-30T00:00:00Z",
};

describe("autonomous alert engine", () => {
  it("produces deterministic eligible alerts", () => {
    const first = evaluateAlert(signal, policy, "2026-07-30T00:01:00Z");
    const second = evaluateAlert({ ...signal, evidenceIds: [...signal.evidenceIds].reverse() }, policy, "2026-07-30T00:01:00Z");
    expect(first.deliverable).toBe(true);
    expect(first.status).toBe("eligible");
    expect(first.checksum).toBe(second.checksum);
    expect(first.channels).toEqual(["archive", "email", "portal"]);
    expect(markDelivered(first).status).toBe("delivered");
  });

  it("blocks unknown rights and low confidence", () => {
    const result = evaluateAlert(
      { ...signal, rightsStatus: "unknown", confidence: 60 },
      policy,
      "2026-07-30T00:01:00Z",
    );
    expect(result.deliverable).toBe(false);
    expect(result.reasons).toContain("rights_not_approved");
    expect(result.reasons).toContain("confidence_below_threshold");
  });

  it("blocks disputed Artfund provenance", () => {
    const artPolicy: AlertPolicy = { ...policy, vertical: "artfund", alertType: "provenance_risk" };
    const result = evaluateAlert(
      {
        ...signal,
        vertical: "artfund",
        alertType: "provenance_risk",
        provenanceStatus: "disputed",
      },
      artPolicy,
      "2026-07-30T00:01:00Z",
    );
    expect(result.reasons).toContain("provenance_disputed");
  });

  it("suppresses duplicate delivery during cooldown", () => {
    const evaluation = evaluateAlert(signal, policy, "2026-07-30T00:01:00Z");
    const result = applyCooldown(
      evaluation,
      policy,
      [{ deduplicationKey: evaluation.deduplicationKey, deliveredAt: "2026-07-30T00:00:30Z" }],
      "2026-07-30T00:01:00Z",
    );
    expect(result.status).toBe("suppressed");
    expect(result.reasons).toEqual(["cooldown_active"]);
  });
});
