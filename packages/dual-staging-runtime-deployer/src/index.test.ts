import { describe, expect, it } from "vitest";
import {
  certifyRuntime,
  planMigrations,
  validateEnvironment,
  verifyRollback,
  verifySmoke,
  type BackupRehearsal,
  type MigrationUnit,
  type RuntimeProbe,
  type StagingEnvironment
} from "./index.js";

const environment: StagingEnvironment = {
  environment: "staging",
  productionPromotionAuthorized: false,
  publicationEnabled: false,
  databases: {
    governance: "governance-staging.db",
    kidults: "kidults-staging.db",
    artfund: "artfund-staging.db"
  },
  viewerTokenConfigured: true,
  operatorTokenConfigured: true
};

const migrations: MigrationUnit[] = [
  { id: "0001-governance", vertical: "governance", checksum: "g1", destructive: false, order: 1 },
  { id: "0002-kidults", vertical: "kidults", checksum: "k1", destructive: false, order: 2 },
  { id: "0003-artfund", vertical: "artfund", checksum: "a1", destructive: false, order: 3 }
];

const probes: RuntimeProbe[] = [
  { name: "kidults-enterprise", vertical: "kidults", authenticated: true, statusCode: 200, portalRendered: true, mobileWidth: 320, horizontalOverflow: false },
  { name: "artfund-institutional", vertical: "artfund", authenticated: true, statusCode: 200, portalRendered: true, mobileWidth: 390, horizontalOverflow: false }
];

const rehearsals: BackupRehearsal[] = [
  { vertical: "governance", backupChecksum: "g", restoredChecksum: "g", integrity: "ok", immutableAuditPreserved: true },
  { vertical: "kidults", backupChecksum: "k", restoredChecksum: "k", integrity: "ok", immutableAuditPreserved: true },
  { vertical: "artfund", backupChecksum: "a", restoredChecksum: "a", integrity: "ok", immutableAuditPreserved: true }
];

describe("dual staging runtime deployment", () => {
  it("accepts an isolated fail-closed staging environment", () => {
    expect(validateEnvironment(environment)).toEqual([]);
  });

  it("rejects production references and enabled publication", () => {
    expect(validateEnvironment({
      ...environment,
      publicationEnabled: true,
      databases: { ...environment.databases, kidults: "kidults-production.db" }
    })).toContain("production_database_reference");
  });

  it("orders non-destructive migrations deterministically", () => {
    expect(planMigrations([...migrations].reverse()).map((item) => item.id)).toEqual([
      "0001-governance",
      "0002-kidults",
      "0003-artfund"
    ]);
  });

  it("passes authenticated desktop and mobile runtime probes", () => {
    expect(verifySmoke(probes)).toBe(true);
  });

  it("requires checksum-preserving rollback for all isolated databases", () => {
    expect(verifyRollback(rehearsals)).toBe(true);
    expect(verifyRollback(rehearsals.slice(0, 2))).toBe(false);
  });

  it("certifies the healthy dual staging runtime", () => {
    expect(certifyRuntime({ environment, migrations, probes, rehearsals })).toMatchObject({
      status: "pass",
      smokePassed: true,
      rollbackPassed: true,
      failureIsolationPassed: true,
      blockers: []
    });
  });
});
