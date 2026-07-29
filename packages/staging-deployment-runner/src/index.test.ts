import { describe, expect, it } from "vitest";
import {
  buildMigrationPlan,
  certifyExecutableBundle,
  runAuthenticatedSmokeMatrix,
  validateStagingEnvironment,
  verifyRollbackRehearsal,
} from "./index.js";

describe("staging deployment runner", () => {
  it("fails closed outside staging", () => {
    const result = validateStagingEnvironment({
      environment: "production",
      databaseUrl: "sqlite:///production.db",
      secretsPresent: true,
      publicationEnabled: true,
      productionPromotionAuthorized: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("environment_must_be_staging");
    expect(result.errors).toContain("publication_must_default_disabled");
  });

  it("orders non-destructive migrations deterministically", () => {
    const plan = buildMigrationPlan([
      { id: "0002", order: 2, checksum: "b", destructive: false },
      { id: "0001", order: 1, checksum: "a", destructive: false },
    ]);
    expect(plan.map((item) => item.id)).toEqual(["0001", "0002"]);
  });

  it("rejects destructive migrations", () => {
    expect(() => buildMigrationPlan([
      { id: "drop", order: 1, checksum: "x", destructive: true },
    ])).toThrow("destructive_migration:drop");
  });

  it("runs authenticated smoke cases independently", async () => {
    const cases = [
      { vertical: "kidults" as const, endpoint: "/api/enterprise", role: "viewer" as const, expectedStatus: 200 },
      { vertical: "artfund" as const, endpoint: "/api/institutional", role: "unauthenticated" as const, expectedStatus: 401 },
    ];
    const results = await runAuthenticatedSmokeMatrix(cases, async (test) => test.expectedStatus);
    expect(results.every((result) => result.passed)).toBe(true);
  });

  it("requires checksum-preserving rollback", () => {
    const result = verifyRollbackRehearsal({
      backupVerified: true,
      restoreIntegrity: "ok",
      originalChecksum: "abc",
      restoredChecksum: "abc",
      immutableAuditPreserved: true,
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("certifies only a complete executable bundle", async () => {
    const environment = validateStagingEnvironment({
      environment: "staging",
      databaseUrl: "sqlite:///staging.db",
      secretsPresent: true,
      publicationEnabled: false,
      productionPromotionAuthorized: false,
    });
    const smokeResults = await runAuthenticatedSmokeMatrix([
      { vertical: "kidults", endpoint: "/api/enterprise", role: "viewer", expectedStatus: 200 },
      { vertical: "artfund", endpoint: "/api/institutional", role: "viewer", expectedStatus: 200 },
    ], async () => 200);
    const rollback = verifyRollbackRehearsal({
      backupVerified: true,
      restoreIntegrity: "ok",
      originalChecksum: "same",
      restoredChecksum: "same",
      immutableAuditPreserved: true,
    });
    expect(certifyExecutableBundle({
      environment,
      migrationPlanValid: true,
      smokeResults,
      rollback,
      kidultsFailureIsolated: true,
      artfundFailureIsolated: true,
    })).toEqual({ ok: true, errors: [] });
  });
});
