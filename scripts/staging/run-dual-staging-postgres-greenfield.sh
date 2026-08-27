#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT_DIR/infrastructure/postgres/dual-staging/0001_runtime_projection_boundary.sql"

: "${KAIOS_POSTGRES_DSN:?KAIOS_POSTGRES_DSN is required}"
: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"

if [[ "$KAIOS_ENVIRONMENT" != "staging" ]]; then
  echo "Refusing greenfield migration outside staging" >&2
  exit 64
fi
if [[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" != "false" ]]; then
  echo "Production promotion must remain false" >&2
  exit 64
fi
command -v psql >/dev/null 2>&1 || {
  echo "psql is required" >&2
  exit 69
}
[[ -f "$MIGRATION" ]] || {
  echo "Canonical migration missing: $MIGRATION" >&2
  exit 66
}

psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" <<SQL
SELECT pg_advisory_lock(hashtextextended('kaios_runtime_greenfield_v1', 0));
\i '$MIGRATION'
SELECT pg_advisory_unlock(hashtextextended('kaios_runtime_greenfield_v1', 0));
SQL

psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --dbname="$KAIOS_POSTGRES_DSN" <<'SQL' | grep -qx '1'
SELECT count(*)
FROM kaios_runtime.schema_migrations
WHERE version = '0001_runtime_projection_boundary';
SQL

printf 'POSTGRES_GREENFIELD_MIGRATION_PASS\n'
