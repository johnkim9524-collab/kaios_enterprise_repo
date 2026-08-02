#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:4173}"
FAILURES=0

check_url() {
  local path="$1"
  local expected_type="$2"
  local status
  local content_type

  status="$(curl -sS -o /tmp/kidults-a10-body -w '%{http_code}' "${BASE_URL}${path}" || true)"
  content_type="$(curl -sSI "${BASE_URL}${path}" | awk 'BEGIN{IGNORECASE=1} /^content-type:/{print $2}' | tr -d '\r' | head -n1 || true)"

  if [[ "$status" != "200" ]]; then
    printf 'FAIL %-42s HTTP %s\n' "$path" "$status"
    FAILURES=$((FAILURES + 1))
    return
  fi

  if [[ -n "$expected_type" && "$content_type" != *"$expected_type"* ]]; then
    printf 'FAIL %-42s content-type=%s expected=%s\n' "$path" "$content_type" "$expected_type"
    FAILURES=$((FAILURES + 1))
    return
  fi

  printf 'PASS %-42s HTTP 200 %s\n' "$path" "$content_type"
}

check_url "/" "text/html"
check_url "/data/kidult-100.json" "application/json"
check_url "/data/monthly-intelligence.json" "application/json"
check_url "/data/archive.json" "application/json"
check_url "/data/quality-status.json" "application/json"
check_url "/methodology.html" "text/html"
check_url "/operations.html" "text/html"

health_status="$(curl -sS -o /tmp/kidults-a10-health -w '%{http_code}' "${BASE_URL}/health" || true)"
if [[ "$health_status" == "200" ]]; then
  printf 'PASS %-42s HTTP 200\n' "/health"
else
  printf 'FAIL %-42s HTTP %s\n' "/health" "$health_status"
  FAILURES=$((FAILURES + 1))
fi

conversion_status="$(curl -sS -o /tmp/kidults-a10-conversion -w '%{http_code}' -X POST "${BASE_URL}/api/conversions" \
  -H 'Content-Type: application/json' \
  --data '{"type":"newsletter","email":"a10-validation@example.com","organization":"","interest":"","consent":true,"consent_version":"2026-08","website":""}' || true)"

if [[ "$conversion_status" == "200" || "$conversion_status" == "201" || "$conversion_status" == "409" ]]; then
  printf 'PASS %-42s HTTP %s\n' "/api/conversions" "$conversion_status"
else
  printf 'FAIL %-42s HTTP %s\n' "/api/conversions" "$conversion_status"
  FAILURES=$((FAILURES + 1))
fi

node - <<'NODE'
const fs = require('fs');
const paths = [
  'apps/kidults-enterprise-staging/public/data/kidult-100.json',
  'apps/kidults-enterprise-staging/public/data/monthly-intelligence.json',
  'apps/kidults-enterprise-staging/public/data/archive.json',
  'apps/kidults-enterprise-staging/public/data/quality-status.json'
];
for (const path of paths) {
  JSON.parse(fs.readFileSync(path, 'utf8'));
  console.log(`PASS JSON ${path}`);
}
NODE

if [[ "$FAILURES" -ne 0 ]]; then
  printf '\nA10 validation failed: %s check(s) failed.\n' "$FAILURES"
  exit 1
fi

printf '\nA10 functional integration validation passed.\n'
