#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/intelligence-holdings/staging/kaios-enterprise}"
APP_DIR="${ROOT_DIR}/apps/kidults-enterprise-staging"
OPERATIONS_DIR="${KIDULTS_OPERATIONS_DATA_DIR:-/opt/intelligence-holdings/staging/data/kidults-operations}"
SERVICE_NAME="kaios-kidults-collector-evidence.service"
TIMER_NAME="kaios-kidults-collector-evidence.timer"
RUNNER="${ROOT_DIR}/scripts/staging/run-kidults-collector-evidence-loop.sh"
RSS_URL="${KAIOS_LIVE_RSS_URL:-https://news.google.com/rss/search?q=LEGO%20OR%20Pokemon%20OR%20%22Pop%20Mart%22%20OR%20Bandai%20OR%20Medicom%20OR%20%22Hot%20Toys%22&hl=en-US&gl=US&ceid=US:en}"

[[ "${ROOT_DIR}" == /opt/intelligence-holdings/staging/* ]] || {
  echo "ROOT_DIR must remain inside /opt/intelligence-holdings/staging" >&2
  exit 1
}
[[ -f "${APP_DIR}/collector-evidence.mjs" ]] || {
  echo "Missing collector evidence bridge: ${APP_DIR}/collector-evidence.mjs" >&2
  exit 1
}
[[ -x "${RUNNER}" ]] || chmod 0755 "${RUNNER}"
command -v node >/dev/null
command -v python3 >/dev/null

sudo install -d -o kaios -g kaios -m 0700 "${OPERATIONS_DIR}"

service_file="$(mktemp)"
timer_file="$(mktemp)"
trap 'rm -f "${service_file}" "${timer_file}"' EXIT

cat >"${service_file}" <<EOF
[Unit]
Description=KAIOS Kidults collector evidence loop (staging only)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=kaios
Group=kaios
WorkingDirectory=${ROOT_DIR}
Environment="ROOT_DIR=${ROOT_DIR}"
Environment="KIDULTS_OPERATIONS_DATA_DIR=${OPERATIONS_DIR}"
Environment="KAIOS_LIVE_RSS_URL=${RSS_URL}"
Environment="KAIOS_LIVE_HTTP_TIMEOUT_SECONDS=15"
Environment="KAIOS_LIVE_RETRY_DELAY_SECONDS=2"
Environment="KAIOS_COLLECTOR_MAX_ATTEMPTS=3"
ExecStart=/usr/bin/bash ${RUNNER}
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=${ROOT_DIR}/data ${APP_DIR}/public/data ${OPERATIONS_DIR}

[Install]
WantedBy=multi-user.target
EOF

cat >"${timer_file}" <<EOF
[Unit]
Description=Daily KAIOS Kidults collector evidence loop (staging only)

[Timer]
OnCalendar=*-*-* 02:10:00 UTC
Persistent=true
RandomizedDelaySec=300
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
