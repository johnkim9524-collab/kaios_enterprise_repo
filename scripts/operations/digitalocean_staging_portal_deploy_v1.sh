#!/usr/bin/env bash
set -euo pipefail

EXPECTED_HOSTNAME="${1:?hostname}"
EXPECTED_PUBLIC_IP="${2:?public ip}"
EXPECTED_PRIVATE_IP="${3:?private ip}"
RELEASE_ID="${4:?release id}"
ARCHIVE="${5:?archive path}"
SOURCE_COMMIT_SHA="${6:?source commit sha}"
WORKFLOW_RUN_ID="${7:?workflow run id}"
WORKFLOW_RUN_ATTEMPT="${8:?workflow run attempt}"
EVIDENCE_CLASS="${KIDULTS_RECEIPT_EXECUTION_MODE:-REMOTE_STAGING}"
RECEIPT_CONTRACT_ID="kidults-digitalocean-staging-portal-receipt-contract-v1"

[[ "$RELEASE_ID" =~ ^portal-r001-[A-Za-z0-9._-]+$ ]] || { echo 'FAIL: unsafe release id' >&2; exit 18; }
[[ "$SOURCE_COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'FAIL: invalid source commit sha' >&2; exit 19; }
[[ "$WORKFLOW_RUN_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'FAIL: invalid workflow run id' >&2; exit 16; }
[[ "$WORKFLOW_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]] || { echo 'FAIL: invalid workflow run attempt' >&2; exit 17; }
[[ "$EVIDENCE_CLASS" == "REMOTE_STAGING" || "$EVIDENCE_CLASS" == "LOCALHOST_CONTRACT_PROOF" ]] \
  || { echo 'FAIL: invalid evidence class' >&2; exit 15; }

[[ "$(id -un)" == "kidults-staging" ]] || exit 20
[[ "$(hostname)" == "$EXPECTED_HOSTNAME" ]] || exit 21
ip4="$(ip -4 addr show || true)"
grep -Fq "$EXPECTED_PUBLIC_IP" <<<"$ip4" || exit 22
grep -Fq "$EXPECTED_PRIVATE_IP" <<<"$ip4" || exit 23
for required_command in python3 curl setsid realpath sha256sum; do
  command -v "$required_command" >/dev/null 2>&1 || { echo "FAIL: $required_command missing" >&2; exit 32; }
done

ROOT="$HOME/kidults-runtime"
MARKER="$ROOT/.kidults-staging-managed"
[[ -f "$MARKER" ]] || exit 24
grep -Fxq 'managed_by=kidults-digitalocean-staging-bootstrap-v1' "$MARKER" || exit 25

APP="$ROOT/app"
AUDIT="$ROOT/audit"
LOG="$ROOT/log"
RELEASES="$APP/portal-r001-releases"
CURRENT="$APP/portal-r001-current"
RELEASE="$RELEASES/$RELEASE_ID"
PORT=4173
BIND="127.0.0.1:$PORT"
HEALTH_URL="http://127.0.0.1:$PORT/index.html"
PIDFILE="$ROOT/portal-r001.pid"
SERVERLOG="$LOG/portal-r001-http.log"
HEALTHFILE="$ROOT/portal-r001-health.html"
RECEIPT_ROOT="$AUDIT/portal-r001-deployments"
RECEIPT_DIR="$RECEIPT_ROOT/$RELEASE_ID"
DEPLOY_RECEIPT="$RECEIPT_DIR/deploy-receipt.json"
HEALTH_RECEIPT="$RECEIPT_DIR/health-receipt.json"
ROLLBACK_RECEIPT="$RECEIPT_DIR/rollback-receipt.json"
mkdir -p "$RELEASES" "$AUDIT" "$LOG" "$RECEIPT_DIR"
chmod 755 "$APP" "$RELEASES" "$LOG"
chmod 700 "$AUDIT" "$RECEIPT_ROOT" "$RECEIPT_DIR"

release_digest() {
  (
    cd "$1"
    find . -type f -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum \
      | sha256sum \
      | awk '{print "sha256:" $1}'
  )
}

release_has_required_markers() {
  local index="$1/index.html"
  [[ -f "$index" ]] \
    && grep -Fq 'data-release="portal-release-001"' "$index" \
    && grep -Fq 'data-state="NO_PROJECTION"' "$index" \
    && grep -Fq 'Read the market.' "$index" \
    && grep -Fq 'Know the evidence.' "$index"
}

PREVIOUS="NONE"
PREVIOUS_DIGEST=""
PREVIOUS_TARGET_AVAILABLE=false
if [[ -L "$CURRENT" ]]; then
  PREVIOUS="$(realpath -e "$CURRENT")" || { echo 'FAIL: current release link is broken' >&2; exit 39; }
  [[ "$PREVIOUS" == "$RELEASES/"* ]] || { echo 'FAIL: current release target escaped managed release root' >&2; exit 39; }
  release_has_required_markers "$PREVIOUS" || { echo 'FAIL: current release is not a valid rollback target' >&2; exit 39; }
  PREVIOUS_DIGEST="$(release_digest "$PREVIOUS")"
  PREVIOUS_TARGET_AVAILABLE=true
elif [[ -e "$CURRENT" ]]; then
  echo 'FAIL: current release path is not a symlink' >&2
  exit 39
fi

[[ ! -e "$RELEASE" ]] || { echo 'FAIL: release already exists' >&2; exit 26; }
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"

INDEX="$RELEASE/index.html"
[[ -f "$INDEX" ]] || exit 27
grep -Fq 'data-release="portal-release-001"' "$INDEX" || exit 28
grep -Fq 'data-state="NO_PROJECTION"' "$INDEX" || exit 29
grep -Fq 'Read the market.' "$INDEX" || exit 30
grep -Fq 'Know the evidence.' "$INDEX" || exit 31

DIGEST="$(release_digest "$RELEASE")"
ROLLBACK_ARMED=false
NEWPID=""

start_server() {
  local directory="$1"
  : > "$SERVERLOG"
  setsid python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$directory" \
    </dev/null >>"$SERVERLOG" 2>&1 &
  local pid="$!"
  for _ in $(seq 1 30); do
    if kill -0 "$pid" 2>/dev/null && curl -fsS "$HEALTH_URL" -o "$HEALTHFILE" 2>/dev/null; then
      printf '%s' "$pid"
      return 0
    fi
    sleep 0.5
  done
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
  return 1
}

stop_pidfile_server() {
  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
    fi
    rm -f "$PIDFILE"
  fi
}

write_rollback_receipt() {
  local state="$1"
  local action="$2"
  local status="$3"
  local trigger_exit_code="$4"
  local server_pid="$5"
  local restored_body_sha256="$6"
  local observed_at
  observed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  python3 - "$ROLLBACK_RECEIPT" \
    "$RECEIPT_CONTRACT_ID" "$RELEASE_ID" "$SOURCE_COMMIT_SHA" "$WORKFLOW_RUN_ID" "$WORKFLOW_RUN_ATTEMPT" \
    "$EVIDENCE_CLASS" "$EXPECTED_HOSTNAME" "$BIND" "$observed_at" "$state" "$action" "$status" \
    "$trigger_exit_code" "$RELEASE" "$PREVIOUS" "$PREVIOUS_DIGEST" "$PREVIOUS_TARGET_AVAILABLE" \
    "$server_pid" "$restored_body_sha256" <<'PY'
import json
import os
import sys
from pathlib import Path

(path, contract_id, deployment_id, source_sha, run_id, run_attempt,
 evidence_class, hostname, bind, observed_at, state, action, status,
 trigger_code, failed_release, target, target_digest, target_available,
 server_pid, restored_body_sha256) = sys.argv[1:]
payload = {
    "receipt_contract_id": contract_id,
    "receipt_type": "ROLLBACK",
    "deployment_id": deployment_id,
    "source_commit_sha": source_sha,
    "workflow_run_id": run_id,
    "workflow_run_attempt": int(run_attempt),
    "evidence_class": evidence_class,
    "remote_target_observed": evidence_class == "REMOTE_STAGING",
    "environment": "STAGING",
    "hostname": hostname,
    "user": "kidults-staging",
    "bind": bind,
    "observed_at": observed_at,
    "state": state,
    "rollback_action": action,
    "rollback_status": status,
    "trigger_exit_code": int(trigger_code),
    "failed_release": failed_release,
    "rollback_target_available": target_available == "true",
    "rollback_target": target,
    "rollback_target_digest": target_digest,
    "server_pid": server_pid,
    "restored_health_body_sha256": restored_body_sha256,
    "restored_markers": {
        "release": status == "RESTORED",
        "no_projection": status == "RESTORED"
    },
    "public_bind": False,
    "production_touch": False,
    "raw_provider_ingestion": False,
    "real_business_workload": False,
    "g5": "HOLD"
}
destination = Path(path)
temporary = destination.with_suffix(destination.suffix + ".tmp")
temporary.write_text(json.dumps(payload, indent=2) + "\n")
os.chmod(temporary, 0o600)
os.replace(temporary, destination)
PY
  cp "$ROLLBACK_RECEIPT" "$AUDIT/portal-r001-rollback-receipt.json"
  chmod 600 "$AUDIT/portal-r001-rollback-receipt.json"
}

rollback_on_exit() {
  local rc="$1"
  trap - EXIT
  if [[ "$ROLLBACK_ARMED" != "true" || "$rc" -eq 0 ]]; then
    exit "$rc"
  fi

  set +e
  if [[ -n "$NEWPID" ]] && kill -0 "$NEWPID" 2>/dev/null; then
    kill "$NEWPID" 2>/dev/null || true
    for _ in $(seq 1 10); do kill -0 "$NEWPID" 2>/dev/null || break; sleep 0.2; done
  fi
  rm -f "$PIDFILE" "$HEALTHFILE"

  rollback_status="NO_PREVIOUS_RELEASE"
  rollback_state="BLOCKED"
  rollback_pid=""
  restored_body_sha256=""
  if [[ "$PREVIOUS_TARGET_AVAILABLE" == "true" ]]; then
    ln -sfn "$PREVIOUS" "$CURRENT"
    rollback_pid="$(start_server "$CURRENT")"
    if [[ -n "$rollback_pid" ]] \
      && kill -0 "$rollback_pid" 2>/dev/null \
      && grep -Fq 'data-release="portal-release-001"' "$HEALTHFILE" \
      && grep -Fq 'data-state="NO_PROJECTION"' "$HEALTHFILE"; then
      printf '%s\n' "$rollback_pid" > "$PIDFILE"
      chmod 600 "$PIDFILE"
      rollback_status="RESTORED"
      rollback_state="VERIFIED_PASS"
      restored_body_sha256="sha256:$(sha256sum "$HEALTHFILE" | awk '{print $1}')"
    else
      rollback_status="FAILED"
      rollback_state="VERIFIED_FAIL"
    fi
  else
    rm -f "$CURRENT"
  fi
  rm -f "$HEALTHFILE"

  write_rollback_receipt "$rollback_state" "EXECUTED" "$rollback_status" "$rc" \
    "$rollback_pid" "$restored_body_sha256"
  cat "$ROLLBACK_RECEIPT" >&2
  exit "$rc"
}
trap 'rollback_on_exit "$?"' EXIT

ROLLBACK_ARMED=true
ln -sfn "$RELEASE" "$CURRENT"
stop_pidfile_server

if ! NEWPID="$(start_server "$CURRENT")"; then
  echo 'FAIL: preview server process not alive or localhost health fetch failed' >&2
  cat "$SERVERLOG" >&2 || true
  exit 35
fi
printf '%s\n' "$NEWPID" > "$PIDFILE"
chmod 600 "$PIDFILE"

if [[ -z "$NEWPID" ]] || ! kill -0 "$NEWPID" 2>/dev/null; then
  echo 'FAIL: preview server process not alive' >&2
  cat "$SERVERLOG" >&2 || true
  exit 36
fi
HTTP_STATUS="$(curl -sS --fail-with-body --connect-timeout 2 --max-time 5 -o "$HEALTHFILE" -w '%{http_code}' "$HEALTH_URL")" \
  || { echo 'FAIL: localhost health request' >&2; exit 35; }
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "FAIL: localhost health HTTP $HTTP_STATUS" >&2
  exit 35
fi
if ! grep -Fq 'data-release="portal-release-001"' "$HEALTHFILE"; then
  echo 'FAIL: release marker health check' >&2
  cat "$SERVERLOG" >&2 || true
  exit 37
fi
if ! grep -Fq 'data-state="NO_PROJECTION"' "$HEALTHFILE"; then
  echo 'FAIL: NO_PROJECTION marker health check' >&2
  cat "$SERVERLOG" >&2 || true
  exit 38
fi
grep -Fq 'Read the market.' "$HEALTHFILE" || { echo 'FAIL: market marker health check' >&2; exit 37; }
grep -Fq 'Know the evidence.' "$HEALTHFILE" || { echo 'FAIL: evidence marker health check' >&2; exit 37; }
HEALTH_BODY_SHA256="sha256:$(sha256sum "$HEALTHFILE" | awk '{print $1}')"
HEALTH_OBSERVED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

python3 - "$HEALTH_RECEIPT" \
  "$RECEIPT_CONTRACT_ID" "$RELEASE_ID" "$SOURCE_COMMIT_SHA" "$WORKFLOW_RUN_ID" "$WORKFLOW_RUN_ATTEMPT" \
  "$EVIDENCE_CLASS" "$EXPECTED_HOSTNAME" "$BIND" "$HEALTH_OBSERVED_AT" "$HEALTH_URL" "$HTTP_STATUS" \
  "$HEALTH_BODY_SHA256" <<'PY'
import json
import os
import sys
from pathlib import Path

(path, contract_id, deployment_id, source_sha, run_id, run_attempt,
 evidence_class, hostname, bind, observed_at, request_url, http_status,
 body_sha256) = sys.argv[1:]
payload = {
    "receipt_contract_id": contract_id,
    "receipt_type": "LOCALHOST_HEALTH",
    "deployment_id": deployment_id,
    "source_commit_sha": source_sha,
    "workflow_run_id": run_id,
    "workflow_run_attempt": int(run_attempt),
    "evidence_class": evidence_class,
    "remote_target_observed": evidence_class == "REMOTE_STAGING",
    "environment": "STAGING",
    "hostname": hostname,
    "user": "kidults-staging",
    "bind": bind,
    "observed_at": observed_at,
    "state": "VERIFIED_PASS",
    "request_url": request_url,
    "http_status": int(http_status),
    "body_sha256": body_sha256,
    "portal_state": "NO_PROJECTION",
    "markers": {
        "release": True,
        "no_projection": True,
        "market_copy": True,
        "evidence_copy": True
    },
    "public_bind": False,
    "production_touch": False,
    "raw_provider_ingestion": False,
    "real_business_workload": False,
    "g5": "HOLD"
}
destination = Path(path)
temporary = destination.with_suffix(destination.suffix + ".tmp")
temporary.write_text(json.dumps(payload, indent=2) + "\n")
os.chmod(temporary, 0o600)
os.replace(temporary, destination)
PY
cp "$HEALTH_RECEIPT" "$AUDIT/portal-r001-health-receipt.json"
chmod 600 "$AUDIT/portal-r001-health-receipt.json"

if [[ "$PREVIOUS_TARGET_AVAILABLE" == "true" ]]; then
  write_rollback_receipt "VERIFIED_PASS" "ARMED_NOT_EXECUTED" "ARMED" 0 "" ""
else
  write_rollback_receipt "BLOCKED" "ARMED_NOT_EXECUTED" "NO_PREVIOUS_RELEASE" 0 "" ""
fi

DEPLOY_OBSERVED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
python3 - "$DEPLOY_RECEIPT" \
  "$RECEIPT_CONTRACT_ID" "$RELEASE_ID" "$SOURCE_COMMIT_SHA" "$WORKFLOW_RUN_ID" "$WORKFLOW_RUN_ATTEMPT" \
  "$EVIDENCE_CLASS" "$EXPECTED_HOSTNAME" "$BIND" "$DEPLOY_OBSERVED_AT" "$RELEASE" "$PREVIOUS" "$DIGEST" \
  "$NEWPID" "$PREVIOUS_TARGET_AVAILABLE" <<'PY'
import json
import os
import sys
from pathlib import Path

(path, contract_id, deployment_id, source_sha, run_id, run_attempt,
 evidence_class, hostname, bind, observed_at, release_path, previous_release,
 release_digest, server_pid, rollback_target_available) = sys.argv[1:]
payload = {
    "receipt_contract_id": contract_id,
    "receipt_type": "DEPLOYMENT",
    "deployment_id": deployment_id,
    "source_commit_sha": source_sha,
    "workflow_run_id": run_id,
    "workflow_run_attempt": int(run_attempt),
    "evidence_class": evidence_class,
    "environment": "STAGING",
    "hostname": hostname,
    "user": "kidults-staging",
    "bind": bind,
    "observed_at": observed_at,
    "state": "DEPLOYED_VERIFIED" if evidence_class == "REMOTE_STAGING" else "VERIFIED_PASS",
    "remote_target_observed": evidence_class == "REMOTE_STAGING",
    "release_path": release_path,
    "previous_release": previous_release,
    "release_digest": release_digest,
    "server_pid": server_pid,
    "health_receipt": "health-receipt.json",
    "rollback_receipt": "rollback-receipt.json",
    "portal_state": "NO_PROJECTION",
    "rollback_armed": True,
    "rollback_target_available": rollback_target_available == "true",
    "public_bind": False,
    "production_touch": False,
    "raw_provider_ingestion": False,
    "real_business_workload": False,
    "g5": "HOLD"
}
destination = Path(path)
temporary = destination.with_suffix(destination.suffix + ".tmp")
temporary.write_text(json.dumps(payload, indent=2) + "\n")
os.chmod(temporary, 0o600)
os.replace(temporary, destination)
PY
cp "$DEPLOY_RECEIPT" "$AUDIT/portal-r001-deploy-receipt.json"
chmod 600 "$AUDIT/portal-r001-deploy-receipt.json"

rm -f "$HEALTHFILE"
ROLLBACK_ARMED=false
trap - EXIT
cat "$DEPLOY_RECEIPT"
