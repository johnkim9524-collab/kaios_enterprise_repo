#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"
: "${KAIOS_POSTGRES_PITR_RESTORE_DSN:?KAIOS_POSTGRES_PITR_RESTORE_DSN is required}"
: "${KAIOS_PITR_BEFORE_MARKER:?KAIOS_PITR_BEFORE_MARKER is required}"
: "${KAIOS_PITR_AFTER_MARKER:?KAIOS_PITR_AFTER_MARKER is required}"
: "${KAIOS_PITR_BEFORE_MARKER_DIGEST:?KAIOS_PITR_BEFORE_MARKER_DIGEST is required}"
: "${KAIOS_PITR_AFTER_MARKER_DIGEST:?KAIOS_PITR_AFTER_MARKER_DIGEST is required}"
: "${KAIOS_PITR_TARGET_TIME:?KAIOS_PITR_TARGET_TIME is required}"

[[ "$KAIOS_ENVIRONMENT" == 'staging' ]] || { echo 'staging only' >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == 'false' ]] || { echo 'production promotion must remain false' >&2; exit 64; }
[[ "$KAIOS_PITR_BEFORE_MARKER_DIGEST" =~ ^[a-f0-9]{64}$ ]] || { echo 'invalid BEFORE digest' >&2; exit 64; }
[[ "$KAIOS_PITR_AFTER_MARKER_DIGEST" =~ ^[a-f0-9]{64}$ ]] || { echo 'invalid AFTER digest' >&2; exit 64; }
for command_name in psql pg_isready; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required" >&2; exit 69; }
done

python3 - "$KAIOS_PITR_TARGET_TIME" <<'PY'
import datetime, re, sys
value=sys.argv[1]
if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', value):
    raise SystemExit('target time must be canonical whole-second UTC RFC3339')
datetime.datetime.fromisoformat(value[:-1] + '+00:00')
PY

pg_isready --dbname="$KAIOS_POSTGRES_PITR_RESTORE_DSN" >/dev/null

probe_json="$(psql "$KAIOS_POSTGRES_PITR_RESTORE_DSN" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --set="marker=$KAIOS_PITR_BEFORE_MARKER" \
  --set="after_marker=$KAIOS_PITR_AFTER_MARKER" \
  --set="target_time=$KAIOS_PITR_TARGET_TIME" \
  --command="SELECT json_build_object(
    'before_count',(SELECT count(*)::int FROM kaios_runtime.pitr_probe_v2 WHERE marker=:'marker'),
    'before_digest',(SELECT COALESCE(max(marker_digest),'') FROM kaios_runtime.pitr_probe_v2 WHERE marker=:'marker'),
    'before_phase',(SELECT COALESCE(max(phase),'') FROM kaios_runtime.pitr_probe_v2 WHERE marker=:'marker'),
    'before_guard_verified',(SELECT COALESCE(max(created_at) <= :'target_time'::timestamptz - interval '2 seconds',false) FROM kaios_runtime.pitr_probe_v2 WHERE marker=:'marker'),
    'after_count',(SELECT count(*)::int FROM kaios_runtime.pitr_probe_v2 WHERE marker=:'after_marker'),
    'data_checksums',current_setting('data_checksums'),
    'force_rls_tables',(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kaios_runtime' AND c.relrowsecurity AND c.relforcerowsecurity),
    'migration_rows',(SELECT count(*)::int FROM kaios_runtime.schema_migrations),
    'endpoint_in_recovery',pg_is_in_recovery()
  )::text")"

python3 - "$probe_json" "$KAIOS_PITR_TARGET_TIME" "$KAIOS_PITR_BEFORE_MARKER_DIGEST" "$KAIOS_PITR_AFTER_MARKER_DIGEST" <<'PY'
import json, sys
probe=json.loads(sys.argv[1])
target_time=sys.argv[2]
before_digest=sys.argv[3]
after_digest=sys.argv[4]
if probe.get('before_count') != 1:
    raise SystemExit('pre-target marker missing at target-boundary probe')
if probe.get('before_digest') != before_digest:
    raise SystemExit('pre-target marker digest mismatch')
if probe.get('before_phase') != 'BEFORE_TARGET':
    raise SystemExit('pre-target marker phase mismatch')
if probe.get('before_guard_verified') is not True:
    raise SystemExit('pre-target marker does not satisfy the two-second target guard')
if probe.get('after_count') != 0:
    raise SystemExit('post-target marker present at target-boundary probe')
if probe.get('data_checksums') != 'on':
    raise SystemExit('data checksums are not enabled at target-boundary probe')
if not isinstance(probe.get('force_rls_tables'), int) or probe['force_rls_tables'] < 4:
    raise SystemExit(f"RLS missing at target-boundary probe: {probe.get('force_rls_tables')}")
if not isinstance(probe.get('migration_rows'), int) or probe['migration_rows'] < 1:
    raise SystemExit('migration ledger missing at target-boundary probe')
if probe.get('endpoint_in_recovery') is not False:
    raise SystemExit('target-boundary endpoint is still in recovery')
print(json.dumps({
  "status": "PASS",
  "environment": "STAGING",
  "production_touch": False,
  "target_time": target_time,
  "pre_target_marker_count": 1,
  "post_target_marker_count": 0,
  "pre_target_marker_digest": before_digest,
  "expected_post_target_marker_digest": after_digest,
  "pre_target_marker_at_or_before_target_time": True,
  "pre_target_marker_guard_seconds_minimum": 2,
  "data_checksums": probe["data_checksums"],
  "pitr_probe_table": "kaios_runtime.pitr_probe_v2",
  "force_rls_tables": probe["force_rls_tables"],
  "migration_rows": probe["migration_rows"],
  "endpoint_in_recovery": False,
  "consistent_snapshot_scope": "SINGLE_POSTGRESQL_STATEMENT",
  "target_boundary_data_state_observed": True,
  "restore_method_verified": False,
  "provider_control_plane_receipt_verified": False,
  "pitr": "NOT_VERIFIED"
}, separators=(",", ":")))
PY
