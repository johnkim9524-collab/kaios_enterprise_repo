export const POSTGRES_LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS kidults_staging_task_lease (
  task_id text PRIMARY KEY,
  lease_id text NOT NULL UNIQUE,
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  terminal boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS kidults_staging_transition (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id text NOT NULL,
  state text NOT NULL,
  detail jsonb NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE (task_id, state) DEFERRABLE INITIALLY IMMEDIATE
);`;

export class PostgresTransitionLedger {
  constructor({ query, nowIso }) {
    this.query = query;
    this.nowIso = nowIso;
  }

  async initialize() { await this.query(POSTGRES_LEDGER_DDL, []); }

  async acquire(taskId, leaseId, expiresAt) {
    const result = await this.query(`
INSERT INTO kidults_staging_task_lease (task_id, lease_id, acquired_at, expires_at)
VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
ON CONFLICT (task_id) DO UPDATE SET
  lease_id = EXCLUDED.lease_id,
  acquired_at = EXCLUDED.acquired_at,
  expires_at = EXCLUDED.expires_at
WHERE kidults_staging_task_lease.terminal = false
  AND kidults_staging_task_lease.expires_at <= EXCLUDED.acquired_at
RETURNING task_id, lease_id, acquired_at, expires_at`, [taskId, leaseId, this.nowIso(), expiresAt]);
    return result.rows[0] ?? null;
  }

  async transition(taskId, state, detail, terminal = false) {
    await this.query('BEGIN', []);
    try {
      const inserted = await this.query(`
INSERT INTO kidults_staging_transition (task_id, state, detail, recorded_at)
VALUES ($1, $2, $3::jsonb, $4::timestamptz)
RETURNING sequence, task_id, state`, [taskId, state, JSON.stringify(detail), this.nowIso()]);
      if (terminal) {
        await this.query(`
UPDATE kidults_staging_task_lease
SET terminal = true
WHERE task_id = $1 AND terminal = false`, [taskId]);
      }
      await this.query('COMMIT', []);
      return inserted.rows[0];
    } catch (error) {
      await this.query('ROLLBACK', []);
      throw error;
    }
  }
}
