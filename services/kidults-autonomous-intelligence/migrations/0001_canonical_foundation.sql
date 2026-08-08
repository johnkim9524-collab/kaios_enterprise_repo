PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_family TEXT NOT NULL,
  region TEXT,
  base_url TEXT,
  trust_tier TEXT NOT NULL DEFAULT 'C',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entity_registry (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  category TEXT NOT NULL,
  external_keys_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(entity_type, canonical_name)
);

CREATE TABLE IF NOT EXISTS evidence_ledger (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_registry(id),
  entity_id TEXT REFERENCES entity_registry(id),
  external_id TEXT,
  observed_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  provenance_url TEXT,
  provenance_label TEXT,
  license_code TEXT,
  raw_payload_json TEXT NOT NULL,
  evidence_grade TEXT NOT NULL DEFAULT 'D',
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence >= 0 AND confidence <= 100),
  status TEXT NOT NULL DEFAULT 'accepted',
  supersedes_id TEXT REFERENCES evidence_ledger(id),
  UNIQUE(source_id, external_id, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_evidence_observed_at ON evidence_ledger(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence_ledger(source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence_ledger(entity_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence_ledger(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entity_registry(id),
  metric_key TEXT NOT NULL,
  metric_value REAL NOT NULL,
  unit TEXT,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 100),
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_observations_metric ON observations(metric_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_entity_metric ON observations(entity_id, metric_key, observed_at DESC);

CREATE TABLE IF NOT EXISTS methodology_registry (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intelligence_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trigger_type TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  evidence_cutoff TEXT NOT NULL,
  status TEXT NOT NULL,
  input_evidence_count INTEGER NOT NULL DEFAULT 0,
  output_category_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS category_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES intelligence_runs(id),
  category TEXT NOT NULL,
  score REAL NOT NULL,
  confidence REAL NOT NULL,
  market_activity REAL,
  cultural_momentum REAL,
  scarcity REAL,
  canon_strength REAL,
  market_velocity REAL,
  liquidity REAL,
  lifecycle_stage TEXT NOT NULL,
  evidence_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, category)
);

CREATE TABLE IF NOT EXISTS index_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES intelligence_runs(id),
  kidult100 REAL NOT NULL,
  sentiment_index REAL,
  canon_strength REAL,
  market_velocity REAL,
  active_listings REAL,
  confidence REAL NOT NULL,
  coverage_brands INTEGER NOT NULL DEFAULT 0,
  source_families INTEGER NOT NULL DEFAULT 0,
  category_count INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  production_eligible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publication_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES intelligence_runs(id),
  channel TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, channel)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  subject_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO methodology_registry (
  id, version, status, definition_json, checksum, effective_from, created_at
) VALUES (
  'method_kidults_v2_foundation',
  'v2.0-autonomous-foundation',
  'active',
  '{"categoryWeights":{"market_activity":0.32,"cultural_momentum":0.24,"scarcity":0.21,"canon_strength":0.23},"indexAggregation":"confidence-weighted category mean","confidenceAggregation":"evidence-weighted mean","productionGate":{"minimumEvidence":20,"minimumCategories":4,"minimumSourceFamilies":3}}',
  'kidults-v2-autonomous-foundation',
  '2026-08-08T00:00:00.000Z',
  '2026-08-08T00:00:00.000Z'
);
