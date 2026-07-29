PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_execution_audit (
  execution_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  status TEXT NOT NULL CHECK (status IN ('scheduled','running','succeeded','partial','retry_scheduled','failed','quarantined','recovered')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  records_received INTEGER NOT NULL DEFAULT 0 CHECK (records_received >= 0),
  records_accepted INTEGER NOT NULL DEFAULT 0 CHECK (records_accepted >= 0),
  records_rejected INTEGER NOT NULL DEFAULT 0 CHECK (records_rejected >= 0),
  schema_fingerprint TEXT,
  error_code TEXT,
  error_message TEXT,
  retry_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_execution_source_created
  ON source_execution_audit(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_execution_vertical_status
  ON source_execution_audit(vertical, status, created_at DESC);

CREATE TABLE IF NOT EXISTS source_health_state (
  source_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('candidate','active','degraded','quarantined','retired')),
  health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  consecutive_successes INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_successes >= 0),
  last_execution_id TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  quarantine_reason TEXT,
  quarantined_at TEXT,
  recover_after TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(last_execution_id) REFERENCES source_execution_audit(execution_id)
);

CREATE INDEX IF NOT EXISTS idx_source_health_vertical_lifecycle
  ON source_health_state(vertical, lifecycle, health_score DESC);

CREATE TABLE IF NOT EXISTS source_recovery_event (
  recovery_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  from_lifecycle TEXT NOT NULL,
  to_lifecycle TEXT NOT NULL,
  reason TEXT NOT NULL,
  automatic INTEGER NOT NULL CHECK (automatic IN (0,1)),
  occurred_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES source_health_state(source_id)
);

CREATE INDEX IF NOT EXISTS idx_source_recovery_source_time
  ON source_recovery_event(source_id, occurred_at DESC);
