PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS publication_runs (
  run_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  state TEXT NOT NULL CHECK (state IN ('scheduled','evaluating','blocked','publishing','published','rolling_back','rolled_back','failed','retry_scheduled')),
  incident_required INTEGER NOT NULL DEFAULT 0 CHECK (incident_required IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publication_run_items (
  item_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES publication_runs(run_id),
  product_kind TEXT NOT NULL CHECK (product_kind IN ('report','alert','index')),
  product_id TEXT NOT NULL,
  publication_state TEXT NOT NULL,
  eligible INTEGER NOT NULL CHECK (eligible IN (0,1)),
  retryable INTEGER NOT NULL CHECK (retryable IN (0,1)),
  checksum TEXT NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  scheduled_for TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id, product_kind, product_id)
);

CREATE TABLE IF NOT EXISTS publication_rollbacks (
  rollback_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  product_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  original_checksum TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publication_incidents (
  incident_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES publication_runs(run_id),
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  severity TEXT NOT NULL CHECK (severity IN ('warning','major','critical')),
  incident_type TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','recovering','resolved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_publication_runs_vertical_started ON publication_runs(vertical, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_publication_items_run_state ON publication_run_items(run_id, publication_state);
CREATE INDEX IF NOT EXISTS idx_publication_rollbacks_product ON publication_rollbacks(vertical, product_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_publication_incidents_status ON publication_incidents(status, severity, created_at DESC);
