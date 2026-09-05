#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"
: "${PGDATABASE:?PGDATABASE is required}"
[[ "$KAIOS_ENVIRONMENT" == staging ]] || { echo 'staging only' >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == false ]] || { echo 'production promotion must remain false' >&2; exit 64; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGISTRY="$ROOT_DIR/coordination/kidults/source-intelligence/global-sold-source-registry-v1.json"
CONTROL_BASE="$ROOT_DIR/services/kidults-control-plane/migrations/postgres/0001_system_of_record.sql"
RUNTIME_BASE="$ROOT_DIR/infrastructure/postgres/dual-staging/0001_runtime_projection_boundary.sql"
REGISTRY_MIGRATION="$ROOT_DIR/infrastructure/postgres/source-intelligence/0001_global_sold_source_registry_v1.sql"
SQL_PACKET="${RUNNER_TEMP:-/tmp}/kidults-global-source-registry-${GITHUB_RUN_ID:-local}-$$.sql"
trap 'rm -f -- "$SQL_PACKET"' EXIT

psql_scalar() {
  psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="$1"
}

node "$ROOT_DIR/scripts/kidults/source-intelligence/global-sold-source-registry-v1.mjs" "$REGISTRY" >/dev/null
control_schema_present="$(psql_scalar "SELECT to_regnamespace('kidults_control') IS NOT NULL")"
control_base_applied=false
if [[ "$control_schema_present" == f ]]; then
  psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file="$CONTROL_BASE" >/dev/null
  control_base_applied=true
else
  [[ "$(psql_scalar "SELECT to_regclass('kidults_control.writer_principals') IS NOT NULL")" == t ]] || { echo 'partial kidults_control schema' >&2; exit 1; }
  [[ "$(psql_scalar "SELECT to_regprocedure('kidults_control.enforce_registered_writer()') IS NOT NULL")" == t ]] || { echo 'missing registered-writer control' >&2; exit 1; }
fi

runtime_migration_present="$(psql_scalar "SELECT COALESCE((SELECT count(*)::text FROM kaios_runtime.schema_migrations WHERE version='0001_runtime_projection_boundary'),'0')" 2>/dev/null || printf 0)"
runtime_base_applied=false
if [[ "$runtime_migration_present" != 1 ]]; then
  psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file="$RUNTIME_BASE" >/dev/null
  runtime_base_applied=true
fi

registry_tables_before="$(psql_scalar "SELECT (to_regclass('kidults_control.global_source_registry_snapshot_ledger') IS NOT NULL)::int || '|' || (to_regclass('kidults_control.global_source_assessment_ledger') IS NOT NULL)::int")"
psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file="$REGISTRY_MIGRATION" >/dev/null
snapshot_digest="$(node -e "const r=require(process.argv[1]); process.stdout.write(r.snapshot_digest)" "$REGISTRY")"
before_counts="$(psql_scalar "SELECT count(*) || '|' || (SELECT count(*) FROM kidults_control.global_source_assessment_ledger WHERE snapshot_digest='$snapshot_digest') FROM kidults_control.global_source_registry_snapshot_ledger WHERE snapshot_digest='$snapshot_digest'")"
node "$ROOT_DIR/scripts/kidults/source-intelligence/global-sold-source-registry-v1.mjs" --emit-postgres-sql "$REGISTRY" > "$SQL_PACKET"
psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file="$SQL_PACKET" >/dev/null
after_counts="$(psql_scalar "SELECT count(*) || '|' || (SELECT count(*) FROM kidults_control.global_source_assessment_ledger WHERE snapshot_digest='$snapshot_digest') FROM kidults_control.global_source_registry_snapshot_ledger WHERE snapshot_digest='$snapshot_digest'")"
[[ "$after_counts" == '1|19' ]] || { echo "unexpected registry counts: $after_counts" >&2; exit 1; }

python3 - "$snapshot_digest" "$registry_tables_before" "$before_counts" "$after_counts" "$control_base_applied" "$runtime_base_applied" <<'PY'
import json, sys
digest, tables_before, before, after, control_applied, runtime_applied=sys.argv[1:]
before_snapshot,before_assessments=map(int,before.split('|'))
after_snapshot,after_assessments=map(int,after.split('|'))
print(json.dumps({
  'id':'kidults-global-sold-source-registry-staging-load-receipt-v1',
  'status':'VERIFIED_PASS',
  'environment':'STAGING',
  'snapshot_digest':digest,
  'source_count':19,
  'registry_tables_present_before':tables_before=='1|1',
  'control_base_applied':control_applied=='true',
  'runtime_base_applied':runtime_applied=='true',
  'snapshot_rows_inserted':after_snapshot-before_snapshot,
  'assessment_rows_inserted':after_assessments-before_assessments,
  'snapshot_rows_after':after_snapshot,
  'assessment_rows_after':after_assessments,
  'acquisition_authorized':False,
  'adapter_activation_authorized':False,
  'production':'HOLD','public_release':'HOLD','g5':'HOLD'
},separators=(',',':')))
PY
