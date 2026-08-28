#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"
: "${KAIOS_POSTGRES_DSN:?KAIOS_POSTGRES_DSN is required}"

[[ "$KAIOS_ENVIRONMENT" == "staging" ]] || { echo 'staging only' >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == "false" ]] || { echo 'production promotion must remain false' >&2; exit 64; }

for command_name in psql pg_isready sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required" >&2; exit 69; }
done

pg_isready "$KAIOS_POSTGRES_DSN" >/dev/null

psql_scalar() {
  psql "$KAIOS_POSTGRES_DSN" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="$1"
}

psql_mutation() {
  psql "$KAIOS_POSTGRES_DSN" --no-psqlrc --quiet --output=/dev/null --set=ON_ERROR_STOP=1 "$@"
}

server_version="$(psql_scalar "SHOW server_version")"
wal_level="$(psql_scalar "SHOW wal_level")"
archive_mode="$(psql_scalar "SHOW archive_mode")"
data_checksums="$(psql_scalar "SHOW data_checksums")"

case "$wal_level" in replica|logical) ;; *) echo "wal_level must support PITR, got $wal_level" >&2; exit 1;; esac
[[ "$data_checksums" == "on" ]] || { echo "data_checksums must be enabled for PITR evidence" >&2; exit 1; }

schema_present="$(psql_scalar "SELECT to_regnamespace('kaios_runtime') IS NOT NULL")"
[[ "$schema_present" == "t" ]] || { echo 'kaios_runtime schema is not present on persistent staging' >&2; exit 1; }

rls_forced="$(psql_scalar "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kaios_runtime' AND c.relrowsecurity AND c.relforcerowsecurity")"
[[ "$rls_forced" =~ ^[0-9]+$ ]] || { echo 'invalid RLS count' >&2; exit 1; }
(( rls_forced >= 4 )) || { echo "expected at least 4 FORCE RLS tables, got $rls_forced" >&2; exit 1; }

pg_switch_wal_authorized="$(psql_scalar "SELECT has_function_privilege(current_user, 'pg_catalog.pg_switch_wal()', 'EXECUTE')")"
[[ "$pg_switch_wal_authorized" == 't' || "$pg_switch_wal_authorized" == 'f' ]] || { echo 'invalid pg_switch_wal privilege read-back' >&2; exit 1; }

psql_mutation <<'SQL'
CREATE TABLE IF NOT EXISTS kaios_runtime.pitr_probe_v2 (
  marker text PRIMARY KEY,
  marker_digest text NOT NULL CHECK (marker_digest ~ '^[a-f0-9]{64}$'),
  phase text NOT NULL CHECK (phase IN ('BEFORE_TARGET','AFTER_TARGET')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SQL

archive_observation_attempted=false
wal_archive_event_verified=false
archived_count_before=''
archived_count=''
failed_count_before=''
failed_count=''
stats_reset_before=''
stats_reset=''
switched_wal=''
last_archived_wal=''
switched_wal_archived=false
if [[ "$pg_switch_wal_authorized" == 't' && ( "$archive_mode" == 'on' || "$archive_mode" == 'always' ) ]]; then
  archive_observation_attempted=true
  archive_status_before="$(psql_scalar "SELECT archived_count || '|' || failed_count || '|' || COALESCE(stats_reset::text,'') FROM pg_stat_archiver")"
  archived_count_before="${archive_status_before%%|*}"
  archive_status_before_rest="${archive_status_before#*|}"
  failed_count_before="${archive_status_before_rest%%|*}"
  stats_reset_before="${archive_status_before_rest#*|}"
  [[ "$archived_count_before" =~ ^[0-9]+$ && "$failed_count_before" =~ ^[0-9]+$ && -n "$stats_reset_before" ]] || { echo 'invalid initial pg_stat_archiver counters' >&2; exit 1; }
fi

run_id="$(date -u +%Y%m%dT%H%M%S)-$$"
before_marker="pitr-before-${run_id}"
after_marker="pitr-after-${run_id}"
before_digest="$(printf '%s' "$before_marker" | sha256sum | awk '{print $1}')"
after_digest="$(printf '%s' "$after_marker" | sha256sum | awk '{print $1}')"
before_lsn="$(psql_scalar "SELECT pg_current_wal_lsn()")"

psql_mutation --set="marker=$before_marker" --set="digest=$before_digest" <<'SQL'
BEGIN;
INSERT INTO kaios_runtime.pitr_probe_v2(marker, marker_digest, phase)
VALUES (:'marker', :'digest', 'BEFORE_TARGET');
COMMIT;
SQL

target_time="$(psql_scalar "SELECT to_char(date_trunc('second', clock_timestamp() AT TIME ZONE 'UTC') + interval '3 seconds', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')")"
sleep 6
psql_mutation --set="marker=$after_marker" --set="digest=$after_digest" <<'SQL'
BEGIN;
INSERT INTO kaios_runtime.pitr_probe_v2(marker, marker_digest, phase)
VALUES (:'marker', :'digest', 'AFTER_TARGET');
COMMIT;
SQL

after_lsn="$(psql_scalar "SELECT pg_current_wal_lsn()")"
[[ "$before_lsn" != "$after_lsn" ]] || { echo 'WAL LSN did not advance' >&2; exit 1; }

if [[ "$archive_observation_attempted" == 'true' ]]; then
  switched_wal="$(psql_scalar "SELECT pg_walfile_name(pg_switch_wal())")"
  [[ "$switched_wal" =~ ^[A-F0-9]{24}$ ]] || { echo "invalid switched WAL name: $switched_wal" >&2; exit 1; }
  archive_poll_attempts="${KAIOS_PITR_ARCHIVE_POLL_ATTEMPTS:-30}"
  archive_poll_interval_seconds="${KAIOS_PITR_ARCHIVE_POLL_INTERVAL_SECONDS:-2}"
  [[ "$archive_poll_attempts" =~ ^[1-9][0-9]*$ ]] || { echo 'invalid archive poll attempts' >&2; exit 64; }
  [[ "$archive_poll_interval_seconds" =~ ^[0-9]+$ ]] || { echo 'invalid archive poll interval' >&2; exit 64; }

  archived_count="$archived_count_before"
  failed_count="$failed_count_before"
  stats_reset="$stats_reset_before"
  for ((attempt=1; attempt<=archive_poll_attempts; attempt+=1)); do
    archive_status="$(psql_scalar "SELECT archived_count || '|' || failed_count || '|' || COALESCE(last_archived_wal,'') || '|' || COALESCE(stats_reset::text,'') FROM pg_stat_archiver")"
    archived_count="${archive_status%%|*}"
    archive_rest="${archive_status#*|}"
    failed_count="${archive_rest%%|*}"
    archive_rest="${archive_rest#*|}"
    last_archived_wal="${archive_rest%%|*}"
    stats_reset="${archive_rest#*|}"
    [[ "$archived_count" =~ ^[0-9]+$ && "$failed_count" =~ ^[0-9]+$ && -n "$stats_reset" ]] || { echo 'invalid pg_stat_archiver counters' >&2; exit 1; }
    [[ -z "$last_archived_wal" || "$last_archived_wal" =~ ^[A-F0-9]{24}$ ]] || { echo 'invalid last archived WAL name' >&2; exit 1; }
    [[ "$stats_reset" == "$stats_reset_before" ]] || { echo 'pg_stat_archiver reset during bounded proof' >&2; exit 1; }
    (( failed_count == failed_count_before )) || { echo "new WAL archive failure observed: before=$failed_count_before after=$failed_count" >&2; exit 1; }
    if (( archived_count > archived_count_before && archived_count > 0 )) \
      && [[ "$last_archived_wal" == "$switched_wal" ]]; then
      switched_wal_archived=true
      wal_archive_event_verified=true
      break
    fi
    sleep "$archive_poll_interval_seconds"
  done
  [[ "$switched_wal_archived" == "true" ]] || { echo "switched WAL was not archived within the bounded poll: $switched_wal" >&2; exit 1; }
fi

for marker in "$before_marker" "$after_marker"; do
  marker_exists="$(psql "$KAIOS_POSTGRES_DSN" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --set="marker=$marker" \
    --command="SELECT count(*) FROM kaios_runtime.pitr_probe_v2 WHERE marker=:'marker'")"
  [[ "$marker_exists" == "1" ]] || { echo "PITR probe marker not durable: $marker" >&2; exit 1; }
done

boundary_order="$(psql "$KAIOS_POSTGRES_DSN" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --set="before_marker=$before_marker" \
  --set="after_marker=$after_marker" \
  --set="target_time=$target_time" \
  --command="SELECT (SELECT created_at <= :'target_time'::timestamptz - interval '2 seconds' FROM kaios_runtime.pitr_probe_v2 WHERE marker=:'before_marker') || '|' || (SELECT created_at >= :'target_time'::timestamptz + interval '2 seconds' FROM kaios_runtime.pitr_probe_v2 WHERE marker=:'after_marker')")"
[[ "$boundary_order" == 't|t' ]] || { echo "marker timestamps do not satisfy the two-second target guard: $boundary_order" >&2; exit 1; }

python3 - "$server_version" "$wal_level" "$archive_mode" "$data_checksums" "$rls_forced" "$before_lsn" "$after_lsn" "$pg_switch_wal_authorized" "$archive_observation_attempted" "$wal_archive_event_verified" "$archived_count_before" "$archived_count" "$failed_count_before" "$failed_count" "$stats_reset" "$switched_wal" "$last_archived_wal" "$before_marker" "$after_marker" "$before_digest" "$after_digest" "$target_time" <<'PY'
import json, sys
(
    server_version, wal_level, archive_mode, data_checksums, rls_forced,
    before_lsn, after_lsn, pg_switch_wal_authorized,
    archive_observation_attempted, wal_archive_event_verified,
    archived_count_before, archived_count, failed_count_before, failed_count,
    stats_reset, switched_wal, last_archived_wal, before_marker, after_marker,
    before_digest, after_digest, target_time
) = sys.argv[1:]
archive_verified = wal_archive_event_verified == "true"
optional_int = lambda value: int(value) if value else None
print(json.dumps({
    "status": "PASS",
    "environment": "STAGING",
    "production_touch": False,
    "server_version": server_version,
    "wal_level": wal_level,
    "archive_mode": archive_mode,
    "data_checksums": data_checksums,
    "force_rls_tables": int(rls_forced),
    "before_lsn": before_lsn,
    "after_lsn": after_lsn,
    "pg_switch_wal_authorized": pg_switch_wal_authorized == "t",
    "archive_observation_attempted": archive_observation_attempted == "true",
    "wal_archive_event_verified": archive_verified,
    "archived_count_before": optional_int(archived_count_before),
    "archived_count": optional_int(archived_count),
    "failed_archive_count_before": optional_int(failed_count_before),
    "failed_archive_count": optional_int(failed_count),
    "archive_stats_reset": stats_reset or None,
    "switched_wal": switched_wal or None,
    "last_archived_wal": last_archived_wal or None,
    "switched_wal_archived": archive_verified,
    "pitr_probe_table": "kaios_runtime.pitr_probe_v2",
    "pitr_before_marker": before_marker,
    "pitr_after_marker": after_marker,
    "pitr_before_marker_digest": before_digest,
    "pitr_after_marker_digest": after_digest,
    "pitr_target_time": target_time,
    "target_time_precision": "WHOLE_SECOND_UTC",
    "marker_target_guard_seconds_minimum": 2,
    "marker_boundary_order_verified": True,
    "fixture_state": "TARGET_BOUNDARY_FIXTURE_AND_WAL_ARCHIVE_EVENT_VERIFIED" if archive_verified else "TARGET_BOUNDARY_FIXTURE_VERIFIED__WAL_ARCHIVE_EVENT_NOT_VERIFIED",
    "pitr_capability": "NOT_VERIFIED",
    "base_backup_verified": False,
    "archive_restore_path_verified": False,
    "restore_capability_verified": False,
    "restore_actuator_configured": False,
    "restore_performed_by_this_script": False
}, separators=(",", ":")))
PY
