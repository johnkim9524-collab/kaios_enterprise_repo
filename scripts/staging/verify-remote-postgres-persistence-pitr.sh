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

server_version="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SHOW server_version")"
wal_level="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SHOW wal_level")"
archive_mode="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SHOW archive_mode")"
data_checksums="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SHOW data_checksums")"

case "$wal_level" in replica|logical) ;; *) echo "wal_level must support PITR, got $wal_level" >&2; exit 1;; esac
[[ "$archive_mode" == "on" || "$archive_mode" == "always" ]] || { echo "archive_mode must be enabled for PITR evidence" >&2; exit 1; }

schema_present="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SELECT to_regnamespace('kaios_runtime') IS NOT NULL")"
[[ "$schema_present" == "t" ]] || { echo 'kaios_runtime schema is not present on persistent staging' >&2; exit 1; }

rls_forced="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kaios_runtime' AND c.relrowsecurity AND c.relforcerowsecurity")"
[[ "$rls_forced" =~ ^[0-9]+$ ]] || { echo 'invalid RLS count' >&2; exit 1; }
(( rls_forced >= 4 )) || { echo "expected at least 4 FORCE RLS tables, got $rls_forced" >&2; exit 1; }

before_lsn="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SELECT pg_current_wal_lsn()")"
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
before_marker="pitr-before-${stamp}"
after_marker="pitr-after-${stamp}"
before_digest="$(printf '%s' "$before_marker" | sha256sum | awk '{print $1}')"
after_digest="$(printf '%s' "$after_marker" | sha256sum | awk '{print $1}')"

psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --set="marker=$before_marker" --set="digest=$before_digest" <<'SQL'
BEGIN;
CREATE TABLE IF NOT EXISTS kaios_runtime.pitr_probe (
  marker text PRIMARY KEY,
  marker_digest text NOT NULL CHECK (marker_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO kaios_runtime.pitr_probe(marker, marker_digest)
VALUES (:'marker', :'digest');
COMMIT;
CHECKPOINT;
SQL

pitr_target_time="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SELECT clock_timestamp() AT TIME ZONE 'UTC'")"
psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SELECT pg_sleep(1)" >/dev/null

psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --set="marker=$after_marker" --set="digest=$after_digest" <<'SQL'
BEGIN;
INSERT INTO kaios_runtime.pitr_probe(marker, marker_digest)
VALUES (:'marker', :'digest');
COMMIT;
CHECKPOINT;
SQL

after_lsn="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SELECT pg_current_wal_lsn()")"
[[ "$before_lsn" != "$after_lsn" ]] || { echo 'WAL LSN did not advance' >&2; exit 1; }

archive_status="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --command="SELECT archived_count || '|' || failed_count FROM pg_stat_archiver")"
archived_count="${archive_status%%|*}"
failed_count="${archive_status##*|}"
[[ "$archived_count" =~ ^[0-9]+$ && "$failed_count" =~ ^[0-9]+$ ]] || { echo 'invalid pg_stat_archiver counters' >&2; exit 1; }

before_exists="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --set="marker=$before_marker" --command="SELECT count(*) FROM kaios_runtime.pitr_probe WHERE marker=:'marker'")"
after_exists="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --set="marker=$after_marker" --command="SELECT count(*) FROM kaios_runtime.pitr_probe WHERE marker=:'marker'")"
[[ "$before_exists" == "1" && "$after_exists" == "1" ]] || { echo 'PITR probe markers are not durable' >&2; exit 1; }

printf '{"status":"PASS","environment":"STAGING","production_touch":false,"server_version":"%s","wal_level":"%s","archive_mode":"%s","data_checksums":"%s","force_rls_tables":%s,"before_lsn":"%s","after_lsn":"%s","archived_count":%s,"failed_archive_count":%s,"before_marker":"%s","before_marker_digest":"%s","after_marker":"%s","after_marker_digest":"%s","pitr_target_time":"%s","pitr_capability":"READY_FOR_TARGET_TIME_RESTORE_EXERCISE"}\n' \
  "$server_version" "$wal_level" "$archive_mode" "$data_checksums" "$rls_forced" "$before_lsn" "$after_lsn" "$archived_count" "$failed_count" "$before_marker" "$before_digest" "$after_marker" "$after_digest" "$pitr_target_time"
