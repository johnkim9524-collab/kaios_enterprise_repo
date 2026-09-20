BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_autonomous_admission') THEN
    CREATE ROLE kidults_control_autonomous_admission
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_autonomous_admission'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'KIDULTS_AUTONOMOUS_ADMISSION_ROLE_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

DO $$
DECLARE
  existing_role name;
  existing_state kidults_control.writer_state;
  existing_purpose text;
  existing_owner text;
BEGIN
  SELECT database_role, state, purpose, owner
    INTO existing_role, existing_state, existing_purpose, existing_owner
  FROM kidults_control.writer_principals
  WHERE writer_id = 'kpmo-autonomous-admission-proof-writer-v1';
  IF NOT FOUND THEN
    INSERT INTO kidults_control.writer_principals (writer_id, database_role, state, purpose, owner)
    VALUES (
      'kpmo-autonomous-admission-proof-writer-v1', 'kidults_control_autonomous_admission', 'ACTIVE',
      'Append-only autonomous synthetic admission proof ledger', 'KPMO_TRACK_A_Z'
    );
  ELSIF existing_role <> 'kidults_control_autonomous_admission'
    OR existing_state <> 'ACTIVE'
    OR existing_purpose <> 'Append-only autonomous synthetic admission proof ledger'
    OR existing_owner <> 'KPMO_TRACK_A_Z'
  THEN
    RAISE EXCEPTION 'KIDULTS_AUTONOMOUS_ADMISSION_WRITER_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE kidults_control.autonomous_admission_proofs (
  proof_id text PRIMARY KEY CHECK (proof_id ~ '^admission-proof:[0-9a-f]{64}$'),
  task_id text NOT NULL CHECK (task_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  decision_id text NOT NULL CHECK (decision_id ~ '^decision:[0-9a-f]{64}$'),
  decision_digest text NOT NULL CHECK (decision_digest ~ '^sha256:[0-9a-f]{64}$'),
  manifest_id text NOT NULL CHECK (manifest_id ~ '^manifest:[0-9a-f]{64}$'),
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
  proof_json jsonb NOT NULL CHECK (jsonb_typeof(proof_json) = 'object'),
  proof_digest text NOT NULL UNIQUE CHECK (proof_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (task_id, manifest_id),
  CHECK (octet_length(proof_json::text) <= 196608),
  CHECK (proof_json ?& ARRAY['sourceRequest', 'decision', 'manifest']),
  CHECK ((proof_json - ARRAY['sourceRequest', 'decision', 'manifest']) = '{}'::jsonb),
  CHECK (jsonb_typeof(proof_json->'sourceRequest') = 'object'),
  CHECK (jsonb_typeof(proof_json->'decision') = 'object'),
  CHECK (jsonb_typeof(proof_json->'manifest') = 'object'),
  CHECK (proof_json->'sourceRequest'->>'taskId' = task_id),
  CHECK (proof_json->'sourceRequest'->>'requestedMode' = 'SYNTHETIC_SHADOW'),
  CHECK (proof_json->'sourceRequest'->'synthetic' = 'true'::jsonb),
  CHECK (proof_json->'decision'->>'decisionId' = decision_id),
  CHECK (proof_json->'decision'->>'decisionDigest' = decision_digest),
  CHECK (proof_json->'decision'->>'taskId' = task_id),
  CHECK (proof_json->'decision'->>'requestDigest' = request_digest),
  CHECK (proof_json->'decision'->>'verdict' = 'SHADOW_ELIGIBLE'),
  CHECK (proof_json->'decision'->>'allowedMode' = 'SHADOW_NO_FETCH'),
  CHECK (proof_json->'decision'->'externalEgress' = 'false'::jsonb),
  CHECK (proof_json->'decision'->>'production' = 'HOLD'),
  CHECK (proof_json->'decision'->>'publicRelease' = 'HOLD'),
  CHECK (proof_json->'decision'->>'g5' = 'HOLD'),
  CHECK (proof_json->'manifest'->>'manifestId' = manifest_id),
  CHECK (proof_json->'manifest'->>'manifestDigest' = manifest_digest),
  CHECK (proof_json->'manifest'->>'taskId' = task_id),
  CHECK (proof_json->'manifest'->>'decisionId' = decision_id),
  CHECK (proof_json->'manifest'->>'decisionDigest' = decision_digest),
  CHECK (proof_json->'manifest'->>'requestDigest' = request_digest),
  CHECK ((proof_json->'manifest'->>'issuedAt')::timestamptz = issued_at),
  CHECK ((proof_json->'manifest'->>'expiresAt')::timestamptz = expires_at),
  CHECK (proof_json->'manifest'->>'issuedAt' = proof_json->'decision'->>'issuedAt'),
  CHECK (proof_json->'manifest'->>'expiresAt' = proof_json->'decision'->>'expiresAt'),
  CHECK (proof_json->'manifest'->>'allowedMode' = 'SHADOW_NO_FETCH'),
  CHECK (proof_json->'manifest'->'externalEgress' = 'false'::jsonb),
  CHECK (proof_json->'manifest'->>'production' = 'HOLD'),
  CHECK (proof_json->'manifest'->>'publicRelease' = 'HOLD'),
  CHECK (proof_json->'manifest'->>'g5' = 'HOLD')
);

CREATE INDEX autonomous_admission_proofs_resolve_idx
  ON kidults_control.autonomous_admission_proofs
  (task_id, request_digest, issued_at DESC, proof_id);

CREATE TRIGGER autonomous_admission_proofs_writer_guard
BEFORE INSERT ON kidults_control.autonomous_admission_proofs
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();
CREATE TRIGGER autonomous_admission_proofs_append_only
BEFORE UPDATE OR DELETE ON kidults_control.autonomous_admission_proofs
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER autonomous_admission_proofs_truncate_denied
BEFORE TRUNCATE ON kidults_control.autonomous_admission_proofs
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE ALL ON kidults_control.autonomous_admission_proofs FROM PUBLIC;
GRANT USAGE ON SCHEMA kidults_control TO kidults_control_autonomous_admission;
GRANT SELECT, INSERT ON kidults_control.autonomous_admission_proofs
  TO kidults_control_autonomous_admission;
GRANT SELECT ON kidults_control.autonomous_admission_proofs
  TO kidults_control_autonomous_task;
GRANT SELECT (writer_id, database_role, state)
  ON kidults_control.writer_principals TO kidults_control_autonomous_admission;
GRANT EXECUTE ON FUNCTION kidults_control.assert_registered_writer(text)
  TO kidults_control_autonomous_admission;

COMMIT;
