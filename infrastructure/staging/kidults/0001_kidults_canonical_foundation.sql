PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS kidults_entities (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('category','subcategory','brand','franchise','character','product_line','product','edition','variant','item_instance')),
  parent_entity_id TEXT REFERENCES kidults_entities(entity_id),
  canonical_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('candidate','active','merged','split','retired','disputed')),
  confidence_grade TEXT NOT NULL DEFAULT 'U' CHECK (confidence_grade IN ('A','B','C','D','U')),
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  methodology_id TEXT,
  rights_status TEXT NOT NULL DEFAULT 'unknown' CHECK (rights_status IN ('unknown','restricted','approved','expired','disputed')),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  observed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kidults_entities_type ON kidults_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kidults_entities_parent ON kidults_entities(parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_kidults_entities_status ON kidults_entities(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_kidults_entities_confidence ON kidults_entities(confidence_score DESC);

CREATE TABLE IF NOT EXISTS kidults_entity_aliases (
  alias_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES kidults_entities(entity_id) ON DELETE CASCADE,
  alias_value TEXT NOT NULL,
  alias_type TEXT NOT NULL DEFAULT 'name',
  source_id TEXT,
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  UNIQUE(entity_id, alias_value, alias_type)
);

CREATE INDEX IF NOT EXISTS idx_kidults_alias_lookup ON kidults_entity_aliases(alias_value);

CREATE TABLE IF NOT EXISTS kidults_observations (
  observation_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES kidults_entities(entity_id),
  observation_type TEXT NOT NULL,
  numeric_value REAL,
  text_value TEXT,
  currency TEXT,
  source_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  rights_id TEXT,
  confidence_grade TEXT NOT NULL CHECK (confidence_grade IN ('A','B','C','D','U')),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  observed_at TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kidults_observations_entity ON kidults_observations(entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_kidults_observations_type ON kidults_observations(observation_type, observed_at DESC);

CREATE TABLE IF NOT EXISTS kidults_signals (
  signal_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES kidults_entities(entity_id),
  signal_type TEXT NOT NULL,
  signal_value REAL,
  signal_label TEXT,
  methodology_id TEXT NOT NULL,
  confidence_grade TEXT NOT NULL CHECK (confidence_grade IN ('A','B','C','D','U')),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  source_coverage REAL NOT NULL DEFAULT 0 CHECK (source_coverage BETWEEN 0 AND 1),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kidults_signals_entity ON kidults_signals(entity_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_kidults_signals_type ON kidults_signals(signal_type, effective_at DESC);

CREATE TABLE IF NOT EXISTS kidults_entity_events (
  event_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','updated','merged','split','retired','disputed','restated')),
  related_entity_id TEXT,
  reason TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system','operator','migration')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kidults_entity_events ON kidults_entity_events(entity_id, occurred_at DESC);
