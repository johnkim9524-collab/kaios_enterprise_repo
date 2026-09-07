#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

for command_name in git pg_config python3 sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required" >&2; exit 69; }
done

PG_BINDIR="$(pg_config --bindir)"
for command_name in initdb pg_basebackup pg_ctl pg_isready psql; do
  test -x "$PG_BINDIR/$command_name" || { echo "$PG_BINDIR/$command_name is required" >&2; exit 69; }
done

REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"
SOURCE_SHA="$(git -C "$REPOSITORY_ROOT" show -s --format=%H HEAD)"
SOURCE_TREE="$(git -C "$REPOSITORY_ROOT" show -s --format=%T HEAD)"
OUTPUT_DIRECTORY="$REPOSITORY_ROOT/artifacts/kir-ephemeral-postgres-runtime"
RUNTIME_ROOT="$(mktemp -d "${RUNNER_TEMP:-/tmp}/kir-postgres-runtime.XXXXXXXX")"
SOURCE_DATA="$RUNTIME_ROOT/source"
SOURCE_SOCKET="$RUNTIME_ROOT/source-socket"
ARCHIVE_DIRECTORY="$RUNTIME_ROOT/archive"
BASE_BACKUP="$RUNTIME_ROOT/base-backup"
RECOVERY_DATA="$RUNTIME_ROOT/recovery"
RECOVERY_SOCKET="$RUNTIME_ROOT/recovery-socket"
SOURCE_LOG="$RUNTIME_ROOT/source.log"
RECOVERY_LOG="$RUNTIME_ROOT/recovery.log"
SOURCE_PORT=55432
RECOVERY_PORT=55433
SOURCE_STARTED=false
RECOVERY_STARTED=false

cleanup() {
  if [[ "$RECOVERY_STARTED" == true ]]; then
    "$PG_BINDIR/pg_ctl" -D "$RECOVERY_DATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  if [[ "$SOURCE_STARTED" == true ]]; then
    "$PG_BINDIR/pg_ctl" -D "$SOURCE_DATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf -- "$RUNTIME_ROOT"
}
trap cleanup EXIT

mkdir -p "$SOURCE_SOCKET" "$RECOVERY_SOCKET" "$ARCHIVE_DIRECTORY" "$OUTPUT_DIRECTORY"
receipt_path="$OUTPUT_DIRECTORY/receipt.json"
python3 - "$receipt_path" "$SOURCE_SHA" "$SOURCE_TREE" <<'PY'
import json, pathlib, sys
path, sha, tree = sys.argv[1:]
pathlib.Path(path).write_text(json.dumps({
    "schema": "KIDULTS_KIR_EPHEMERAL_POSTGRES_RUNTIME_V1",
    "state": "VERIFIED_FAIL",
    "failure_class": "OPERATIONAL_RUNTIME_NOT_COMPLETED",
    "source_sha": sha,
    "source_tree": tree,
    "environment": "EPHEMERAL_CI",
    "production": "HOLD",
    "public_release": "HOLD",
    "g5": "HOLD",
}, indent=2) + "\n", encoding="utf-8")
PY
"$PG_BINDIR/initdb" --no-locale --encoding=UTF8 --data-checksums --auth=trust -D "$SOURCE_DATA" >/dev/null
cat >> "$SOURCE_DATA/postgresql.conf" <<EOF
listen_addresses = ''
port = $SOURCE_PORT
unix_socket_directories = '$SOURCE_SOCKET'
wal_level = replica
archive_mode = on
archive_command = 'test ! -f "$ARCHIVE_DIRECTORY/%f" && cp "%p" "$ARCHIVE_DIRECTORY/%f"'
archive_timeout = 1s
fsync = on
synchronous_commit = on
full_page_writes = on
EOF

if ! "$PG_BINDIR/pg_ctl" -D "$SOURCE_DATA" -l "$SOURCE_LOG" -w start >/dev/null; then
  cat "$SOURCE_LOG" >&2
  exit 1
fi
SOURCE_STARTED=true
export PGHOST="$SOURCE_SOCKET" PGPORT="$SOURCE_PORT" PGDATABASE=postgres

psql_scalar() {
  "$PG_BINDIR/psql" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="$1"
}

"$PG_BINDIR/psql" --no-psqlrc --quiet --set=ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA kir_runtime;
CREATE TABLE kir_runtime.runtime_probe (
  marker text PRIMARY KEY,
  phase text NOT NULL CHECK (phase IN ('BEFORE_TARGET', 'AFTER_TARGET')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO kir_runtime.runtime_probe(marker, phase) VALUES ('before-target', 'BEFORE_TARGET');
BEGIN;
INSERT INTO kir_runtime.runtime_probe(marker, phase) VALUES ('rolled-back', 'AFTER_TARGET');
ROLLBACK;
SQL

rollback_count="$(psql_scalar "SELECT count(*) FROM kir_runtime.runtime_probe WHERE marker='rolled-back'")"
[[ "$rollback_count" == 0 ]] || { echo "rollback probe persisted" >&2; exit 1; }

first_backend_pid="$(psql_scalar 'SELECT pg_backend_pid()')"
second_backend_pid="$(psql_scalar 'SELECT pg_backend_pid()')"
[[ "$first_backend_pid" != "$second_backend_pid" ]] || { echo "reconnect did not create a distinct backend" >&2; exit 1; }

"$PG_BINDIR/pg_basebackup" -D "$BASE_BACKUP" --format=plain --wal-method=stream --checkpoint=fast --no-password >/dev/null
pitr_target_time="$(psql_scalar "SELECT to_char(clock_timestamp(), 'YYYY-MM-DD HH24:MI:SS.USOF')")"
sleep 2
"$PG_BINDIR/psql" --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --command="INSERT INTO kir_runtime.runtime_probe(marker, phase) VALUES ('after-target', 'AFTER_TARGET')"
switched_wal="$(psql_scalar 'SELECT pg_walfile_name(pg_switch_wal())')"

archive_verified=false
for _attempt in $(seq 1 30); do
  last_archived_wal="$(psql_scalar "SELECT COALESCE(last_archived_wal, '') FROM pg_stat_archiver")"
  if [[ "$last_archived_wal" == "$switched_wal" && -f "$ARCHIVE_DIRECTORY/$switched_wal" ]]; then
    archive_verified=true
    break
  fi
  sleep 1
done
[[ "$archive_verified" == true ]] || { echo "WAL archive did not reach $switched_wal" >&2; exit 1; }

"$PG_BINDIR/pg_ctl" -D "$SOURCE_DATA" -m fast -w restart >/dev/null
SOURCE_STARTED=true
"$PG_BINDIR/pg_isready" -h "$SOURCE_SOCKET" -p "$SOURCE_PORT" -d postgres >/dev/null
persistent_count="$(psql_scalar "SELECT count(*) FROM kir_runtime.runtime_probe WHERE marker IN ('before-target','after-target')")"
[[ "$persistent_count" == 2 ]] || { echo "restart persistence probe failed" >&2; exit 1; }

"$PG_BINDIR/pg_ctl" -D "$SOURCE_DATA" -m fast -w stop >/dev/null
SOURCE_STARTED=false
cp -a -- "$BASE_BACKUP" "$RECOVERY_DATA"
cat >> "$RECOVERY_DATA/postgresql.auto.conf" <<EOF
port = $RECOVERY_PORT
unix_socket_directories = '$RECOVERY_SOCKET'
restore_command = 'cp "$ARCHIVE_DIRECTORY/%f" "%p"'
recovery_target_time = '$pitr_target_time'
recovery_target_action = 'promote'
EOF
touch "$RECOVERY_DATA/recovery.signal"

if ! "$PG_BINDIR/pg_ctl" -D "$RECOVERY_DATA" -l "$RECOVERY_LOG" -w start >/dev/null; then
  cat "$RECOVERY_LOG" >&2
  exit 1
fi
RECOVERY_STARTED=true
export PGHOST="$RECOVERY_SOCKET" PGPORT="$RECOVERY_PORT"
"$PG_BINDIR/pg_isready" -h "$RECOVERY_SOCKET" -p "$RECOVERY_PORT" -d postgres >/dev/null
recovered_before="$(psql_scalar "SELECT count(*) FROM kir_runtime.runtime_probe WHERE marker='before-target'")"
recovered_after="$(psql_scalar "SELECT count(*) FROM kir_runtime.runtime_probe WHERE marker='after-target'")"
recovery_promoted="$(psql_scalar 'SELECT NOT pg_is_in_recovery()')"
[[ "$recovered_before" == 1 && "$recovered_after" == 0 && "$recovery_promoted" == t ]] || {
  echo "PITR boundary recovery failed: before=$recovered_before after=$recovered_after promoted=$recovery_promoted" >&2
  exit 1
}

server_version="$(psql_scalar 'SHOW server_version')"
data_checksums="$(psql_scalar 'SHOW data_checksums')"
wal_level="$(psql_scalar 'SHOW wal_level')"
archive_count="$(find "$ARCHIVE_DIRECTORY" -maxdepth 1 -type f | wc -l | tr -d ' ')"
python3 - "$receipt_path" "$SOURCE_SHA" "$SOURCE_TREE" "$server_version" "$data_checksums" "$wal_level" "$archive_count" "$pitr_target_time" <<'PY'
import json, pathlib, sys
path, sha, tree, version, checksums, wal_level, archive_count, target = sys.argv[1:]
payload = {
    "schema": "KIDULTS_KIR_EPHEMERAL_POSTGRES_RUNTIME_V1",
    "state": "VERIFIED_PASS",
    "source_sha": sha,
    "source_tree": tree,
    "environment": "EPHEMERAL_CI",
    "production_touch": False,
    "public_touch": False,
    "g5_touch": False,
    "server_version": version,
    "data_checksums": checksums,
    "wal_level": wal_level,
    "connect_verified": True,
    "reconnect_verified": True,
    "restart_verified": True,
    "transaction_rollback_verified": True,
    "persistence_verified": True,
    "wal_archive_verified": True,
    "archived_wal_file_count": int(archive_count),
    "pitr_compatibility_verified": True,
    "physical_base_backup_verified": True,
    "recovery_target_time": target,
    "recovery_verified": True,
    "before_target_present": True,
    "after_target_absent": True,
    "fail_closed": True,
    "production": "HOLD",
    "public_release": "HOLD",
    "g5": "HOLD",
}
pathlib.Path(path).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
sha256sum "$receipt_path" > "$receipt_path.sha256"
cat "$receipt_path"
cat "$receipt_path.sha256"
