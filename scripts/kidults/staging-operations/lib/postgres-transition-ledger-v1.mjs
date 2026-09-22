import { idFrom } from './canonical-v1.mjs';

const terminalStates = new Set(['COMPLETE_VERIFIED', 'DENIED', 'QUARANTINED']);

export const POSTGRES_LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS kidults_staging_task_lease (
  task_id text PRIMARY KEY,
  lease_id text NOT NULL UNIQUE,
  generation bigint NOT NULL DEFAULT 1,
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  terminal boolean NOT NULL DEFAULT false
);
ALTER TABLE kidults_staging_task_lease
  ADD COLUMN IF NOT EXISTS generation bigint NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS kidults_staging_transition (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id text NOT NULL,
  lease_id text,
  lease_generation bigint,
  state text NOT NULL,
  detail jsonb NOT NULL,
  recorded_at timestamptz NOT NULL
);
ALTER TABLE kidults_staging_transition ADD COLUMN IF NOT EXISTS lease_id text;
ALTER TABLE kidults_staging_transition ADD COLUMN IF NOT EXISTS lease_generation bigint;
ALTER TABLE kidults_staging_transition
  DROP CONSTRAINT IF EXISTS kidults_staging_transition_task_id_state_key;
CREATE UNIQUE INDEX IF NOT EXISTS kidults_staging_transition_task_generation_state_uq
  ON kidults_staging_transition (task_id, lease_generation, state);
`;

export class PostgresTransitionLedger {
  constructor({ query, nowIso }) {
    this.query = query;
    this.nowIso = nowIso;
  }

  async initialize() { await this.query(POSTGRES_LEDGER_DDL, []); }

  async acquire(taskId, nowMs, ttlMs) {
    const acquiredAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + ttlMs).toISOString();
    const leaseId = idFrom('lease', { task_id: taskId, acquired_at_ms: nowMs, expires_at_ms: nowMs + ttlMs });
    const result = await this.query(`
INSERT INTO kidults_staging_task_lease (task_id, lease_id, generation, acquired_at, expires_at)
VALUES ($1, $2, 1, $3::timestamptz, $4::timestamptz)
ON CONFLICT (task_id) DO UPDATE SET
  lease_id = EXCLUDED.lease_id,
  generation = kidults_staging_task_lease.generation + 1,
  acquired_at = EXCLUDED.acquired_at,
  expires_at = EXCLUDED.expires_at
WHERE kidults_staging_task_lease.terminal = false
  AND kidults_staging_task_lease.expires_at <= EXCLUDED.acquired_at
RETURNING task_id, lease_id, generation, acquired_at, expires_at
`, [taskId, leaseId, acquiredAt, expiresAt]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      task_id: row.task_id,
      lease_id: row.lease_id,
      generation: Number(row.generation),
      acquired_at_ms: new Date(row.acquired_at).getTime(),
      expires_at_ms: new Date(row.expires_at).getTime(),
    };
  }

  async transition(taskId, lease, state, detail = {}) {
    await this.query('BEGIN', []);
    try {
      const current = await this.query(`
SELECT task_id, lease_id, generation, terminal
FROM kidults_staging_task_lease
WHERE task_id = $1
FOR UPDATE
`, [taskId]);
      const active = current.rows[0];
      if (!active || active.terminal === true
        || active.lease_id !== lease?.lease_id
        || Number(active.generation) !== Number(lease?.generation)) {
        throw new Error('STALE_LEASE_FENCE');
      }
      const inserted = await this.query(`
INSERT INTO kidults_staging_transition
  (task_id, lease_id, lease_generation, state, detail, recorded_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
RETURNING sequence, task_id, lease_id, lease_generation, state
`, [taskId, lease.lease_id, lease.generation, state, JSON.stringify(detail), this.nowIso()]);
      if (terminalStates.has(state)) {
        const terminal = await this.query(`
UPDATE kidults_staging_task_lease
SET terminal = true
WHERE task_id = $1
  AND lease_id = $2
  AND generation = $3
  AND terminal = false
RETURNING task_id
`, [taskId, lease.lease_id, lease.generation]);
        if (terminal.rows.length !== 1) throw new Error('STALE_LEASE_FENCE');
      }
      await this.query('COMMIT', []);
      return inserted.rows[0];
    } catch (error) {
      await this.query('ROLLBACK', []);
      throw error;
    }
  }

  async release(taskId, lease) {
    const result = await this.query(`
UPDATE kidults_staging_task_lease
SET expires_at = $4::timestamptz
WHERE task_id = $1
  AND lease_id = $2
  AND generation = $3
  AND terminal = false
RETURNING task_id
`, [taskId, lease?.lease_id, lease?.generation, this.nowIso()]);
    return result.rows.length === 1;
  }
}
