#!/usr/bin/env bash
set -euo pipefail

: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"
: "${KAIOS_POSTGRES_PITR_RESTORE_DSN:?KAIOS_POSTGRES_PITR_RESTORE_DSN is required}"
: "${KAIOS_PITR_BEFORE_MARKER:?KAIOS_PITR_BEFORE_MARKER is required}"
: "${KAIOS_PITR_AFTER_MARKER:?KAIOS_PITR_AFTER_MARKER is required}"
: "${KAIOS_PITR_BEFORE_MARKER_DIGEST:?KAIOS_PITR_BEFORE_MARKER_DIGEST is required}"
: "${KAIOS_PITR_AFTER_MARKER_DIGEST:?KAIOS_PITR_AFTER_MARKER_DIGEST is required}"
: "${KAIOS_PITR_TARGET_TIME:?KAIOS_PITR_TARGET_TIME is required}"

[[ "$KAIOS_ENVIRONMENT" == 'staging' ]] || { echo 'staging only' >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == 'false' ]] || { echo 'production promotion must remain false' >&2; exit 64; }
[[ "$KAIOS_PITR_BEFORE_MARKER_DIGEST" =~ ^[a-f0-9]{64}$ ]] || { echo 'invalid BEFORE digest' >&2; exit 64; }
[[ "$KAIOS_PITR_AFTER_MARKER_DIGEST" =~ ^[a-f0-9]{64}$ ]] || { echo 'invalid AFTER digest' >&2; exit 64; }
command -v psql >/dev/null 2>&1 || { echo 'psql is required' >&2; exit 69; }

before_row="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --dbname="$KAIOS_POSTGRES_PITR_RESTORE_DSN" \
  --set="marker=$KAIOS_PITR_BEFORE_MARKER" \
  --command="SELECT count(*) || '|' || COALESCE(max(marker_digest),'') || '|' || COALESCE(max(phase),'') FROM kaios_runtime.pitr_probe WHERE marker=:'marker'")"
before_count="${before_row%%|*}"
before_rest="${before_row#*|}"
before_digest="${before_rest%%|*}"
before_phase="${before_rest##*|}"
[[ "$before_count" == '1' ]] || { echo 'pre-target marker missing after PITR restore' >&2; exit 1; }
[[ "$before_digest" == "$KAIOS_PITR_BEFORE_MARKER_DIGEST" ]] || { echo 'pre-target marker digest mismatch' >&2; exit 1; }
[[ "$before_phase" == 'BEFORE_TARGET' ]] || { echo 'pre-target marker phase mismatch' >&2; exit 1; }

after_count="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --dbname="$KAIOS_POSTGRES_PITR_RESTORE_DSN" \
  --set="marker=$KAIOS_PITR_AFTER_MARKER" \
  --command="SELECT count(*) FROM kaios_runtime.pitr_probe WHERE marker=:'marker'")"
[[ "$after_count" == '0' ]] || { echo 'post-target marker survived PITR restore' >&2; exit 1; }

rls_forced="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --dbname="$KAIOS_POSTGRES_PITR_RESTORE_DSN" \
  --command="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kaios_runtime' AND c.relrowsecurity AND c.relforcerowsecurity")"
[[ "$rls_forced" =~ ^[0-9]+$ ]] || { echo 'invalid RLS count after restore' >&2; exit 1; }
(( rls_forced >= 4 )) || { echo "RLS lost after PITR restore: $rls_forced" >&2; exit 1; }

migration_count="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --dbname="$KAIOS_POSTGRES_PITR_RESTORE_DSN" \
  --command="SELECT count(*) FROM kaios_runtime.schema_migrations")"
[[ "$migration_count" =~ ^[0-9]+$ ]] || { echo 'invalid migration ledger count after restore' >&2; exit 1; }
(( migration_count >= 1 )) || { echo 'migration ledger missing after PITR restore' >&2; exit 1; }

python3 - "$KAIOS_PITR_TARGET_TIME" "$rls_forced" "$migration_count" "$KAIOS_PITR_BEFORE_MARKER_DIGEST" "$KAIOS_PITR_AFTER_MARKER_DIGEST" <<'PY'
import json, sys
print(json.dumps({
  "status": "PASS",
  "environment": "STAGING",
  "production_touch": False,
  "target_time": sys.argv[1],
  "pre_target_marker_count": 1,
  "post_target_marker_count": 0,
  "pre_target_marker_digest": sys.argv[4],
  "expected_post_target_marker_digest": sys.argv[5],
  "force_rls_tables": int(sys.argv[2]),
  "migration_rows": int(sys.argv[3]),
  "pitr": "TARGET_TIME_RESTORE_VERIFIED"
}, separators=(",", ":")))
PY
