#!/usr/bin/env bash
set -euo pipefail

: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"
: "${KAIOS_POSTGRES_PITR_RESTORE_DSN:?KAIOS_POSTGRES_PITR_RESTORE_DSN is required}"
: "${KAIOS_PITR_BEFORE_MARKER:?KAIOS_PITR_BEFORE_MARKER is required}"
: "${KAIOS_PITR_AFTER_MARKER:?KAIOS_PITR_AFTER_MARKER is required}"
: "${KAIOS_PITR_TARGET_TIME:?KAIOS_PITR_TARGET_TIME is required}"

[[ "$KAIOS_ENVIRONMENT" == 'staging' ]] || { echo 'staging only' >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == 'false' ]] || { echo 'production promotion must remain false' >&2; exit 64; }
command -v psql >/dev/null 2>&1 || { echo 'psql is required' >&2; exit 69; }

before_count="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --dbname="$KAIOS_POSTGRES_PITR_RESTORE_DSN" \
  --set="marker=$KAIOS_PITR_BEFORE_MARKER" \
  --command="SELECT count(*) FROM kaios_runtime.pitr_probe WHERE marker=:'marker'")"
after_count="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --dbname="$KAIOS_POSTGRES_PITR_RESTORE_DSN" \
  --set="marker=$KAIOS_PITR_AFTER_MARKER" \
  --command="SELECT count(*) FROM kaios_runtime.pitr_probe WHERE marker=:'marker'")"

[[ "$before_count" == '1' ]] || { echo 'pre-target marker missing after PITR restore' >&2; exit 1; }
[[ "$after_count" == '0' ]] || { echo 'post-target marker survived PITR restore' >&2; exit 1; }

rls_forced="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --dbname="$KAIOS_POSTGRES_PITR_RESTORE_DSN" \
  --command="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kaios_runtime' AND c.relrowsecurity AND c.relforcerowsecurity")"
(( rls_forced >= 4 )) || { echo "RLS lost after PITR restore: $rls_forced" >&2; exit 1; }

migration_count="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --dbname="$KAIOS_POSTGRES_PITR_RESTORE_DSN" \
  --command="SELECT count(*) FROM kaios_runtime.schema_migrations")"
(( migration_count >= 1 )) || { echo 'migration ledger missing after PITR restore' >&2; exit 1; }

printf '{"status":"PASS","environment":"STAGING","production_touch":false,"target_time":"%s","pre_target_marker_count":1,"post_target_marker_count":0,"force_rls_tables":%s,"migration_rows":%s,"pitr":"TARGET_TIME_RESTORE_VERIFIED"}\n' \
  "$KAIOS_PITR_TARGET_TIME" "$rls_forced" "$migration_count"
