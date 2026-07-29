import { describe, expect, it } from "vitest";
import { certifyEvidencePackage, type RuntimeEvidencePackage } from "./index.js";

const base: RuntimeEvidencePackage = {
  releaseCandidateId: "ih-dual-rc-2026.09.09-rc1",
  environment: "staging",
  generatedAt: "2026-07-30T00:00:00.000Z",
  productionPromotionAuthorized: false,
  publicationEnabled: false,
  probes: [
    { id: "migration", vertical: "governance", category: "migration", status: "pass", observedAt: "2026-07-30T00:00:00.000Z", details: {} },
    { id: "api", vertical: "kidults", category: "api", status: "pass", observedAt: "2026-07-30T00:00:00.000Z", details: { authenticatedHttp: 200, unauthenticatedHttp: 401 } },
    { id: "desktop", vertical: "artfund", category: "portal_desktop", status: "pass", observedAt: "2026-07-30T00:00:00.000Z", details: { horizontalOverflow: false } },
    { id: "mobile", vertical: "kidults", category: "portal_mobile", status: "pass", observedAt: "2026-07-30T00:00:00.000Z", details: { viewportWidth: 320, horizontalOverflow: false } },
    { id: "restore", vertical: "governance", category: "backup_restore", status: "pass", observedAt: "2026-07-30T00:00:00.000Z", details: {}, checksum: { algorithm: "sha256", before: "abc", after: "abc", matches: true } },
    { id: "isolation", vertical: "artfund", category: "failure_isolation", status: "pass", observedAt: "2026-07-30T00:00:00.000Z", details: { kidultsContinued: true } },
  ],
};

describe("runtime evidence certification", () => {
  it("passes a complete staging evidence package", () => {
    expect(certifyEvidencePackage(base).status).toBe("pass");
  });

  it("fails when restore checksum does not match", () => {
    const input = structuredClone(base);
    input.probes.find((probe) => probe.category === "backup_restore")!.checksum!.matches = false;
    expect(certifyEvidencePackage(input)).toMatchObject({ status: "fail", errors: ["checksum_mismatch:restore"] });
  });

  it("fails when a required probe was not run", () => {
    const input = structuredClone(base);
    input.probes = input.probes.filter((probe) => probe.category !== "portal_mobile");
    expect(certifyEvidencePackage(input).errors).toContain("missing_probe:portal_mobile");
  });
});
