CREATE TABLE IF NOT EXISTS collector_runs (
  id TEXT PRIMARY KEY,
  adapter_id TEXT NOT NULL,
  source_family TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  raw_count INTEGER NOT NULL DEFAULT 0,
  normalized_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  error_text TEXT
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES source_registry(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  UNIQUE(source_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_entity_alias_normalized ON entity_aliases(normalized_alias);

CREATE TABLE IF NOT EXISTS publication_state (
  channel TEXT PRIMARY KEY,
  snapshot_id TEXT REFERENCES publication_snapshots(id),
  payload_hash TEXT,
  promoted_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS autonomous_checkpoints (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO autonomous_checkpoints(key,value_json,updated_at)
VALUES ('visual_baseline','{"version":"KIDULTS Portal Visual Baseline v1.0","locked":true}',datetime('now'));
