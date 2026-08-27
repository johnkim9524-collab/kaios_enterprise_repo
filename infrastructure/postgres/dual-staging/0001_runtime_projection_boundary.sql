BEGIN;

CREATE SCHEMA IF NOT EXISTS kaios_runtime;

CREATE OR REPLACE FUNCTION kaios_runtime.current_tenant()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$;

CREATE TABLE IF NOT EXISTS kaios_runtime.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS kaios_runtime.projections (
  tenant_id text NOT NULL,
  vertical text NOT NULL CHECK (vertical IN ('kidults', 'artfund')),
  projection_id text NOT NULL,
  projection_json jsonb NOT NULL,
  projection_digest text NOT NULL CHECK (projection_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('draft', 'approved', 'revoked')),
  as_of timestamptz NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, vertical),
  UNIQUE (tenant_id, projection_id),
  UNIQUE (tenant_id, vertical, projection_digest)
);

CREATE TABLE IF NOT EXISTS kaios_runtime.entitlements (
  tenant_id text NOT NULL,
  entitlement_id text NOT NULL,
  subject_id text NOT NULL,
  vertical text NOT NULL CHECK (vertical IN ('kidults', 'artfund')),
  scopes text[] NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
  projection_digest text CHECK (projection_digest IS NULL OR projection_digest ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, entitlement_id),
  CHECK (array_length(scopes, 1) IS NOT NULL),
  CHECK (expires_at IS NULL OR expires_at > issued_at),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL) OR status <> 'revoked')
);

CREATE INDEX IF NOT EXISTS entitlements_subject_vertical_idx
  ON kaios_runtime.entitlements (tenant_id, subject_id, vertical, status);

CREATE TABLE IF NOT EXISTS kaios_runtime.export_nonces (
  tenant_id text NOT NULL,
  vertical text NOT NULL CHECK (vertical IN ('kidults', 'artfund')),
  entitlement_id text NOT NULL,
  nonce_digest text NOT NULL CHECK (nonce_digest ~ '^[0-9a-f]{64}$'),
  projection_digest text NOT NULL CHECK (projection_digest ~ '^[0-9a-f]{64}$'),
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, vertical, entitlement_id, nonce_digest),
  FOREIGN KEY (tenant_id, entitlement_id)
    REFERENCES kaios_runtime.entitlements (tenant_id, entitlement_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS kaios_runtime.export_audit (
  tenant_id text NOT NULL,
  audit_id bigint GENERATED ALWAYS AS IDENTITY,
  vertical text NOT NULL CHECK (vertical IN ('kidults', 'artfund')),
  subject_id text NOT NULL,
  entitlement_id text NOT NULL,
  nonce_digest text NOT NULL CHECK (nonce_digest ~ '^[0-9a-f]{64}$'),
  projection_digest text NOT NULL CHECK (projection_digest ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('authorized', 'denied')),
  reason_code text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, audit_id)
);

CREATE OR REPLACE FUNCTION kaios_runtime.reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable runtime evidence cannot be updated or deleted'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS export_nonces_immutable ON kaios_runtime.export_nonces;
CREATE TRIGGER export_nonces_immutable
BEFORE UPDATE OR DELETE ON kaios_runtime.export_nonces
FOR EACH ROW EXECUTE FUNCTION kaios_runtime.reject_immutable_mutation();

DROP TRIGGER IF EXISTS export_audit_immutable ON kaios_runtime.export_audit;
CREATE TRIGGER export_audit_immutable
BEFORE UPDATE OR DELETE ON kaios_runtime.export_audit
FOR EACH ROW EXECUTE FUNCTION kaios_runtime.reject_immutable_mutation();

ALTER TABLE kaios_runtime.projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE kaios_runtime.projections FORCE ROW LEVEL SECURITY;
ALTER TABLE kaios_runtime.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE kaios_runtime.entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE kaios_runtime.export_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE kaios_runtime.export_nonces FORCE ROW LEVEL SECURITY;
ALTER TABLE kaios_runtime.export_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE kaios_runtime.export_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projections_tenant_isolation ON kaios_runtime.projections;
CREATE POLICY projections_tenant_isolation ON kaios_runtime.projections
  USING (tenant_id = kaios_runtime.current_tenant())
  WITH CHECK (tenant_id = kaios_runtime.current_tenant());

DROP POLICY IF EXISTS entitlements_tenant_isolation ON kaios_runtime.entitlements;
CREATE POLICY entitlements_tenant_isolation ON kaios_runtime.entitlements
  USING (tenant_id = kaios_runtime.current_tenant())
  WITH CHECK (tenant_id = kaios_runtime.current_tenant());

DROP POLICY IF EXISTS export_nonces_tenant_isolation ON kaios_runtime.export_nonces;
CREATE POLICY export_nonces_tenant_isolation ON kaios_runtime.export_nonces
  USING (tenant_id = kaios_runtime.current_tenant())
  WITH CHECK (tenant_id = kaios_runtime.current_tenant());

DROP POLICY IF EXISTS export_audit_tenant_isolation ON kaios_runtime.export_audit;
CREATE POLICY export_audit_tenant_isolation ON kaios_runtime.export_audit
  USING (tenant_id = kaios_runtime.current_tenant())
  WITH CHECK (tenant_id = kaios_runtime.current_tenant());

REVOKE ALL ON SCHEMA kaios_runtime FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA kaios_runtime FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA kaios_runtime FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA kaios_runtime FROM PUBLIC;

INSERT INTO kaios_runtime.schema_migrations (version)
VALUES ('0001_runtime_projection_boundary')
ON CONFLICT (version) DO NOTHING;

COMMIT;
