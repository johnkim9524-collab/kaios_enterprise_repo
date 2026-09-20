BEGIN;

CREATE TABLE kidults_control.autonomous_containment_fence_events (
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  fence_digest text PRIMARY KEY CHECK (fence_digest ~ '^sha256:[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action IN ('QUARANTINE', 'STOP', 'RELEASE')),
  source_evidence_digest text NOT NULL CHECK (source_evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  action_package_digest text NOT NULL CHECK (action_package_digest ~ '^sha256:[0-9a-f]{64}$'),
  approval_receipt_digest text NOT NULL CHECK (approval_receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  previous_fence_digest text REFERENCES kidults_control.autonomous_containment_fence_events(fence_digest)
    CHECK (previous_fence_digest ~ '^sha256:[0-9a-f]{64}$'),
  fence_json jsonb NOT NULL CHECK (jsonb_typeof(fence_json) = 'object'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (octet_length(fence_json::text) <= 65536),
  CHECK (fence_json ?& ARRAY[
    'contractId','version','state','action','sourceEvidenceDigest','actionPackageDigest',
    'approvalReceiptDigest','previousFenceDigest','allowInvocation','automaticActionTaken','mutationAllowed',
    'production','publicRelease','g5','fenceDigest'
  ]),
  CHECK ((fence_json - ARRAY[
    'contractId','version','state','action','sourceEvidenceDigest','actionPackageDigest',
    'approvalReceiptDigest','previousFenceDigest','allowInvocation','automaticActionTaken','mutationAllowed',
    'production','publicRelease','g5','fenceDigest'
  ]) = '{}'::jsonb),
  CHECK (fence_json->>'state' IN ('APPROVED_CONTAINMENT_FENCE_ACTIVE', 'APPROVED_CONTAINMENT_RELEASED')),
  CHECK (fence_json->>'action' = action),
  CHECK (fence_json->>'sourceEvidenceDigest' = source_evidence_digest),
  CHECK (fence_json->>'actionPackageDigest' = action_package_digest),
  CHECK (fence_json->>'approvalReceiptDigest' = approval_receipt_digest),
  CHECK (fence_json->>'previousFenceDigest' IS NOT DISTINCT FROM previous_fence_digest),
  CHECK (fence_json->>'fenceDigest' = fence_digest),
  CHECK ((action = 'RELEASE' AND fence_json->'allowInvocation' = 'true'::jsonb
      AND previous_fence_digest IS NOT NULL AND source_evidence_digest = previous_fence_digest)
    OR (action IN ('QUARANTINE', 'STOP') AND fence_json->'allowInvocation' = 'false'::jsonb
      AND previous_fence_digest IS NULL)),
  CHECK (fence_json->'automaticActionTaken' = 'false'::jsonb),
  CHECK (fence_json->'mutationAllowed' = 'false'::jsonb),
  CHECK (fence_json->>'production' = 'HOLD'),
  CHECK (fence_json->>'publicRelease' = 'HOLD'),
  CHECK (fence_json->>'g5' = 'HOLD')
);

CREATE TRIGGER autonomous_containment_fence_events_writer_guard
BEFORE INSERT ON kidults_control.autonomous_containment_fence_events
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

CREATE TRIGGER autonomous_containment_fence_events_append_only
BEFORE UPDATE OR DELETE ON kidults_control.autonomous_containment_fence_events
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER autonomous_containment_fence_events_truncate_denied
BEFORE TRUNCATE ON kidults_control.autonomous_containment_fence_events
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE ALL ON kidults_control.autonomous_containment_fence_events FROM PUBLIC;
GRANT SELECT, INSERT ON kidults_control.autonomous_containment_fence_events
  TO kidults_control_approval_consumer;
GRANT USAGE, SELECT ON SEQUENCE
  kidults_control.autonomous_containment_fence_events_event_sequence_seq
  TO kidults_control_approval_consumer;

COMMIT;
