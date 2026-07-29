PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS artfund_entities (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'artist','artwork','edition','object_instance','provenance_event',
    'exhibition','auction_lot','transaction','institution','market_signal'
  )),
  parent_entity_id TEXT REFERENCES artfund_entities(entity_id),
  canonical_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('candidate','active','merged','retired','disputed')),
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  methodology_id TEXT,
  rights_status TEXT NOT NULL DEFAULT 'unknown' CHECK (rights_status IN ('unknown','restricted','approved','expired','disputed')),
  source_coverage INTEGER NOT NULL DEFAULT 0 CHECK (source_coverage >= 0),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  freshness_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artfund_entities_type_status
  ON artfund_entities(entity_type, status);
CREATE INDEX IF NOT EXISTS idx_artfund_entities_parent
  ON artfund_entities(parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_artfund_entities_confidence
  ON artfund_entities(confidence_score DESC);

CREATE TABLE IF NOT EXISTS artfund_entity_aliases (
  alias_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES artfund_entities(entity_id) ON DELETE CASCADE,
  alias_value TEXT NOT NULL,
  alias_type TEXT NOT NULL DEFAULT 'name',
  locale TEXT,
  source_id TEXT,
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  UNIQUE(entity_id, alias_value, alias_type)
);

CREATE INDEX IF NOT EXISTS idx_artfund_alias_value
  ON artfund_entity_aliases(alias_value);

CREATE TABLE IF NOT EXISTS artfund_provenance_events (
  provenance_event_id TEXT PRIMARY KEY,
  object_entity_id TEXT NOT NULL REFERENCES artfund_entities(entity_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'creation','ownership','sale','transfer','exhibition','publication',
    'authentication','restoration','location','dispute','other'
  )),
  party_entity_id TEXT REFERENCES artfund_entities(entity_id),
  location_text TEXT,
  event_at TEXT,
  source_id TEXT,
  evidence_id TEXT,
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  rights_status TEXT NOT NULL CHECK (rights_status IN ('unknown','restricted','approved','expired','disputed')),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artfund_provenance_object_time
  ON artfund_provenance_events(object_entity_id, event_at);

CREATE TABLE IF NOT EXISTS artfund_observations (
  observation_id TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL REFERENCES artfund_entities(entity_id) ON DELETE CASCADE,
  observation_type TEXT NOT NULL,
  numeric_value REAL,
  text_value TEXT,
  currency TEXT,
  observed_at TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  source_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  methodology_id TEXT,
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  rights_status TEXT NOT NULL CHECK (rights_status IN ('unknown','restricted','approved','expired','disputed')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artfund_observations_subject_time
  ON artfund_observations(subject_entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_artfund_observations_type_time
  ON artfund_observations(observation_type, observed_at DESC);

CREATE TABLE IF NOT EXISTS artfund_signals (
  signal_id TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL REFERENCES artfund_entities(entity_id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  signal_value REAL,
  direction TEXT CHECK (direction IN ('positive','negative','neutral','mixed')),
  methodology_id TEXT NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  source_coverage INTEGER NOT NULL DEFAULT 0 CHECK (source_coverage >= 0),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  calculated_at TEXT NOT NULL,
  valid_until TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artfund_signals_subject_time
  ON artfund_signals(subject_entity_id, calculated_at DESC);

CREATE TABLE IF NOT EXISTS artfund_audit_events (
  audit_event_id TEXT PRIMARY KEY,
  entity_id TEXT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','operator','admin','migration')),
  actor_id TEXT,
  detail_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artfund_audit_entity_time
  ON artfund_audit_events(entity_id, recorded_at DESC);
