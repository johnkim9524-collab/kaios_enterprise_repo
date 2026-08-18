PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS asi_event_log (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL,
  producer_engine TEXT NOT NULL,
  producer_version TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  partition_key TEXT NOT NULL,
  input_snapshot_ref TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  rights_state TEXT NOT NULL,
  freshness_state TEXT NOT NULL,
  assertion_purpose TEXT,
  decision TEXT,
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  trace_refs_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asi_event_correlation ON asi_event_log(correlation_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_asi_event_partition ON asi_event_log(partition_key, observed_at);
CREATE INDEX IF NOT EXISTS idx_asi_event_type ON asi_event_log(event_type, observed_at);

CREATE TABLE IF NOT EXISTS asi_outbox (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  engine_fleet TEXT NOT NULL,
  queue_binding TEXT NOT NULL,
  queue_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  dispatched_at TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(event_id, engine_fleet, queue_binding)
);

CREATE INDEX IF NOT EXISTS idx_asi_outbox_pending ON asi_outbox(status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS asi_engine_assertions (
  assertion_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  engine_fleet TEXT NOT NULL,
  assertion_type TEXT NOT NULL,
  purpose TEXT,
  decision TEXT NOT NULL,
  rights_state TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  engine_version TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  supersedes_assertion_id TEXT REFERENCES asi_engine_assertions(assertion_id),
  UNIQUE(source_id, engine_fleet, assertion_type, purpose, payload_hash)
);

CREATE TABLE IF NOT EXISTS asi_purpose_admissions (
  admission_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  evidence_class TEXT NOT NULL,
  output_class TEXT NOT NULL,
  region TEXT NOT NULL,
  decision TEXT NOT NULL,
  rights_state TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  input_snapshot_ref TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  required_assertion_count INTEGER NOT NULL CHECK(required_assertion_count > 0),
  satisfied_assertion_count INTEGER NOT NULL CHECK(satisfied_assertion_count >= 0 AND satisfied_assertion_count <= required_assertion_count),
  source_event_id TEXT REFERENCES asi_event_log(event_id),
  decided_at TEXT NOT NULL,
  review_due_at TEXT NOT NULL,
  superseded_at TEXT,
  revoked_at TEXT,
  UNIQUE(source_id, purpose, evidence_class, output_class, region, decided_at)
);

CREATE INDEX IF NOT EXISTS idx_asi_admission_source_purpose ON asi_purpose_admissions(source_id, purpose, decision, review_due_at);

CREATE TABLE IF NOT EXISTS asi_admission_assertions (
  admission_id TEXT NOT NULL REFERENCES asi_purpose_admissions(admission_id) ON DELETE CASCADE,
  assertion_id TEXT NOT NULL REFERENCES asi_engine_assertions(assertion_id),
  PRIMARY KEY(admission_id, assertion_id)
);

ALTER TABLE evidence_ledger ADD COLUMN admission_id TEXT REFERENCES asi_purpose_admissions(admission_id);
CREATE INDEX IF NOT EXISTS idx_evidence_admission ON evidence_ledger(admission_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS asi_queue_watermarks (
  queue_name TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  last_processed_at TEXT NOT NULL,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(queue_name, partition_key)
);

CREATE TABLE IF NOT EXISTS asi_dead_letters (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  source_queue_name TEXT,
  source_queue_provenance_state TEXT NOT NULL,
  source_queue_candidates_json TEXT NOT NULL DEFAULT '[]',
  message_id TEXT NOT NULL,
  event_id TEXT,
  attempts INTEGER NOT NULL,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  replayed_at TEXT,
  replay_event_id TEXT,
  UNIQUE(queue_name, message_id, attempts)
);

CREATE TABLE IF NOT EXISTS asi_processed_messages (
  queue_name TEXT NOT NULL,
  outbox_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  event_id TEXT,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  processing_token TEXT,
  completed_at TEXT,
  last_error TEXT,
  PRIMARY KEY(queue_name, outbox_id),
  UNIQUE(queue_name, message_id)
);

CREATE TABLE IF NOT EXISTS asi_engine_health (
  engine_fleet TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  state TEXT NOT NULL,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  dead_letter_count INTEGER NOT NULL DEFAULT 0,
  oldest_message_age_seconds INTEGER,
  p50_processing_latency_ms INTEGER,
  p95_processing_latency_ms INTEGER,
  last_success_at TEXT,
  last_failure_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asi_task_leases (
  lease_id TEXT PRIMARY KEY,
  engine_fleet TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  task_event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  lease_owner TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  released_at TEXT,
  release_state TEXT,
  UNIQUE(engine_fleet, partition_key, task_event_id)
);

CREATE INDEX IF NOT EXISTS idx_asi_task_lease_expiry ON asi_task_leases(engine_fleet, expires_at, released_at);

CREATE TABLE IF NOT EXISTS asi_replay_requests (
  replay_id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  target_engine_fleet TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  replay_event_id TEXT REFERENCES asi_event_log(event_id)
);

CREATE TABLE IF NOT EXISTS asi_circuit_breakers (
  engine_fleet TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'CLOSED',
  failure_count INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT,
  next_probe_at TEXT,
  reason_code TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asi_fleet_budgets (
  engine_fleet TEXT NOT NULL,
  budget_window TEXT NOT NULL,
  request_limit INTEGER NOT NULL,
  request_used INTEGER NOT NULL DEFAULT 0,
  cost_limit_microunits INTEGER NOT NULL,
  cost_used_microunits INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  window_ends_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(engine_fleet, budget_window, window_started_at)
);

INSERT OR IGNORE INTO asi_event_log (
  event_id,event_type,event_version,producer_engine,producer_version,correlation_id,causation_id,idempotency_key,
  partition_key,input_snapshot_ref,payload_hash,rights_state,freshness_state,assertion_purpose,decision,
  reason_codes_json,trace_refs_json,payload_json,occurred_at,observed_at,received_at
) VALUES (
  'event-staging-golden-path-admission-v1','SOURCE_PURPOSE_ADMISSION_DECIDED','1.0.0',
  'SOURCE_RIGHTS_COMPLIANCE_ANALYSIS','shadow-fixture-1.0.0','correlation-staging-golden-path-v1',NULL,
  'idempotency-staging-golden-path-admission-v1','fixture|GLOBAL|en|scope-staging|SOLD_TRANSACTION|staging-golden-path',
  'sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6',
  'sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','ALLOW','CURRENT',
  'BOUNDED_SHADOW_ACQUISITION','PASS','["STAGING_NONCOMMERCIAL_FIXTURE_ONLY"]','[]',
  '{"fixture":true,"commercial_use":false,"production_eligible":false}',
  '2026-08-18T00:00:00.000Z','2026-08-18T00:00:00.000Z','2026-08-18T00:00:00.000Z'
);

INSERT OR IGNORE INTO asi_engine_assertions (
  assertion_id,source_id,engine_fleet,assertion_type,purpose,decision,rights_state,payload_hash,event_id,engine_version,observed_at
) VALUES
  ('assert-staging-collect-v1','staging-golden-path','SOURCE_RIGHTS_COMPLIANCE_ANALYSIS','COLLECT','BOUNDED_SHADOW_ACQUISITION','PASS','ALLOW','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','event-staging-golden-path-admission-v1','shadow-fixture-1.0.0','2026-08-18T00:00:00.000Z'),
  ('assert-staging-store-v1','staging-golden-path','SOURCE_RIGHTS_COMPLIANCE_ANALYSIS','STORE','BOUNDED_SHADOW_ACQUISITION','PASS','ALLOW','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','event-staging-golden-path-admission-v1','shadow-fixture-1.0.0','2026-08-18T00:00:00.000Z'),
  ('assert-staging-transform-v1','staging-golden-path','SOURCE_RIGHTS_COMPLIANCE_ANALYSIS','TRANSFORM','BOUNDED_SHADOW_ACQUISITION','PASS','ALLOW','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','event-staging-golden-path-admission-v1','shadow-fixture-1.0.0','2026-08-18T00:00:00.000Z'),
  ('assert-staging-retention-v1','staging-golden-path','SOURCE_RIGHTS_COMPLIANCE_ANALYSIS','RETENTION','BOUNDED_SHADOW_ACQUISITION','PASS','ALLOW','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','event-staging-golden-path-admission-v1','shadow-fixture-1.0.0','2026-08-18T00:00:00.000Z'),
  ('assert-staging-rate-limit-v1','staging-golden-path','SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS','RATE_LIMIT','BOUNDED_SHADOW_ACQUISITION','PASS','ALLOW','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','event-staging-golden-path-admission-v1','shadow-fixture-1.0.0','2026-08-18T00:00:00.000Z'),
  ('assert-staging-robots-v1','staging-golden-path','SOURCE_RIGHTS_COMPLIANCE_ANALYSIS','ROBOTS','BOUNDED_SHADOW_ACQUISITION','PASS','ALLOW','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','event-staging-golden-path-admission-v1','shadow-fixture-1.0.0','2026-08-18T00:00:00.000Z'),
  ('assert-staging-schema-v1','staging-golden-path','SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS','SCHEMA','BOUNDED_SHADOW_ACQUISITION','PASS','ALLOW','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','event-staging-golden-path-admission-v1','shadow-fixture-1.0.0','2026-08-18T00:00:00.000Z'),
  ('assert-staging-provenance-v1','staging-golden-path','SOURCE_SITE_IDENTITY_OWNER_LINEAGE','PROVENANCE','BOUNDED_SHADOW_ACQUISITION','PASS','ALLOW','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','event-staging-golden-path-admission-v1','shadow-fixture-1.0.0','2026-08-18T00:00:00.000Z'),
  ('assert-staging-freshness-v1','staging-golden-path','SOURCE_FRESHNESS_STABILITY_ANALYSIS','FRESHNESS','BOUNDED_SHADOW_ACQUISITION','PASS','ALLOW','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6','event-staging-golden-path-admission-v1','shadow-fixture-1.0.0','2026-08-18T00:00:00.000Z');

INSERT OR IGNORE INTO asi_purpose_admissions (
  admission_id,source_id,purpose,evidence_class,output_class,region,decision,rights_state,policy_version,input_snapshot_ref,
  reason_codes_json,required_assertion_count,satisfied_assertion_count,source_event_id,decided_at,review_due_at
) VALUES (
  'admission-staging-golden-path-v1','staging-golden-path','BOUNDED_SHADOW_ACQUISITION',
  'ILLUSTRATIVE_TRANSACTION_FIXTURE','INTERNAL_SHADOW','GLOBAL','PASS','ALLOW',
  'kidults-asi-purpose-specific-admission-policy-v1@1.0.0','sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6',
  '["STAGING_NONCOMMERCIAL_FIXTURE_ONLY"]',9,9,'event-staging-golden-path-admission-v1',
  '2026-08-18T00:00:00.000Z','2027-08-18T00:00:00.000Z'
);

INSERT OR IGNORE INTO asi_admission_assertions (admission_id,assertion_id)
SELECT 'admission-staging-golden-path-v1',assertion_id
FROM asi_engine_assertions
WHERE source_id='staging-golden-path'
  AND purpose='BOUNDED_SHADOW_ACQUISITION'
  AND assertion_type IN ('COLLECT','STORE','TRANSFORM','RETENTION','RATE_LIMIT','ROBOTS','SCHEMA','PROVENANCE','FRESHNESS');
