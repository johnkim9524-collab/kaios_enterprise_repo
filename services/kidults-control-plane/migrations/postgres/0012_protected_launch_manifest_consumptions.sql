BEGIN;

CREATE TABLE kidults_control.protected_launch_manifest_consumptions (
  manifest_digest text PRIMARY KEY CHECK (manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  source_sha text NOT NULL CHECK (source_sha ~ '^[0-9a-f]{40}$'),
  request_id text NOT NULL,
  consumed_at timestamptz NOT NULL,
  manifest_json jsonb NOT NULL CHECK (jsonb_typeof(manifest_json) = 'object'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (octet_length(manifest_json::text) <= 262144),
  CHECK (manifest_json->>'manifestDigest' = manifest_digest),
  CHECK (manifest_json->>'sourceSha' = source_sha),
  CHECK (manifest_json->'request'->>'requestId' = request_id),
  CHECK (manifest_json->>'automaticTrigger' = 'NOT_REGISTERED_HOLD'),
  CHECK (manifest_json->>'production' = 'HOLD'),
  CHECK (manifest_json->>'publicRelease' = 'HOLD'),
  CHECK (manifest_json->>'g5' = 'HOLD')
);

CREATE TRIGGER protected_launch_manifest_consumptions_writer_guard
BEFORE INSERT ON kidults_control.protected_launch_manifest_consumptions
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

CREATE TRIGGER protected_launch_manifest_consumptions_append_only
BEFORE UPDATE OR DELETE ON kidults_control.protected_launch_manifest_consumptions
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER protected_launch_manifest_consumptions_truncate_denied
BEFORE TRUNCATE ON kidults_control.protected_launch_manifest_consumptions
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE ALL ON kidults_control.protected_launch_manifest_consumptions FROM PUBLIC;
GRANT SELECT, INSERT ON kidults_control.protected_launch_manifest_consumptions
  TO kidults_control_autonomous_invocation;

COMMIT;
