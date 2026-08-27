#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROLLBACK_SQL="$ROOT_DIR/infrastructure/postgres/dual-staging/rollback_0001_runtime_projection_boundary.sql"

: "${KAIOS_POSTGRES_DSN:?KAIOS_POSTGRES_DSN is required}"
: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"
: "${KAIOS_ALLOW_DESTRUCTIVE_ROLLBACK:?KAIOS_ALLOW_DESTRUCTIVE_ROLLBACK=true is required}"

[[ "$KAIOS_ENVIRONMENT" == "staging" ]] || { echo "rollback is staging-only" >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == "false" ]] || { echo "production promotion must remain false" >&2; exit 64; }
[[ "$KAIOS_ALLOW_DESTRUCTIVE_ROLLBACK" == "true" ]] || { echo "explicit destructive rollback acknowledgement required" >&2; exit 64; }
command -v psql >/dev/null 2>&1 || { echo "psql is required" >&2; exit 69; }

psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$KAIOS_POSTGRES_DSN" --file="$ROLLBACK_SQL"
printf 'POSTGRES_GREENFIELD_ROLLBACK_PASS\n'
