#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
APP_DIR="${ROOT_DIR}/apps/kidults-enterprise-staging"
RAW_PATH="${KIDULTS_COLLECTOR_RAW_PATH:-${ROOT_DIR}/data/raw/latest_signals.json}"
OPERATIONS_DIR="${KIDULTS_OPERATIONS_DATA_DIR:-/opt/intelligence-holdings/staging/data/kidults-operations}"
REGISTRY_PATH="${KIDULTS_SOURCE_REGISTRY_PATH:-${APP_DIR}/operations/source-registry.staging.json}"
VALIDATED_PATH="${OPERATIONS_DIR}/validated-signals.json"
AUDIT_PATH="${OPERATIONS_DIR}/collector-evidence-audit.jsonl"

[[ "${ROOT_DIR}" == /opt/intelligence-holdings/staging/* ]] || {
  echo "ROOT_DIR must remain inside /opt/intelligence-holdings/staging" >&2
  exit 1
}

cd "${ROOT_DIR}"

python3 - <<'PY'
import os

from app.collectors.source_collector import SourceCollector
from app.core.modes import RuntimeMode

max_attempts = int(os.getenv("KAIOS_COLLECTOR_MAX_ATTEMPTS", "3"))
report = SourceCollector(
    mode=RuntimeMode.LIVE,
    max_attempts=max_attempts,
).collect()
if report["status"] not in {"operational", "degraded"}:
    raise SystemExit("Collector did not produce an eligible live report")
PY

node "${APP_DIR}/collector-evidence.mjs" \
  --input "${RAW_PATH}" \
  --registry "${REGISTRY_PATH}" \
  --output "${VALIDATED_PATH}" \
  --audit "${AUDIT_PATH}"

node "${APP_DIR}/operations.mjs" refresh \
  --public "${APP_DIR}/public" \
  --operations "${OPERATIONS_DIR}" \
  --source "${VALIDATED_PATH}"

node "${APP_DIR}/quality-alerts.mjs" evaluate \
  --public "${APP_DIR}/public" \
  --operations "${OPERATIONS_DIR}" \
  --policy "${APP_DIR}/operations/quality-policy.staging.json"
