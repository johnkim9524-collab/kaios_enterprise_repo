#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${KAIOS_STAGING_POSTGRES_ENV_FILE:-/etc/intelligence-holdings/staging/dual-staging-postgres.env}"
SERVICE_USER="${KAIOS_STAGING_SERVICE_USER:-kaios}"
SERVICE_GROUP="${KAIOS_STAGING_SERVICE_GROUP:-kaios}"
SERVER="$ROOT_DIR/apps/dual-staging-http-runtime/src/postgres-server.mjs"

[[ -f "$ENV_FILE" ]] || { echo "Missing environment file: $ENV_FILE" >&2; exit 66; }
[[ -f "$SERVER" ]] || { echo "Missing PostgreSQL runtime entrypoint: $SERVER" >&2; exit 66; }
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 69; }
command -v psql >/dev/null 2>&1 || { echo "psql is required" >&2; exit 69; }
id "$SERVICE_USER" >/dev/null 2>&1 || { echo "Missing service user: $SERVICE_USER" >&2; exit 67; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"
: "${KAIOS_STAGING_TENANT_ID:?KAIOS_STAGING_TENANT_ID is required}"
: "${KAIOS_POSTGRES_DSN:?KAIOS_POSTGRES_DSN is required}"
: "${KAIOS_STAGING_VIEWER_TOKEN_FILE:?KAIOS_STAGING_VIEWER_TOKEN_FILE is required}"
: "${KAIOS_STAGING_OPERATOR_TOKEN_FILE:?KAIOS_STAGING_OPERATOR_TOKEN_FILE is required}"

[[ "$KAIOS_ENVIRONMENT" == "staging" ]] || { echo "staging only" >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == "false" ]] || { echo "production promotion must remain false" >&2; exit 64; }
for token_file in "$KAIOS_STAGING_VIEWER_TOKEN_FILE" "$KAIOS_STAGING_OPERATOR_TOKEN_FILE"; do
  [[ -s "$token_file" ]] || { echo "Missing or empty token file: $token_file" >&2; exit 66; }
  chmod 600 "$token_file"
  chown "$SERVICE_USER:$SERVICE_GROUP" "$token_file"
done
chmod 640 "$ENV_FILE"
chown root:"$SERVICE_GROUP" "$ENV_FILE"

write_unit() {
  local service_name="$1"
  local vertical="$2"
  local port="$3"
  local unit="/etc/systemd/system/${service_name}.service"

  sudo tee "$unit" >/dev/null <<UNIT
[Unit]
Description=KaiOS ${vertical} PostgreSQL staging intelligence runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${ROOT_DIR}
EnvironmentFile=${ENV_FILE}
Environment=KAIOS_STAGING_VERTICAL=${vertical}
Environment=PORT=${port}
ExecStart=/usr/bin/env node ${SERVER}
Restart=on-failure
RestartSec=5
TimeoutStartSec=30
TimeoutStopSec=20
KillSignal=SIGTERM
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictRealtime=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
UNIT
}

write_unit kaios-kidults-postgres-staging kidults "${KAIOS_KIDULTS_STAGING_PORT:-3101}"
write_unit kaios-artfund-postgres-staging artfund "${KAIOS_ARTFUND_STAGING_PORT:-3102}"

sudo systemctl daemon-reload
if [[ "${KAIOS_AUTO_START_STAGING_RUNTIME:-false}" == "true" ]]; then
  sudo systemctl enable --now kaios-kidults-postgres-staging.service
  sudo systemctl enable --now kaios-artfund-postgres-staging.service
else
  echo "Units installed but not started; KAIOS_AUTO_START_STAGING_RUNTIME is not true"
fi

printf 'POSTGRES_STAGING_RUNTIME_INSTALL_PASS production_promotion=false\n'
