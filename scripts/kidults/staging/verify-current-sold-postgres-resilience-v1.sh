#!/usr/bin/env bash
set -euo pipefail

: "${KAIOS_POSTGRES_DSN:?KAIOS_POSTGRES_DSN required}"
: "${KIR_SQL_TEST_CONTAINER_ID:?KIR_SQL_TEST_CONTAINER_ID required}"
: "${CURRENT_SOLD_EXPECTED_HEAD_SHA:?CURRENT_SOLD_EXPECTED_HEAD_SHA required}"
[[ "$CURRENT_SOLD_EXPECTED_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]

receipt_dir='out/current-sold-postgres-resilience'
receipt_path="$receipt_dir/receipt.json"
mkdir -p "$receipt_dir"

write_fail_receipt() {
  cat > "$receipt_path" <<JSON
{
  "id": "kidults-current-sold-postgres-resilience-receipt-v1",
  "state": "VERIFIED_FAIL",
  "failure_code": "EXECUTION_INCOMPLETE_FAIL_CLOSED",
  "source_sha": "$CURRENT_SOLD_EXPECTED_HEAD_SHA",
  "database": "EPHEMERAL_PINNED_POSTGRESQL_16",
  "explicit_rollback_zero_rows": false,
  "disconnect_rollback_zero_rows": false,
  "restart_persistence_verified": false,
  "remote_database_authority": false,
  "production": "HOLD",
  "public": "HOLD",
  "g5": "HOLD"
}
JSON
  chmod 600 "$receipt_path"
}

write_pass_receipt() {
  cat > "$receipt_path" <<JSON
{
  "id": "kidults-current-sold-postgres-resilience-receipt-v1",
  "state": "VERIFIED_PASS",
  "failure_code": null,
  "source_sha": "$CURRENT_SOLD_EXPECTED_HEAD_SHA",
  "database": "EPHEMERAL_PINNED_POSTGRESQL_16",
  "explicit_rollback_zero_rows": true,
  "disconnect_rollback_zero_rows": true,
  "restart_persistence_verified": true,
  "remote_database_authority": false,
  "production": "HOLD",
  "public": "HOLD",
  "g5": "HOLD"
}
JSON
  chmod 600 "$receipt_path"
}

# Preserve a durable non-promotable terminal receipt even if any later attack fails.
write_fail_receipt

resilience_database='kaios_current_sold_resilience'
admin_dsn="${KAIOS_POSTGRES_DSN%/*}/postgres"
resilience_dsn="${KAIOS_POSTGRES_DSN%/*}/$resilience_database"
psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$admin_dsn" \
  --command="CREATE DATABASE $resilience_database"
psql_cmd=(psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$resilience_dsn")
"${psql_cmd[@]}" --file=infrastructure/postgres/current-sold/0001_current_sold_append_only_ledger_v1.sql

receipt_values() {
  local id="$1" digest_char="$2" digest_value=''
  [[ "$id" =~ ^[0-9a-f]{24}$ ]]
  printf -v digest_value '%*s' 64 ''
  digest_value="${digest_value// /$digest_char}"
  printf "('csr_%s','sha256:%s','synthetic-batch-%s','PASS','%s','kir-fixture-postgres-1','sha256:%064d','sha256:%064d','sha256:%064d','{\"receipt_id\":\"csr_%s\",\"batch_id\":\"synthetic-batch-%s\",\"status\":\"PASS\",\"source_sha\":\"%s\",\"canonical_run_id\":\"kir-fixture-postgres-1\",\"envelope_digest\":\"sha256:%064d\",\"event_versions_digest\":\"sha256:%064d\",\"evidence_digest\":\"sha256:%064d\"}'::jsonb)" \
    "$id" "$digest_value" "$id" "$CURRENT_SOLD_EXPECTED_HEAD_SHA" 4 5 6 "$id" "$id" "$CURRENT_SOLD_EXPECTED_HEAD_SHA" 4 5 6
}

rollback_id="${CURRENT_SOLD_EXPECTED_HEAD_SHA:0:24}"
commit_id="${CURRENT_SOLD_EXPECTED_HEAD_SHA:8:24}"
disconnect_id="${CURRENT_SOLD_EXPECTED_HEAD_SHA:16:24}"
rollback_receipt="$(receipt_values "$rollback_id" 7)"
commit_receipt="$(receipt_values "$commit_id" 8)"
disconnect_receipt="$(receipt_values "$disconnect_id" 9)"

"${psql_cmd[@]}" <<SQL
BEGIN;
INSERT INTO kidults_private.current_sold_batch_receipt_ledger
  (receipt_id,receipt_digest,batch_id,status,source_sha,canonical_run_id,envelope_digest,event_versions_digest,evidence_digest,receipt_payload)
VALUES $rollback_receipt;
ROLLBACK;
BEGIN;
INSERT INTO kidults_private.current_sold_batch_receipt_ledger
  (receipt_id,receipt_digest,batch_id,status,source_sha,canonical_run_id,envelope_digest,event_versions_digest,evidence_digest,receipt_payload)
VALUES $commit_receipt;
COMMIT;
SQL

"${psql_cmd[@]}" --tuples-only --no-align \
  --command="SELECT count(*) FROM kidults_private.current_sold_batch_receipt_ledger WHERE receipt_id='csr_$rollback_id'" \
  | grep -qx '0'
"${psql_cmd[@]}" --tuples-only --no-align \
  --command="SELECT count(*) FROM kidults_private.current_sold_batch_receipt_ledger WHERE receipt_id='csr_$commit_id'" \
  | grep -qx '1'

PGAPPNAME=kidults_current_sold_disconnect "${psql_cmd[@]}" <<SQL >/tmp/current-sold-disconnect.log 2>&1 &
BEGIN;
INSERT INTO kidults_private.current_sold_batch_receipt_ledger
  (receipt_id,receipt_digest,batch_id,status,source_sha,canonical_run_id,envelope_digest,event_versions_digest,evidence_digest,receipt_payload)
VALUES $disconnect_receipt;
SELECT pg_sleep(60);
COMMIT;
SQL
disconnect_pid=$!

for _ in $(seq 1 30); do
  backend_pid="$("${psql_cmd[@]}" --tuples-only --no-align --command="SELECT pid FROM pg_stat_activity WHERE application_name='kidults_current_sold_disconnect' LIMIT 1")"
  [[ "$backend_pid" =~ ^[0-9]+$ ]] && break
  sleep 1
done
[[ "${backend_pid:-}" =~ ^[0-9]+$ ]]
"${psql_cmd[@]}" --command="SELECT pg_terminate_backend($backend_pid)" >/dev/null
if wait "$disconnect_pid"; then
  echo 'disconnect transaction unexpectedly committed' >&2
  exit 1
fi
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT count(*) FROM kidults_private.current_sold_batch_receipt_ledger WHERE receipt_id='csr_$disconnect_id'" | grep -qx '0'

docker restart "$KIR_SQL_TEST_CONTAINER_ID" >/dev/null
for _ in $(seq 1 30); do
  pg_isready --dbname="$resilience_dsn" >/dev/null 2>&1 && break
  sleep 1
done
pg_isready --dbname="$resilience_dsn" >/dev/null
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT count(*) FROM kidults_private.current_sold_batch_receipt_ledger WHERE receipt_id='csr_$commit_id'" | grep -qx '1'

write_pass_receipt
