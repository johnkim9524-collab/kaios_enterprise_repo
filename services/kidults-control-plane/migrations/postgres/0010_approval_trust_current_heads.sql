BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_trust_current_head') THEN
    CREATE ROLE kidults_control_trust_current_head
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_trust_current_head'
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls))
  THEN RAISE EXCEPTION 'KIDULTS_TRUST_CURRENT_HEAD_ROLE_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

DO $$
DECLARE existing_role name; existing_state kidults_control.writer_state;
  existing_purpose text; existing_owner text;
BEGIN
  SELECT database_role, state, purpose, owner INTO existing_role, existing_state,
    existing_purpose, existing_owner FROM kidults_control.writer_principals
  WHERE writer_id = 'kpmo-trust-current-head-writer-v1';
  IF NOT FOUND THEN
    INSERT INTO kidults_control.writer_principals (writer_id, database_role, state, purpose, owner)
    VALUES ('kpmo-trust-current-head-writer-v1', 'kidults_control_trust_current_head', 'ACTIVE',
      'Append-only current approval trust lifecycle heads', 'KPMO');
  ELSIF existing_role <> 'kidults_control_trust_current_head' OR existing_state <> 'ACTIVE'
    OR existing_purpose <> 'Append-only current approval trust lifecycle heads'
    OR existing_owner <> 'KPMO'
  THEN RAISE EXCEPTION 'KIDULTS_TRUST_CURRENT_HEAD_WRITER_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE kidults_control.approval_trust_current_heads (
  revision integer PRIMARY KEY CHECK (revision >= 1),
  head_id text NOT NULL UNIQUE CHECK (head_id ~ '^trust-current-head:[0-9a-f]{64}$'),
  head_digest text NOT NULL UNIQUE CHECK (head_digest ~ '^sha256:[0-9a-f]{64}$'),
  previous_head_digest text NULL UNIQUE CHECK (previous_head_digest IS NULL
    OR previous_head_digest ~ '^sha256:[0-9a-f]{64}$'),
  lifecycle_state_digest text NOT NULL CHECK (lifecycle_state_digest ~ '^sha256:[0-9a-f]{64}$'),
  active_registry_id text NULL,
  active_registry_digest text NULL CHECK (active_registry_digest IS NULL
    OR active_registry_digest ~ '^sha256:[0-9a-f]{64}$'),
  head_json jsonb NOT NULL CHECK (jsonb_typeof(head_json) = 'object'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK ((active_registry_id IS NULL) = (active_registry_digest IS NULL)),
  CHECK (octet_length(head_json::text) <= 65536),
  CHECK ((head_json->>'revision')::integer = revision),
  CHECK (head_json->>'headId' = head_id),
  CHECK (head_json->>'headDigest' = head_digest),
  CHECK ((head_json->>'previousHeadDigest') IS NOT DISTINCT FROM previous_head_digest),
  CHECK (head_json->>'lifecycleStateDigest' = lifecycle_state_digest),
  CHECK ((head_json->>'activeRegistryId') IS NOT DISTINCT FROM active_registry_id),
  CHECK ((head_json->>'activeRegistryDigest') IS NOT DISTINCT FROM active_registry_digest),
  CHECK ((head_json->>'observedAt')::timestamptz = observed_at),
  CHECK (head_json->'activationAuthorized' = 'false'::jsonb),
  CHECK (head_json->'externalEgress' = 'false'::jsonb),
  CHECK (head_json->>'production' = 'HOLD'),
  CHECK (head_json->>'publicRelease' = 'HOLD'),
  CHECK (head_json->>'g5' = 'HOLD')
);

CREATE TRIGGER approval_trust_current_heads_writer_guard
BEFORE INSERT ON kidults_control.approval_trust_current_heads
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();
CREATE TRIGGER approval_trust_current_heads_append_only
BEFORE UPDATE OR DELETE ON kidults_control.approval_trust_current_heads
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER approval_trust_current_heads_truncate_denied
BEFORE TRUNCATE ON kidults_control.approval_trust_current_heads
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE ALL ON kidults_control.approval_trust_current_heads FROM PUBLIC;
GRANT USAGE ON SCHEMA kidults_control TO kidults_control_trust_current_head;
GRANT SELECT, INSERT ON kidults_control.approval_trust_current_heads
  TO kidults_control_trust_current_head;
GRANT SELECT ON kidults_control.approval_trust_current_heads TO kidults_control_approval_consumer;
GRANT SELECT (writer_id, database_role, state)
  ON kidults_control.writer_principals TO kidults_control_trust_current_head;
GRANT EXECUTE ON FUNCTION kidults_control.assert_registered_writer(text)
  TO kidults_control_trust_current_head;

COMMIT;
