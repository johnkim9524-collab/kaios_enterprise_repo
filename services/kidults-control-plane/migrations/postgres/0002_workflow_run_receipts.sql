BEGIN;

-- Workflow receipts are repository-scoped operational evidence, not tenant
-- product data. Keep them in the canonical PostgreSQL control plane without
-- weakening the tenant RLS boundaries on customer-facing tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'kidults_control_workflow_receipt'
  ) THEN
    CREATE ROLE kidults_control_workflow_receipt
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'kidults_control_workflow_receipt'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'KIDULTS_WORKFLOW_RECEIPT_ROLE_DRIFT' USING ERRCODE = '42501';
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
  WHERE writer_id = 'kpmo-workflow-receipt-writer-v1';

  IF NOT FOUND THEN
    INSERT INTO kidults_control.writer_principals (
      writer_id, database_role, state, purpose, owner
    ) VALUES (
      'kpmo-workflow-receipt-writer-v1',
      'kidults_control_workflow_receipt',
      'ACTIVE',
      'Append-only GitHub Actions workflow receipt ledger',
      'KPMO_TRACK_D'
    );
  ELSIF existing_role <> 'kidults_control_workflow_receipt'
    OR existing_state <> 'ACTIVE'
    OR existing_purpose <> 'Append-only GitHub Actions workflow receipt ledger'
    OR existing_owner <> 'KPMO_TRACK_D'
  THEN
    RAISE EXCEPTION 'KIDULTS_WORKFLOW_RECEIPT_WRITER_DRIFT' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- This is an immutable, first-writer canonical identity anchor. It is a
-- readiness surface for a separately activated classifier/finalizer, not a
-- claim that remote deduplication or failed-leader takeover is active.
CREATE TABLE kidults_control.workflow_canonical_run_claims (
  canonical_claim_id uuid PRIMARY KEY,
  repository text NOT NULL,
  consumer_workflow_id text NOT NULL,
  source_sha text NOT NULL CHECK (source_sha ~ '^[0-9a-f]{40}$'),
  upstream_class text NOT NULL,
  generation_discriminator text NOT NULL,
  classifier_contract_digest text NOT NULL CHECK (classifier_contract_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonical_input_digest text NOT NULL CHECK (canonical_input_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonical_input_digest_state text NOT NULL,
  special_exact_artifact_class boolean NOT NULL,
  upstream_binding_digest text CHECK (upstream_binding_digest IS NULL OR upstream_binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  source_receipt_digest text CHECK (source_receipt_digest IS NULL OR source_receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  dedupe_eligible boolean NOT NULL CHECK (dedupe_eligible),
  leader_workflow_path text NOT NULL,
  leader_workflow_run_id bigint NOT NULL CHECK (leader_workflow_run_id > 0),
  leader_workflow_run_attempt integer NOT NULL CHECK (leader_workflow_run_attempt > 0),
  leader_claim_binding_digest text NOT NULL UNIQUE CHECK (leader_claim_binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_canonical_run_claims_key UNIQUE (
    repository, consumer_workflow_id, source_sha, upstream_class,
    generation_discriminator, classifier_contract_digest
  ),
  CONSTRAINT workflow_canonical_run_claims_leader_run UNIQUE (
    repository, consumer_workflow_id, leader_workflow_run_id, leader_workflow_run_attempt
  ),
  CONSTRAINT workflow_canonical_run_claims_alias_fk_target UNIQUE (
    canonical_claim_id, repository, consumer_workflow_id,
    leader_workflow_run_id, leader_workflow_run_attempt,
    leader_claim_binding_digest, canonical_input_digest,
    canonical_input_digest_state, special_exact_artifact_class
  ),
  CHECK (repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  CHECK (consumer_workflow_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'),
  CHECK (upstream_class ~ '^[A-Z][A-Z0-9_]{1,127}$'),
  CHECK (generation_discriminator ~ '^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,254}$'),
  CHECK (leader_workflow_path ~ '^\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml$'),
  CHECK (
    (
      upstream_class IN ('ASI_REQUIREMENT_COVERAGE', 'ASI_SHARDED_SOURCE_RESERVE', 'ASI_SHADOW_OPERATING_EVIDENCE')
      AND special_exact_artifact_class
      AND canonical_input_digest_state = 'VERIFIED_EXACT_ARTIFACT_INPUT'
      AND upstream_binding_digest IS NOT NULL
      AND source_receipt_digest IS NOT NULL
    )
    OR
    (
      upstream_class NOT IN ('ASI_REQUIREMENT_COVERAGE', 'ASI_SHARDED_SOURCE_RESERVE', 'ASI_SHADOW_OPERATING_EVIDENCE')
      AND NOT special_exact_artifact_class
      AND canonical_input_digest_state = 'VERIFIED_GROUPED_SEMANTIC_INPUT'
    )
  )
);

CREATE TABLE kidults_control.workflow_canonical_run_aliases (
  canonical_alias_id uuid PRIMARY KEY,
  canonical_claim_id uuid NOT NULL,
  repository text NOT NULL,
  consumer_workflow_id text NOT NULL,
  leader_workflow_run_id bigint NOT NULL CHECK (leader_workflow_run_id > 0),
  leader_workflow_run_attempt integer NOT NULL CHECK (leader_workflow_run_attempt > 0),
  leader_claim_binding_digest text NOT NULL CHECK (leader_claim_binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonical_input_digest text NOT NULL CHECK (canonical_input_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonical_input_digest_state text NOT NULL,
  special_exact_artifact_class boolean NOT NULL,
  upstream_binding_digest text CHECK (upstream_binding_digest IS NULL OR upstream_binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  source_receipt_digest text CHECK (source_receipt_digest IS NULL OR source_receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  alias_workflow_path text NOT NULL,
  alias_workflow_run_id bigint NOT NULL CHECK (alias_workflow_run_id > 0),
  alias_workflow_run_attempt integer NOT NULL CHECK (alias_workflow_run_attempt > 0),
  alias_binding_digest text NOT NULL UNIQUE CHECK (alias_binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_canonical_run_aliases_claim_fk FOREIGN KEY (
    canonical_claim_id, repository, consumer_workflow_id,
    leader_workflow_run_id, leader_workflow_run_attempt,
    leader_claim_binding_digest, canonical_input_digest,
    canonical_input_digest_state, special_exact_artifact_class
  ) REFERENCES kidults_control.workflow_canonical_run_claims (
    canonical_claim_id, repository, consumer_workflow_id,
    leader_workflow_run_id, leader_workflow_run_attempt,
    leader_claim_binding_digest, canonical_input_digest,
    canonical_input_digest_state, special_exact_artifact_class
  ) ON DELETE RESTRICT,
  CONSTRAINT workflow_canonical_run_aliases_run_key UNIQUE (
    repository, consumer_workflow_id, alias_workflow_run_id, alias_workflow_run_attempt
  ),
  CHECK (alias_workflow_path ~ '^\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml$'),
  CHECK (canonical_input_digest_state IN ('VERIFIED_GROUPED_SEMANTIC_INPUT', 'VERIFIED_EXACT_ARTIFACT_INPUT')),
  CHECK (
    NOT special_exact_artifact_class
    OR (upstream_binding_digest IS NOT NULL AND source_receipt_digest IS NOT NULL)
  ),
  CHECK (
    alias_workflow_run_id <> leader_workflow_run_id
    OR alias_workflow_run_attempt <> leader_workflow_run_attempt
  )
);

CREATE TABLE kidults_control.workflow_run_receipts (
  workflow_receipt_id uuid PRIMARY KEY,
  repository text NOT NULL,
  workflow_path text NOT NULL,
  workflow_name text NOT NULL,
  workflow_run_id bigint NOT NULL CHECK (workflow_run_id > 0),
  workflow_run_attempt integer NOT NULL CHECK (workflow_run_attempt > 0),
  event_name text NOT NULL,
  head_branch text NOT NULL,
  head_sha text NOT NULL CHECK (head_sha ~ '^[0-9a-f]{40}$'),
  workflow_conclusion text NOT NULL CHECK (
    workflow_conclusion IN ('success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale')
  ),
  canonical_job_conclusion text NOT NULL CHECK (
    canonical_job_conclusion IN ('success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale')
  ),
  receipt_type text NOT NULL,
  receipt_schema_version text NOT NULL,
  source_receipt_digest text NOT NULL CHECK (source_receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonical_claim_id uuid REFERENCES kidults_control.workflow_canonical_run_claims(canonical_claim_id),
  canonical_relation text CHECK (canonical_relation IS NULL OR canonical_relation IN ('LEADER', 'ALIAS')),
  canonical_binding_digest text CHECK (canonical_binding_digest IS NULL OR canonical_binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  artifact_name text,
  artifact_id bigint CHECK (artifact_id IS NULL OR artifact_id > 0),
  artifact_digest text CHECK (artifact_digest IS NULL OR artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  artifact_expires_at timestamptz,
  result_state text NOT NULL,
  result_json jsonb NOT NULL,
  result_digest text NOT NULL CHECK (result_digest ~ '^sha256:[0-9a-f]{64}$'),
  binding_digest text NOT NULL UNIQUE CHECK (binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (repository, workflow_run_id, workflow_run_attempt, receipt_type),
  CHECK (repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  CHECK (workflow_path ~ '^\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml$'),
  CHECK (length(workflow_name) BETWEEN 1 AND 255),
  CHECK (event_name ~ '^[a-z][a-z0-9_]{0,63}$'),
  CHECK (length(head_branch) BETWEEN 1 AND 255),
  CHECK (receipt_type ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CHECK (receipt_schema_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  CHECK (length(result_state) BETWEEN 1 AND 160),
  CHECK (jsonb_typeof(result_json) = 'object'),
  CHECK (octet_length(result_json::text) <= 262144),
  CHECK (
    (canonical_claim_id IS NULL AND canonical_relation IS NULL AND canonical_binding_digest IS NULL)
    OR
    (canonical_claim_id IS NOT NULL AND canonical_relation IS NOT NULL AND canonical_binding_digest IS NOT NULL)
  ),
  CHECK (
    (artifact_name IS NULL AND artifact_id IS NULL AND artifact_digest IS NULL AND artifact_expires_at IS NULL)
    OR
    (artifact_name IS NOT NULL AND artifact_id IS NOT NULL AND artifact_digest IS NOT NULL AND artifact_expires_at IS NOT NULL)
  ),
  CHECK (canonical_job_conclusion <> 'success' OR artifact_id IS NOT NULL),
  CHECK (artifact_expires_at IS NULL OR artifact_expires_at > observed_at)
);

CREATE FUNCTION kidults_control.enforce_workflow_receipt_canonical_relation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, kidults_control
AS $$
BEGIN
  IF NEW.canonical_relation IS NULL THEN
    IF NEW.canonical_claim_id IS NOT NULL OR NEW.canonical_binding_digest IS NOT NULL THEN
      RAISE EXCEPTION 'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_BINDING_PARTIAL' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.canonical_relation = 'LEADER' THEN
    PERFORM 1
    FROM kidults_control.workflow_canonical_run_claims c
    WHERE c.canonical_claim_id = NEW.canonical_claim_id
      AND c.repository = NEW.repository
      AND c.leader_workflow_path = NEW.workflow_path
      AND c.leader_workflow_run_id = NEW.workflow_run_id
      AND c.leader_workflow_run_attempt = NEW.workflow_run_attempt
      AND c.leader_claim_binding_digest = NEW.canonical_binding_digest;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_LEADER_BINDING_INVALID' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.canonical_relation = 'ALIAS' THEN
    PERFORM 1
    FROM kidults_control.workflow_canonical_run_aliases a
    JOIN kidults_control.workflow_canonical_run_claims c
      ON c.canonical_claim_id = a.canonical_claim_id
    WHERE a.canonical_claim_id = NEW.canonical_claim_id
      AND a.repository = NEW.repository
      AND c.repository = NEW.repository
      AND a.alias_workflow_path = NEW.workflow_path
      AND a.alias_workflow_run_id = NEW.workflow_run_id
      AND a.alias_workflow_run_attempt = NEW.workflow_run_attempt
      AND a.alias_binding_digest = NEW.canonical_binding_digest;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_ALIAS_BINDING_INVALID' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_RELATION_INVALID' USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION kidults_control.enforce_workflow_receipt_canonical_relation() FROM PUBLIC;

CREATE TRIGGER workflow_canonical_run_claims_writer_guard
BEFORE INSERT OR UPDATE ON kidults_control.workflow_canonical_run_claims
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

CREATE TRIGGER workflow_canonical_run_claims_append_only
BEFORE UPDATE OR DELETE ON kidults_control.workflow_canonical_run_claims
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER workflow_canonical_run_claims_truncate_denied
BEFORE TRUNCATE ON kidults_control.workflow_canonical_run_claims
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER workflow_canonical_run_aliases_writer_guard
BEFORE INSERT OR UPDATE ON kidults_control.workflow_canonical_run_aliases
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

CREATE TRIGGER workflow_canonical_run_aliases_append_only
BEFORE UPDATE OR DELETE ON kidults_control.workflow_canonical_run_aliases
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER workflow_canonical_run_aliases_truncate_denied
BEFORE TRUNCATE ON kidults_control.workflow_canonical_run_aliases
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER workflow_run_receipts_writer_guard
BEFORE INSERT OR UPDATE ON kidults_control.workflow_run_receipts
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

CREATE TRIGGER workflow_run_receipts_writer_relation_guard
BEFORE INSERT OR UPDATE ON kidults_control.workflow_run_receipts
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_workflow_receipt_canonical_relation();

CREATE TRIGGER workflow_run_receipts_append_only
BEFORE UPDATE OR DELETE ON kidults_control.workflow_run_receipts
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER workflow_run_receipts_truncate_denied
BEFORE TRUNCATE ON kidults_control.workflow_run_receipts
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE INDEX workflow_run_receipts_workflow_time_idx
  ON kidults_control.workflow_run_receipts (repository, workflow_path, observed_at DESC);
CREATE INDEX workflow_run_receipts_source_sha_idx
  ON kidults_control.workflow_run_receipts (head_sha, observed_at DESC);
CREATE INDEX workflow_run_receipts_canonical_claim_idx
  ON kidults_control.workflow_run_receipts (canonical_claim_id, recorded_at DESC)
  WHERE canonical_claim_id IS NOT NULL;
CREATE INDEX workflow_canonical_run_aliases_claim_time_idx
  ON kidults_control.workflow_canonical_run_aliases (canonical_claim_id, recorded_at DESC);

REVOKE ALL ON kidults_control.workflow_canonical_run_claims FROM PUBLIC;
REVOKE ALL ON kidults_control.workflow_canonical_run_aliases FROM PUBLIC;
REVOKE ALL ON kidults_control.workflow_run_receipts FROM PUBLIC;
GRANT USAGE ON SCHEMA kidults_control TO kidults_control_workflow_receipt;
GRANT SELECT, INSERT ON kidults_control.workflow_canonical_run_claims TO kidults_control_workflow_receipt;
GRANT SELECT, INSERT ON kidults_control.workflow_canonical_run_aliases TO kidults_control_workflow_receipt;
GRANT SELECT, INSERT ON kidults_control.workflow_run_receipts TO kidults_control_workflow_receipt;

-- assert_registered_writer is SECURITY INVOKER. Every governed writer needs
-- only the three non-secret registry columns referenced by that guard.
GRANT SELECT (writer_id, database_role, state)
  ON kidults_control.writer_principals TO
  kidults_control_command, kidults_control_supply, kidults_control_audit,
  kidults_control_projector, kidults_control_workflow_receipt;
GRANT EXECUTE ON FUNCTION kidults_control.assert_registered_writer(text) TO
  kidults_control_command, kidults_control_supply, kidults_control_audit,
  kidults_control_projector, kidults_control_workflow_receipt;

COMMIT;
