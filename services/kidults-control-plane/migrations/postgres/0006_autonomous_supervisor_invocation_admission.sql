BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_autonomous_invocation') THEN
    CREATE ROLE kidults_control_autonomous_invocation
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_autonomous_invocation'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'KIDULTS_AUTONOMOUS_INVOCATION_ROLE_DRIFT' USING ERRCODE = '42501';
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
  WHERE writer_id = 'kpmo-autonomous-invocation-writer-v1';
  IF NOT FOUND THEN
    INSERT INTO kidults_control.writer_principals (writer_id, database_role, state, purpose, owner)
    VALUES (
      'kpmo-autonomous-invocation-writer-v1', 'kidults_control_autonomous_invocation', 'ACTIVE',
      'Append-only local synthetic supervisor invocation admission', 'KPMO'
    );
  ELSIF existing_role <> 'kidults_control_autonomous_invocation'
    OR existing_state <> 'ACTIVE'
    OR existing_purpose <> 'Append-only local synthetic supervisor invocation admission'
    OR existing_owner <> 'KPMO'
  THEN
    RAISE EXCEPTION 'KIDULTS_AUTONOMOUS_INVOCATION_WRITER_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE kidults_control.autonomous_supervisor_invocation_requests (
  command_id text PRIMARY KEY CHECK (command_id ~ '^supervisor-command:[A-Za-z0-9._:-]{1,108}$'),
  request_id text NOT NULL UNIQUE CHECK (request_id ~ '^supervisor-request:[0-9a-f]{64}$'),
  request_digest text NOT NULL UNIQUE CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  request_json jsonb NOT NULL CHECK (jsonb_typeof(request_json) = 'object'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (command_id, request_id, request_digest),
  CHECK (octet_length(request_json::text) <= 65536),
  CHECK (request_json ?& ARRAY[
    'contractId','version','commandId','requestedBy','workerId','maxTicks','maxDurationMs',
    'leaseSeconds','timeoutMs','retryDelaySeconds','recoveryDelaySeconds','maxCandidates',
    'handlerRegistryId','controlStateDigest','requestedAt','expiresAt','scope','externalEgress',
    'credentialResolution','production','publicRelease','g5','requestId','requestDigest'
  ]),
  CHECK ((request_json - ARRAY[
    'contractId','version','commandId','requestedBy','workerId','maxTicks','maxDurationMs',
    'leaseSeconds','timeoutMs','retryDelaySeconds','recoveryDelaySeconds','maxCandidates',
    'handlerRegistryId','controlStateDigest','requestedAt','expiresAt','scope','externalEgress',
    'credentialResolution','production','publicRelease','g5','requestId','requestDigest'
  ]) = '{}'::jsonb),
  CHECK (request_json->>'commandId' = command_id),
  CHECK (request_json->>'requestId' = request_id),
  CHECK (request_json->>'requestDigest' = request_digest),
  CHECK ((request_json->>'expiresAt')::timestamptz = expires_at),
  CHECK ((request_json->>'maxTicks')::integer BETWEEN 1 AND 16),
  CHECK ((request_json->>'maxDurationMs')::integer BETWEEN 1 AND 60000),
  CHECK (request_json->>'handlerRegistryId' = 'synthetic-handler-registry-v1'),
  CHECK (request_json->>'scope' = 'LOCAL_SYNTHETIC_SHADOW_ONLY'),
  CHECK (request_json->'externalEgress' = 'false'::jsonb),
  CHECK (request_json->'credentialResolution' = 'false'::jsonb),
  CHECK (request_json->>'production' = 'HOLD'),
  CHECK (request_json->>'publicRelease' = 'HOLD'),
  CHECK (request_json->>'g5' = 'HOLD')
);

CREATE TABLE kidults_control.autonomous_supervisor_invocation_decisions (
  command_id text PRIMARY KEY,
  request_id text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  decision_id text NOT NULL UNIQUE CHECK (decision_id ~ '^supervisor-decision:[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  decision_digest text NOT NULL UNIQUE CHECK (decision_digest ~ '^sha256:[0-9a-f]{64}$'),
  decision_json jsonb NOT NULL CHECK (jsonb_typeof(decision_json) = 'object'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (command_id, decision_id, decision_digest),
  FOREIGN KEY (command_id, request_id, request_digest)
    REFERENCES kidults_control.autonomous_supervisor_invocation_requests
      (command_id, request_id, request_digest),
  CHECK (octet_length(decision_json::text) <= 65536),
  CHECK (decision_json ?& ARRAY[
    'contractId','version','commandId','requestId','requestDigest','decision','reviewerId',
    'reviewerAuthentication','authorityClass','subjectType','subjectId','subjectDigest',
    'requiredReviewerRole','decidedAt','externalEgress','credentialResolution','production',
    'publicRelease','g5','decisionId','decisionDigest'
  ]),
  CHECK ((decision_json - ARRAY[
    'contractId','version','commandId','requestId','requestDigest','decision','reviewerId',
    'reviewerAuthentication','authorityClass','subjectType','subjectId','subjectDigest',
    'requiredReviewerRole','decidedAt','externalEgress','credentialResolution','production',
    'publicRelease','g5','decisionId','decisionDigest'
  ]) = '{}'::jsonb),
  CHECK (decision_json->>'commandId' = command_id),
  CHECK (decision_json->>'requestId' = request_id),
  CHECK (decision_json->>'requestDigest' = request_digest),
  CHECK (decision_json->>'decisionId' = decision_id),
  CHECK (decision_json->>'decisionDigest' = decision_digest),
  CHECK (decision_json->>'decision' = decision),
  CHECK (decision_json->>'reviewerAuthentication' = 'CRYPTOGRAPHIC_APPROVAL_REQUIRED_AT_LAUNCHER'),
  CHECK (decision_json->>'authorityClass' = 'LOCAL_SYNTHETIC_SHADOW'),
  CHECK (decision_json->>'subjectType' = 'SUPERVISOR_INVOCATION'),
  CHECK (decision_json->>'subjectId' = request_id),
  CHECK (decision_json->>'subjectDigest' = request_digest),
  CHECK (decision_json->>'requiredReviewerRole' = 'KPMO'),
  CHECK (decision_json->'externalEgress' = 'false'::jsonb),
  CHECK (decision_json->'credentialResolution' = 'false'::jsonb),
  CHECK (decision_json->>'production' = 'HOLD'),
  CHECK (decision_json->>'publicRelease' = 'HOLD'),
  CHECK (decision_json->>'g5' = 'HOLD')
);

CREATE TABLE kidults_control.autonomous_supervisor_invocation_consumptions (
  command_id text PRIMARY KEY,
  request_id text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  decision_id text NOT NULL,
  decision_digest text NOT NULL CHECK (decision_digest ~ '^sha256:[0-9a-f]{64}$'),
  control_state_digest text NOT NULL CHECK (control_state_digest ~ '^sha256:[0-9a-f]{64}$'),
  consumption_id text NOT NULL UNIQUE CHECK (consumption_id ~ '^supervisor-consumption:[0-9a-f]{64}$'),
  consumed_at timestamptz NOT NULL,
  consumption_json jsonb NOT NULL CHECK (jsonb_typeof(consumption_json) = 'object'),
  receipt_digest text NOT NULL UNIQUE CHECK (receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  FOREIGN KEY (command_id, request_id, request_digest)
    REFERENCES kidults_control.autonomous_supervisor_invocation_requests
      (command_id, request_id, request_digest),
  FOREIGN KEY (command_id, decision_id, decision_digest)
    REFERENCES kidults_control.autonomous_supervisor_invocation_decisions
      (command_id, decision_id, decision_digest),
  CHECK (octet_length(consumption_json::text) <= 65536),
  CHECK (consumption_json ?& ARRAY[
    'contractId','version','commandId','requestId','requestDigest','decisionId',
    'decisionDigest','controlStateDigest','consumedAt','externalEgress','credentialResolution',
    'remoteWorkerActivation','production','publicRelease','g5','consumptionId','receiptDigest'
  ]),
  CHECK ((consumption_json - ARRAY[
    'contractId','version','commandId','requestId','requestDigest','decisionId',
    'decisionDigest','controlStateDigest','consumedAt','externalEgress','credentialResolution',
    'remoteWorkerActivation','production','publicRelease','g5','consumptionId','receiptDigest'
  ]) = '{}'::jsonb),
  CHECK (consumption_json->>'commandId' = command_id),
  CHECK (consumption_json->>'requestId' = request_id),
  CHECK (consumption_json->>'requestDigest' = request_digest),
  CHECK (consumption_json->>'decisionId' = decision_id),
  CHECK (consumption_json->>'decisionDigest' = decision_digest),
  CHECK (consumption_json->>'controlStateDigest' = control_state_digest),
  CHECK (consumption_json->>'consumptionId' = consumption_id),
  CHECK (consumption_json->>'receiptDigest' = receipt_digest),
  CHECK ((consumption_json->>'consumedAt')::timestamptz = consumed_at),
  CHECK (consumption_json->'externalEgress' = 'false'::jsonb),
  CHECK (consumption_json->'credentialResolution' = 'false'::jsonb),
  CHECK (consumption_json->>'remoteWorkerActivation' = 'HOLD'),
  CHECK (consumption_json->>'production' = 'HOLD'),
  CHECK (consumption_json->>'publicRelease' = 'HOLD'),
  CHECK (consumption_json->>'g5' = 'HOLD')
);

CREATE TRIGGER autonomous_supervisor_invocation_requests_writer_guard
BEFORE INSERT ON kidults_control.autonomous_supervisor_invocation_requests
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();
CREATE TRIGGER autonomous_supervisor_invocation_decisions_writer_guard
BEFORE INSERT ON kidults_control.autonomous_supervisor_invocation_decisions
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();
CREATE TRIGGER autonomous_supervisor_invocation_consumptions_writer_guard
BEFORE INSERT ON kidults_control.autonomous_supervisor_invocation_consumptions
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

CREATE TRIGGER autonomous_supervisor_invocation_requests_append_only
BEFORE UPDATE OR DELETE ON kidults_control.autonomous_supervisor_invocation_requests
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER autonomous_supervisor_invocation_decisions_append_only
BEFORE UPDATE OR DELETE ON kidults_control.autonomous_supervisor_invocation_decisions
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER autonomous_supervisor_invocation_consumptions_append_only
BEFORE UPDATE OR DELETE ON kidults_control.autonomous_supervisor_invocation_consumptions
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER autonomous_supervisor_invocation_requests_truncate_denied
BEFORE TRUNCATE ON kidults_control.autonomous_supervisor_invocation_requests
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER autonomous_supervisor_invocation_decisions_truncate_denied
BEFORE TRUNCATE ON kidults_control.autonomous_supervisor_invocation_decisions
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER autonomous_supervisor_invocation_consumptions_truncate_denied
BEFORE TRUNCATE ON kidults_control.autonomous_supervisor_invocation_consumptions
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE ALL ON kidults_control.autonomous_supervisor_invocation_requests FROM PUBLIC;
REVOKE ALL ON kidults_control.autonomous_supervisor_invocation_decisions FROM PUBLIC;
REVOKE ALL ON kidults_control.autonomous_supervisor_invocation_consumptions FROM PUBLIC;
GRANT USAGE ON SCHEMA kidults_control TO kidults_control_autonomous_invocation;
GRANT SELECT, INSERT ON kidults_control.autonomous_supervisor_invocation_requests
  TO kidults_control_autonomous_invocation;
GRANT SELECT, INSERT ON kidults_control.autonomous_supervisor_invocation_decisions
  TO kidults_control_autonomous_invocation;
GRANT SELECT, INSERT ON kidults_control.autonomous_supervisor_invocation_consumptions
  TO kidults_control_autonomous_invocation;
GRANT SELECT (writer_id, database_role, state)
  ON kidults_control.writer_principals TO kidults_control_autonomous_invocation;
GRANT EXECUTE ON FUNCTION kidults_control.assert_registered_writer(text)
  TO kidults_control_autonomous_invocation;

COMMIT;
