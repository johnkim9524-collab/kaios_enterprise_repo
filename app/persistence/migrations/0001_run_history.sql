CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_runs (
    run_id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL,
    runtime_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    edition TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER,
    error_type TEXT,
    error_stage TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    stage_name TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT,
    recorded_at TEXT NOT NULL,
    FOREIGN KEY (run_id)
        REFERENCES runtime_runs(run_id)
        ON DELETE CASCADE,
    UNIQUE (run_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS source_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    signal_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    recorded_at TEXT NOT NULL,
    FOREIGN KEY (run_id)
        REFERENCES runtime_runs(run_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    edition TEXT NOT NULL,
    published_at TEXT NOT NULL,
    FOREIGN KEY (run_id)
        REFERENCES runtime_runs(run_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runtime_runs_started_at
    ON runtime_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_runs_status
    ON runtime_runs(status);

CREATE INDEX IF NOT EXISTS idx_stage_executions_run
    ON stage_executions(run_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_source_executions_run
    ON source_executions(run_id);

CREATE INDEX IF NOT EXISTS idx_publications_edition
    ON publications(edition);