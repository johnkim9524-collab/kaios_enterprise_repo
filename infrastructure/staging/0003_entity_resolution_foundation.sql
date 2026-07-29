PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entity_aliases (
  alias_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  entity_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  locale TEXT,
  source_id TEXT,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  UNIQUE (vertical, entity_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_lookup
  ON entity_aliases(vertical, normalized_alias, confidence DESC);

CREATE TABLE IF NOT EXISTS entity_resolution_candidates (
  candidate_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  entity_type TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  parent_entity_id TEXT,
  external_ids_json TEXT NOT NULL DEFAULT '{}',
  source_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (resolution_status IN ('pending','matched','review','created','rejected','suppressed')),
  resolved_entity_id TEXT,
  resolution_score INTEGER CHECK (resolution_score BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resolution_candidates_queue
  ON entity_resolution_candidates(vertical, resolution_status, entity_type, observed_at DESC);

CREATE TABLE IF NOT EXISTS entity_resolution_audit (
  audit_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  action TEXT NOT NULL CHECK (
    action IN (
      'alias_added','candidate_matched','entity_created','entity_merged',
      'entity_split','duplicate_suppressed','manual_override'
    )
  ),
  subject_entity_id TEXT NOT NULL,
  related_entity_ids_json TEXT NOT NULL DEFAULT '[]',
  actor TEXT NOT NULL CHECK (actor IN ('system','operator','admin')),
  reason TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_resolution_audit_subject
  ON entity_resolution_audit(vertical, subject_entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS entity_redirects (
  retired_entity_id TEXT PRIMARY KEY,
  surviving_entity_id TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  redirect_reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (retired_entity_id <> surviving_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_redirect_survivor
  ON entity_redirects(vertical, surviving_entity_id);
