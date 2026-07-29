PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS index_publications (
  publication_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  index_id TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  index_value REAL NOT NULL,
  methodology_id TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  methodology_checksum TEXT NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  source_coverage REAL NOT NULL CHECK (source_coverage BETWEEN 0 AND 100),
  rights_status TEXT NOT NULL,
  freshness_status TEXT NOT NULL,
  provenance_disputed INTEGER NOT NULL DEFAULT 0 CHECK (provenance_disputed IN (0,1)),
  publication_checksum TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published','blocked','rolled_back')),
  block_reasons_json TEXT NOT NULL DEFAULT '[]',
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vertical, index_id, as_of_date, publication_checksum)
);

CREATE TABLE IF NOT EXISTS index_rollback_events (
  rollback_id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_checksum TEXT NOT NULL,
  rolled_back_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES index_publications(publication_id)
);

CREATE TABLE IF NOT EXISTS index_publish_attempts (
  attempt_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  index_id TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('started','published','blocked','retry_scheduled','failed')),
  reasons_json TEXT NOT NULL DEFAULT '[]',
  next_retry_at TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_index_publications_lookup
  ON index_publications(vertical, index_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_index_publications_status
  ON index_publications(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_index_publish_attempts_retry
  ON index_publish_attempts(status, next_retry_at);
