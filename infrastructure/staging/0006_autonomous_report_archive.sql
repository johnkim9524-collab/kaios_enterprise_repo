PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS report_runs (
  report_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  title TEXT NOT NULL,
  edition TEXT NOT NULL,
  as_of TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft','blocked','ready','published','archived')),
  supported_claim_count INTEGER NOT NULL DEFAULT 0 CHECK (supported_claim_count >= 0),
  blocked_claim_count INTEGER NOT NULL DEFAULT 0 CHECK (blocked_claim_count >= 0),
  checksum TEXT NOT NULL,
  methodology_manifest_json TEXT NOT NULL,
  evidence_manifest_json TEXT NOT NULL,
  archive_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_runs_vertical_edition_checksum
  ON report_runs(vertical, edition, checksum);
CREATE INDEX IF NOT EXISTS idx_report_runs_state_generated
  ON report_runs(state, generated_at DESC);

CREATE TABLE IF NOT EXISTS report_claims (
  claim_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES report_runs(report_id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('supported','insufficient_evidence','rights_blocked','methodology_blocked','low_confidence')),
  reasons_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_claims_report_state
  ON report_claims(report_id, state);

CREATE TABLE IF NOT EXISTS report_publication_events (
  event_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES report_runs(report_id),
  event_type TEXT NOT NULL CHECK (event_type IN ('generated','blocked','approved','published','archived','rolled_back')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','operator','admin')),
  detail_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_publication_events_report_time
  ON report_publication_events(report_id, recorded_at DESC);
