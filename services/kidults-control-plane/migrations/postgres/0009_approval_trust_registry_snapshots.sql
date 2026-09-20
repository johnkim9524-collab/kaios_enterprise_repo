BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_trust_registry_snapshot') THEN
    CREATE ROLE kidults_control_trust_registry_snapshot
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_trust_registry_snapshot'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'KIDULTS_TRUST_REGISTRY_SNAPSHOT_ROLE_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

DO $$
DECLARE existing_role name; existing_state kidults_control.writer_state;
  existing_purpose text; existing_owner text;
BEGIN
  SELECT database_role, state, purpose, owner
    INTO existing_role, existing_state, existing_purpose, existing_owner
  FROM kidults_control.writer_principals
  WHERE writer_id = 'kpmo-trust-registry-snapshot-writer-v1';
  IF NOT FOUND THEN
    INSERT INTO kidults_control.writer_principals (writer_id, database_role, state, purpose, owner)
    VALUES ('kpmo-trust-registry-snapshot-writer-v1',
      'kidults_control_trust_registry_snapshot', 'ACTIVE',
      'Append-only compiled synthetic trust registry snapshots', 'KPMO');
  ELSIF existing_role <> 'kidults_control_trust_registry_snapshot'
    OR existing_state <> 'ACTIVE'
    OR existing_purpose <> 'Append-only compiled synthetic trust registry snapshots'
    OR existing_owner <> 'KPMO'
  THEN RAISE EXCEPTION 'KIDULTS_TRUST_REGISTRY_SNAPSHOT_WRITER_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE kidults_control.approval_trust_registry_snapshots (
  snapshot_id text PRIMARY KEY CHECK (snapshot_id ~ '^trust-registry-snapshot:[0-9a-f]{64}$'),
  registry_id text NOT NULL UNIQUE,
  registry_digest text NOT NULL UNIQUE CHECK (registry_digest ~ '^sha256:[0-9a-f]{64}$'),
  handoff_id text NOT NULL UNIQUE CHECK (handoff_id ~ '^trust-registry-handoff:[0-9a-f]{64}$'),
  handoff_digest text NOT NULL UNIQUE CHECK (handoff_digest ~ '^sha256:[0-9a-f]{64}$'),
  lifecycle_state_digest text NOT NULL CHECK (lifecycle_state_digest ~ '^sha256:[0-9a-f]{64}$'),
  registry_json jsonb NOT NULL CHECK (jsonb_typeof(registry_json) = 'object'),
  handoff_json jsonb NOT NULL CHECK (jsonb_typeof(handoff_json) = 'object'),
  snapshot_json jsonb NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
  receipt_digest text NOT NULL UNIQUE CHECK (receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL,
  CHECK (octet_length(registry_json::text) <= 262144),
  CHECK (octet_length(handoff_json::text) <= 65536),
  CHECK (octet_length(snapshot_json::text) <= 65536),
  CHECK (registry_json->>'registryId' = registry_id),
  CHECK (registry_json->>'registryDigest' = registry_digest),
  CHECK (handoff_json->>'registryId' = registry_id),
  CHECK (handoff_json->>'registryDigest' = registry_digest),
  CHECK (handoff_json->>'handoffId' = handoff_id),
  CHECK (handoff_json->>'handoffDigest' = handoff_digest),
  CHECK (handoff_json->>'lifecycleStateDigest' = lifecycle_state_digest),
  CHECK (snapshot_json->>'snapshotId' = snapshot_id),
  CHECK (snapshot_json->>'registryId' = registry_id),
  CHECK (snapshot_json->>'registryDigest' = registry_digest),
  CHECK (snapshot_json->>'handoffId' = handoff_id),
  CHECK (snapshot_json->>'handoffDigest' = handoff_digest),
  CHECK (snapshot_json->>'lifecycleStateDigest' = lifecycle_state_digest),
  CHECK (snapshot_json->>'receiptDigest' = receipt_digest),
  CHECK ((snapshot_json->>'recordedAt')::timestamptz = recorded_at),
  CHECK (snapshot_json->'activationAuthorized' = 'false'::jsonb),
  CHECK (snapshot_json->'externalEgress' = 'false'::jsonb),
  CHECK (snapshot_json->>'production' = 'HOLD'),
  CHECK (snapshot_json->>'publicRelease' = 'HOLD'),
  CHECK (snapshot_json->>'g5' = 'HOLD')
);

CREATE TRIGGER approval_trust_registry_snapshots_writer_guard
BEFORE INSERT ON kidults_control.approval_trust_registry_snapshots
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();
CREATE TRIGGER approval_trust_registry_snapshots_append_only
BEFORE UPDATE OR DELETE ON kidults_control.approval_trust_registry_snapshots
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER approval_trust_registry_snapshots_truncate_denied
BEFORE TRUNCATE ON kidults_control.approval_trust_registry_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE ALL ON kidults_control.approval_trust_registry_snapshots FROM PUBLIC;
GRANT USAGE ON SCHEMA kidults_control TO kidults_control_trust_registry_snapshot;
GRANT SELECT, INSERT ON kidults_control.approval_trust_registry_snapshots
  TO kidults_control_trust_registry_snapshot;
GRANT SELECT ON kidults_control.approval_trust_registry_snapshots
  TO kidults_control_approval_consumer;
GRANT SELECT (writer_id, database_role, state)
  ON kidults_control.writer_principals TO kidults_control_trust_registry_snapshot;
GRANT EXECUTE ON FUNCTION kidults_control.assert_registered_writer(text)
  TO kidults_control_trust_registry_snapshot;

COMMIT;
