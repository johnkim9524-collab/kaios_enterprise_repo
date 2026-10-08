#!/usr/bin/env bash
set -euo pipefail
[[ "${KAIOS_ENVIRONMENT:-}" == staging && "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:-}" == false ]] || exit 64
[[ "${KAIOS_STAGING_RUNTIME_SCHEMA_INITIALIZATION_AUTHORIZED:-}" == true ]] || exit 64
[[ "${KAIOS_POSTGRES_TUNNEL_CONNECTION_BOUND:-}" == true && "${PGSERVICE:-}" == kaios-staging ]] || exit 64
[[ -f "${PGSERVICEFILE:-}" && -f "${PGPASSFILE:-}" ]] || exit 66
[[ -z "${PGDATABASE:-}" && -z "${PGPASSWORD:-}" ]] || exit 64
migration="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/infrastructure/postgres/dual-staging/0001_runtime_projection_boundary.sql"
[[ -f "$migration" ]] || exit 66
# Serialize the absence check and canonical transactional migration in one session.
# An existing schema is never altered by this initialization route.
psql --no-psqlrc --no-password --quiet --output=/dev/null --set=ON_ERROR_STOP=1 --set="migration=$migration" <<'SQL'
SELECT pg_advisory_lock(hashtextextended('kaios_runtime_greenfield_v1', 0));
SELECT to_regnamespace('kaios_runtime') IS NULL AS schema_absent \gset
\if :schema_absent
\i :migration
\endif
SELECT pg_advisory_unlock(hashtextextended('kaios_runtime_greenfield_v1', 0));
SQL
