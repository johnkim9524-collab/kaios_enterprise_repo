#!/usr/bin/env bash
set -euo pipefail

: "${KAIOS_POSTGRES_DSN:?KAIOS_POSTGRES_DSN required}"
: "${KIR_SQL_TEST_CONTAINER_ID:?KIR_SQL_TEST_CONTAINER_ID required}"
: "${CURRENT_SOLD_EXPECTED_HEAD_SHA:?CURRENT_SOLD_EXPECTED_HEAD_SHA required}"
[[ "$CURRENT_SOLD_EXPECTED_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]

psql_cmd=(psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN")
"${psql_cmd[@]}" --file=infrastructure/postgres/current-sold/0001_current_sold_append_only_ledger_v1.sql

receipt_values() {
  local suffix="$1" digest_char="$2"
  printf "('csr_%024d','sha256:%064d','synthetic-batch-%s','PASS','%s','kir-fixture-postgres-1','sha256:%064d','sha256:%064d','sha256:%064d','{\"receipt_id\":\"csr_%024d\",\"batch_id\":\"synthetic-batch-%s\",\"status\":\"PASS\",\"source_sha\":\"%s\",\"canonical_run_id\":\"kir-fixture-postgres-1\",\"envelope_digest\":\"sha256:%064d\",\"event_versions_digest\":\"sha256:%064d\",\"evidence_digest\":\"sha256:%064d\"}'::jsonb)" \
    "$suffix" "$digest_char" "$suffix" "$CURRENT_SOLD_EXPECTED_HEAD_SHA" 4 5 6 "$suffix" "$suffix" "$CURRENT_SOLD_EXPECTED_HEAD_SHA" 4 5 6
}

rollback_receipt="$(receipt_values 1 7)"
commit_receipt="$(receipt_values 2 8)"
disconnect_receipt="$(receipt_values 3 9)"

"${psql_cmd[@]}" <<SQL
BEGIN;
INSERT INTO kidults_private.current_sold_batch_receipt_ledger
  (receipt_id,receipt_digest,batch_id,status,source_sha,canonical_run_id,envelope_digest,event_versions_digest,evidence_digest,receipt_payload)
VALUES $rollback_receipt;
ROLLBACK;
SELECT CASE WHEN count(*)=0 THEN 1 ELSE 1/0 END
  FROM kidults_private.current_sold_batch_receipt_ledger
 WHERE receipt_id='csr_000000000000000000000001';

BEGIN;
INSERT INTO kidults_private.current_sold_batch_receipt_ledger
  (receipt_id,receipt_digest,batch_id,status,source_sha,canonical_run_id,envelope_digest,event_versions_digest,evidence_digest,receipt_payload)
VALUES $commit_receipt;
COMMIT;
SELECT CASE WHEN count(*)=1 THEN 1 ELSE 1/0 END
  FROM kidults_private.current_sold_batch_receipt_ledger
 WHERE receipt_id='csr_000000000000000000000002';
SQL

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
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT count(*) FROM kidults_private.current_sold_batch_receipt_ledger WHERE receipt_id='csr_000000000000000000000003'" | grep -qx '0'

docker restart "$KIR_SQL_TEST_CONTAINER_ID" >/dev/null
for _ in $(seq 1 30); do
  pg_isready --dbname="$KAIOS_POSTGRES_DSN" >/dev/null 2>&1 && break
  sleep 1
done
pg_isready --dbname="$KAIOS_POSTGRES_DSN" >/dev/null
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT count(*) FROM kidults_private.current_sold_batch_receipt_ledger WHERE receipt_id='csr_000000000000000000000002'" | grep -qx '1'

mkdir -p out/current-sold-postgres-resilience
cat > out/current-sold-postgres-resilience/receipt.json <<JSON
{
  "id": "kidults-current-sold-postgres-resilience-receipt-v1",
  "state": "VERIFIED_PASS",
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
chmod 600 out/current-sold-postgres-resilience/receipt.json
