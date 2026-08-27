-- D1 is a non-canonical, disposable read model. Every row must be reproducible
-- from a PostgreSQL outbox event and written by the single governed projector.

CREATE TABLE IF NOT EXISTS projection_meta (
  projection_name TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL,
  source_event_hash TEXT NOT NULL CHECK (source_event_hash GLOB 'sha256:*'),
  source_schema_version TEXT NOT NULL,
  projection_cursor TEXT NOT NULL,
  projector_id TEXT NOT NULL CHECK (projector_id = 'kpmo-d1-projector-v1'),
  projected_at TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0)
);

CREATE TABLE IF NOT EXISTS organization_access_projection (
  organization_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  organization_state TEXT NOT NULL,
  membership_state TEXT NOT NULL,
  role_code TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  source_event_hash TEXT NOT NULL CHECK (source_event_hash GLOB 'sha256:*'),
  source_schema_version TEXT NOT NULL,
  projector_id TEXT NOT NULL CHECK (projector_id = 'kpmo-d1-projector-v1'),
  projected_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, subject_id)
);

CREATE TABLE IF NOT EXISTS subscription_entitlement_projection (
  organization_id TEXT NOT NULL,
  entitlement_code TEXT NOT NULL,
  subscription_state TEXT NOT NULL,
  entitlement_state TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  policy_version TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  source_event_hash TEXT NOT NULL CHECK (source_event_hash GLOB 'sha256:*'),
  source_schema_version TEXT NOT NULL,
  projector_id TEXT NOT NULL CHECK (projector_id = 'kpmo-d1-projector-v1'),
  projected_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, entitlement_code)
);

CREATE TABLE IF NOT EXISTS source_admission_projection (
  source_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  field_set_digest TEXT NOT NULL,
  rights_decision TEXT NOT NULL CHECK (rights_decision IN ('PASS', 'HOLD', 'DENY')),
  expires_at TEXT,
  last_supply_chain_run_id TEXT,
  last_normalized_digest TEXT,
  source_event_id TEXT NOT NULL,
  source_event_hash TEXT NOT NULL CHECK (source_event_hash GLOB 'sha256:*'),
  source_schema_version TEXT NOT NULL,
  projector_id TEXT NOT NULL CHECK (projector_id = 'kpmo-d1-projector-v1'),
  projected_at TEXT NOT NULL,
  PRIMARY KEY (source_id, purpose_code, field_set_digest)
);

CREATE TABLE IF NOT EXISTS control_plane_health_projection (
  service_name TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  slo_json TEXT NOT NULL,
  projector_lag_seconds INTEGER NOT NULL CHECK (projector_lag_seconds >= 0),
  unknown_writer_count INTEGER NOT NULL CHECK (unknown_writer_count >= 0),
  audit_gap_count INTEGER NOT NULL CHECK (audit_gap_count >= 0),
  source_event_id TEXT NOT NULL,
  source_event_hash TEXT NOT NULL CHECK (source_event_hash GLOB 'sha256:*'),
  source_schema_version TEXT NOT NULL,
  projector_id TEXT NOT NULL CHECK (projector_id = 'kpmo-d1-projector-v1'),
  projected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS access_projection_subject_idx
  ON organization_access_projection (subject_id, organization_state, membership_state);
CREATE INDEX IF NOT EXISTS entitlement_projection_org_state_idx
  ON subscription_entitlement_projection (organization_id, entitlement_state);
CREATE INDEX IF NOT EXISTS source_admission_projection_decision_idx
  ON source_admission_projection (rights_decision, expires_at);
