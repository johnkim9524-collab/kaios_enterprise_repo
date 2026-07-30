#!/usr/bin/env bash
set -euo pipefail

BASELINE_ROOT="${BASELINE_ROOT:-/mnt/ih_prod_01/backups/stability-baseline}"
STATUS_FILE="${BASELINE_ROOT}/status/kidults-stability-status.json"

assert_file() {
  local path="$1"
  [[ -f "${path}" ]] || {
    echo "FAIL missing file: ${path}" >&2
    exit 1
  }
}

assert_directory() {
  local path="$1"
  [[ -d "${path}" ]] || {
    echo "FAIL missing directory: ${path}" >&2
    exit 1
  }
}

assert_directory "${BASELINE_ROOT}/daily"
assert_directory "${BASELINE_ROOT}/status"
assert_directory "${BASELINE_ROOT}/incidents"
assert_directory "${BASELINE_ROOT}/incidents/false-positive"
assert_file "${STATUS_FILE}"
assert_file /usr/local/sbin/kidults-stability-snapshot.sh
assert_file /usr/local/sbin/kidults-stability-evaluate.sh

for unit in \
  kidults-stability-snapshot.timer \
  kidults-stability-evaluate.timer
do
  systemctl is-enabled --quiet "${unit}"
  systemctl is-active --quiet "${unit}"
  echo "PASS ${unit} enabled and active"
done

for wrapper in \
  /usr/local/sbin/kidults-stability-snapshot.sh \
  /usr/local/sbin/kidults-stability-evaluate.sh
do
  owner_group="$(stat -c '%U:%G' "${wrapper}")"
  mode="$(stat -c '%a' "${wrapper}")"
  [[ "${owner_group}" == "root:kaios" ]] || {
    echo "FAIL ${wrapper} owner/group=${owner_group}" >&2
    exit 1
  }
  [[ "${mode}" == "750" ]] || {
    echo "FAIL ${wrapper} mode=${mode}" >&2
    exit 1
  }
  echo "PASS ${wrapper} root:kaios 750"
done

python3 - "${STATUS_FILE}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = json.loads(path.read_text(encoding="utf-8"))

required = {
    "status": {"observing", "ready"},
    "production_change_allowed": {False},
    "artfund_production_authorized": {False},
}

for key, allowed in required.items():
    value = payload.get(key)
    if value not in allowed:
        raise SystemExit(f"FAIL {key}={value!r}")

if payload.get("failed_days", 0) != 0:
    raise SystemExit("FAIL failed_days must be zero")
if payload.get("invalid_snapshot_files"):
    raise SystemExit("FAIL invalid_snapshot_files must be empty")

print("PASS machine-readable stability gate")
print(json.dumps(payload, indent=2))
PY

echo "Kidults stability daily operations verification passed."
