#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/infrastructure/staging/.env.dual-staging}"
SERVICE_DIR="/etc/systemd/system"

[[ -f "${ENV_FILE}" ]] || { echo "Missing ${ENV_FILE}" >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js is required" >&2; exit 1; }

set -a
source "${ENV_FILE}"
set +a

: "${KAIOS_STAGING_VIEWER_TOKEN_FILE:?missing viewer token file path}"
: "${KAIOS_STAGING_OPERATOR_TOKEN_FILE:?missing operator token file path}"

for token_file in "${KAIOS_STAGING_VIEWER_TOKEN_FILE}" "${KAIOS_STAGING_OPERATOR_TOKEN_FILE}"; do
  [[ -s "${token_file}" ]] || { echo "Missing token file: ${token_file}" >&2; exit 1; }
done

install_unit() {
  local vertical="$1" port="$2"
  sudo tee "${SERVICE_DIR}/kaios-${vertical}-staging.service" >/dev/null <<EOF
[Unit]
Description=KAIOS ${vertical} staging HTTP runtime
After=network.target

[Service]
Type=simple
User=kaios
Group=kaios
WorkingDirectory=${ROOT_DIR}
EnvironmentFile=${ENV_FILE}
Environment=KAIOS_STAGING_VERTICAL=${vertical}
Environment=PORT=${port}
ExecStart=$(command -v node) ${ROOT_DIR}/apps/dual-staging-http-runtime/src/server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/intelligence-holdings/staging

[Install]
WantedBy=multi-user.target
EOF
}

install_unit kidults 18871
install_unit artfund 18872
sudo systemctl daemon-reload
sudo systemctl enable --now kaios-kidults-staging.service kaios-artfund-staging.service

echo "Dual staging HTTP runtime installed."
