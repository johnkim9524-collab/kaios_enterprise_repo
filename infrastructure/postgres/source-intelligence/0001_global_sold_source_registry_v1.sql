BEGIN;

CREATE TABLE IF NOT EXISTS kidults_control.global_source_registry_snapshot_ledger (
    ledger_id BIGSERIAL PRIMARY KEY,
    registry_id TEXT NOT NULL CHECK (registry_id = 'kidults-global-sold-source-registry-v1'),
    registry_version TEXT NOT NULL CHECK (registry_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
    snapshot_digest TEXT NOT NULL UNIQUE CHECK (snapshot_digest ~ '^sha256:[0-9a-f]{64}$'),
    generated_at TIMESTAMPTZ NOT NULL,
    source_count INTEGER NOT NULL CHECK (source_count > 0),
    registry_payload JSONB NOT NULL,
    writer_id TEXT NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT global_source_registry_payload_binding_ck CHECK (
        registry_payload->>'id' = registry_id
        AND registry_payload->>'version' = registry_version
        AND registry_payload->>'snapshot_digest' = snapshot_digest
        AND jsonb_array_length(registry_payload->'sources') = source_count
        AND registry_payload#>>'{release_boundary,acquisition_authorized}' = 'false'
        AND registry_payload#>>'{release_boundary,adapter_activation_authorized}' = 'false'
        AND registry_payload#>>'{release_boundary,postgres_migration_authorized}' = 'false'
        AND registry_payload#>>'{release_boundary,d1_projection_authorized}' = 'false'
        AND registry_payload#>>'{release_boundary,public_release}' = 'HOLD'
        AND registry_payload#>>'{release_boundary,production}' = 'HOLD'
        AND registry_payload#>>'{release_boundary,g5}' = 'HOLD'
    )
);

CREATE TABLE IF NOT EXISTS kidults_control.global_source_assessment_ledger (
    ledger_id BIGSERIAL PRIMARY KEY,
    snapshot_digest TEXT NOT NULL REFERENCES kidults_control.global_source_registry_snapshot_ledger(snapshot_digest)
      DEFERRABLE INITIALLY DEFERRED,
    source_id TEXT NOT NULL CHECK (source_id ~ '^[a-z0-9][a-z0-9-]{2,127}$'),
    source_name TEXT NOT NULL CHECK (length(source_name) > 0),
    owner_name TEXT NOT NULL CHECK (length(owner_name) > 0),
    region TEXT NOT NULL CHECK (length(region) > 0),
    decision TEXT NOT NULL CHECK (decision IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO')),
    rights_matrix JSONB NOT NULL,
    claim_ceiling TEXT NOT NULL CHECK (length(claim_ceiling) > 0),
    source_roles JSONB NOT NULL,
    verticals JSONB NOT NULL,
    official_urls JSONB NOT NULL,
    freshness TEXT NOT NULL,
    evidence_state TEXT NOT NULL,
    activation_authorized BOOLEAN NOT NULL CHECK (activation_authorized = false),
    production_authorized BOOLEAN NOT NULL CHECK (production_authorized = false),
    assessment_digest TEXT NOT NULL CHECK (assessment_digest ~ '^sha256:[0-9a-f]{64}$'),
    assessment_payload JSONB NOT NULL,
    writer_id TEXT NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (snapshot_digest, source_id),
    UNIQUE (snapshot_digest, assessment_digest),
    CONSTRAINT global_source_assessment_payload_binding_ck CHECK (
        assessment_payload->>'source_id' = source_id
        AND assessment_payload->>'source_name' = source_name
        AND assessment_payload->>'owner_name' = owner_name
        AND assessment_payload->>'region' = region
        AND assessment_payload->>'decision' = decision
        AND assessment_payload->>'claim_ceiling' = claim_ceiling
        AND assessment_payload->'rights' = rights_matrix
        AND assessment_payload->'source_roles' = source_roles
        AND assessment_payload->'verticals' = verticals
        AND assessment_payload->'official_urls' = official_urls
        AND assessment_payload->>'freshness' = freshness
        AND assessment_payload->>'evidence_state' = evidence_state
        AND assessment_payload->>'activation_authorized' = 'false'
        AND assessment_payload->>'production_authorized' = 'false'
    ),
    CONSTRAINT global_source_assessment_rights_shape_ck CHECK (
        rights_matrix ?& ARRAY['collect', 'store', 'derive', 'commercial_use', 'display', 'raw_archive']
        AND rights_matrix->>'collect' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
        AND rights_matrix->>'store' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
        AND rights_matrix->>'derive' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
        AND rights_matrix->>'commercial_use' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
        AND rights_matrix->>'display' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
        AND rights_matrix->>'raw_archive' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
    ),
    CONSTRAINT global_source_assessment_decision_consistency_ck CHECK (
        (decision <> 'PASS' OR (
          rights_matrix->>'collect' = 'PASS'
          AND rights_matrix->>'store' = 'PASS'
          AND rights_matrix->>'derive' = 'PASS'
          AND rights_matrix->>'commercial_use' = 'PASS'
        ))
        AND
        (decision <> 'NO_GO' OR (
          rights_matrix->>'collect' = 'NO_GO'
          AND rights_matrix->>'store' = 'NO_GO'
          AND rights_matrix->>'derive' = 'NO_GO'
          AND rights_matrix->>'commercial_use' = 'NO_GO'
        ))
    )
);

CREATE INDEX IF NOT EXISTS global_source_assessment_decision_idx
    ON kidults_control.global_source_assessment_ledger (decision, source_id, ledger_id);
CREATE INDEX IF NOT EXISTS global_source_assessment_freshness_idx
    ON kidults_control.global_source_assessment_ledger (freshness, source_id, ledger_id);

DROP TRIGGER IF EXISTS global_source_registry_snapshot_registered_writer ON kidults_control.global_source_registry_snapshot_ledger;
CREATE TRIGGER global_source_registry_snapshot_registered_writer
BEFORE INSERT ON kidults_control.global_source_registry_snapshot_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

DROP TRIGGER IF EXISTS global_source_assessment_registered_writer ON kidults_control.global_source_assessment_ledger;
CREATE TRIGGER global_source_assessment_registered_writer
BEFORE INSERT ON kidults_control.global_source_assessment_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer();

DROP TRIGGER IF EXISTS global_source_registry_snapshot_no_update_delete ON kidults_control.global_source_registry_snapshot_ledger;
CREATE TRIGGER global_source_registry_snapshot_no_update_delete
BEFORE UPDATE OR DELETE ON kidults_control.global_source_registry_snapshot_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
DROP TRIGGER IF EXISTS global_source_registry_snapshot_no_truncate ON kidults_control.global_source_registry_snapshot_ledger;
CREATE TRIGGER global_source_registry_snapshot_no_truncate
BEFORE TRUNCATE ON kidults_control.global_source_registry_snapshot_ledger
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

DROP TRIGGER IF EXISTS global_source_assessment_no_update_delete ON kidults_control.global_source_assessment_ledger;
CREATE TRIGGER global_source_assessment_no_update_delete
BEFORE UPDATE OR DELETE ON kidults_control.global_source_assessment_ledger
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();
DROP TRIGGER IF EXISTS global_source_assessment_no_truncate ON kidults_control.global_source_assessment_ledger;
CREATE TRIGGER global_source_assessment_no_truncate
BEFORE TRUNCATE ON kidults_control.global_source_assessment_ledger
FOR EACH STATEMENT EXECUTE FUNCTION kidults_control.reject_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON kidults_control.global_source_registry_snapshot_ledger FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON kidults_control.global_source_assessment_ledger FROM PUBLIC;
GRANT SELECT ON kidults_control.global_source_registry_snapshot_ledger TO kidults_control_reader;
GRANT SELECT ON kidults_control.global_source_assessment_ledger TO kidults_control_reader;
GRANT SELECT, INSERT ON kidults_control.global_source_registry_snapshot_ledger TO kidults_control_supply;
GRANT SELECT, INSERT ON kidults_control.global_source_assessment_ledger TO kidults_control_supply;
GRANT USAGE, SELECT ON SEQUENCE kidults_control.global_source_registry_snapshot_ledger_ledger_id_seq TO kidults_control_supply;
GRANT USAGE, SELECT ON SEQUENCE kidults_control.global_source_assessment_ledger_ledger_id_seq TO kidults_control_supply;

COMMENT ON TABLE kidults_control.global_source_registry_snapshot_ledger IS
  'Append-only source-research registry snapshots. A row is not acquisition, adapter, D1, Public, Production or G5 authority.';
COMMENT ON TABLE kidults_control.global_source_assessment_ledger IS
  'Append-only purpose-specific source assessments and claim ceilings; copyrighted source content and raw transaction dumps are excluded.';

COMMIT;
