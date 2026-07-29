PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS score_results (
  score_result_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  score_name TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  score_value REAL NOT NULL CHECK (score_value >= 0 AND score_value <= 100),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  methodology_id TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  methodology_checksum TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  as_of TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(vertical, score_name, subject_id, as_of, methodology_version)
);

CREATE TABLE IF NOT EXISTS index_runs (
  index_run_id TEXT PRIMARY KEY,
  index_id TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  index_level REAL NOT NULL CHECK (index_level > 0),
  eligible_constituent_count INTEGER NOT NULL CHECK (eligible_constituent_count > 0),
  aggregate_confidence REAL NOT NULL CHECK (aggregate_confidence >= 0 AND aggregate_confidence <= 100),
  methodology_id TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  methodology_checksum TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  as_of TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('calculated','published','restated','rejected')),
  created_at TEXT NOT NULL,
  UNIQUE(index_id, as_of, methodology_version)
);

CREATE TABLE IF NOT EXISTS index_constituent_results (
  index_run_id TEXT NOT NULL,
  constituent_id TEXT NOT NULL,
  normalized_value REAL NOT NULL,
  applied_weight REAL NOT NULL CHECK (applied_weight >= 0),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  eligible INTEGER NOT NULL CHECK (eligible IN (0,1)),
  exclusion_reason TEXT,
  PRIMARY KEY(index_run_id, constituent_id),
  FOREIGN KEY(index_run_id) REFERENCES index_runs(index_run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_score_results_subject ON score_results(vertical, score_name, subject_id, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_index_runs_lookup ON index_runs(vertical, index_id, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_index_constituents_eligible ON index_constituent_results(index_run_id, eligible);
