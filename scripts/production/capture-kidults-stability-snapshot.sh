#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://kaios.kidults.com}"
PROD_DB="${PROD_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/mnt/ih_prod_01/backups/stability-baseline/daily}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="${OUTPUT_ROOT}/kidults-stability-${TIMESTAMP}.json"

mkdir -p "${OUTPUT_ROOT}"

HEALTH_HTTP="$(curl -sS -o /tmp/kidults-stability-health.json -w '%{http_code}' "${BASE_URL}/api/health" || true)"
PORTAL_HTTP="$(curl -sS -o /tmp/kidults-stability-portal.html -w '%{http_code}' "${BASE_URL}/portal/" || true)"
DB_INTEGRITY="$(sqlite3 "${PROD_DB}" 'PRAGMA integrity_check;' 2>/dev/null || true)"
GATEWAY_RUNNING="$(docker inspect -f '{{.State.Running}}' kidults-gateway 2>/dev/null || echo false)"
SCHEDULER_RUNNING="$(docker inspect -f '{{.State.Running}}' kidults-scheduler 2>/dev/null || echo false)"

HEALTH_HTTP="${HEALTH_HTTP}" \
PORTAL_HTTP="${PORTAL_HTTP}" \
DB_INTEGRITY="${DB_INTEGRITY}" \
GATEWAY_RUNNING="${GATEWAY_RUNNING}" \
SCHEDULER_RUNNING="${SCHEDULER_RUNNING}" \
OUTPUT="${OUTPUT}" \
TIMESTAMP="${TIMESTAMP}" \
python3 - <<'PY'
import json
import os
from pathlib import Path

checks = {
    "health_http": os.environ["HEALTH_HTTP"] == "200",
    "portal_http": os.environ["PORTAL_HTTP"] == "200",
    "database_integrity": os.environ["DB_INTEGRITY"] == "ok",
    "gateway_running": os.environ["GATEWAY_RUNNING"].lower() == "true",
    "scheduler_running": os.environ["SCHEDULER_RUNNING"].lower() == "true",
}
payload = {
    "status": "pass" if all(checks.values()) else "fail",
    "vertical": "kidults",
    "environment": "production",
    "captured_at": os.environ["TIMESTAMP"],
    "checks": checks,
    "health_http": int(os.environ["HEALTH_HTTP"] or 0),
    "portal_http": int(os.environ["PORTAL_HTTP"] or 0),
    "database_integrity": os.environ["DB_INTEGRITY"],
}
Path(os.environ["OUTPUT"]).write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(json.dumps(payload, indent=2))
PY

find "${OUTPUT_ROOT}" -type f -name 'kidults-stability-*.json' -mtime +45 -delete
