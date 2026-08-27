BEGIN;

CREATE SCHEMA IF NOT EXISTS kidults_control;

-- Runtime identities are group roles only. Deployment must grant exactly one
-- role to each separately provisioned LOGIN principal; this migration creates
-- no credentials and no bypass-RLS role.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'kidults_control_reader', 'kidults_control_command',
    'kidults_control_supply', 'kidults_control_audit',
    'kidults_control_projector'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS', role_name);
    END IF;
  END LOOP;
END;
$$;

CREATE TYPE kidults_control.writer_state AS ENUM ('ACTIVE', 'SUSPENDED', 'RETIRED');
CREATE TYPE kidults_control.organization_state AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE kidults_control.membership_state AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE kidults_control.subscription_state AS ENUM ('PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'ENDED');
CREATE TYPE kidults_control.rights_decision AS ENUM ('PASS', 'HOLD', 'DENY');

CREATE TABLE kidults_control.writer_principals (
  writer_id text PRIMARY KEY,
  database_role name NOT NULL,
  state kidults_control.writer_state NOT NULL,
  purpose text NOT NULL,
  owner text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  retired_at timestamptz,
  CHECK (writer_id ~ '^[a-z0-9][a-z0-9._-]{2,127}$'),
  CHECK ((state = 'RETIRED') = (retired_at IS NOT NULL))
);

INSERT INTO kidults_control.writer_principals (writer_id, database_role, state, purpose, owner) VALUES
  ('kpmo-command-service-v1', 'kidults_control_command', 'ACTIVE', 'Canonical product and commercial commands', 'TRACK_C_TRACK_D'),
  ('kpmo-supply-chain-admission-v1', 'kidults_control_supply', 'ACTIVE', 'Canonical lawful source admission commands', 'TRACK_A_TRACK_Z_KPMO'),
  ('kpmo-audit-writer-v1', 'kidults_control_audit', 'ACTIVE', 'Security and control audit events', 'SECURITY_KPMO'),
  ('kpmo-d1-projector-v1', 'kidults_control_projector', 'ACTIVE', 'PostgreSQL outbox delivery receipts for the governed D1 projector', 'TRACK_D_KPMO');

CREATE FUNCTION kidults_control.assert_registered_writer(row_writer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, kidults_control
AS $$
DECLARE
  session_writer_id text := current_setting('kidults.writer_id', true);
BEGIN
  IF session_writer_id IS NULL OR session_writer_id = '' THEN
    RAISE EXCEPTION 'KIDULTS_WRITER_ID_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF row_writer_id IS DISTINCT FROM session_writer_id THEN
    RAISE EXCEPTION 'KIDULTS_WRITER_ID_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM kidults_control.writer_principals p
    WHERE p.writer_id = session_writer_id AND p.state = 'ACTIVE'
      AND p.database_role = current_user
  ) THEN
    RAISE EXCEPTION 'KIDULTS_WRITER_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION kidults_control.enforce_registered_writer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, kidults_control
AS $$
BEGIN
  PERFORM kidults_control.assert_registered_writer(NEW.writer_id);
  RETURN NEW;
END;
$$;

CREATE FUNCTION kidults_control.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'KIDULTS_APPEND_ONLY_MUTATION_DENIED' USING ERRCODE = '42501';
END;
$$;

CREATE FUNCTION kidults_control.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('kidults.organization_id', true), '')::uuid
$$;

CREATE TABLE kidults_control.users (
  user_id uuid PRIMARY KEY,
  external_subject text NOT NULL,
  identity_provider text NOT NULL,
  display_name text,
  email_normalized text,
  state text NOT NULL CHECK (state IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (identity_provider, external_subject)
);

CREATE TABLE kidults_control.organizations (
  organization_id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  state kidults_control.organization_state NOT NULL,
  default_currency char(3) NOT NULL,
  default_locale text NOT NULL,
  jurisdiction text NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  CHECK (default_currency ~ '^[A-Z]{3}$')
);

CREATE TABLE kidults_control.memberships (
  membership_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES kidults_control.organizations(organization_id),
  user_id uuid NOT NULL REFERENCES kidults_control.users(user_id),
  role_code text NOT NULL,
  state kidults_control.membership_state NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, user_id),
  CHECK ((state = 'REVOKED') = (revoked_at IS NOT NULL))
);

CREATE TABLE kidults_control.resource_grants (
  grant_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES kidults_control.organizations(organization_id),
  membership_id uuid NOT NULL REFERENCES kidults_control.memberships(membership_id),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  permission_code text NOT NULL,
  policy_version text NOT NULL,
  reason text NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, membership_id, resource_type, resource_id, permission_code)
);

CREATE TABLE kidults_control.plans (
  plan_id uuid PRIMARY KEY,
  plan_code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  currency char(3) NOT NULL,
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  billing_interval text NOT NULL CHECK (billing_interval IN ('MONTH', 'YEAR', 'ONE_TIME')),
  entitlements_json jsonb NOT NULL,
  active_from timestamptz NOT NULL,
  active_until timestamptz,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (plan_code, version),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (active_until IS NULL OR active_until > active_from)
);

CREATE TABLE kidults_control.subscriptions (
  subscription_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES kidults_control.organizations(organization_id),
  plan_id uuid NOT NULL REFERENCES kidults_control.plans(plan_id),
  provider_code text,
  provider_customer_ref text,
  provider_subscription_ref text,
  state kidults_control.subscription_state NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  state_version bigint NOT NULL DEFAULT 1 CHECK (state_version > 0),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (provider_code, provider_subscription_ref),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end > period_start)
);

CREATE TABLE kidults_control.entitlements (
  entitlement_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES kidults_control.organizations(organization_id),
  subscription_id uuid REFERENCES kidults_control.subscriptions(subscription_id),
  entitlement_code text NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  policy_version text NOT NULL,
  source_transition_id uuid NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, entitlement_code, source_transition_id),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE TABLE kidults_control.usage_events (
  usage_event_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES kidults_control.organizations(organization_id),
  entitlement_code text NOT NULL,
  meter_code text NOT NULL,
  quantity numeric(24, 6) NOT NULL CHECK (quantity >= 0),
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE kidults_control.billing_events (
  billing_event_id uuid PRIMARY KEY,
  organization_id uuid REFERENCES kidults_control.organizations(organization_id),
  provider_code text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  signature_verified boolean NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  provider_created_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  ordering_key text NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  UNIQUE (provider_code, provider_event_id),
  CHECK (signature_verified)
);

CREATE TABLE kidults_control.data_sources (
  source_id uuid PRIMARY KEY,
  canonical_source_id text NOT NULL UNIQUE,
  provider_code text NOT NULL,
  source_name text NOT NULL,
  acquisition_method text NOT NULL,
  jurisdiction text NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (provider_code, source_name),
  CHECK (canonical_source_id ~ '^[a-z0-9][a-z0-9._-]{2,127}$')
);

CREATE TABLE kidults_control.source_aliases (
  alias_source_id text PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES kidults_control.data_sources(source_id),
  alias_reason text NOT NULL,
  source_contract_id text NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (alias_source_id ~ '^[a-z0-9][a-z0-9._-]{2,127}$')
);

CREATE TABLE kidults_control.source_rights_decisions (
  rights_decision_id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES kidults_control.data_sources(source_id),
  purpose_code text NOT NULL,
  field_set_digest text NOT NULL CHECK (field_set_digest ~ '^sha256:[0-9a-f]{64}$'),
  decision kidults_control.rights_decision NOT NULL,
  collect_allowed boolean NOT NULL,
  store_allowed boolean NOT NULL,
  transform_allowed boolean NOT NULL,
  model_use_allowed boolean NOT NULL,
  display_allowed boolean NOT NULL,
  retention_days integer CHECK (retention_days >= 0),
  post_exit_allowed boolean,
  evidence_ref text NOT NULL,
  decided_at timestamptz NOT NULL,
  expires_at timestamptz,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (rights_decision_id, source_id),
  UNIQUE (source_id, purpose_code, field_set_digest, decided_at),
  CHECK (expires_at IS NULL OR expires_at > decided_at),
  CHECK (decision <> 'PASS' OR (collect_allowed AND store_allowed))
);

CREATE TABLE kidults_control.supply_chain_runs (
  supply_chain_run_id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES kidults_control.data_sources(source_id),
  rights_decision_id uuid NOT NULL,
  source_timestamp timestamptz NOT NULL,
  acquired_at timestamptz NOT NULL,
  raw_digest text NOT NULL CHECK (raw_digest ~ '^sha256:[0-9a-f]{64}$'),
  normalized_digest text NOT NULL CHECK (normalized_digest ~ '^sha256:[0-9a-f]{64}$'),
  code_version text NOT NULL,
  schema_version text NOT NULL,
  expected_cardinality bigint NOT NULL CHECK (expected_cardinality >= 0),
  actual_cardinality bigint NOT NULL CHECK (actual_cardinality >= 0),
  replay_command_digest text NOT NULL CHECK (replay_command_digest ~ '^sha256:[0-9a-f]{64}$'),
  admission_state text NOT NULL CHECK (admission_state IN ('HOLD', 'ADMITTED', 'REJECTED')),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (admission_state <> 'ADMITTED' OR expected_cardinality = actual_cardinality),
  FOREIGN KEY (rights_decision_id, source_id)
    REFERENCES kidults_control.source_rights_decisions(rights_decision_id, source_id)
);

CREATE TABLE kidults_control.source_control_plane_snapshots (
  snapshot_id uuid PRIMARY KEY,
  contract_id text NOT NULL,
  ledger_version text NOT NULL,
  ledger_digest text NOT NULL UNIQUE CHECK (ledger_digest ~ '^sha256:[0-9a-f]{64}$'),
  input_fingerprints_json jsonb NOT NULL,
  canonical_source_count integer NOT NULL CHECK (canonical_source_count >= 0),
  curated_candidate_count integer NOT NULL CHECK (curated_candidate_count >= 0),
  implemented_adapter_count integer NOT NULL CHECK (implemented_adapter_count >= 0),
  bounded_admitted_source_count integer NOT NULL CHECK (bounded_admitted_source_count >= 0),
  rights_clear_collector_current_sold_count integer NOT NULL CHECK (rights_clear_collector_current_sold_count >= 0),
  active_adapter_count integer NOT NULL CHECK (active_adapter_count >= 0),
  activation_backlog_count integer NOT NULL CHECK (activation_backlog_count >= 0),
  public_release_state text NOT NULL CHECK (public_release_state = 'HOLD'),
  production_state text NOT NULL CHECK (production_state = 'HOLD'),
  source_as_of timestamptz NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (jsonb_typeof(input_fingerprints_json) = 'object'),
  CHECK (rights_clear_collector_current_sold_count > 0 OR activation_backlog_count = 0),
  CHECK (active_adapter_count <= implemented_adapter_count)
);

CREATE TABLE kidults_control.commands (
  command_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES kidults_control.organizations(organization_id),
  idempotency_key text NOT NULL,
  command_type text NOT NULL,
  actor_subject text NOT NULL,
  request_id text NOT NULL,
  trace_id text NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  accepted_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE kidults_control.audit_events (
  audit_event_id uuid PRIMARY KEY,
  organization_id uuid REFERENCES kidults_control.organizations(organization_id),
  sequence_no bigint NOT NULL,
  actor_subject text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('ALLOW', 'DENY', 'ERROR', 'HOLD')),
  reason text NOT NULL,
  request_id text NOT NULL,
  trace_id text NOT NULL,
  policy_version text NOT NULL,
  before_digest text,
  after_digest text,
  previous_event_hash text,
  event_hash text NOT NULL CHECK (event_hash ~ '^sha256:[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, sequence_no),
  UNIQUE (event_hash),
  CHECK (before_digest IS NULL OR before_digest ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (after_digest IS NULL OR after_digest ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (previous_event_hash IS NULL OR previous_event_hash ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE kidults_control.outbox_events (
  outbox_event_id uuid PRIMARY KEY,
  organization_id uuid REFERENCES kidults_control.organizations(organization_id),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  source_schema_version text NOT NULL,
  payload_json jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE kidults_control.outbox_delivery_receipts (
  receipt_id uuid PRIMARY KEY,
  outbox_event_id uuid NOT NULL REFERENCES kidults_control.outbox_events(outbox_event_id),
  organization_id uuid REFERENCES kidults_control.organizations(organization_id),
  projector_id text NOT NULL,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  state text NOT NULL CHECK (state IN ('CLAIMED', 'PROJECTED', 'FAILED', 'QUARANTINED')),
  projection_cursor text,
  d1_result_digest text,
  error_code text,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (outbox_event_id, projector_id, attempt_no),
  CHECK (d1_result_digest IS NULL OR d1_result_digest ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE kidults_control.outbox_delivery_claims (
  outbox_event_id uuid NOT NULL REFERENCES kidults_control.outbox_events(outbox_event_id),
  organization_id uuid REFERENCES kidults_control.organizations(organization_id),
  projector_id text NOT NULL,
  claim_token uuid NOT NULL,
  worker_id text NOT NULL,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  claimed_until timestamptz NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (outbox_event_id, projector_id)
);

CREATE TABLE kidults_control.observability_events (
  observability_event_id uuid PRIMARY KEY,
  organization_id uuid REFERENCES kidults_control.organizations(organization_id),
  signal_type text NOT NULL CHECK (signal_type IN ('METRIC', 'LOG', 'TRACE', 'SLO', 'ALERT')),
  service_name text NOT NULL,
  event_name text NOT NULL,
  request_id text,
  trace_id text,
  payload_json jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  writer_id text NOT NULL REFERENCES kidults_control.writer_principals(writer_id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'organizations', 'memberships', 'resource_grants', 'plans',
    'subscriptions', 'entitlements', 'usage_events', 'billing_events',
    'data_sources', 'source_aliases', 'source_rights_decisions', 'supply_chain_runs',
    'source_control_plane_snapshots', 'commands',
    'audit_events', 'outbox_events', 'outbox_delivery_receipts',
    'outbox_delivery_claims', 'observability_events'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON kidults_control.%I FOR EACH ROW EXECUTE FUNCTION kidults_control.enforce_registered_writer()',
      table_name || '_writer_guard', table_name
    );
  END LOOP;
END;
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON kidults_control.audit_events
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER commands_append_only
BEFORE UPDATE OR DELETE ON kidults_control.commands
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER plans_append_only
BEFORE UPDATE OR DELETE ON kidults_control.plans
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER entitlements_append_only
BEFORE UPDATE OR DELETE ON kidults_control.entitlements
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER outbox_events_append_only
BEFORE UPDATE OR DELETE ON kidults_control.outbox_events
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER usage_events_append_only
BEFORE UPDATE OR DELETE ON kidults_control.usage_events
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER billing_events_append_only
BEFORE UPDATE OR DELETE ON kidults_control.billing_events
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER supply_chain_runs_append_only
BEFORE UPDATE OR DELETE ON kidults_control.supply_chain_runs
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER source_aliases_append_only
BEFORE UPDATE OR DELETE ON kidults_control.source_aliases
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER source_rights_decisions_append_only
BEFORE UPDATE OR DELETE ON kidults_control.source_rights_decisions
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER source_control_plane_snapshots_append_only
BEFORE UPDATE OR DELETE ON kidults_control.source_control_plane_snapshots
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER outbox_delivery_receipts_append_only
BEFORE UPDATE OR DELETE ON kidults_control.outbox_delivery_receipts
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

CREATE TRIGGER observability_events_append_only
BEFORE UPDATE OR DELETE ON kidults_control.observability_events
FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'organizations', 'memberships', 'resource_grants', 'subscriptions',
    'data_sources'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON kidults_control.%I FOR EACH ROW EXECUTE FUNCTION kidults_control.reject_mutation()',
      table_name || '_delete_denied', table_name
    );
  END LOOP;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations', 'memberships', 'resource_grants', 'subscriptions',
    'entitlements', 'usage_events', 'billing_events', 'commands', 'audit_events',
    'outbox_events', 'outbox_delivery_receipts', 'outbox_delivery_claims',
    'observability_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE kidults_control.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE kidults_control.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON kidults_control.%I USING (organization_id = kidults_control.current_organization_id()) WITH CHECK (organization_id = kidults_control.current_organization_id())',
      table_name || '_tenant_isolation', table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX memberships_org_state_idx ON kidults_control.memberships (organization_id, state);
CREATE INDEX subscriptions_org_state_idx ON kidults_control.subscriptions (organization_id, state);
CREATE INDEX entitlements_org_state_idx ON kidults_control.entitlements (organization_id, state, entitlement_code);
CREATE INDEX usage_events_org_meter_time_idx ON kidults_control.usage_events (organization_id, meter_code, occurred_at);
CREATE INDEX audit_events_org_time_idx ON kidults_control.audit_events (organization_id, occurred_at);
CREATE INDEX outbox_events_created_idx ON kidults_control.outbox_events (created_at, outbox_event_id);
CREATE INDEX outbox_delivery_claims_lease_idx ON kidults_control.outbox_delivery_claims (projector_id, claimed_until);
CREATE INDEX supply_chain_runs_source_time_idx ON kidults_control.supply_chain_runs (source_id, acquired_at);
CREATE INDEX source_aliases_source_idx ON kidults_control.source_aliases (source_id);
CREATE INDEX source_rights_source_purpose_time_idx ON kidults_control.source_rights_decisions (source_id, purpose_code, decided_at);
CREATE INDEX source_control_plane_snapshots_created_idx ON kidults_control.source_control_plane_snapshots (created_at, snapshot_id);
CREATE INDEX observability_events_org_time_idx ON kidults_control.observability_events (organization_id, occurred_at);

REVOKE ALL ON SCHEMA kidults_control FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA kidults_control FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA kidults_control FROM PUBLIC;

GRANT USAGE ON SCHEMA kidults_control TO
  kidults_control_reader, kidults_control_command, kidults_control_supply,
  kidults_control_audit, kidults_control_projector;

GRANT SELECT ON kidults_control.users, kidults_control.organizations,
  kidults_control.memberships, kidults_control.resource_grants,
  kidults_control.plans, kidults_control.subscriptions,
  kidults_control.entitlements TO kidults_control_reader;

GRANT SELECT ON kidults_control.users, kidults_control.organizations,
  kidults_control.memberships, kidults_control.resource_grants,
  kidults_control.plans, kidults_control.subscriptions,
  kidults_control.entitlements, kidults_control.commands,
  kidults_control.audit_events, kidults_control.outbox_events TO kidults_control_command;
GRANT INSERT, UPDATE ON kidults_control.users, kidults_control.organizations,
  kidults_control.memberships, kidults_control.resource_grants,
  kidults_control.subscriptions TO kidults_control_command;
GRANT INSERT ON kidults_control.plans, kidults_control.entitlements,
  kidults_control.usage_events, kidults_control.billing_events,
  kidults_control.commands, kidults_control.audit_events,
  kidults_control.outbox_events TO kidults_control_command;

GRANT SELECT ON kidults_control.data_sources, kidults_control.source_aliases,
  kidults_control.source_rights_decisions, kidults_control.supply_chain_runs,
  kidults_control.source_control_plane_snapshots, kidults_control.organizations,
  kidults_control.commands, kidults_control.audit_events,
  kidults_control.outbox_events TO kidults_control_supply;
GRANT INSERT, UPDATE ON kidults_control.data_sources TO kidults_control_supply;
GRANT INSERT ON kidults_control.source_aliases,
  kidults_control.source_rights_decisions, kidults_control.supply_chain_runs,
  kidults_control.source_control_plane_snapshots, kidults_control.commands,
  kidults_control.audit_events, kidults_control.outbox_events TO kidults_control_supply;

GRANT SELECT ON kidults_control.organizations TO kidults_control_audit;
GRANT INSERT ON kidults_control.audit_events,
  kidults_control.observability_events TO kidults_control_audit;

GRANT SELECT ON kidults_control.organizations,
  kidults_control.outbox_events,
  kidults_control.outbox_delivery_receipts,
  kidults_control.outbox_delivery_claims TO kidults_control_projector;
GRANT INSERT ON kidults_control.outbox_delivery_receipts TO kidults_control_projector;
GRANT INSERT, UPDATE ON kidults_control.outbox_delivery_claims TO kidults_control_projector;

GRANT EXECUTE ON FUNCTION kidults_control.current_organization_id() TO
  kidults_control_reader, kidults_control_command, kidults_control_supply,
  kidults_control_audit, kidults_control_projector;

COMMIT;
