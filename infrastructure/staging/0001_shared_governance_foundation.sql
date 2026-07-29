PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_registry (
  source_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('shared','kidults','artfund')),
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_tier TEXT NOT NULL CHECK (source_tier IN ('tier_1','tier_2','tier_3','experimental')),
  base_url TEXT,
  owner_name TEXT,
  jurisdiction TEXT,
  collection_method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate','approved','active','degraded','quarantined','retired')),
  quality_score REAL NOT NULL DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),
  last_reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rights_registry (
  rights_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_registry(source_id),
  collect_allowed INTEGER NOT NULL CHECK (collect_allowed IN (0,1)),
  store_allowed INTEGER NOT NULL CHECK (store_allowed IN (0,1)),
  transform_allowed INTEGER NOT NULL CHECK (transform_allowed IN (0,1)),
  display_allowed INTEGER NOT NULL CHECK (display_allowed IN (0,1)),
  redistribute_allowed INTEGER NOT NULL CHECK (redistribute_allowed IN (0,1)),
  sell_allowed INTEGER NOT NULL CHECK (sell_allowed IN (0,1)),
  attribution_required INTEGER NOT NULL CHECK (attribution_required IN (0,1)),
  retention_rule TEXT,
  license_type TEXT,
  legal_basis TEXT,
  status TEXT NOT NULL CHECK (status IN ('unknown','restricted','approved','expired','disputed')),
  effective_at TEXT,
  expires_at TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_ledger (
  evidence_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  source_id TEXT NOT NULL REFERENCES source_registry(source_id),
  canonical_uri TEXT,
  source_document_id TEXT,
  content_hash TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  rights_id TEXT REFERENCES rights_registry(rights_id),
  confidence_grade TEXT NOT NULL CHECK (confidence_grade IN ('A','B','C','D','U')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS methodology_registry (
  methodology_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('shared','kidults','artfund')),
  methodology_name TEXT NOT NULL,
  methodology_type TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','active','deprecated','retired')),
  effective_at TEXT,
  supersedes_methodology_id TEXT,
  input_contract_json TEXT NOT NULL,
  calculation_contract_json TEXT NOT NULL,
  restatement_policy TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(methodology_name, version)
);

CREATE TABLE IF NOT EXISTS confidence_assessments (
  assessment_id TEXT PRIMARY KEY,
  vertical TEXT NOT NULL CHECK (vertical IN ('kidults','artfund')),
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('A','B','C','D','U')),
  score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
  source_coverage REAL NOT NULL CHECK (source_coverage >= 0 AND source_coverage <= 100),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  rationale TEXT NOT NULL,
  methodology_id TEXT REFERENCES methodology_registry(methodology_id),
  assessed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_registry_vertical_status ON source_registry(vertical, status);
CREATE INDEX IF NOT EXISTS idx_rights_registry_source_status ON rights_registry(source_id, status);
CREATE INDEX IF NOT EXISTS idx_evidence_ledger_vertical_collected ON evidence_ledger(vertical, collected_at);
CREATE INDEX IF NOT EXISTS idx_evidence_ledger_source ON evidence_ledger(source_id);
CREATE INDEX IF NOT EXISTS idx_methodology_registry_vertical_status ON methodology_registry(vertical, status);
CREATE INDEX IF NOT EXISTS idx_confidence_subject ON confidence_assessments(vertical, subject_type, subject_id);
