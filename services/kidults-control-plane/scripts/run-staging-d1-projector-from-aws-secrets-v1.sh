#!/usr/bin/env bash
set -euo pipefail
: "${AWS_REGION:=ap-northeast-2}"
: "${POSTGRES_SECRET_ID:=kidults/staging/d1-projector/postgres-dsn}"
: "${CLOUDFLARE_SECRET_ID:=kidults/staging/d1-projector/cloudflare-api-token}"

cleanup() {
  unset POSTGRES_DSN CLOUDFLARE_API_TOKEN
}
trap cleanup EXIT HUP INT TERM

POSTGRES_DSN="$(aws secretsmanager get-secret-value \
  --region "$AWS_REGION" --secret-id "$POSTGRES_SECRET_ID" \
  --query SecretString --output text --no-cli-pager)"
CLOUDFLARE_API_TOKEN="$(aws secretsmanager get-secret-value \
  --region "$AWS_REGION" --secret-id "$CLOUDFLARE_SECRET_ID" \
  --query SecretString --output text --no-cli-pager)"
export POSTGRES_DSN CLOUDFLARE_API_TOKEN
exec node scripts/run-staging-d1-projector-once-v1.mjs
