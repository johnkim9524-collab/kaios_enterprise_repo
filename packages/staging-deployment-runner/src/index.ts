export type Vertical = "kidults" | "artfund";
export type Role = "viewer" | "operator" | "admin";

export interface EnvironmentInput {
  environment: string;
  databaseUrl: string;
  secretsPresent: boolean;
  publicationEnabled: boolean;
  productionPromotionAuthorized: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateStagingEnvironment(input: EnvironmentInput): ValidationResult {
  const errors: string[] = [];
  if (input.environment !== "staging") errors.push("environment_must_be_staging");
  if (!input.databaseUrl || input.databaseUrl.includes("production")) errors.push("staging_database_required");
  if (!input.secretsPresent) errors.push("staging_secrets_required");
  if (input.publicationEnabled) errors.push("publication_must_default_disabled");
  if (input.productionPromotionAuthorized) errors.push("production_promotion_must_be_unauthorized");
  return { ok: errors.length === 0, errors };
}

export interface MigrationUnit {
  id: string;
  order: number;
  checksum: string;
  destructive: boolean;
}

export function buildMigrationPlan(units: readonly MigrationUnit[]): MigrationUnit[] {
  const sorted = [...units].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const ids = new Set<string>();
  for (const unit of sorted) {
    if (unit.destructive) throw new Error(`destructive_migration:${unit.id}`);
    if (!unit.checksum) throw new Error(`missing_checksum:${unit.id}`);
    if (ids.has(unit.id)) throw new Error(`duplicate_migration:${unit.id}`);
    ids.add(unit.id);
  }
  return sorted;
}

export interface SmokeCase {
  vertical: Vertical;
  endpoint: string;
  role: Role | "unauthenticated";
  expectedStatus: number;
}

export interface SmokeResult extends SmokeCase {
  actualStatus: number;
  passed: boolean;
}

export async function runAuthenticatedSmokeMatrix(
  cases: readonly SmokeCase[],
  request: (test: SmokeCase) => Promise<number>,
): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  for (const test of cases) {
    const actualStatus = await request(test);
    results.push({ ...test, actualStatus, passed: actualStatus === test.expectedStatus });
  }
  return results;
}

export interface RollbackInput {
  backupVerified: boolean;
  restoreIntegrity: "ok" | "failed";
  originalChecksum: string;
  restoredChecksum: string;
  immutableAuditPreserved: boolean;
}

export function verifyRollbackRehearsal(input: RollbackInput): ValidationResult {
  const errors: string[] = [];
  if (!input.backupVerified) errors.push("backup_not_verified");
  if (input.restoreIntegrity !== "ok") errors.push("restore_integrity_failed");
  if (!input.originalChecksum || input.originalChecksum !== input.restoredChecksum) errors.push("checksum_mismatch");
  if (!input.immutableAuditPreserved) errors.push("immutable_audit_not_preserved");
  return { ok: errors.length === 0, errors };
}

export interface DeploymentDecisionInput {
  environment: ValidationResult;
  migrationPlanValid: boolean;
  smokeResults: readonly SmokeResult[];
  rollback: ValidationResult;
  kidultsFailureIsolated: boolean;
  artfundFailureIsolated: boolean;
}

export function certifyExecutableBundle(input: DeploymentDecisionInput): ValidationResult {
  const errors = [
    ...input.environment.errors,
    ...input.rollback.errors,
  ];
  if (!input.migrationPlanValid) errors.push("migration_plan_invalid");
  if (input.smokeResults.some((result) => !result.passed)) errors.push("smoke_test_failed");
  if (!input.kidultsFailureIsolated) errors.push("kidults_failure_isolation_failed");
  if (!input.artfundFailureIsolated) errors.push("artfund_failure_isolation_failed");
  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() };
}
