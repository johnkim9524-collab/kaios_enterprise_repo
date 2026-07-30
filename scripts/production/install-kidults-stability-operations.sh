#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/intelligence-holdings/staging/kaios-enterprise}"
BASELINE_ROOT="${BASELINE_ROOT:-/mnt/ih_prod_01/backups/stability-baseline}"
SNAPSHOT_SCRIPT_SOURCE="${SNAPSHOT_SCRIPT_SOURCE:-${ROOT_DIR}/scripts/production/capture-kidults-stability-snapshot.sh}"
EVALUATE_SCRIPT_SOURCE="${EVALUATE_SCRIPT_SOURCE:-${ROOT_DIR}/scripts/production/evaluate-kidults-stability-baseline.py}"
INCIDENT_SCRIPT_SOURCE="${INCIDENT_SCRIPT_SOURCE:-${ROOT_DIR}/scripts/production/capture-kidults-stability-incident.sh}"

SNAPSHOT_WRAPPER="/usr/local/sbin/kidults-stability-snapshot.sh"
EVALUATE_WRAPPER="/usr/local/sbin/kidults-stability-evaluate.sh"

require_file() {
  local path="$1"
  [[ -f "${path}" ]] || {
    echo "ERROR: missing required file: ${path}" >&2
    exit 1
  }
}

require_file "${SNAPSHOT_SCRIPT_SOURCE}"
require_file "${EVALUATE_SCRIPT_SOURCE}"
require_file "${INCIDENT_SCRIPT_SOURCE}"

sudo mkdir -p \
  "${BASELINE_ROOT}/daily" \
  "${BASELINE_ROOT}/status" \
  "${BASELINE_ROOT}/incidents" \
  "${BASELINE_ROOT}/incidents/false-positive" \
  "${BASELINE_ROOT}-metadata"

sudo chown -R kaios:kaios \
  "${BASELINE_ROOT}" \
  "${BASELINE_ROOT}-metadata"

sudo tee "${SNAPSHOT_WRAPPER}" >/dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "${ROOT_DIR}"
ROOT_DIR="${ROOT_DIR}" \\
PROD_ROOT="/opt/intelligence-holdings/kidults/app" \\
PROD_DB="/opt/intelligence-holdings/kidults/data/kaios.db" \\
BASE_URL="https://kaios.kidults.com" \\
ADMIN_TOKEN_FILE="/opt/intelligence-holdings/kidults/secrets/kaios_admin_token" \\
STABILITY_ROOT="${BASELINE_ROOT}" \\
bash scripts/production/capture-kidults-stability-snapshot.sh
EOF

sudo tee "${EVALUATE_WRAPPER}" >/dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "${ROOT_DIR}"
python3 scripts/production/evaluate-kidults-stability-baseline.py \\
  --snapshot-root "${BASELINE_ROOT}/daily" \\
  --output "${BASELINE_ROOT}/status/kidults-stability-status.json" \\
  --required-days 30
STATUS_FILE="${BASELINE_ROOT}/status/kidults-stability-status.json" \\
INCIDENT_ROOT="${BASELINE_ROOT}/incidents" \\
bash scripts/production/capture-kidults-stability-incident.sh
EOF

sudo chown root:kaios "${SNAPSHOT_WRAPPER}" "${EVALUATE_WRAPPER}"
sudo chmod 750 "${SNAPSHOT_WRAPPER}" "${EVALUATE_WRAPPER}"

sudo tee /etc/systemd/system/kidults-stability-snapshot.service >/dev/null <<EOF
[Unit]
Description=Kidults Production Stability Snapshot
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
User=kaios
Group=kaios
ExecStart=${SNAPSHOT_WRAPPER}
EOF

sudo tee /etc/systemd/system/kidults-stability-snapshot.timer >/dev/null <<'EOF'
[Unit]
Description=Daily Kidults Production Stability Snapshot

[Timer]
OnCalendar=*-*-* 03:30:00 Asia/Seoul
RandomizedDelaySec=300
Persistent=true
Unit=kidults-stability-snapshot.service

[Install]
WantedBy=timers.target
EOF

sudo tee /etc/systemd/system/kidults-stability-evaluate.service >/dev/null <<EOF
[Unit]
Description=Evaluate Kidults Production Stability Baseline
After=kidults-stability-snapshot.service
RequiresMountsFor=/mnt/ih_prod_01

[Service]
Type=oneshot
User=kaios
Group=kaios
ExecStart=${EVALUATE_WRAPPER}
EOF

sudo tee /etc/systemd/system/kidults-stability-evaluate.timer >/dev/null <<'EOF'
[Unit]
Description=Daily Kidults Stability Baseline Evaluation

[Timer]
OnCalendar=*-*-* 03:40:00 Asia/Seoul
RandomizedDelaySec=120
Persistent=true
Unit=kidults-stability-evaluate.service

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now \
  kidults-stability-snapshot.timer \
  kidults-stability-evaluate.timer

sudo systemctl reset-failed \
  kidults-stability-snapshot.service \
  kidults-stability-evaluate.service || true

sudo systemctl start kidults-stability-snapshot.service
sudo systemctl start kidults-stability-evaluate.service

sudo systemctl status \
  kidults-stability-snapshot.service \
  kidults-stability-snapshot.timer \
  kidults-stability-evaluate.service \
  kidults-stability-evaluate.timer \
  --no-pager
