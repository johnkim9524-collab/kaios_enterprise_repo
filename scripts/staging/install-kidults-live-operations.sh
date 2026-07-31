#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
APP_DIR="${ROOT_DIR}/apps/kidults-enterprise-staging"
PUBLIC_DIR="${APP_DIR}/public"
CONVERSION_DIR="${KIDULTS_CONVERSION_DATA_DIR:-/opt/intelligence-holdings/staging/data/kidults-conversions}"
OPERATIONS_DIR="${KIDULTS_OPERATIONS_DATA_DIR:-/opt/intelligence-holdings/staging/data/kidults-operations}"
EXPORT_DIR="${KIDULTS_OPERATIONS_EXPORT_DIR:-/opt/intelligence-holdings/staging/exports/kidults}"
BACKUP_DIR="${KIDULTS_OPERATIONS_BACKUP_DIR:-/opt/intelligence-holdings/staging/backups/kidults}"

[[ "${ROOT_DIR}" == /opt/intelligence-holdings/staging/* ]] || {
  echo "ROOT_DIR must remain inside /opt/intelligence-holdings/staging" >&2
  exit 1
}
command -v node >/dev/null || { echo "Node.js 20 or newer is required" >&2; exit 1; }

sudo install -d -m 700 -o kaios -g kaios \
  "${CONVERSION_DIR}" "${OPERATIONS_DIR}" "${EXPORT_DIR}" "${BACKUP_DIR}"

if [[ ! -s "${OPERATIONS_DIR}/validated-signals.json" ]]; then
  sudo install -m 600 -o kaios -g kaios \
    "${APP_DIR}/operations/validated-signals.example.json" \
    "${OPERATIONS_DIR}/validated-signals.json"
fi

sudo tee /etc/systemd/system/kaios-kidults-intelligence-refresh.service >/dev/null <<EOF
[Unit]
Description=KAIOS Kidults staging intelligence refresh
After=kaios-kidults-editorial-staging.service

[Service]
Type=oneshot
User=kaios
Group=kaios
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) ${APP_DIR}/operations.mjs refresh --public ${PUBLIC_DIR} --operations ${OPERATIONS_DIR} --source ${OPERATIONS_DIR}/validated-signals.json
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=${PUBLIC_DIR}/data ${OPERATIONS_DIR}
EOF

sudo tee /etc/systemd/system/kaios-kidults-intelligence-refresh.timer >/dev/null <<EOF
[Unit]
Description=Daily KAIOS Kidults staging intelligence refresh

[Timer]
OnCalendar=*-*-* 02:20:00 UTC
Persistent=true
RandomizedDelaySec=300
Unit=kaios-kidults-intelligence-refresh.service

[Install]
WantedBy=timers.target
EOF

sudo tee /etc/systemd/system/kaios-kidults-conversion-retention.service >/dev/null <<EOF
[Unit]
Description=KAIOS Kidults staging conversion retention enforcement

[Service]
Type=oneshot
User=kaios
Group=kaios
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) ${APP_DIR}/operations.mjs enforce-retention --data ${CONVERSION_DIR} --days 365
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=${CONVERSION_DIR}
EOF

sudo tee /etc/systemd/system/kaios-kidults-conversion-retention.timer >/dev/null <<EOF
[Unit]
Description=Weekly KAIOS Kidults staging conversion retention enforcement

[Timer]
OnCalendar=Sun *-*-* 03:10:00 UTC
Persistent=true
RandomizedDelaySec=300
Unit=kaios-kidults-conversion-retention.service

[Install]
WantedBy=timers.target
EOF

sudo tee /etc/systemd/system/kaios-kidults-operations-backup.service >/dev/null <<EOF
[Unit]
Description=KAIOS Kidults staging operations backup
After=kaios-kidults-intelligence-refresh.service

[Service]
Type=oneshot
User=kaios
Group=kaios
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) ${APP_DIR}/operations.mjs backup --public ${PUBLIC_DIR} --data ${CONVERSION_DIR} --output ${BACKUP_DIR}
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=${BACKUP_DIR}
ReadOnlyPaths=${PUBLIC_DIR}/data ${CONVERSION_DIR}
EOF

sudo tee /etc/systemd/system/kaios-kidults-operations-backup.timer >/dev/null <<EOF
[Unit]
Description=Daily KAIOS Kidults staging operations backup

[Timer]
OnCalendar=*-*-* 02:45:00 UTC
Persistent=true
RandomizedDelaySec=300
Unit=kaios-kidults-operations-backup.service

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now \
  kaios-kidults-intelligence-refresh.timer \
  kaios-kidults-conversion-retention.timer \
  kaios-kidults-operations-backup.timer
sudo systemctl start kaios-kidults-intelligence-refresh.service
sudo systemctl start kaios-kidults-operations-backup.service
sudo systemctl restart kaios-kidults-editorial-staging.service
sudo systemctl list-timers --all --no-pager | grep "kaios-kidults"
