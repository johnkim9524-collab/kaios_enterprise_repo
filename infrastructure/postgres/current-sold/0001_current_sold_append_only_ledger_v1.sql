BEGIN;

CREATE SCHEMA IF NOT EXISTS kidults_private;

CREATE TABLE IF NOT EXISTS kidults_private.current_sold_event_ledger (
    ledger_id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL CHECK (event_id ~ '^cs_[0-9a-f]{24}$'),
    content_digest TEXT NOT NULL CHECK (content_digest ~ '^sha256:[0-9a-f]{64}$'),
    canonical_object_id TEXT NOT NULL CHECK (length(canonical_object_id) > 0),
    source_id TEXT NOT NULL CHECK (length(source_id) > 0),
    source_event_id TEXT NOT NULL CHECK (length(source_event_id) > 0),
    source_sha TEXT NOT NULL CHECK (source_sha ~ '^[0-9a-f]{40}$'),
    canonical_run_id TEXT NOT NULL CHECK (canonical_run_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$'),
    correction_state TEXT NOT NULL CHECK (correction_state IN ('ORIGINAL', 'CORRECTED')),
    supersedes_content_digest TEXT CHECK (supersedes_content_digest IS NULL OR supersedes_content_digest ~ '^sha256:[0-9a-f]{64}$'),
    sold_at TIMESTAMPTZ NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    event_payload JSONB NOT NULL,
    batch_receipt_id TEXT NOT NULL CHECK (batch_receipt_id ~ '^csr_[0-9a-f]{24}$'),
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT current_sold_event_identity_content_uq UNIQUE (event_id, content_digest),
    CONSTRAINT current_sold_event_payload_binding_ck CHECK (
        event_payload->>'event_id' = event_id
        AND event_payload->>'content_digest' = content_digest
        AND event_payload->>'canonical_object_id' = canonical_object_id
        AND event_payload->>'source_id' = source_id
        AND event_payload->>'source_event_id' = source_event_id
        AND event_payload->>'source_sha' = source_sha
        AND event_payload->>'canonical_run_id' = canonical_run_id
        AND event_payload->>'correction_state' = correction_state
        AND COALESCE(event_payload->>'supersedes_content_digest', '') = COALESCE(supersedes_content_digest, '')
    ),
    CONSTRAINT current_sold_event_correction_shape_ck CHECK (
        (correction_state = 'ORIGINAL' AND supersedes_content_digest IS NULL)
        OR
        (correction_state = 'CORRECTED' AND supersedes_content_digest IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS current_sold_event_ledger_source_idx
    ON kidults_private.current_sold_event_ledger (source_id, source_event_id, ledger_id);
CREATE INDEX IF NOT EXISTS current_sold_event_ledger_run_idx
    ON kidults_private.current_sold_event_ledger (canonical_run_id, ledger_id);

CREATE TABLE IF NOT EXISTS kidults_private.current_sold_evidence_ledger (
    ledger_id BIGSERIAL PRIMARY KEY,
    evidence_id TEXT NOT NULL UNIQUE CHECK (evidence_id ~ '^ev_cs_[0-9a-f]{24}$'),
    fact_id TEXT NOT NULL CHECK (fact_id ~ '^evf_cs_[0-9a-f]{24}$'),
    evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
    current_sold_event_id TEXT NOT NULL CHECK (current_sold_event_id ~ '^cs_[0-9a-f]{24}$'),
    current_sold_content_digest TEXT NOT NULL CHECK (current_sold_content_digest ~ '^sha256:[0-9a-f]{64}$'),
    canonical_object_id TEXT NOT NULL CHECK (length(canonical_object_id) > 0),
    source_sha TEXT NOT NULL CHECK (source_sha ~ '^[0-9a-f]{40}$'),
    canonical_run_id TEXT NOT NULL CHECK (canonical_run_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$'),
    evidence_payload JSONB NOT NULL,
    batch_receipt_id TEXT NOT NULL CHECK (batch_receipt_id ~ '^csr_[0-9a-f]{24}$'),
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT current_sold_evidence_payload_binding_ck CHECK (
        evidence_payload->>'evidence_id' = evidence_id
        AND evidence_payload->>'fact_id' = fact_id
        AND evidence_payload->>'canonical_object_id' = canonical_object_id
        AND evidence_payload#>>'{lineage,current_sold_event_id}' = current_sold_event_id
        AND evidence_payload#>>'{lineage,current_sold_content_digest}' = current_sold_content_digest
        AND evidence_payload#>>'{lineage,source_sha}' = source_sha
        AND evidence_payload#>>'{lineage,canonical_run_id}' = canonical_run_id
    ),
    CONSTRAINT current_sold_evidence_event_fk
      FOREIGN KEY (current_sold_event_id, current_sold_content_digest)
      REFERENCES kidults_private.current_sold_event_ledger (event_id, content_digest)
      DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS current_sold_evidence_ledger_object_idx
    ON kidults_private.current_sold_evidence_ledger (canonical_object_id, ledger_id);
CREATE INDEX IF NOT EXISTS current_sold_evidence_ledger_fact_idx
    ON kidults_private.current_sold_evidence_ledger (fact_id, ledger_id);

CREATE TABLE IF NOT EXISTS kidults_private.current_sold_batch_receipt_ledger (
    ledger_id BIGSERIAL PRIMARY KEY,
    receipt_id TEXT NOT NULL UNIQUE CHECK (receipt_id ~ '^csr_[0-9a-f]{24}$'),
    receipt_digest TEXT NOT NULL CHECK (receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
    batch_id TEXT NOT NULL CHECK (length(batch_id) > 0),
    status TEXT NOT NULL CHECK (status = 'PASS'),
    source_sha TEXT NOT NULL CHECK (source_sha ~ '^[0-9a-f]{40}$'),
    canonical_run_id TEXT NOT NULL CHECK (canonical_run_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$'),
    envelope_digest TEXT NOT NULL CHECK (envelope_digest ~ '^sha256:[0-9a-f]{64}$'),
    event_versions_digest TEXT NOT NULL CHECK (event_versions_digest ~ '^sha256:[0-9a-f]{64}$'),
    evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
    receipt_payload JSONB NOT NULL,
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT current_sold_receipt_payload_binding_ck CHECK (
        receipt_payload->>'receipt_id' = receipt_id
        AND receipt_payload->>'batch_id' = batch_id
        AND receipt_payload->>'status' = status
        AND receipt_payload->>'source_sha' = source_sha
        AND receipt_payload->>'canonical_run_id' = canonical_run_id
        AND receipt_payload->>'envelope_digest' = envelope_digest
        AND receipt_payload->>'event_versions_digest' = event_versions_digest
        AND receipt_payload->>'evidence_digest' = evidence_digest
    )
);


CREATE INDEX IF NOT EXISTS current_sold_batch_receipt_run_idx
    ON kidults_private.current_sold_batch_receipt_ledger (canonical_run_id, ledger_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'current_sold_event_batch_receipt_fk'
           AND conrelid = 'kidults_private.current_sold_event_ledger'::regclass
    ) THEN
        ALTER TABLE kidults_private.current_sold_event_ledger
          ADD CONSTRAINT current_sold_event_batch_receipt_fk
          FOREIGN KEY (batch_receipt_id)
          REFERENCES kidults_private.current_sold_batch_receipt_ledger (receipt_id)
          DEFERRABLE INITIALLY DEFERRED;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'current_sold_evidence_batch_receipt_fk'
           AND conrelid = 'kidults_private.current_sold_evidence_ledger'::regclass
    ) THEN
        ALTER TABLE kidults_private.current_sold_evidence_ledger
          ADD CONSTRAINT current_sold_evidence_batch_receipt_fk
          FOREIGN KEY (batch_receipt_id)
          REFERENCES kidults_private.current_sold_batch_receipt_ledger (receipt_id)
          DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION kidults_private.enforce_current_sold_event_append_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, kidults_private
AS $$
DECLARE
    head kidults_private.current_sold_event_ledger%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id, 0));
    SELECT * INTO head
      FROM kidults_private.current_sold_event_ledger
     WHERE event_id = NEW.event_id
     ORDER BY ledger_id DESC
     LIMIT 1;

    IF NOT FOUND THEN
        IF NEW.correction_state <> 'ORIGINAL' OR NEW.supersedes_content_digest IS NOT NULL THEN
            RAISE EXCEPTION 'CURRENT_SOLD_LEDGER_CORRECTION_BASE_MISSING'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.canonical_object_id <> head.canonical_object_id THEN
        RAISE EXCEPTION 'CURRENT_SOLD_LEDGER_CROSS_RUN_OBJECT_CONFLICT'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.correction_state <> 'CORRECTED' THEN
        RAISE EXCEPTION 'CURRENT_SOLD_LEDGER_CROSS_RUN_CONTENT_CONFLICT'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.supersedes_content_digest IS DISTINCT FROM head.content_digest THEN
        RAISE EXCEPTION 'CURRENT_SOLD_LEDGER_CROSS_RUN_CORRECTION_MISMATCH'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.observed_at <= head.observed_at THEN
        RAISE EXCEPTION 'CURRENT_SOLD_LEDGER_CROSS_RUN_CORRECTION_TIME_NOT_MONOTONIC'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS current_sold_event_ledger_append_chain ON kidults_private.current_sold_event_ledger;
CREATE TRIGGER current_sold_event_ledger_append_chain
BEFORE INSERT ON kidults_private.current_sold_event_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_private.enforce_current_sold_event_append_chain();

CREATE OR REPLACE FUNCTION kidults_private.reject_current_sold_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, kidults_private
AS $$
BEGIN
    RAISE EXCEPTION 'CURRENT_SOLD_LEDGER_APPEND_ONLY_%', TG_OP
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS current_sold_event_ledger_no_update_delete ON kidults_private.current_sold_event_ledger;
CREATE TRIGGER current_sold_event_ledger_no_update_delete
BEFORE UPDATE OR DELETE ON kidults_private.current_sold_event_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_private.reject_current_sold_ledger_mutation();
DROP TRIGGER IF EXISTS current_sold_event_ledger_no_truncate ON kidults_private.current_sold_event_ledger;
CREATE TRIGGER current_sold_event_ledger_no_truncate
BEFORE TRUNCATE ON kidults_private.current_sold_event_ledger
FOR EACH STATEMENT EXECUTE FUNCTION kidults_private.reject_current_sold_ledger_mutation();

DROP TRIGGER IF EXISTS current_sold_evidence_ledger_no_update_delete ON kidults_private.current_sold_evidence_ledger;
CREATE TRIGGER current_sold_evidence_ledger_no_update_delete
BEFORE UPDATE OR DELETE ON kidults_private.current_sold_evidence_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_private.reject_current_sold_ledger_mutation();
DROP TRIGGER IF EXISTS current_sold_evidence_ledger_no_truncate ON kidults_private.current_sold_evidence_ledger;
CREATE TRIGGER current_sold_evidence_ledger_no_truncate
BEFORE TRUNCATE ON kidults_private.current_sold_evidence_ledger
FOR EACH STATEMENT EXECUTE FUNCTION kidults_private.reject_current_sold_ledger_mutation();

DROP TRIGGER IF EXISTS current_sold_batch_receipt_ledger_no_update_delete ON kidults_private.current_sold_batch_receipt_ledger;
CREATE TRIGGER current_sold_batch_receipt_ledger_no_update_delete
BEFORE UPDATE OR DELETE ON kidults_private.current_sold_batch_receipt_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_private.reject_current_sold_ledger_mutation();
DROP TRIGGER IF EXISTS current_sold_batch_receipt_ledger_no_truncate ON kidults_private.current_sold_batch_receipt_ledger;
CREATE TRIGGER current_sold_batch_receipt_ledger_no_truncate
BEFORE TRUNCATE ON kidults_private.current_sold_batch_receipt_ledger
FOR EACH STATEMENT EXECUTE FUNCTION kidults_private.reject_current_sold_ledger_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON kidults_private.current_sold_event_ledger FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON kidults_private.current_sold_evidence_ledger FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON kidults_private.current_sold_batch_receipt_ledger FROM PUBLIC;
REVOKE ALL ON FUNCTION kidults_private.reject_current_sold_ledger_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION kidults_private.enforce_current_sold_event_append_chain() FROM PUBLIC;

COMMENT ON SCHEMA kidults_private IS 'Private governed KIDULTS evidence and receipt ledger; no Public/Production/G5 authority is implied.';
COMMENT ON TABLE kidults_private.current_sold_event_ledger IS 'Append-only Current-SOLD event content chain. Cross-run divergence is rejected by the governed writer.';
COMMENT ON TABLE kidults_private.current_sold_evidence_ledger IS 'Append-only canonical Evidence derived from admitted Current-SOLD events.';
COMMENT ON TABLE kidults_private.current_sold_batch_receipt_ledger IS 'Append-only PASS-only admission receipts. Failed batches remain artifacts and are not ledger-writable.';

COMMIT;
