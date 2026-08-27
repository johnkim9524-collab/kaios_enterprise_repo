#!/usr/bin/env bash
set -euo pipefail

: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"
: "${KAIOS_POSTGRES_DSN:?KAIOS_POSTGRES_DSN is required}"

[[ "$KAIOS_ENVIRONMENT" == "staging" ]] || { echo 'staging only' >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == "false" ]] || { echo 'production promotion must remain false' >&2; exit 64; }

for command_name in psql pg_isready sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required" >&2; exit 69; }
done

pg_isready --dbname="$KAIOS_POSTGRES_DSN" >/dev/null

psql_scalar() {
  psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="$1"
}

server_version="$(psql_scalar "SHOW server_version")"
wal_level="$(psql_scalar "SHOW wal_level")"
archive_mode="$(psql_scalar "SHOW archive_mode")"
data_checksums="$(psql_scalar "SHOW data_checksums")"

case "$wal_level" in replica|logical) ;; *) echo "wal_level must support PITR, got $wal_level" >&2; exit 1;; esac
[[ "$archive_mode" == "on" || "$archive_mode" == "always" ]] || { echo "archive_mode must be enabled for PITR evidence" >&2; exit 1; }

schema_present="$(psql_scalar "SELECT to_regnamespace('kaios_runtime') IS NOT NULL")"
[[ "$schema_present" == "t" ]] || { echo 'kaios_runtime schema is not present on persistent staging' >&2; exit 1; }

rls_forced="$(psql_scalar "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kaios_runtime' AND c.relrowsecurity AND c.relforcerowsecurity")"
[[ "$rls_forced" =~ ^[0-9]+$ ]] || { echo 'invalid RLS count' >&2; exit 1; }
(( rls_forced >= 4 )) || { echo "expected at least 4 FORCE RLS tables, got $rls_forced" >&2; exit 1; }

psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" <<'SQL'
CREATE TABLE IF NOT EXISTS kaios_runtime.pitr_probe (
  marker text PRIMARY KEY,
  marker_digest text NOT NULL CHECK (marker_digest ~ '^[a-f0-9]{64}$'),
  phase text NOT NULL CHECK (phase IN ('BEFORE_TARGET','AFTER_TARGET')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SQL

run_id="$(date -u +%Y%m%dT%H%M%S)-$$"
before_marker="pitr-before-${run_id}"
after_marker="pitr-after-${run_id}"
before_digest="$(printf '%s' "$before_marker" | sha256sum | awk '{print $1}')"
after_digest="$(printf '%s' "$after_marker" | sha256sum | awk '{print $1}')"
before_lsn="$(psql_scalar "SELECT pg_current_wal_lsn()")"

psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" \
  --set="marker=$before_marker" --set="digest=$before_digest" <<'SQL'
BEGIN;
INSERT INTO kaios_runtime.pitr_probe(marker, marker_digest, phase)
VALUES (:'marker', :'digest', 'BEFORE_TARGET');
COMMIT;
CHECKPOINT;
SQL

target_time="$(psql_scalar "SELECT clock_timestamp() AT TIME ZONE 'UTC'")"
sleep 1
psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" \
  --set="marker=$after_marker" --set="digest=$after_digest" <<'SQL'
BEGIN;
INSERT INTO kaios_runtime.pitr_probe(marker, marker_digest, phase)
VALUES (:'marker', :'digest', 'AFTER_TARGET');
COMMIT;
CHECKPOINT;
SELECT pg_switch_wal();
SQL

after_lsn="$(psql_scalar "SELECT pg_current_wal_lsn()")"
[[ "$before_lsn" != "$after_lsn" ]] || { echo 'WAL LSN did not advance' >&2; exit 1; }

archive_status="$(psql_scalar "SELECT archived_count || '|' || failed_count FROM pg_stat_archiver")"
archived_count="${archive_status%%|*}"
failed_count="${archive_status##*|}"
[[ "$archived_count" =~ ^[0-9]+$ && "$failed_count" =~ ^[0-9]+$ ]] || { echo 'invalid pg_stat_archiver counters' >&2; exit 1; }

for marker in "$before_marker" "$after_marker"; do
  marker_exists="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --dbname="$KAIOS_POSTGRES_DSN" --set="marker=$marker" \
    --command="SELECT count(*) FROM kaios_runtime.pitr_probe WHERE marker=:'marker'")"
  [[ "$marker_exists" == "1" ]] || { echo "PITR probe marker not durable: $marker" >&2; exit 1; }
done

python3 - "$server_version" "$wal_level" "$archive_mode" "$data_checksums" "$rls_forced" "$before_lsn" "$after_lsn" "$archived_count" "$failed_count" "$before_marker" "$after_marker" "$before_digest" "$after_digest" "$target_time" <<'PY'
import json, sys
(
    server_version, wal_level, archive_mode, data_checksums, rls_forced,
    before_lsn, after_lsn, archived_count, failed_count, before_marker,
    after_marker, before_digest, after_digest, target_time
) = sys.argv[1:]
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
    "archived_count": int(archived_count),
    "failed_archive_count": int(failed_count),
    "pitr_before_marker": before_marker,
    "pitr_after_marker": after_marker,
    "pitr_before_marker_digest": before_digest,
    "pitr_after_marker_digest": after_digest,
    "pitr_target_time": target_time,
    "pitr_capability": "TARGET_TIME_RESTORE_FIXTURE_READY"
}, separators=(",", ":")))
PY
