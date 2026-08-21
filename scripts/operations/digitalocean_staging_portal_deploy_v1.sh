#!/usr/bin/env bash
set -euo pipefail

EXPECTED_HOSTNAME="${1:?hostname}"
EXPECTED_PUBLIC_IP="${2:?public ip}"
EXPECTED_PRIVATE_IP="${3:?private ip}"
RELEASE_ID="${4:?release id}"
ARCHIVE="${5:?archive path}"

[[ "$(id -un)" == "kidults-staging" ]] || exit 20
[[ "$(hostname)" == "$EXPECTED_HOSTNAME" ]] || exit 21
ip4="$(ip -4 addr show || true)"
grep -Fq "$EXPECTED_PUBLIC_IP" <<<"$ip4" || exit 22
grep -Fq "$EXPECTED_PRIVATE_IP" <<<"$ip4" || exit 23
command -v python3 >/dev/null 2>&1 || { echo 'FAIL: python3 missing' >&2; exit 32; }
command -v curl >/dev/null 2>&1 || { echo 'FAIL: curl missing' >&2; exit 33; }
command -v setsid >/dev/null 2>&1 || { echo 'FAIL: setsid missing' >&2; exit 34; }

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
PIDFILE="$ROOT/portal-r001.pid"
SERVERLOG="$LOG/portal-r001-http.log"
HEALTHFILE="$ROOT/portal-r001-health.html"
ROLLBACK_RECEIPT="$AUDIT/portal-r001-rollback-receipt.json"
mkdir -p "$RELEASES" "$AUDIT" "$LOG"
chmod 755 "$APP" "$RELEASES" "$LOG"
chmod 700 "$AUDIT"

PREVIOUS="NONE"
if [[ -L "$CURRENT" ]]; then PREVIOUS="$(readlink "$CURRENT")"; fi
[[ ! -e "$RELEASE" ]] || { echo 'FAIL: release already exists' >&2; exit 26; }
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"

INDEX="$RELEASE/index.html"
[[ -f "$INDEX" ]] || exit 27
grep -Fq 'data-release="portal-release-001"' "$INDEX" || exit 28
grep -Fq 'data-state="NO_PROJECTION"' "$INDEX" || exit 29
grep -Fq 'Read the market.' "$INDEX" || exit 30
grep -Fq 'Know the evidence.' "$INDEX" || exit 31

DIGEST="sha256:$(find "$RELEASE" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
ROLLBACK_ARMED=false
NEWPID=""

start_server() {
  local directory="$1"
  : > "$SERVERLOG"
  setsid -f sh -c 'exec python3 -m http.server "$1" --bind 127.0.0.1 --directory "$2" </dev/null >>"$3" 2>&1' sh "$PORT" "$directory" "$SERVERLOG"
  local pid=""
  for _ in $(seq 1 30); do
    pid="$(pgrep -u "$(id -u)" -f "python3 -m http.server $PORT --bind 127.0.0.1 --directory $directory" | head -1 || true)"
    if [[ -n "$pid" ]] && curl -fsS "http://127.0.0.1:$PORT/index.html" -o "$HEALTHFILE"; then
      printf '%s' "$pid"
      return 0
    fi
    sleep 0.5
  done
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
  rollback_pid=""
  if [[ "$PREVIOUS" != "NONE" && -d "$PREVIOUS" && -f "$PREVIOUS/index.html" ]]; then
    ln -sfn "$PREVIOUS" "$CURRENT"
    rollback_pid="$(start_server "$CURRENT")"
    if [[ -n "$rollback_pid" ]] \
      && kill -0 "$rollback_pid" 2>/dev/null \
      && grep -Fq 'data-release="portal-release-001"' "$HEALTHFILE"; then
      printf '%s\n' "$rollback_pid" > "$PIDFILE"
      chmod 600 "$PIDFILE"
      rollback_status="PASS"
    else
      rollback_status="FAILED"
    fi
  else
    rm -f "$CURRENT"
  fi
  rm -f "$HEALTHFILE"

  cat > "$ROLLBACK_RECEIPT" <<JSON
{
  "deployment_id": "$RELEASE_ID",
  "environment": "STAGING",
  "trigger_exit_code": $rc,
  "failed_release": "$RELEASE",
  "restored_release": "$PREVIOUS",
  "rollback_status": "$rollback_status",
  "server_pid": "${rollback_pid:-}",
  "bind": "127.0.0.1:$PORT",
  "public_bind": false,
  "production_touch": false,
  "raw_provider_ingestion": false,
  "g5": "HOLD"
}
JSON
  chmod 600 "$ROLLBACK_RECEIPT"
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
rm -f "$HEALTHFILE"

cat > "$AUDIT/portal-r001-deploy-receipt.json" <<EOF
{
  "deployment_id": "$RELEASE_ID",
  "environment": "STAGING",
  "hostname": "$EXPECTED_HOSTNAME",
  "bind": "127.0.0.1:$PORT",
  "release_path": "$RELEASE",
  "previous_release": "$PREVIOUS",
  "release_digest": "$DIGEST",
  "server_pid": "$NEWPID",
  "health": "PASS",
  "portal_state": "NO_PROJECTION",
  "rollback_armed": true,
  "public_bind": false,
  "production_touch": false,
  "raw_provider_ingestion": false,
  "real_business_workload": false,
  "g5": "HOLD"
}
EOF
chmod 600 "$AUDIT/portal-r001-deploy-receipt.json"
ROLLBACK_ARMED=false
trap - EXIT
cat "$AUDIT/portal-r001-deploy-receipt.json"
