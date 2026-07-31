#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/intelligence-holdings/staging/kaios-enterprise}"
APP_DIR="${ROOT_DIR}/apps/kidults-enterprise-staging"
OPERATIONS_DIR="${KIDULTS_OPERATIONS_DATA_DIR:-/opt/intelligence-holdings/staging/data/kidults-operations}"
SERVICE_NAME="kaios-kidults-intelligence-quality.service"
TIMER_NAME="kaios-kidults-intelligence-quality.timer"
RUNNER="${ROOT_DIR}/scripts/staging/run-kidults-intelligence-quality-alerting.sh"

[[ "${ROOT_DIR}" == /opt/intelligence-holdings/staging/* ]] || {
  echo "ROOT_DIR must remain inside /opt/intelligence-holdings/staging" >&2
  exit 1
}
[[ -f "${APP_DIR}/quality-alerts.mjs" ]] || {
  echo "Missing quality evaluator: ${APP_DIR}/quality-alerts.mjs" >&2
  exit 1
}
[[ -x "${RUNNER}" ]] || chmod 0755 "${RUNNER}"
command -v node >/dev/null
sudo install -d -o kaios -g kaios -m 0700 "${OPERATIONS_DIR}"

service_file="$(mktemp)"
timer_file="$(mktemp)"
trap 'rm -f "${service_file}" "${timer_file}"' EXIT

cat >"${service_file}" <<EOF
[Unit]
Description=KAIOS Kidults intelligence quality and alert evaluation (staging only)
After=kaios-kidults-collector-evidence.service

[Service]
Type=oneshot
User=kaios
Group=kaios
WorkingDirectory=${ROOT_DIR}
Environment="ROOT_DIR=${ROOT_DIR}"
Environment="KIDULTS_OPERATIONS_DATA_DIR=${OPERATIONS_DIR}"
ExecStart=/usr/bin/bash ${RUNNER}
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadOnlyPaths=${APP_DIR}/operations
ReadWritePaths=${APP_DIR}/public/data ${OPERATIONS_DIR}
EOF

cat >"${timer_file}" <<EOF
[Unit]
Description=Hourly KAIOS Kidults intelligence quality evaluation (staging only)

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=180
Unit=${SERVICE_NAME}

[Install]
WantedBy=timers.target
EOF

sudo install -o root -g root -m 0644 "${service_file}" "/etc/systemd/system/${SERVICE_NAME}"
sudo install -o root -g root -m 0644 "${timer_file}" "/etc/systemd/system/${TIMER_NAME}"
sudo systemctl daemon-reload
sudo systemctl enable --now "${TIMER_NAME}"
sudo systemctl start "${SERVICE_NAME}"
sudo systemctl show "${SERVICE_NAME}" \
  --property=Result \
  --property=ExecMainStatus \
  --property=InactiveEnterTimestamp \
  --no-pager
sudo systemctl list-timers --all --no-pager "${TIMER_NAME}"
