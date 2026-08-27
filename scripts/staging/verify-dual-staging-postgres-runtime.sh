#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RLS_SUITE="$ROOT_DIR/infrastructure/postgres/dual-staging/verify_runtime_rls.sql"
ROLLBACK_SQL="$ROOT_DIR/infrastructure/postgres/dual-staging/rollback_0001_runtime_projection_boundary.sql"
GREENFIELD="$ROOT_DIR/scripts/staging/run-dual-staging-postgres-greenfield.sh"

: "${KAIOS_POSTGRES_DSN:?KAIOS_POSTGRES_DSN is required}"
: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"

[[ "$KAIOS_ENVIRONMENT" == "staging" ]] || { echo "staging only" >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == "false" ]] || { echo "production promotion must remain false" >&2; exit 64; }
for command_name in psql pg_dump pg_restore sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required" >&2; exit 69; }
done

psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --file="$RLS_SUITE" \
  | grep -q 'POSTGRES_RLS_ATTACK_SUITE_PASS'

nonce_digest="$(printf '%s' "${GITHUB_RUN_ID:-local}-$$-$(date +%s%N)" | sha256sum | awk '{print $1}')"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

for index in $(seq 1 20); do
  (
    psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
      --dbname="$KAIOS_POSTGRES_DSN" \
      --set="nonce_digest=$nonce_digest" <<'SQL' >"$tmpdir/$index.out"
SET ROLE kaios_runtime_ci_app;
WITH tenant_context AS MATERIALIZED (
  SELECT set_config('app.tenant_id', 'tenant-rls-a', true)
), inserted AS (
  INSERT INTO kaios_runtime.export_nonces (
    tenant_id, vertical, entitlement_id, nonce_digest, projection_digest
  )
  SELECT 'tenant-rls-a', 'kidults', 'ent-rls-a', :'nonce_digest', repeat('a', 64)
  FROM tenant_context
  ON CONFLICT DO NOTHING
  RETURNING 1
)
SELECT count(*) FROM inserted;
SQL
  ) &
done
wait

successes="$(awk '{sum += $1} END {print sum + 0}' "$tmpdir"/*.out)"
[[ "$successes" == "1" ]] || {
  echo "nonce concurrency failure: expected exactly one insert, got $successes" >&2
  exit 1
}

backup="$tmpdir/kaios_runtime.dump"
pg_dump --dbname="$KAIOS_POSTGRES_DSN" --format=custom --schema=kaios_runtime --file="$backup"
pg_restore --list "$backup" >/dev/null

if [[ -n "${KAIOS_POSTGRES_RESTORE_DSN:-}" ]]; then
  pg_restore --exit-on-error --no-owner --dbname="$KAIOS_POSTGRES_RESTORE_DSN" "$backup"
  psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --dbname="$KAIOS_POSTGRES_RESTORE_DSN" <<'SQL' | grep -qx '1|4'
SELECT
  (SELECT count(*) FROM kaios_runtime.schema_migrations WHERE version = '0001_runtime_projection_boundary')
  || '|' ||
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'kaios_runtime' AND c.relrowsecurity AND c.relforcerowsecurity);
SQL

  KAIOS_POSTGRES_DSN="$KAIOS_POSTGRES_RESTORE_DSN" \
    psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_RESTORE_DSN" --file="$RLS_SUITE" \
    | grep -q 'POSTGRES_RLS_ATTACK_SUITE_PASS'

  KAIOS_ALLOW_DESTRUCTIVE_ROLLBACK=true \
  KAIOS_POSTGRES_DSN="$KAIOS_POSTGRES_RESTORE_DSN" \
    "$ROOT_DIR/scripts/staging/rollback-dual-staging-postgres-greenfield.sh"

  if psql --no-psqlrc --quiet --tuples-only --no-align --dbname="$KAIOS_POSTGRES_RESTORE_DSN" \
    --command="SELECT to_regnamespace('kaios_runtime') IS NULL" | grep -qx 't'; then
    :
  else
    echo "rollback verification failed" >&2
    exit 1
  fi

  KAIOS_POSTGRES_DSN="$KAIOS_POSTGRES_RESTORE_DSN" "$GREENFIELD"
fi

printf 'POSTGRES_RUNTIME_VERIFICATION_PASS rls=pass concurrency=pass logical_backup=pass restore=%s rollback=%s\n' \
  "${KAIOS_POSTGRES_RESTORE_DSN:+pass}" "${KAIOS_POSTGRES_RESTORE_DSN:+pass}"
