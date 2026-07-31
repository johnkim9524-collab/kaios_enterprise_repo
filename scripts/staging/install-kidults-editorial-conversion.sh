#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
APP_DIR="${ROOT_DIR}/apps/kidults-enterprise-staging"
DATA_DIR="${KIDULTS_CONVERSION_DATA_DIR:-/opt/intelligence-holdings/staging/data/kidults-conversions}"
SECRET_DIR="${KIDULTS_CONVERSION_SECRET_DIR:-/opt/intelligence-holdings/staging/secrets}"
SECRET_FILE="${SECRET_DIR}/kidults_conversion_hash_secret"
SERVICE_FILE="/etc/systemd/system/kaios-kidults-editorial-staging.service"

[[ "${ROOT_DIR}" == /opt/intelligence-holdings/staging/* ]] || {
  echo "ROOT_DIR must remain inside /opt/intelligence-holdings/staging" >&2
  exit 1
}
command -v node >/dev/null || { echo "Node.js 20 or newer is required" >&2; exit 1; }
command -v openssl >/dev/null || { echo "OpenSSL is required" >&2; exit 1; }

sudo install -d -m 700 -o kaios -g kaios "${DATA_DIR}" "${SECRET_DIR}"
if [[ ! -s "${SECRET_FILE}" ]]; then
  openssl rand -hex 32 | sudo tee "${SECRET_FILE}" >/dev/null
fi
sudo chown kaios:kaios "${SECRET_FILE}"
sudo chmod 600 "${SECRET_FILE}"

sudo tee "${SERVICE_FILE}" >/dev/null <<EOF
[Unit]
Description=KAIOS Kidults editorial conversion staging runtime
After=network.target

[Service]
Type=simple
User=kaios
Group=kaios
WorkingDirectory=${APP_DIR}
Environment=KAIOS_ENVIRONMENT=staging
Environment=KAIOS_PRODUCTION_PROMOTION_AUTHORIZED=false
Environment=HOST=127.0.0.1
Environment=PORT=4173
Environment=KIDULTS_PUBLIC_DIR=${APP_DIR}/public
Environment=KIDULTS_CONVERSION_DATA_DIR=${DATA_DIR}
Environment=KIDULTS_CONVERSION_HASH_SECRET_FILE=${SECRET_FILE}
ExecStart=$(command -v node) ${APP_DIR}/server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now kaios-kidults-editorial-staging.service
sudo systemctl status kaios-kidults-editorial-staging.service --no-pager
