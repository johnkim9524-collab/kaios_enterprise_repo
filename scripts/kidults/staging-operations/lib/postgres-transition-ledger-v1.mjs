import { randomUUID } from 'node:crypto';

const terminalStates = new Set(['COMPLETE_VERIFIED', 'DENIED', 'QUARANTINED']);
const states = new Set(['LEASED', 'DECIDED', 'BROKERED_SHADOW', 'RETRY_WAIT', 'EVIDENCE_PENDING', ...terminalStates]);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
function binding(taskId, lease) {
  if (typeof lease?.generation === 'number' && !Number.isSafeInteger(lease.generation)) throw new Error('INVALID_LEASE_BINDING');
  const generation = String(lease?.generation ?? '');
  if (!text(taskId) || !text(lease?.lease_id) || !/^[1-9][0-9]{0,18}$/.test(generation)
    || BigInt(generation) > 9223372036854775807n) throw new Error('INVALID_LEASE_BINDING');
  return [taskId, lease.lease_id, generation];
}

// Only provision a new compatible test/staging schema. Never silently migrate old evidence.
export const POSTGRES_LEDGER_DDL = `
DO $$ BEGIN
  IF to_regclass('kidults_staging_task_lease') IS NOT NULL AND
    (SELECT count(*) FROM pg_attribute WHERE attrelid = to_regclass('kidults_staging_task_lease')
      AND attname IN ('generation', 'released') AND NOT attisdropped) <> 2 THEN
    RAISE EXCEPTION 'SCHEMA_MIGRATION_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid
    AND a.attnum=ANY(i.indkey) WHERE i.indrelid=to_regclass('kidults_staging_transition')
    AND i.indisunique AND a.attname='state') THEN
    RAISE EXCEPTION 'SCHEMA_MIGRATION_REQUIRED';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS kidults_staging_task_lease (
  task_id text PRIMARY KEY,
  lease_id text NOT NULL UNIQUE,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > acquired_at),
  terminal boolean NOT NULL DEFAULT false,
  released boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS kidults_staging_transition (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id text NOT NULL,
  lease_id text NOT NULL,
  lease_generation bigint NOT NULL,
  state text NOT NULL,
  detail jsonb NOT NULL,
  recorded_at timestamptz NOT NULL
);`;

export class PostgresTransitionLedger {
  constructor({ query }) {
    if (typeof query !== 'function') throw new Error('POSTGRES_QUERY_REQUIRED');
    this.query = query;
  }

  async initialize() { await this.query(POSTGRES_LEDGER_DDL, []); }

  // Preserve the shared interface; caller time is deliberately not database authority.
  async acquire(taskId, _callerNowMs, ttlMs) {
    if (!text(taskId) || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 300000) {
      throw new Error('INVALID_LEASE_REQUEST');
    }
    const result = await this.query(`
WITH server_clock AS MATERIALIZED (SELECT clock_timestamp() AS t)
INSERT INTO kidults_staging_task_lease (task_id, lease_id, generation, acquired_at, expires_at)
SELECT $1, $2, 1, t, t + $3::bigint * interval '1 millisecond' FROM server_clock
ON CONFLICT (task_id) DO UPDATE SET
  lease_id = EXCLUDED.lease_id,
  generation = kidults_staging_task_lease.generation + 1,
  acquired_at = clock_timestamp(),
  expires_at = clock_timestamp() + $3::bigint * interval '1 millisecond',
  released = false
WHERE kidults_staging_task_lease.terminal = false
  AND (kidults_staging_task_lease.released OR kidults_staging_task_lease.expires_at <= clock_timestamp())
RETURNING task_id, lease_id, generation, acquired_at, expires_at`, [taskId, randomUUID(), ttlMs]);
    const row = result.rows[0];
    if (!row) return null;
    const lease = { task_id: row.task_id, lease_id: row.lease_id, generation: String(row.generation),
      acquired_at_ms: new Date(row.acquired_at).getTime(), expires_at_ms: new Date(row.expires_at).getTime() };
    binding(taskId, lease);
    return lease;
  }

  async transition(taskId, lease, state, detail = {}) {
    const values = binding(taskId, lease);
    if (!states.has(state)) throw new Error('INVALID_TRANSITION_STATE');
    // One SQL statement = one atomic transaction, even through pool.query().
    // Materialize the locked row before evaluating wall-clock expiry.
    const result = await this.query(`
WITH locked AS MATERIALIZED (
  SELECT * FROM kidults_staging_task_lease WHERE task_id=$1 FOR UPDATE
), admitted AS (
  UPDATE kidults_staging_task_lease l SET terminal=$6::boolean FROM locked p
  WHERE l.task_id=p.task_id AND p.lease_id=$2 AND p.generation=$3::bigint
    AND NOT p.terminal AND NOT p.released AND p.expires_at > clock_timestamp()
  RETURNING l.task_id, l.lease_id, l.generation
)
INSERT INTO kidults_staging_transition
  (task_id, lease_id, lease_generation, state, detail, recorded_at)
SELECT task_id, lease_id, generation, $4, $5::jsonb, clock_timestamp() FROM admitted
RETURNING sequence, task_id, lease_id, lease_generation, state`,
    [...values, state, JSON.stringify(detail), terminalStates.has(state)]);
    if (result.rows.length !== 1) throw new Error('STALE_OR_EXPIRED_LEASE_FENCE');
    return result.rows[0];
  }

  async release(taskId, lease) {
    const result = await this.query(`
UPDATE kidults_staging_task_lease SET released=true
WHERE task_id=$1 AND lease_id=$2 AND generation=$3::bigint
  AND NOT terminal AND NOT released RETURNING task_id`, binding(taskId, lease));
    return result.rows.length === 1;
  }

  async rows(taskId) {
    if (!text(taskId)) throw new Error('INVALID_TASK_ID');
    return (await this.query('SELECT * FROM kidults_staging_transition WHERE task_id=$1 ORDER BY sequence', [taskId])).rows;
  }
}
