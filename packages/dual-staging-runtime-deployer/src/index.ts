export type Vertical = "kidults" | "artfund" | "governance";
export type RuntimeState = "planned" | "migrating" | "healthy" | "degraded" | "failed" | "rolled_back";

export interface StagingEnvironment {
  environment: "staging";
  productionPromotionAuthorized: false;
  publicationEnabled: false;
  databases: Record<Vertical, string>;
  viewerTokenConfigured: boolean;
  operatorTokenConfigured: boolean;
}

export interface MigrationUnit {
  id: string;
  vertical: Vertical;
  checksum: string;
  destructive: false;
  order: number;
}

export interface RuntimeProbe {
  name: string;
  vertical: Exclude<Vertical, "governance">;
  authenticated: boolean;
  statusCode: number;
  portalRendered: boolean;
  mobileWidth: 320 | 390 | 430;
  horizontalOverflow: boolean;
}

export interface BackupRehearsal {
  vertical: Vertical;
  backupChecksum: string;
  restoredChecksum: string;
  integrity: "ok" | "failed";
  immutableAuditPreserved: boolean;
}

export interface RuntimeCertification {
  status: "pass" | "fail";
  states: Record<Vertical, RuntimeState>;
  migrationOrder: string[];
  smokePassed: boolean;
  rollbackPassed: boolean;
  failureIsolationPassed: boolean;
  blockers: string[];
}

export function validateEnvironment(env: StagingEnvironment): string[] {
  const blockers: string[] = [];
  if (env.environment !== "staging") blockers.push("environment_not_staging");
  if (env.productionPromotionAuthorized) blockers.push("production_promotion_authorized");
  if (env.publicationEnabled) blockers.push("publication_enabled");
  const values = Object.values(env.databases);
  if (new Set(values).size !== values.length) blockers.push("database_isolation_failed");
  if (values.some((value) => /prod|production/i.test(value))) blockers.push("production_database_reference");
  if (!env.viewerTokenConfigured || !env.operatorTokenConfigured) blockers.push("staging_tokens_missing");
  return blockers;
}

export function planMigrations(units: readonly MigrationUnit[]): MigrationUnit[] {
  if (units.some((unit) => unit.destructive !== false)) throw new Error("destructive_migration_rejected");
  const ids = new Set<string>();
  for (const unit of units) {
    if (ids.has(unit.id)) throw new Error("duplicate_migration_id");
    ids.add(unit.id);
  }
  return [...units].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function verifySmoke(probes: readonly RuntimeProbe[]): boolean {
  const verticals = new Set(probes.map((probe) => probe.vertical));
  return verticals.has("kidults") && verticals.has("artfund") && probes.every((probe) =>
    probe.authenticated &&
    probe.statusCode === 200 &&
    probe.portalRendered &&
    probe.mobileWidth >= 320 &&
    !probe.horizontalOverflow
  );
}

export function verifyRollback(rehearsals: readonly BackupRehearsal[]): boolean {
  const verticals = new Set(rehearsals.map((item) => item.vertical));
  return verticals.size === 3 && rehearsals.every((item) =>
    item.integrity === "ok" &&
    item.backupChecksum === item.restoredChecksum &&
    item.immutableAuditPreserved
  );
}

export function certifyRuntime(input: {
  environment: StagingEnvironment;
  migrations: readonly MigrationUnit[];
  probes: readonly RuntimeProbe[];
  rehearsals: readonly BackupRehearsal[];
  failedVerticals?: readonly Exclude<Vertical, "governance">[];
}): RuntimeCertification {
  const blockers = validateEnvironment(input.environment);
  let migrationOrder: string[] = [];
  try {
    migrationOrder = planMigrations(input.migrations).map((unit) => unit.id);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "migration_plan_failed");
  }
  const smokePassed = verifySmoke(input.probes);
  const rollbackPassed = verifyRollback(input.rehearsals);
  if (!smokePassed) blockers.push("authenticated_runtime_smoke_failed");
  if (!rollbackPassed) blockers.push("backup_restore_rehearsal_failed");
  const failed = new Set(input.failedVerticals ?? []);
  const failureIsolationPassed = failed.size <= 1;
  if (!failureIsolationPassed) blockers.push("cross_vertical_failure_isolation_failed");
  return {
    status: blockers.length === 0 ? "pass" : "fail",
    states: {
      governance: blockers.length === 0 ? "healthy" : "degraded",
      kidults: failed.has("kidults") ? "failed" : blockers.length === 0 ? "healthy" : "degraded",
      artfund: failed.has("artfund") ? "failed" : blockers.length === 0 ? "healthy" : "degraded"
    },
    migrationOrder,
    smokePassed,
    rollbackPassed,
    failureIsolationPassed,
    blockers
  };
}
