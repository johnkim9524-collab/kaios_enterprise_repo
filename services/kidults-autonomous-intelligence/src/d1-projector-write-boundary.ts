/**
 * Single auditable D1 statement boundary.
 *
 * PostgreSQL is canonical. D1 is a rebuildable read model. Runtime/business
 * code may read D1 through the classified read boundary, but it may not
 * prepare or execute D1 mutations. The write-shaped API is retained only so
 * legacy callers fail closed without creating a TypeScript migration bypass.
 */
export const D1_PROJECTOR_WRITE_BOUNDARY_VERSION = 'd1-projector-write-boundary-v1';
export const D1_PROJECTOR_READ_BOUNDARY_VERSION = 'd1-projector-read-boundary-v1';

const MUTATION = /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;
const READ = /^(?:SELECT|WITH|EXPLAIN)\b/i;
const FORBIDDEN = /\b(?:CREATE|DROP|ALTER|TRUNCATE|VACUUM|REINDEX|ATTACH|DETACH|PRAGMA)\b/i;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

export function prepareD1ProjectionWrite(_database: D1Database, sql: string): D1PreparedStatement {
  const normalized = normalize(sql);
  if (!MUTATION.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_NON_MUTATION');
  }
  if (FORBIDDEN.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_SCHEMA_MUTATION_DENIED');
  }
  throw new Error('D1_LEGACY_RUNTIME_WRITE_DISABLED_USE_CONTROL_PLANE_PROJECTOR');
}

export function prepareD1ProjectionRead(database: D1Database, sql: string): D1PreparedStatement {
  const normalized = normalize(sql);
  if (!READ.test(normalized) || MUTATION.test(normalized) || FORBIDDEN.test(normalized)) {
    throw new Error('D1_PROJECTOR_READ_BOUNDARY_NON_READ_DENIED');
  }
  return database.prepare(sql);
}
