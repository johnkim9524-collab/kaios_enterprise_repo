BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_approval_consumer') THEN
    CREATE ROLE kidults_control_approval_consumer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_approval_consumer'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'KIDULTS_APPROVAL_CONSUMER_ROLE_DRIFT' USING ERRCODE = '42501';
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
  WHERE writer_id = 'kpmo-approval-consumption-writer-v1';
  IF NOT FOUND THEN
    INSERT INTO kidults_control.writer_principals (writer_id, database_role, state, purpose, owner)
    VALUES (
      'kpmo-approval-consumption-writer-v1', 'kidults_control_approval_consumer', 'ACTIVE',
      'Append-only cryptographic approval replay prevention without authority activation', 'KPMO'
    );
  ELSIF existing_role <> 'kidults_control_approval_consumer'
    OR existing_state <> 'ACTIVE'
    OR existing_purpose <> 'Append-only cryptographic approval replay prevention without authority activation'
    OR existing_owner <> 'KPMO'
  THEN
    RAISE EXCEPTION 'KIDULTS_APPROVAL_CONSUMPTION_WRITER_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE kidults_control.cryptographic_approval_consumptions (
  envelope_id text PRIMARY KEY CHECK (envelope_id ~ '^approval-envelope:[0-9a-f]{64}$'),
  envelope_digest text NOT NULL UNIQUE CHECK (envelope_digest ~ '^sha256:[0-9a-f]{64}$'),
  nonce_digest text NOT NULL UNIQUE CHECK (nonce_digest ~ '^sha256:[0-9a-f]{64}$'),
  matrix_contract_digest text NOT NULL CHECK (matrix_contract_digest ~ '^sha256:[0-9a-f]{64}$'),
  trust_registry_digest text NOT NULL CHECK (trust_registry_digest ~ '^sha256:[0-9a-f]{64}$'),
  requested_capabilities_digest text NOT NULL
    CHECK (requested_capabilities_digest ~ '^sha256:[0-9a-f]{64}$'),
  authority_class text NOT NULL CHECK (authority_class IN (
    'LOCAL_SYNTHETIC_SHADOW', 'PROVIDER_PREFLIGHT_NO_FETCH', 'PROTECTED_ACTION_PACKAGE'
  )),
  subject_type text NOT NULL CHECK (subject_type IN (
    'SUPERVISOR_INVOCATION', 'PROVIDER_ACTION', 'PROTECTED_ACTION_PACKAGE'
  )),
  subject_id text NOT NULL,
  subject_digest text NOT NULL CHECK (subject_digest ~ '^sha256:[0-9a-f]{64}$'),
  approval_verification_receipt_digest text NOT NULL UNIQUE
    CHECK (approval_verification_receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  consumption_id text NOT NULL UNIQUE CHECK (consumption_id ~ '^approval-consumption:[0-9a-f]{64}$'),
  consumed_at timestamptz NOT NULL,
  consumption_json jsonb NOT NULL CHECK (jsonb_typeof(consumption_json) = 'object'),
  receipt_digest text NOT NULL UNIQUE CHECK (receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (octet_length(subject_id) BETWEEN 1 AND 128),
  CHECK (octet_length(consumption_json::text) <= 65536),
  CHECK (consumption_json ?& ARRAY[
    'contractId','version','state','envelopeId','envelopeDigest','nonceDigest',
    'matrixContractDigest','trustRegistryDigest','requestedCapabilitiesDigest',
    'authorityClass','subjectType','subjectId','subjectDigest',
    'approvalVerificationReceiptDigest','consumedAt','activationAuthorized',
    'providerContactExecuted','spendAuthorized','externalEgress','credentialResolution',
    'production','publicRelease','g5','consumptionId','receiptDigest'
  ]),
  CHECK ((consumption_json - ARRAY[
    'contractId','version','state','envelopeId','envelopeDigest','nonceDigest',
    'matrixContractDigest','trustRegistryDigest','requestedCapabilitiesDigest',
    'authorityClass','subjectType','subjectId','subjectDigest',
    'approvalVerificationReceiptDigest','consumedAt','activationAuthorized',
    'providerContactExecuted','spendAuthorized','externalEgress','credentialResolution',
    'production','publicRelease','g5','consumptionId','receiptDigest'
  ]) = '{}'::jsonb),
  CHECK (consumption_json->>'state' = 'VERIFIED_AND_CONSUMED_AUTHORITY_NOT_ACTIVATED'),
  CHECK (consumption_json->>'envelopeId' = envelope_id),
  CHECK (consumption_json->>'envelopeDigest' = envelope_digest),
  CHECK (consumption_json->>'nonceDigest' = nonce_digest),
  CHECK (consumption_json->>'matrixContractDigest' = matrix_contract_digest),
  CHECK (consumption_json->>'trustRegistryDigest' = trust_registry_digest),
  CHECK (consumption_json->>'requestedCapabilitiesDigest' = requested_capabilities_digest),
  CHECK (consumption_json->>'authorityClass' = authority_class),
  CHECK (consumption_json->>'subjectType' = subject_type),
  CHECK (consumption_json->>'subjectId' = subject_id),
  CHECK (consumption_json->>'subjectDigest' = subject_digest),
  CHECK (consumption_json->>'approvalVerificationReceiptDigest' = approval_verification_receipt_digest),
  CHECK (consumption_json->>'consumptionId' = consumption_id),
  CHECK (consumption_json->>'receiptDigest' = receipt_digest),
  CHECK ((consumption_json->>'consumedAt')::timestamptz = consumed_at),
  CHECK (consumption_json->'activationAuthorized' = 'false'::jsonb),
  CHECK (consumption_json->'providerContactExecuted' = 'false'::jsonb),
  CHECK (consumption_json->'spendAuthorized' = 'false'::jsonb),
  CHECK (consumption_json->'externalEgress' = 'false'::jsonb),
  CHECK (consumption_json->'credentialResolution' = 'false'::jsonb),
  CHECK (consumption_json->>'production' = 'HOLD'),
  CHECK (consumption_json->>'publicRelease' = 'HOLD'),
  CHECK (consumption_json->>'g5' = 'HOLD')
);

CREATE TRIGGER cryptographic_approval_consumptions_writer_guard
BEFORE INSERT ON kidults_control.cryptographic_approval_consumptions
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

CREATE TRIGGER cryptographic_approval_consumptions_append_only
BEFORE UPDATE OR DELETE ON kidults_control.cryptographic_approval_consumptions
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER cryptographic_approval_consumptions_truncate_denied
BEFORE TRUNCATE ON kidults_control.cryptographic_approval_consumptions
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE ALL ON kidults_control.cryptographic_approval_consumptions FROM PUBLIC;
GRANT USAGE ON SCHEMA kidults_control TO kidults_control_approval_consumer;
GRANT SELECT, INSERT ON kidults_control.cryptographic_approval_consumptions
  TO kidults_control_approval_consumer;
GRANT SELECT (writer_id, database_role, state)
  ON kidults_control.writer_principals TO kidults_control_approval_consumer;
GRANT EXECUTE ON FUNCTION kidults_control.assert_registered_writer(text)
  TO kidults_control_approval_consumer;

COMMIT;
