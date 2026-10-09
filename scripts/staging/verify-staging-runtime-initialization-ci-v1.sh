#!/usr/bin/env bash
set -euo pipefail
# Disposable CI PostgreSQL only: no provider credential or remote access.
[[ "${GITHUB_ACTIONS:-}" == true ]] || exit 64
[[ "${KAIOS_POSTGRES_DSN:-}" == 'postgresql://postgres:postgres@127.0.0.1:5432/kaios' ]] || exit 64
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
task_temp="$(mktemp -d)"
trap 'rm -rf -- "$task_temp"' EXIT
umask 077
printf '[kaios-staging]\nhost=127.0.0.1\nport=5432\ndbname=kaios\nuser=postgres\n' > "$task_temp/service"
printf '127.0.0.1:5432:kaios:postgres:postgres\n' > "$task_temp/password"
export PGSERVICE=kaios-staging PGSERVICEFILE="$task_temp/service" PGPASSFILE="$task_temp/password"
unset PGDATABASE PGPASSWORD
export KAIOS_POSTGRES_TUNNEL_CONNECTION_BOUND=true KAIOS_STAGING_RUNTIME_SCHEMA_INITIALIZATION_AUTHORIZED=true
bash "$root/scripts/staging/initialize-staging-runtime-schema-v1.sh"
psql --no-psqlrc --no-password --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kaios_runtime' AND c.relrowsecurity AND c.relforcerowsecurity" | grep -qx 4
before="$(psql --no-psqlrc --no-password --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SELECT md5(string_agg(version || applied_at::text, chr(10) ORDER BY version)) FROM kaios_runtime.schema_migrations')"
bash "$root/scripts/staging/initialize-staging-runtime-schema-v1.sh"
after="$(psql --no-psqlrc --no-password --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SELECT md5(string_agg(version || applied_at::text, chr(10) ORDER BY version)) FROM kaios_runtime.schema_migrations')"
test "$before" = "$after"
marker="quoted'value:with\\backslash"
if psql --no-psqlrc --no-password --set=ON_ERROR_STOP=1 --set="marker=$marker" --command="SELECT :'marker'" >/dev/null 2>&1; then exit 1; fi
actual="$(psql --no-psqlrc --no-password --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --set="marker=$marker" --file=- <<'SQL'
SELECT :'marker';
SQL
)"
test "$actual" = "$marker"
psql --no-psqlrc --no-password --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="SELECT true || '|' || true" | grep -qx 'true|true'
printf 'STAGING_INITIALIZATION_AND_REAL_PSQL_INTERPOLATION_VERIFIED\n'
