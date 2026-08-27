/**
 * Single auditable D1 projector write boundary.
 *
 * D1 is a read model. Business/runtime modules may request a deterministic
 * projection mutation through this module, but they may not prepare mutations
 * directly. The estate validator permits dynamic D1 mutation preparation only
 * in this file and rejects it everywhere else.
 */
export const D1_PROJECTOR_WRITE_BOUNDARY_VERSION = 'd1-projector-write-boundary-v1';

const MUTATION = /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;
const FORBIDDEN = /\b(?:CREATE|DROP|ALTER|TRUNCATE|VACUUM|REINDEX|ATTACH|DETACH|PRAGMA)\b/i;

export function prepareD1ProjectionWrite(database: D1Database, sql: string) {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  if (!MUTATION.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_NON_MUTATION');
  }
  if (FORBIDDEN.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_SCHEMA_MUTATION_DENIED');
  }
  return database.prepare(sql);
}
