BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_trust_root_lifecycle') THEN
    CREATE ROLE kidults_control_trust_root_lifecycle
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_trust_root_lifecycle'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'KIDULTS_TRUST_ROOT_LIFECYCLE_ROLE_DRIFT' USING ERRCODE = '42501';
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
  WHERE writer_id = 'kpmo-trust-root-lifecycle-writer-v1';
  IF NOT FOUND THEN
    INSERT INTO kidults_control.writer_principals (writer_id, database_role, state, purpose, owner)
    VALUES (
      'kpmo-trust-root-lifecycle-writer-v1', 'kidults_control_trust_root_lifecycle', 'ACTIVE',
      'Append-only local synthetic public-key candidate and lifecycle evidence', 'KPMO'
    );
  ELSIF existing_role <> 'kidults_control_trust_root_lifecycle'
    OR existing_state <> 'ACTIVE'
    OR existing_purpose <> 'Append-only local synthetic public-key candidate and lifecycle evidence'
    OR existing_owner <> 'KPMO'
  THEN
    RAISE EXCEPTION 'KIDULTS_TRUST_ROOT_LIFECYCLE_WRITER_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE kidults_control.approval_trust_root_candidates (
  key_id text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('KPMO', 'PROGRAM_OWNER', 'TRACK_A', 'TRACK_Z')),
  algorithm text NOT NULL CHECK (algorithm = 'Ed25519'),
  public_key_pem text NOT NULL,
  key_fingerprint text NOT NULL UNIQUE CHECK (key_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  predecessor_key_id text NULL,
  proposed_at timestamptz NOT NULL,
  candidate_json jsonb NOT NULL CHECK (jsonb_typeof(candidate_json) = 'object'),
  candidate_digest text NOT NULL UNIQUE CHECK (candidate_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (key_id, candidate_digest),
  CHECK (octet_length(key_id) BETWEEN 1 AND 128),
  CHECK (predecessor_key_id IS NULL OR (octet_length(predecessor_key_id) BETWEEN 1 AND 128
    AND predecessor_key_id <> key_id)),
  CHECK (octet_length(public_key_pem) BETWEEN 1 AND 4096),
  CHECK (octet_length(candidate_json::text) <= 16384),
  CHECK (candidate_json ?& ARRAY[
    'contractId','version','state','scope','keyId','role','algorithm','publicKeyPem',
    'keyFingerprint','predecessorKeyId','proposedAt','activationAuthorized',
    'production','publicRelease','g5','candidateDigest'
  ]),
  CHECK ((candidate_json - ARRAY[
    'contractId','version','state','scope','keyId','role','algorithm','publicKeyPem',
    'keyFingerprint','predecessorKeyId','proposedAt','activationAuthorized',
    'production','publicRelease','g5','candidateDigest'
  ]) = '{}'::jsonb),
  CHECK (candidate_json->>'contractId' = 'kidults-approval-trust-root-candidate-v1'),
  CHECK (candidate_json->>'version' = '1.0.0'),
  CHECK (candidate_json->>'state' = 'CANDIDATE_HOLD'),
  CHECK (candidate_json->>'scope' = 'LOCAL_SYNTHETIC_TEST_ONLY'),
  CHECK (candidate_json->>'keyId' = key_id),
  CHECK (candidate_json->>'role' = role),
  CHECK (candidate_json->>'algorithm' = algorithm),
  CHECK (candidate_json->>'publicKeyPem' = public_key_pem),
  CHECK (candidate_json->>'keyFingerprint' = key_fingerprint),
  CHECK ((candidate_json->>'predecessorKeyId') IS NOT DISTINCT FROM predecessor_key_id),
  CHECK ((candidate_json->>'proposedAt')::timestamptz = proposed_at),
  CHECK (candidate_json->>'candidateDigest' = candidate_digest),
  CHECK (candidate_json->'activationAuthorized' = 'false'::jsonb),
  CHECK (candidate_json->>'production' = 'HOLD'),
  CHECK (candidate_json->>'publicRelease' = 'HOLD'),
  CHECK (candidate_json->>'g5' = 'HOLD')
);

CREATE TABLE kidults_control.approval_trust_root_lifecycle_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^trust-root-event:[0-9a-f]{64}$'),
  key_id text NOT NULL,
  candidate_digest text NOT NULL CHECK (candidate_digest ~ '^sha256:[0-9a-f]{64}$'),
  role text NOT NULL CHECK (role IN ('KPMO', 'PROGRAM_OWNER', 'TRACK_A', 'TRACK_Z')),
  operation text NOT NULL CHECK (operation IN ('ACTIVATE_SYNTHETIC_ONLY', 'REVOKE')),
  revision integer NOT NULL CHECK (revision >= 1),
  predecessor_key_id text NULL,
  observed_at timestamptz NOT NULL,
  event_json jsonb NOT NULL CHECK (jsonb_typeof(event_json) = 'object'),
  event_digest text NOT NULL UNIQUE CHECK (event_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (key_id, revision),
  FOREIGN KEY (key_id, candidate_digest)
    REFERENCES kidults_control.approval_trust_root_candidates(key_id, candidate_digest),
  CHECK (octet_length(event_json::text) <= 16384),
  CHECK (event_json ?& ARRAY[
    'contractId','version','state','scope','eventId','keyId','candidateDigest','role',
    'operation','revision','predecessorKeyId','beforeState','afterState','observedAt',
    'activationAuthorized','providerContactExecuted','spendAuthorized','externalEgress',
    'credentialResolution','production','publicRelease','g5','eventDigest'
  ]),
  CHECK ((event_json - ARRAY[
    'contractId','version','state','scope','eventId','keyId','candidateDigest','role',
    'operation','revision','predecessorKeyId','beforeState','afterState','observedAt',
    'activationAuthorized','providerContactExecuted','spendAuthorized','externalEgress',
    'credentialResolution','production','publicRelease','g5','eventDigest'
  ]) = '{}'::jsonb),
  CHECK (event_json->>'contractId' = 'kidults-approval-trust-root-lifecycle-event-v1'),
  CHECK (event_json->>'version' = '1.0.0'),
  CHECK (event_json->>'state' = 'LIFECYCLE_RECORDED_AUTHORITY_NOT_ACTIVATED'),
  CHECK (event_json->>'scope' = 'LOCAL_SYNTHETIC_TEST_ONLY'),
  CHECK (event_json->>'eventId' = event_id),
  CHECK (event_json->>'keyId' = key_id),
  CHECK (event_json->>'candidateDigest' = candidate_digest),
  CHECK (event_json->>'role' = role),
  CHECK (event_json->>'operation' = operation),
  CHECK (event_json->>'beforeState' IN ('CANDIDATE_HOLD', 'ACTIVE_SYNTHETIC_ONLY')),
  CHECK (event_json->>'afterState' = CASE operation
    WHEN 'REVOKE' THEN 'REVOKED' ELSE 'ACTIVE_SYNTHETIC_ONLY' END),
  CHECK ((event_json->>'revision')::integer = revision),
  CHECK ((event_json->>'predecessorKeyId') IS NOT DISTINCT FROM predecessor_key_id),
  CHECK ((event_json->>'observedAt')::timestamptz = observed_at),
  CHECK (event_json->>'eventDigest' = event_digest),
  CHECK (event_json->'activationAuthorized' = 'false'::jsonb),
  CHECK (event_json->'providerContactExecuted' = 'false'::jsonb),
  CHECK (event_json->'spendAuthorized' = 'false'::jsonb),
  CHECK (event_json->'externalEgress' = 'false'::jsonb),
  CHECK (event_json->'credentialResolution' = 'false'::jsonb),
  CHECK (event_json->>'production' = 'HOLD'),
  CHECK (event_json->>'publicRelease' = 'HOLD'),
  CHECK (event_json->>'g5' = 'HOLD')
);

CREATE TRIGGER approval_trust_root_candidates_writer_guard
BEFORE INSERT ON kidults_control.approval_trust_root_candidates
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();
CREATE TRIGGER approval_trust_root_candidates_append_only
BEFORE UPDATE OR DELETE ON kidults_control.approval_trust_root_candidates
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER approval_trust_root_candidates_truncate_denied
BEFORE TRUNCATE ON kidults_control.approval_trust_root_candidates
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER approval_trust_root_lifecycle_events_writer_guard
BEFORE INSERT ON kidults_control.approval_trust_root_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();
CREATE TRIGGER approval_trust_root_lifecycle_events_append_only
BEFORE UPDATE OR DELETE ON kidults_control.approval_trust_root_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER approval_trust_root_lifecycle_events_truncate_denied
BEFORE TRUNCATE ON kidults_control.approval_trust_root_lifecycle_events
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE ALL ON kidults_control.approval_trust_root_candidates FROM PUBLIC;
REVOKE ALL ON kidults_control.approval_trust_root_lifecycle_events FROM PUBLIC;
GRANT USAGE ON SCHEMA kidults_control TO kidults_control_trust_root_lifecycle;
GRANT SELECT, INSERT ON kidults_control.approval_trust_root_candidates
  TO kidults_control_trust_root_lifecycle;
GRANT SELECT, INSERT ON kidults_control.approval_trust_root_lifecycle_events
  TO kidults_control_trust_root_lifecycle;
GRANT SELECT (writer_id, database_role, state)
  ON kidults_control.writer_principals TO kidults_control_trust_root_lifecycle;
GRANT EXECUTE ON FUNCTION kidults_control.assert_registered_writer(text)
  TO kidults_control_trust_root_lifecycle;

COMMIT;
