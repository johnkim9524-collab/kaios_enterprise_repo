BEGIN;

CREATE TABLE IF NOT EXISTS kidults_control.source_evidence_manifest_ledger (
    ledger_id BIGSERIAL PRIMARY KEY,
    manifest_id TEXT NOT NULL CHECK (manifest_id ~ '^[a-z0-9][a-z0-9-]{2,127}$'),
    manifest_version TEXT NOT NULL CHECK (manifest_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
    manifest_type TEXT NOT NULL CHECK (manifest_type IN (
      'REGISTRY_SNAPSHOT', 'RIGHTS_EVIDENCE', 'ACQUISITION_EVIDENCE', 'OBJECT_IDENTITY',
      'ANALYSIS_LINEAGE', 'CORRECTION', 'DELETION_RECEIPT'
    )),
    manifest_digest TEXT NOT NULL UNIQUE CHECK (manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
    registry_snapshot_digest TEXT NOT NULL REFERENCES kidults_control.global_source_registry_snapshot_ledger(snapshot_digest)
      DEFERRABLE INITIALLY DEFERRED,
    source_ids JSONB NOT NULL CHECK (jsonb_typeof(source_ids) = 'array'),
    source_count INTEGER NOT NULL CHECK (source_count > 0),
    artifact_digest TEXT NOT NULL CHECK (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
    storage_mode TEXT NOT NULL CHECK (storage_mode IN (
      'GITHUB_VERSIONED_METADATA', 'METADATA_ONLY', 'DIGEST_ONLY',
      'RESTRICTED_EVIDENCE_BYTES', 'DELETION_RECEIPT_ONLY'
    )),
    evidence_uri TEXT,
    contains_external_raw_content BOOLEAN NOT NULL,
    rights_decision_id UUID REFERENCES kidults_control.source_rights_decisions(rights_decision_id),
    supply_chain_run_id UUID REFERENCES kidults_control.supply_chain_runs(supply_chain_run_id),
    manifest_payload JSONB NOT NULL,
    writer_id TEXT NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (manifest_id, manifest_version),
    CONSTRAINT source_evidence_manifest_payload_binding_ck CHECK (
      manifest_payload->>'id' = manifest_id
      AND manifest_payload->>'version' = manifest_version
      AND manifest_payload->>'manifest_type' = manifest_type
      AND manifest_payload->>'manifest_digest' = manifest_digest
      AND manifest_payload->>'registry_snapshot_digest' = registry_snapshot_digest
      AND manifest_payload#>>'{artifact,digest}' = artifact_digest
      AND manifest_payload#>>'{artifact,storage_mode}' = storage_mode
      AND (manifest_payload#>>'{artifact,contains_external_raw_content}')::boolean = contains_external_raw_content
      AND (manifest_payload#>>'{admission,rights_decision_id}')::uuid IS NOT DISTINCT FROM rights_decision_id
      AND (manifest_payload#>>'{admission,supply_chain_run_id}')::uuid IS NOT DISTINCT FROM supply_chain_run_id
      AND jsonb_array_length(source_ids) = source_count
      AND manifest_payload#>>'{release_boundary,source_acquisition}' = 'false'
      AND manifest_payload#>>'{release_boundary,adapter_activation}' = 'false'
      AND manifest_payload#>>'{release_boundary,database_mutation}' = 'false'
      AND manifest_payload#>>'{release_boundary,d1_projection}' = 'false'
      AND manifest_payload#>>'{release_boundary,public}' = 'HOLD'
      AND manifest_payload#>>'{release_boundary,production}' = 'HOLD'
      AND manifest_payload#>>'{release_boundary,g5}' = 'HOLD'
    ),
    CONSTRAINT source_evidence_manifest_uri_ck CHECK (
      (
        contains_external_raw_content = false
        AND storage_mode <> 'RESTRICTED_EVIDENCE_BYTES'
        AND evidence_uri IS NULL
        AND rights_decision_id IS NULL
        AND supply_chain_run_id IS NULL
        AND manifest_payload#>>'{artifact,evidence_uri}' IS NULL
      ) OR (
        contains_external_raw_content = true
        AND storage_mode = 'RESTRICTED_EVIDENCE_BYTES'
        AND evidence_uri LIKE '/mnt/ih_prod_01/evidence/current-sold/%'
        AND position('/../' IN evidence_uri) = 0
        AND right(evidence_uri, 3) <> '/..'
        AND rights_decision_id IS NOT NULL
        AND supply_chain_run_id IS NOT NULL
        AND manifest_payload#>>'{artifact,evidence_uri}' = evidence_uri
        AND manifest_payload->>'status' = 'ADMITTED_RESTRICTED_EVIDENCE_NOT_RELEASE_AUTHORITY'
      )
    )
);

CREATE INDEX IF NOT EXISTS source_evidence_manifest_registry_idx
    ON kidults_control.source_evidence_manifest_ledger (registry_snapshot_digest, manifest_type, ledger_id);

DROP TRIGGER IF EXISTS source_evidence_manifest_registered_writer ON kidults_control.source_evidence_manifest_ledger;
CREATE TRIGGER source_evidence_manifest_registered_writer
BEFORE INSERT ON kidults_control.source_evidence_manifest_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

DROP TRIGGER IF EXISTS source_evidence_manifest_no_update_delete ON kidults_control.source_evidence_manifest_ledger;
CREATE TRIGGER source_evidence_manifest_no_update_delete
BEFORE UPDATE OR DELETE ON kidults_control.source_evidence_manifest_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

DROP TRIGGER IF EXISTS source_evidence_manifest_no_truncate ON kidults_control.source_evidence_manifest_ledger;
CREATE TRIGGER source_evidence_manifest_no_truncate
BEFORE TRUNCATE ON kidults_control.source_evidence_manifest_ledger
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON kidults_control.source_evidence_manifest_ledger FROM PUBLIC;
GRANT SELECT ON kidults_control.source_evidence_manifest_ledger TO kidults_control_reader;
GRANT SELECT, INSERT ON kidults_control.source_evidence_manifest_ledger TO kidults_control_supply;
GRANT USAGE, SELECT ON SEQUENCE kidults_control.source_evidence_manifest_ledger_ledger_id_seq TO kidults_control_supply;

COMMENT ON TABLE kidults_control.source_evidence_manifest_ledger IS
  'Append-only metadata manifests binding source intelligence artifacts to registry snapshots; no row grants acquisition, adapter, database, D1, Public, Production or G5 authority.';

COMMIT;
