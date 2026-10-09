-- Upgrade existing ledgers; do not rewrite previously applied migrations.
-- CHECK accepts SQL NULL: only explicit TRUE may authorize a bound row.
-- No row rewrite, privilege change, trigger removal, or release authority.
-- Invalid existing rows abort the whole migration; do not delete them to pass.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE kidults_private.current_sold_event_ledger
  DROP CONSTRAINT current_sold_event_payload_binding_ck,
  ADD CONSTRAINT current_sold_event_payload_binding_ck CHECK ((
    event_payload->>'event_id' = event_id
            AND event_payload->>'content_digest' = content_digest
            AND event_payload->>'canonical_object_id' = canonical_object_id
            AND event_payload->>'source_id' = source_id
            AND event_payload->>'source_event_id' = source_event_id
            AND event_payload->>'source_sha' = source_sha
            AND event_payload->>'canonical_run_id' = canonical_run_id
            AND event_payload->>'correction_state' = correction_state
            AND COALESCE(event_payload->>'supersedes_content_digest', '') = COALESCE(supersedes_content_digest, '')
  ) IS TRUE) NOT VALID;

ALTER TABLE kidults_private.current_sold_evidence_ledger
  DROP CONSTRAINT current_sold_evidence_payload_binding_ck,
  ADD CONSTRAINT current_sold_evidence_payload_binding_ck CHECK ((
    evidence_payload->>'evidence_id' = evidence_id
            AND evidence_payload->>'fact_id' = fact_id
            AND evidence_payload->>'canonical_object_id' = canonical_object_id
            AND evidence_payload#>>'{lineage,current_sold_event_id}' = current_sold_event_id
            AND evidence_payload#>>'{lineage,current_sold_content_digest}' = current_sold_content_digest
            AND evidence_payload#>>'{lineage,source_sha}' = source_sha
            AND evidence_payload#>>'{lineage,canonical_run_id}' = canonical_run_id
  ) IS TRUE) NOT VALID;

ALTER TABLE kidults_private.current_sold_batch_receipt_ledger
  DROP CONSTRAINT current_sold_receipt_payload_binding_ck,
  ADD CONSTRAINT current_sold_receipt_payload_binding_ck CHECK ((
    receipt_payload->>'receipt_id' = receipt_id
            AND receipt_payload->>'batch_id' = batch_id
            AND receipt_payload->>'status' = status
            AND receipt_payload->>'source_sha' = source_sha
            AND receipt_payload->>'canonical_run_id' = canonical_run_id
            AND receipt_payload->>'envelope_digest' = envelope_digest
            AND receipt_payload->>'event_versions_digest' = event_versions_digest
            AND receipt_payload->>'evidence_digest' = evidence_digest
  ) IS TRUE) NOT VALID;

ALTER TABLE kidults_private.current_sold_event_ledger VALIDATE CONSTRAINT current_sold_event_payload_binding_ck;
ALTER TABLE kidults_private.current_sold_evidence_ledger VALIDATE CONSTRAINT current_sold_evidence_payload_binding_ck;
ALTER TABLE kidults_private.current_sold_batch_receipt_ledger VALIDATE CONSTRAINT current_sold_receipt_payload_binding_ck;

COMMIT;
