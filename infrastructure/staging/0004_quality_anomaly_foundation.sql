PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS quality_assessments (
  assessment_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  observation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  quality_score INTEGER NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
  decision TEXT NOT NULL CHECK (decision IN ('accept','review','reject','quarantine')),
  methodology_version TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quality_findings (
  finding_id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code IN (
    'MISSING_REQUIRED_FIELD','INVALID_TIMESTAMP','INVALID_VALUE','OUTLIER_VALUE',
    'DUPLICATE_EVIDENCE','STALE_OBSERVATION','RIGHTS_BLOCK','LOW_CONFIDENCE',
    'PROVENANCE_DISPUTE','DATA_GAP'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','high','critical')),
  field_name TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assessment_id) REFERENCES quality_assessments(assessment_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence_deduplication_registry (
  evidence_hash TEXT PRIMARY KEY,
  first_evidence_id TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  first_seen_at TEXT NOT NULL,
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_gap_events (
  gap_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  entity_id TEXT NOT NULL,
  observation_type TEXT NOT NULL,
  expected_interval_hours INTEGER NOT NULL CHECK (expected_interval_hours > 0),
  detected_gap_hours INTEGER NOT NULL CHECK (detected_gap_hours >= 0),
  status TEXT NOT NULL CHECK (status IN ('open','recollecting','resolved','accepted')),
  detected_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_quality_assessments_vertical_decision
  ON quality_assessments(vertical, decision, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_entity
  ON quality_assessments(entity_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_findings_assessment
  ON quality_findings(assessment_id, severity);
CREATE INDEX IF NOT EXISTS idx_data_gap_events_open
  ON data_gap_events(vertical, status, detected_at DESC);
