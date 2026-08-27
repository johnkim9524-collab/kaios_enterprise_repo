/**
 * Single auditable D1 statement boundary.
 *
 * PostgreSQL is canonical. Cloudflare D1 is a rebuildable read model and is
 * never a runtime mutation target. The only write escape below is for the
 * repository's in-process MemoryD1Database fixture used by deterministic
 * SHADOW tests; a real Cloudflare D1 binding can never satisfy that brand.
 */
export const D1_PROJECTOR_WRITE_BOUNDARY_VERSION = 'd1-projector-write-boundary-v1';
export const D1_PROJECTOR_READ_BOUNDARY_VERSION = 'd1-projector-read-boundary-v1';
export const D1_TEST_FIXTURE_WRITE_BOUNDARY_VERSION = 'd1-test-fixture-write-boundary-v1';

const MUTATION = /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;
const READ = /^(?:SELECT|WITH|EXPLAIN)\b/i;
const FORBIDDEN = /\b(?:CREATE|DROP|ALTER|TRUNCATE|VACUUM|REINDEX|ATTACH|DETACH|PRAGMA)\b/i;

type ExplicitMemoryFixture = D1Database & { sqlite: unknown };

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function isExplicitMemoryFixture(database: D1Database): database is ExplicitMemoryFixture {
  const candidate = database as D1Database & { constructor?: { name?: string }; sqlite?: unknown };
  return candidate.constructor?.name === 'MemoryD1Database' &&
    Object.prototype.hasOwnProperty.call(candidate, 'sqlite');
}

function prepareClassified(database: D1Database, sql: string): D1PreparedStatement {
  return database.prepare(sql);
}

export function prepareD1ProjectionWrite(database: D1Database, sql: string): D1PreparedStatement {
  const normalized = normalize(sql);
  if (!MUTATION.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_NON_MUTATION');
  }
  if (FORBIDDEN.test(normalized)) {
    throw new Error('D1_PROJECTOR_WRITE_BOUNDARY_SCHEMA_MUTATION_DENIED');
  }
  if (!isExplicitMemoryFixture(database)) {
    throw new Error('D1_LEGACY_RUNTIME_WRITE_DISABLED_USE_CONTROL_PLANE_PROJECTOR');
  }
  return prepareClassified(database, sql);
}

export function prepareD1ProjectionRead(database: D1Database, sql: string): D1PreparedStatement {
  const normalized = normalize(sql);
  if (!READ.test(normalized) || MUTATION.test(normalized) || FORBIDDEN.test(normalized)) {
    throw new Error('D1_PROJECTOR_READ_BOUNDARY_NON_READ_DENIED');
  }
  return prepareClassified(database, sql);
}
