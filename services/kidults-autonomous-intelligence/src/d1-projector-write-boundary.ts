/**
 * Single auditable D1 projector statement boundary.
 *
 * D1 is a read model. Business/runtime modules may request deterministic
 * projection statements through this module, but they may not prepare SQL
 * directly. Writes and reads are classified separately and fail closed.
 */
export const D1_PROJECTOR_WRITE_BOUNDARY_VERSION = 'd1-projector-write-boundary-v1';
export const D1_PROJECTOR_READ_BOUNDARY_VERSION = 'd1-projector-read-boundary-v1';

const MUTATION = /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;
const READ = /^(?:SELECT|WITH|EXPLAIN)\b/i;
const FORBIDDEN = /\b(?:CREATE|DROP|ALTER|TRUNCATE|VACUUM|REINDEX|ATTACH|DETACH|PRAGMA)\b/i;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

export function prepareD1ProjectionWrite(database: D1Database, sql: string) {
  const normalized = normalize(sql);
  if (!MUTATION.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_NON_MUTATION');
  }
  if (FORBIDDEN.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_SCHEMA_MUTATION_DENIED');
  }
  return database.prepare(sql);
}

export function prepareD1ProjectionRead(database: D1Database, sql: string) {
  const normalized = normalize(sql);
  if (!READ.test(normalized) || MUTATION.test(normalized) || FORBIDDEN.test(normalized)) {
    throw new Error('D1_PROJECTOR_READ_BOUNDARY_NON_READ_DENIED');
  }
  return database.prepare(sql);
}
