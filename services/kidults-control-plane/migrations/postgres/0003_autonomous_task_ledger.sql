BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_autonomous_task') THEN
    CREATE ROLE kidults_control_autonomous_task
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_autonomous_task'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'KIDULTS_AUTONOMOUS_TASK_ROLE_DRIFT' USING ERRCODE = '42501';
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
  WHERE writer_id = 'kpmo-autonomous-task-writer-v1';

  IF NOT FOUND THEN
    INSERT INTO kidults_control.writer_principals (writer_id, database_role, state, purpose, owner)
    VALUES (
      'kpmo-autonomous-task-writer-v1', 'kidults_control_autonomous_task', 'ACTIVE',
      'Append-only autonomous task snapshot and transition ledger', 'KPMO_TRACK_D'
    );
  ELSIF existing_role <> 'kidults_control_autonomous_task'
    OR existing_state <> 'ACTIVE'
    OR existing_purpose <> 'Append-only autonomous task snapshot and transition ledger'
    OR existing_owner <> 'KPMO_TRACK_D'
  THEN
    RAISE EXCEPTION 'KIDULTS_AUTONOMOUS_TASK_WRITER_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE kidults_control.autonomous_task_snapshots (
  task_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 0),
  state text NOT NULL CHECK (state IN (
    'PENDING', 'LEASED', 'RUNNING', 'RETRY_SCHEDULED',
    'SUCCEEDED', 'FAILED', 'CANCELLED', 'QUARANTINED'
  )),
  attempt integer NOT NULL CHECK (attempt >= 0),
  lease_owner text,
  lease_epoch integer NOT NULL CHECK (lease_epoch >= 0),
  task_json jsonb NOT NULL CHECK (jsonb_typeof(task_json) = 'object'),
  task_digest text NOT NULL CHECK (task_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (task_id, revision),
  UNIQUE (task_id, revision, task_digest),
  UNIQUE (task_id, revision, task_digest, state),
  UNIQUE (task_digest),
  CHECK (task_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CHECK (lease_owner IS NULL OR lease_owner ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CHECK (octet_length(task_json::text) <= 65536),
  CHECK (task_json ?& ARRAY[
    'contractId', 'version', 'taskId', 'workflowType', 'state', 'revision', 'attempt',
    'maxAttempts', 'priority', 'availableAt', 'leaseOwner', 'leaseEpoch',
    'leaseExpiresAt', 'checkpointDigest', 'admissionRequestDigest', 'lastReason',
    'createdAt', 'updatedAt'
  ]),
  CHECK ((task_json - ARRAY[
    'contractId', 'version', 'taskId', 'workflowType', 'state', 'revision', 'attempt',
    'maxAttempts', 'priority', 'availableAt', 'leaseOwner', 'leaseEpoch',
    'leaseExpiresAt', 'checkpointDigest', 'admissionRequestDigest', 'lastReason',
    'createdAt', 'updatedAt'
  ]) = '{}'::jsonb),
  CHECK ((state IN ('LEASED', 'RUNNING')) = (lease_owner IS NOT NULL)),
  CHECK (task_json->>'contractId' = 'kidults-autonomous-task-v1'),
  CHECK (task_json->>'version' = '1.0.0'),
  CHECK (task_json->>'taskId' = task_id),
  CHECK (task_json->>'state' = state),
  CHECK ((task_json->>'revision')::integer = revision),
  CHECK ((task_json->>'attempt')::integer = attempt),
  CHECK ((task_json->>'leaseEpoch')::integer = lease_epoch),
  CHECK (
    (lease_owner IS NULL AND task_json->'leaseOwner' = 'null'::jsonb)
    OR task_json->>'leaseOwner' = lease_owner
  )
);

CREATE INDEX autonomous_task_snapshots_latest_idx
  ON kidults_control.autonomous_task_snapshots (task_id, revision DESC);

CREATE TABLE kidults_control.autonomous_task_transitions (
  receipt_id text PRIMARY KEY,
  task_id text NOT NULL,
  from_revision integer NOT NULL CHECK (from_revision >= 0),
  to_revision integer NOT NULL CHECK (to_revision = from_revision + 1),
  transition text NOT NULL,
  from_state text NOT NULL CHECK (from_state IN (
    'PENDING', 'LEASED', 'RUNNING', 'RETRY_SCHEDULED',
    'SUCCEEDED', 'FAILED', 'CANCELLED', 'QUARANTINED'
  )),
  to_state text NOT NULL CHECK (to_state IN (
    'PENDING', 'LEASED', 'RUNNING', 'RETRY_SCHEDULED',
    'SUCCEEDED', 'FAILED', 'CANCELLED', 'QUARANTINED'
  )),
  before_digest text NOT NULL CHECK (before_digest ~ '^sha256:[0-9a-f]{64}$'),
  after_digest text NOT NULL CHECK (after_digest ~ '^sha256:[0-9a-f]{64}$'),
  worker_id text,
  lease_epoch integer NOT NULL CHECK (lease_epoch >= 0),
  reason text NOT NULL,
  observed_at timestamptz NOT NULL,
  receipt_json jsonb NOT NULL CHECK (jsonb_typeof(receipt_json) = 'object'),
  receipt_digest text NOT NULL UNIQUE CHECK (receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (task_id, to_revision),
  FOREIGN KEY (task_id, from_revision, before_digest, from_state)
    REFERENCES kidults_control.autonomous_task_snapshots (task_id, revision, task_digest, state) ON DELETE RESTRICT,
  FOREIGN KEY (task_id, to_revision, after_digest, to_state)
    REFERENCES kidults_control.autonomous_task_snapshots (task_id, revision, task_digest, state) ON DELETE RESTRICT,
  CHECK (receipt_id ~ '^task-transition:[0-9a-f]{64}$'),
  CHECK (task_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CHECK (transition ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  CHECK (worker_id IS NULL OR worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CHECK (reason ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CHECK (octet_length(receipt_json::text) <= 65536),
  CHECK (receipt_json ?& ARRAY[
    'contractId', 'version', 'taskId', 'transition', 'fromState', 'toState',
    'fromRevision', 'toRevision', 'beforeDigest', 'afterDigest', 'workerId',
    'leaseEpoch', 'reason', 'observedAt', 'externalEgress', 'production',
    'publicRelease', 'g5', 'receiptId', 'receiptDigest'
  ]),
  CHECK ((receipt_json - ARRAY[
    'contractId', 'version', 'taskId', 'transition', 'fromState', 'toState',
    'fromRevision', 'toRevision', 'beforeDigest', 'afterDigest', 'workerId',
    'leaseEpoch', 'reason', 'observedAt', 'externalEgress', 'production',
    'publicRelease', 'g5', 'receiptId', 'receiptDigest'
  ]) = '{}'::jsonb),
  CHECK (receipt_json->>'contractId' = 'kidults-autonomous-task-transition-receipt-v1'),
  CHECK (receipt_json->>'version' = '1.0.0'),
  CHECK (receipt_json->>'receiptId' = receipt_id),
  CHECK (receipt_json->>'taskId' = task_id),
  CHECK ((receipt_json->>'fromRevision')::integer = from_revision),
  CHECK ((receipt_json->>'toRevision')::integer = to_revision),
  CHECK (receipt_json->>'transition' = transition),
  CHECK (receipt_json->>'fromState' = from_state),
  CHECK (receipt_json->>'toState' = to_state),
  CHECK (receipt_json->>'beforeDigest' = before_digest),
  CHECK (receipt_json->>'afterDigest' = after_digest),
  CHECK ((receipt_json->>'leaseEpoch')::integer = lease_epoch),
  CHECK (receipt_json->>'reason' = reason),
  CHECK ((receipt_json->>'observedAt')::timestamptz = observed_at),
  CHECK (receipt_json->>'receiptDigest' = receipt_digest),
  CHECK (receipt_json->'externalEgress' = 'false'::jsonb),
  CHECK (receipt_json->>'production' = 'HOLD'),
  CHECK (receipt_json->>'publicRelease' = 'HOLD'),
  CHECK (receipt_json->>'g5' = 'HOLD'),
  CHECK (
    (worker_id IS NULL AND receipt_json->'workerId' = 'null'::jsonb)
    OR receipt_json->>'workerId' = worker_id
  )
);

CREATE TRIGGER autonomous_task_snapshots_writer_guard
BEFORE INSERT ON kidults_control.autonomous_task_snapshots
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

CREATE TRIGGER autonomous_task_transitions_writer_guard
BEFORE INSERT ON kidults_control.autonomous_task_transitions
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

CREATE TRIGGER autonomous_task_snapshots_append_only
BEFORE UPDATE OR DELETE ON kidults_control.autonomous_task_snapshots
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER autonomous_task_snapshots_truncate_denied
BEFORE TRUNCATE ON kidults_control.autonomous_task_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER autonomous_task_transitions_append_only
BEFORE UPDATE OR DELETE ON kidults_control.autonomous_task_transitions
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
CREATE TRIGGER autonomous_task_transitions_truncate_denied
BEFORE TRUNCATE ON kidults_control.autonomous_task_transitions
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE ALL ON kidults_control.autonomous_task_snapshots FROM PUBLIC;
REVOKE ALL ON kidults_control.autonomous_task_transitions FROM PUBLIC;
GRANT USAGE ON SCHEMA kidults_control TO kidults_control_autonomous_task;
GRANT SELECT, INSERT ON kidults_control.autonomous_task_snapshots TO kidults_control_autonomous_task;
GRANT SELECT, INSERT ON kidults_control.autonomous_task_transitions TO kidults_control_autonomous_task;
GRANT SELECT (writer_id, database_role, state)
  ON kidults_control.writer_principals TO kidults_control_autonomous_task;
GRANT EXECUTE ON FUNCTION kidults_control.assert_registered_writer(text)
  TO kidults_control_autonomous_task;

COMMIT;
