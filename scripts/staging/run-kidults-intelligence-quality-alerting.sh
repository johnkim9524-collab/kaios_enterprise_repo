#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="${ROOT_DIR:-/opt/intelligence-holdings/staging/kaios-enterprise}"
APP_DIR="${ROOT_DIR}/apps/kidults-enterprise-staging"
OPERATIONS_DIR="${KIDULTS_OPERATIONS_DATA_DIR:-/opt/intelligence-holdings/staging/data/kidults-operations}"

[[ "${ROOT_DIR}" == /opt/intelligence-holdings/staging/* ]] || {
  echo "ROOT_DIR must remain inside /opt/intelligence-holdings/staging" >&2
  exit 1
}

node "${APP_DIR}/quality-alerts.mjs" evaluate \
  --public "${APP_DIR}/public" \
  --operations "${OPERATIONS_DIR}" \
  --policy "${APP_DIR}/operations/quality-policy.staging.json"
