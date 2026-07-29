PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS alert_policies (
  policy_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  alert_type TEXT NOT NULL,
  minimum_severity TEXT NOT NULL CHECK (minimum_severity IN ('info','watch','warning','critical')),
  minimum_confidence INTEGER NOT NULL CHECK (minimum_confidence BETWEEN 0 AND 100),
  cooldown_seconds INTEGER NOT NULL CHECK (cooldown_seconds >= 0),
  channels_json TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_evaluations (
  alert_id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','watch','warning','critical')),
  status TEXT NOT NULL CHECK (status IN ('candidate','eligible','blocked','delivered','suppressed')),
  deliverable INTEGER NOT NULL CHECK (deliverable IN (0,1)),
  reasons_json TEXT NOT NULL,
  channels_json TEXT NOT NULL,
  deduplication_key TEXT NOT NULL,
  checksum TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  FOREIGN KEY (policy_id) REFERENCES alert_policies(policy_id)
);

CREATE TABLE IF NOT EXISTS alert_delivery_events (
  delivery_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('portal','email','webhook','archive')),
  status TEXT NOT NULL CHECK (status IN ('queued','delivered','failed','suppressed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_message TEXT,
  delivered_at TEXT,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (alert_id) REFERENCES alert_evaluations(alert_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_eval_vertical_time ON alert_evaluations(vertical, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_eval_dedup ON alert_evaluations(deduplication_key, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_delivery_alert ON alert_delivery_events(alert_id, recorded_at DESC);
