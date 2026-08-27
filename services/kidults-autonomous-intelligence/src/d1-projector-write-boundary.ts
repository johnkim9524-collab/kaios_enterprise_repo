/**
 * D1 read-model boundary for the legacy autonomous-intelligence runtime.
 *
 * PostgreSQL is the canonical system of record. This service is therefore
 * prohibited from mutating D1 directly. The governed control-plane projector
 * is the only component allowed to write D1 after its own cutover gate.
 */
export const D1_PROJECTOR_WRITE_BOUNDARY_VERSION = 'd1-projector-write-boundary-v2-readonly';
export const D1_PROJECTOR_READ_BOUNDARY_VERSION = 'd1-projector-read-boundary-v1';

const MUTATION = /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;
const READ = /^(?:SELECT|WITH|EXPLAIN)\b/i;
const FORBIDDEN = /\b(?:CREATE|DROP|ALTER|TRUNCATE|VACUUM|REINDEX|ATTACH|DETACH|PRAGMA)\b/i;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * Legacy compatibility entry point. It intentionally never returns a D1
 * statement: every mutation request from this runtime is fail-closed.
 */
export function prepareD1ProjectionWrite(_database: D1Database, sql: string): never {
  const normalized = normalize(sql);
  if (!MUTATION.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_NON_MUTATION');
  }
  if (FORBIDDEN.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_SCHEMA_MUTATION_DENIED');
  }
  throw new Error('D1_LEGACY_RUNTIME_WRITE_DISABLED_USE_CONTROL_PLANE_PROJECTOR');
}

export function prepareD1ProjectionRead(database: D1Database, sql: string) {
  const normalized = normalize(sql);
  if (!READ.test(normalized) || MUTATION.test(normalized) || FORBIDDEN.test(normalized)) {
    throw new Error('D1_PROJECTOR_READ_BOUNDARY_NON_READ_DENIED');
  }
  return database.prepare(sql);
}
