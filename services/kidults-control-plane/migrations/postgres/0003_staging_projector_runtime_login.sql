BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'kidults_control_projector_runtime'
  ) THEN
    CREATE ROLE kidults_control_projector_runtime
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'kidults_control_projector_runtime'
      AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
           OR rolinherit OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'KIDULTS_PROJECTOR_RUNTIME_ROLE_DRIFT'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

GRANT kidults_control_projector
  TO kidults_control_projector_runtime;

COMMIT;
