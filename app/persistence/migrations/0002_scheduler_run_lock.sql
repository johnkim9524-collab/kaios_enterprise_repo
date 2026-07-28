CREATE TABLE IF NOT EXISTS scheduler_state (
    scheduler_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    interval_seconds INTEGER NOT NULL,
    runtime_mode TEXT NOT NULL,
    last_tick_at TEXT,
    last_run_id TEXT,
    last_run_status TEXT,
    last_run_started_at TEXT,
    last_run_completed_at TEXT,
    next_run_at TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_locks (
    lock_name TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_locks_expires_at
ON runtime_locks (expires_at);