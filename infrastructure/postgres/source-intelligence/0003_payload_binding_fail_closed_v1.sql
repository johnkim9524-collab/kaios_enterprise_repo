-- Upgrade existing ledgers; do not rewrite previously applied migrations.
-- CHECK accepts SQL NULL: only explicit TRUE may authorize a bound row.
-- No row rewrite, privilege change, trigger removal, or release authority.
-- Invalid existing rows abort the whole migration; do not delete them to pass.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE kidults_control.global_source_registry_snapshot_ledger
  DROP CONSTRAINT global_source_registry_payload_binding_ck,
  ADD CONSTRAINT global_source_registry_payload_binding_ck CHECK ((
    registry_payload->>'id' = registry_id
            AND registry_payload->>'version' = registry_version
            AND registry_payload->>'snapshot_digest' = snapshot_digest
            AND jsonb_array_length(registry_payload->'sources') = source_count
            AND registry_payload#>'{release_boundary,acquisition_authorized}' = 'false'::jsonb
            AND registry_payload#>'{release_boundary,adapter_activation_authorized}' = 'false'::jsonb
            AND registry_payload#>'{release_boundary,postgres_migration_authorized}' = 'false'::jsonb
            AND registry_payload#>'{release_boundary,d1_projection_authorized}' = 'false'::jsonb
            AND registry_payload#>>'{release_boundary,public_release}' = 'HOLD'
            AND registry_payload#>>'{release_boundary,production}' = 'HOLD'
            AND registry_payload#>>'{release_boundary,g5}' = 'HOLD'
  ) IS TRUE) NOT VALID;

ALTER TABLE kidults_control.global_source_assessment_ledger
  DROP CONSTRAINT global_source_assessment_payload_binding_ck,
  ADD CONSTRAINT global_source_assessment_payload_binding_ck CHECK ((
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
            AND assessment_payload->'activation_authorized' = 'false'::jsonb
            AND assessment_payload->'production_authorized' = 'false'::jsonb
  ) IS TRUE) NOT VALID;

ALTER TABLE kidults_control.global_source_assessment_ledger
  DROP CONSTRAINT global_source_assessment_rights_shape_ck,
  ADD CONSTRAINT global_source_assessment_rights_shape_ck CHECK ((
    rights_matrix ?& ARRAY['collect', 'store', 'derive', 'commercial_use', 'display', 'raw_archive']
            AND rights_matrix->>'collect' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
            AND rights_matrix->>'store' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
            AND rights_matrix->>'derive' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
            AND rights_matrix->>'commercial_use' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
            AND rights_matrix->>'display' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
            AND rights_matrix->>'raw_archive' IN ('PASS', 'CONDITIONAL', 'HOLD', 'NO_GO', 'NOT_APPLICABLE')
  ) IS TRUE) NOT VALID;

ALTER TABLE kidults_control.global_source_assessment_ledger
  DROP CONSTRAINT global_source_assessment_decision_consistency_ck,
  ADD CONSTRAINT global_source_assessment_decision_consistency_ck CHECK ((
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
  ) IS TRUE) NOT VALID;

ALTER TABLE kidults_control.source_evidence_manifest_ledger
  DROP CONSTRAINT source_evidence_manifest_payload_binding_ck,
  ADD CONSTRAINT source_evidence_manifest_payload_binding_ck CHECK ((
    manifest_payload->>'id' = manifest_id
          AND manifest_payload->>'version' = manifest_version
          AND manifest_payload->>'manifest_type' = manifest_type
          AND manifest_payload->>'manifest_digest' = manifest_digest
          AND manifest_payload->>'registry_snapshot_digest' = registry_snapshot_digest
          AND manifest_payload#>>'{artifact,digest}' = artifact_digest
          AND manifest_payload#>>'{artifact,storage_mode}' = storage_mode
          AND manifest_payload#>'{artifact,contains_external_raw_content}' = to_jsonb(contains_external_raw_content)
          AND (manifest_payload#>>'{admission,rights_decision_id}')::uuid IS NOT DISTINCT FROM rights_decision_id
          AND (manifest_payload#>>'{admission,supply_chain_run_id}')::uuid IS NOT DISTINCT FROM supply_chain_run_id
          AND jsonb_array_length(source_ids) = source_count
          AND manifest_payload#>'{release_boundary,source_acquisition}' = 'false'::jsonb
          AND manifest_payload#>'{release_boundary,adapter_activation}' = 'false'::jsonb
          AND manifest_payload#>'{release_boundary,database_mutation}' = 'false'::jsonb
          AND manifest_payload#>'{release_boundary,d1_projection}' = 'false'::jsonb
          AND manifest_payload#>>'{release_boundary,public}' = 'HOLD'
          AND manifest_payload#>>'{release_boundary,production}' = 'HOLD'
          AND manifest_payload#>>'{release_boundary,g5}' = 'HOLD'
  ) IS TRUE) NOT VALID;

ALTER TABLE kidults_control.global_source_registry_snapshot_ledger VALIDATE CONSTRAINT global_source_registry_payload_binding_ck;
ALTER TABLE kidults_control.global_source_assessment_ledger VALIDATE CONSTRAINT global_source_assessment_payload_binding_ck;
ALTER TABLE kidults_control.global_source_assessment_ledger VALIDATE CONSTRAINT global_source_assessment_rights_shape_ck;
ALTER TABLE kidults_control.global_source_assessment_ledger VALIDATE CONSTRAINT global_source_assessment_decision_consistency_ck;
ALTER TABLE kidults_control.source_evidence_manifest_ledger VALIDATE CONSTRAINT source_evidence_manifest_payload_binding_ck;

COMMIT;
