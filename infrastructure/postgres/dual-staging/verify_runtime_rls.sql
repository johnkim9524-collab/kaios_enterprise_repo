\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kaios_runtime_ci_app') THEN
    CREATE ROLE kaios_runtime_ci_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA kaios_runtime TO kaios_runtime_ci_app;
GRANT EXECUTE ON FUNCTION kaios_runtime.current_tenant() TO kaios_runtime_ci_app;
GRANT SELECT, INSERT, UPDATE ON kaios_runtime.projections TO kaios_runtime_ci_app;
GRANT SELECT, INSERT, UPDATE ON kaios_runtime.entitlements TO kaios_runtime_ci_app;
GRANT SELECT, INSERT ON kaios_runtime.export_nonces TO kaios_runtime_ci_app;
GRANT SELECT, INSERT ON kaios_runtime.export_audit TO kaios_runtime_ci_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kaios_runtime TO kaios_runtime_ci_app;

SET ROLE kaios_runtime_ci_app;

SELECT set_config('app.tenant_id', 'tenant-rls-a', false);
INSERT INTO kaios_runtime.projections (
  tenant_id, vertical, projection_id, projection_json, projection_digest, status, as_of, version
) VALUES (
  'tenant-rls-a', 'kidults', 'projection-rls-a', '{"tenant":"a"}'::jsonb,
  repeat('a', 64), 'approved', clock_timestamp(), 1
) ON CONFLICT (tenant_id, vertical) DO UPDATE SET
  projection_json = EXCLUDED.projection_json,
  projection_digest = EXCLUDED.projection_digest,
  status = EXCLUDED.status,
  as_of = EXCLUDED.as_of,
  version = kaios_runtime.projections.version + 1,
  updated_at = clock_timestamp();

INSERT INTO kaios_runtime.entitlements (
  tenant_id, entitlement_id, subject_id, vertical, scopes, status, projection_digest, expires_at
) VALUES (
  'tenant-rls-a', 'ent-rls-a', 'operator', 'kidults', ARRAY['EXPORT'], 'active', repeat('a', 64), clock_timestamp() + interval '1 day'
) ON CONFLICT (tenant_id, entitlement_id) DO UPDATE SET
  status = 'active', revoked_at = NULL, projection_digest = EXCLUDED.projection_digest,
  expires_at = EXCLUDED.expires_at, updated_at = clock_timestamp();

SELECT set_config('app.tenant_id', 'tenant-rls-b', false);
INSERT INTO kaios_runtime.projections (
  tenant_id, vertical, projection_id, projection_json, projection_digest, status, as_of, version
) VALUES (
  'tenant-rls-b', 'kidults', 'projection-rls-b', '{"tenant":"b"}'::jsonb,
  repeat('b', 64), 'approved', clock_timestamp(), 1
) ON CONFLICT (tenant_id, vertical) DO UPDATE SET
  projection_json = EXCLUDED.projection_json,
  projection_digest = EXCLUDED.projection_digest,
  status = EXCLUDED.status,
  as_of = EXCLUDED.as_of,
  version = kaios_runtime.projections.version + 1,
  updated_at = clock_timestamp();

INSERT INTO kaios_runtime.entitlements (
  tenant_id, entitlement_id, subject_id, vertical, scopes, status, projection_digest, expires_at
) VALUES (
  'tenant-rls-b', 'ent-rls-b', 'operator', 'kidults', ARRAY['EXPORT'], 'active', repeat('b', 64), clock_timestamp() + interval '1 day'
) ON CONFLICT (tenant_id, entitlement_id) DO UPDATE SET
  status = 'active', revoked_at = NULL, projection_digest = EXCLUDED.projection_digest,
  expires_at = EXCLUDED.expires_at, updated_at = clock_timestamp();

SELECT set_config('app.tenant_id', 'tenant-rls-a', false);

DO $$
DECLARE
  visible_count integer;
  changed_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM kaios_runtime.projections;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'RLS projection visibility failure: expected 1, got %', visible_count;
  END IF;

  SELECT count(*) INTO visible_count
  FROM kaios_runtime.projections
  WHERE tenant_id = 'tenant-rls-b';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'RLS cross-tenant read escaped';
  END IF;

  UPDATE kaios_runtime.projections
  SET version = version + 1
  WHERE tenant_id = 'tenant-rls-b';
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 0 THEN
    RAISE EXCEPTION 'RLS cross-tenant update escaped';
  END IF;

  BEGIN
    INSERT INTO kaios_runtime.export_audit (
      tenant_id, vertical, subject_id, entitlement_id, nonce_digest,
      projection_digest, decision, reason_code
    ) VALUES (
      'tenant-rls-b', 'kidults', 'operator', 'ent-rls-b', repeat('c', 64),
      repeat('b', 64), 'denied', 'CROSS_TENANT_ATTACK'
    );
    RAISE EXCEPTION 'RLS cross-tenant insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

INSERT INTO kaios_runtime.export_nonces (
  tenant_id, vertical, entitlement_id, nonce_digest, projection_digest
) VALUES (
  'tenant-rls-a', 'kidults', 'ent-rls-a', repeat('d', 64), repeat('a', 64)
) ON CONFLICT DO NOTHING;

DO $$
BEGIN
  BEGIN
    UPDATE kaios_runtime.export_nonces
    SET projection_digest = repeat('e', 64)
    WHERE tenant_id = 'tenant-rls-a';
    RAISE EXCEPTION 'application role unexpectedly received immutable UPDATE authority';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

RESET ROLE;

DO $$
BEGIN
  BEGIN
    UPDATE kaios_runtime.export_nonces
    SET projection_digest = repeat('e', 64)
    WHERE tenant_id = 'tenant-rls-a';
    RAISE EXCEPTION 'immutable nonce trigger unexpectedly permitted owner UPDATE';
  EXCEPTION
    WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END
$$;

SELECT 'POSTGRES_RLS_ATTACK_SUITE_PASS';
