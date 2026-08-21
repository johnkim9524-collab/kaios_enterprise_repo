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
ln -sfn "$RELEASE" "$CURRENT"

if [[ -f "$PIDFILE" ]]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [[ -z "$oldpid" ]] || kill "$oldpid" 2>/dev/null || true
fi
nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$CURRENT" >"$LOG/portal-r001-http.log" 2>&1 &
echo $! > "$PIDFILE"
chmod 600 "$PIDFILE"

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/index.html" >/tmp/kidults-portal-r001-health.html; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/index.html" | grep -Fq 'data-release="portal-release-001"'
curl -fsS "http://127.0.0.1:$PORT/index.html" | grep -Fq 'data-state="NO_PROJECTION"'

cat > "$AUDIT/portal-r001-deploy-receipt.json" <<EOF
{
  "deployment_id": "$RELEASE_ID",
  "environment": "STAGING",
  "hostname": "$EXPECTED_HOSTNAME",
  "bind": "127.0.0.1:$PORT",
  "release_path": "$RELEASE",
  "previous_release": "$PREVIOUS",
  "release_digest": "$DIGEST",
  "health": "PASS",
  "portal_state": "NO_PROJECTION",
  "public_bind": false,
  "production_touch": false,
  "raw_provider_ingestion": false,
  "real_business_workload": false,
  "g5": "HOLD"
}
EOF
chmod 600 "$AUDIT/portal-r001-deploy-receipt.json"
cat "$AUDIT/portal-r001-deploy-receipt.json"
