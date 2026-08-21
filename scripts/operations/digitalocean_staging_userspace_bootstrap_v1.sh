#!/usr/bin/env bash
set -euo pipefail

EXPECTED_HOSTNAME="${1:?expected hostname required}"
EXPECTED_PUBLIC_IP="${2:?expected public ip required}"
EXPECTED_PRIVATE_IP="${3:?expected private ip required}"

[[ "$(id -un)" == "kidults-staging" ]] || { echo "FAIL: wrong user" >&2; exit 20; }
[[ "$(hostname)" == "$EXPECTED_HOSTNAME" ]] || { echo "FAIL: hostname mismatch" >&2; exit 21; }

ip4="$(ip -4 addr show || true)"
grep -Fq "$EXPECTED_PUBLIC_IP" <<<"$ip4" || { echo "FAIL: public IP mismatch" >&2; exit 22; }
grep -Fq "$EXPECTED_PRIVATE_IP" <<<"$ip4" || { echo "FAIL: private IP mismatch" >&2; exit 23; }

ROOT="$HOME/kidults-runtime"
MARKER="$ROOT/.kidults-staging-managed"
APP="$ROOT/app"; DATA="$ROOT/data"; AUDIT="$ROOT/audit"; LOG="$ROOT/log"; BIN="$ROOT/bin"
USER_SYSTEMD="$HOME/.config/systemd/user"
UNIT="$USER_SYSTEMD/kidults-staging-health.service"
HEALTH="$BIN/health.sh"
ROLLBACK="$BIN/rollback.sh"

if [[ -e "$ROOT" && ! -f "$MARKER" ]]; then
  echo "FAIL: existing unmanaged runtime root" >&2
  exit 24
fi

mkdir -p "$APP" "$DATA" "$AUDIT" "$LOG" "$BIN" "$USER_SYSTEMD"
chmod 700 "$ROOT" "$DATA" "$AUDIT"
chmod 755 "$APP" "$LOG" "$BIN" "$USER_SYSTEMD"
printf '%s\n' 'managed_by=kidults-digitalocean-staging-bootstrap-v1' > "$MARKER"
chmod 600 "$MARKER"

cat > "$HEALTH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '{"environment":"STAGING","runtime":"FOUNDATION","status":"OK","production":false}\n'
EOF
chmod 755 "$HEALTH"

cat > "$UNIT" <<EOF
[Unit]
Description=KIDULTS STAGING health foundation
After=network-online.target
[Service]
Type=oneshot
ExecStart=$HEALTH
[Install]
WantedBy=default.target
EOF
chmod 644 "$UNIT"

cat > "$ROLLBACK" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$HOME/kidults-runtime"
MARKER="$ROOT/.kidults-staging-managed"
UNIT="$HOME/.config/systemd/user/kidults-staging-health.service"
[[ -f "$MARKER" ]] || { echo "FAIL: managed marker missing" >&2; exit 30; }
grep -Fxq 'managed_by=kidults-digitalocean-staging-bootstrap-v1' "$MARKER" || exit 31
rm -f "$UNIT"
rm -rf "$ROOT"
printf '{"rollback":"PASS","environment":"STAGING","production_touch":false}\n'
EOF
chmod 700 "$ROLLBACK"

{
  echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "hostname=$(hostname)"
  echo "user=$(id -un)"
  echo "kernel=$(uname -srmo)"
  command -v lsb_release >/dev/null 2>&1 && lsb_release -ds || true
  command -v ssh >/dev/null 2>&1 && ssh -V 2>&1 || true
  command -v systemctl >/dev/null 2>&1 && systemctl --version | head -1 || true
  echo "monitoring_agent_processes:"
  pgrep -a do-agent || true
} > "$AUDIT/os-baseline.txt"
chmod 600 "$AUDIT/os-baseline.txt"

"$HEALTH" > "$AUDIT/health-foundation.json"
chmod 600 "$AUDIT/health-foundation.json"

cat > "$AUDIT/bootstrap-receipt.json" <<EOF
{
  "bootstrap_id": "digitalocean-staging-userspace-bootstrap-v1",
  "environment": "STAGING",
  "hostname": "$EXPECTED_HOSTNAME",
  "public_ip": "$EXPECTED_PUBLIC_IP",
  "private_ip": "$EXPECTED_PRIVATE_IP",
  "runtime_root": "$ROOT",
  "rollback_target": "USERSPACE_PRISTINE_BEFORE_BOOTSTRAP_V1",
  "systemd_foundation": "USER_UNIT_FILE_CREATED_NOT_ENABLED",
  "os_package_baseline": "OBSERVED_NO_PACKAGE_MUTATION",
  "monitoring_agent": "OBSERVED_ONLY",
  "raw_provider_ingestion": false,
  "real_business_workload": false,
  "production_touch": false,
  "g5": "HOLD"
}
EOF
chmod 600 "$AUDIT/bootstrap-receipt.json"
cat "$AUDIT/bootstrap-receipt.json"
