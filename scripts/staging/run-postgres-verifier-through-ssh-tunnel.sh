#!/usr/bin/env bash
set -euo pipefail

mode="${1:?usage: run-postgres-verifier-through-ssh-tunnel.sh source|restore}"

: "${KAIOS_ENVIRONMENT:?KAIOS_ENVIRONMENT is required}"
: "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED:?KAIOS_PRODUCTION_PROMOTION_AUTHORIZED is required}"
: "${KAIOS_STAGING_SSH_HOST:?KAIOS_STAGING_SSH_HOST is required}"
: "${KAIOS_STAGING_SSH_USER:?KAIOS_STAGING_SSH_USER is required}"
: "${KAIOS_STAGING_SSH_KEY_PATH:?KAIOS_STAGING_SSH_KEY_PATH is required}"
: "${KAIOS_STAGING_SSH_KNOWN_HOSTS_PATH:?KAIOS_STAGING_SSH_KNOWN_HOSTS_PATH is required}"

[[ "$KAIOS_ENVIRONMENT" == 'staging' ]] || { echo 'staging only' >&2; exit 64; }
[[ "$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == 'false' ]] || { echo 'production promotion must remain false' >&2; exit 64; }
[[ "$KAIOS_STAGING_SSH_USER" == 'kidults-staging' ]] || { echo 'unexpected SSH user' >&2; exit 64; }
[[ -f "$KAIOS_STAGING_SSH_KEY_PATH" ]] || { echo 'SSH key is missing' >&2; exit 66; }
[[ -f "$KAIOS_STAGING_SSH_KNOWN_HOSTS_PATH" ]] || { echo 'SSH known_hosts is missing' >&2; exit 66; }

for command_name in python3 ssh psql pg_isready; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required" >&2; exit 69; }
done

case "$mode" in
  source)
    : "${KAIOS_POSTGRES_DSN:?KAIOS_POSTGRES_DSN is required}"
    input_dsn="$KAIOS_POSTGRES_DSN"
    unset KAIOS_POSTGRES_DSN
    verifier="${KAIOS_SOURCE_VERIFIER_PATH:?KAIOS_SOURCE_VERIFIER_PATH is required}"
    ;;
  restore)
    : "${KAIOS_POSTGRES_PITR_RESTORE_DSN:?KAIOS_POSTGRES_PITR_RESTORE_DSN is required}"
    : "${KAIOS_PITR_BEFORE_MARKER:?KAIOS_PITR_BEFORE_MARKER is required}"
    : "${KAIOS_PITR_AFTER_MARKER:?KAIOS_PITR_AFTER_MARKER is required}"
    : "${KAIOS_PITR_BEFORE_MARKER_DIGEST:?KAIOS_PITR_BEFORE_MARKER_DIGEST is required}"
    : "${KAIOS_PITR_AFTER_MARKER_DIGEST:?KAIOS_PITR_AFTER_MARKER_DIGEST is required}"
    : "${KAIOS_PITR_TARGET_TIME:?KAIOS_PITR_TARGET_TIME is required}"
    input_dsn="$KAIOS_POSTGRES_PITR_RESTORE_DSN"
    unset KAIOS_POSTGRES_PITR_RESTORE_DSN
    verifier="${KAIOS_RESTORE_VERIFIER_PATH:?KAIOS_RESTORE_VERIFIER_PATH is required}"
    ;;
  *)
    echo 'mode must be source or restore' >&2
    exit 64
    ;;
esac

[[ -f "$verifier" ]] || { echo 'verifier is missing' >&2; exit 66; }

runtime_root="${RUNNER_TEMP:-/tmp}/kaios-postgres-tunnel-$$"
umask 077
mkdir -p "$runtime_root"
chmod 700 "$runtime_root"

tunnel_pid=''
cleanup() {
  if [[ -n "$tunnel_pid" ]]; then
    kill "$tunnel_pid" >/dev/null 2>&1 || true
    wait "$tunnel_pid" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$runtime_root"
}
trap cleanup EXIT

export KAIOS_TUNNEL_INPUT_DSN="$input_dsn"
unset input_dsn
python3 - "$runtime_root" <<'PY'
import ipaddress
import hashlib
import json
import os
import re
import socket
import sys
import urllib.parse
from pathlib import Path

root = Path(sys.argv[1])
dsn = os.environ['KAIOS_TUNNEL_INPUT_DSN']
parts = urllib.parse.urlsplit(dsn)
if parts.scheme not in {'postgres', 'postgresql'} or not parts.hostname or parts.fragment:
    raise SystemExit('invalid PostgreSQL URI')
if ',' in parts.hostname:
    raise SystemExit('multi-host PostgreSQL URI is not supported by the bounded tunnel')

host = parts.hostname
try:
    ipaddress.ip_address(host)
except ValueError:
    if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9._-]{0,251}[A-Za-z0-9])?', host):
        raise SystemExit('invalid PostgreSQL host')

remote_port = parts.port or 5432
if not 1 <= remote_port <= 65535:
    raise SystemExit('invalid PostgreSQL port')
canonical_host = host.lower().rstrip('.')
if not canonical_host.endswith('.db.ondigitalocean.com') or remote_port != 25060:
    raise SystemExit('PostgreSQL destination is outside the approved DigitalOcean STAGING boundary')

original_query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
ssl_modes = [value.lower() for key, value in original_query if key.lower() == 'sslmode']
if len(ssl_modes) != 1 or ssl_modes[0] not in {'require', 'verify-ca', 'verify-full'}:
    raise SystemExit('PostgreSQL URI must require TLS with one approved sslmode')
ssl_mode = ssl_modes[0]

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
    listener.bind(('127.0.0.1', 0))
    local_port = listener.getsockname()[1]

userinfo, separator, _ = parts.netloc.rpartition('@')
host_label = f'[{host}]' if ':' in host else host
netloc = f'{userinfo}@{host_label}:{local_port}' if separator else f'{host_label}:{local_port}'
query = [
    (key, value)
    for key, value in original_query
    if key.lower() not in {'host', 'hostaddr', 'port', 'connect_timeout', 'sslmode'}
]
query.append(('sslmode', ssl_mode))
query.append(('hostaddr', '127.0.0.1'))
query.append(('connect_timeout', '10'))
tunneled = urllib.parse.urlunsplit((
    parts.scheme,
    netloc,
    parts.path,
    urllib.parse.urlencode(query),
    ''
))

values = {
    'database_host': host,
    'database_port': str(remote_port),
    'local_port': str(local_port),
    'tunneled_dsn': tunneled,
    'tls_mode': ssl_mode,
    'destination_policy': 'DIGITALOCEAN_MANAGED_POSTGRESQL_STAGING_HOST_SUFFIX_AND_PORT',
    'connection_identity_digest': 'sha256:' + hashlib.sha256(json.dumps({
        'scheme': 'postgresql',
        'host': canonical_host,
        'port': remote_port,
        'database': urllib.parse.unquote(parts.path or '/'),
    }, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
}
for name, value in values.items():
    path = root / name
    path.write_text(value, encoding='utf-8')
    path.chmod(0o600)
PY
unset KAIOS_TUNNEL_INPUT_DSN

database_host="$(<"$runtime_root/database_host")"
database_port="$(<"$runtime_root/database_port")"
local_port="$(<"$runtime_root/local_port")"

if [[ "$database_host" == *:* ]]; then
  forward_host="[$database_host]"
else
  forward_host="$database_host"
fi

SSH=(
  ssh
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o ConnectTimeout=10
  -o ExitOnForwardFailure=yes
  -o KexAlgorithms=curve25519-sha256
  -o HostKeyAlgorithms=ssh-ed25519
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$KAIOS_STAGING_SSH_KNOWN_HOSTS_PATH"
  -i "$KAIOS_STAGING_SSH_KEY_PATH"
)

"${SSH[@]}" -N -L "127.0.0.1:${local_port}:${forward_host}:${database_port}" \
  "$KAIOS_STAGING_SSH_USER@$KAIOS_STAGING_SSH_HOST" &
tunnel_pid=$!

tunnel_ready=false
for _ in {1..50}; do
  if ! kill -0 "$tunnel_pid" >/dev/null 2>&1; then
    wait "$tunnel_pid"
    exit 1
  fi
  if python3 - "$local_port" <<'PY' >/dev/null 2>&1
import socket, sys
with socket.create_connection(('127.0.0.1', int(sys.argv[1])), timeout=0.2):
    pass
PY
  then
    tunnel_ready=true
    break
  fi
  sleep 0.2
done
[[ "$tunnel_ready" == 'true' ]] || { echo 'SSH PostgreSQL tunnel did not become ready' >&2; exit 1; }

case "$mode" in
  source)
    export KAIOS_POSTGRES_DSN="$(<"$runtime_root/tunneled_dsn")"
    bash "$verifier" > "$runtime_root/verifier.json"
    ;;
  restore)
    export KAIOS_POSTGRES_PITR_RESTORE_DSN="$(<"$runtime_root/tunneled_dsn")"
    bash "$verifier" > "$runtime_root/verifier.json"
    ;;
esac

python3 - "$runtime_root/verifier.json" "$runtime_root/connection_identity_digest" "$runtime_root/tls_mode" "$runtime_root/destination_policy" <<'PY'
import json
import re
import sys
from pathlib import Path

receipt_path = Path(sys.argv[1])
receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
identity_digest = Path(sys.argv[2]).read_text(encoding='utf-8')
tls_mode = Path(sys.argv[3]).read_text(encoding='utf-8')
destination_policy = Path(sys.argv[4]).read_text(encoding='utf-8')
if not re.fullmatch(r'sha256:[a-f0-9]{64}', identity_digest):
    raise SystemExit('invalid connection identity digest')
if receipt.get('status') != 'PASS' or receipt.get('environment') != 'STAGING':
    raise SystemExit('verifier did not emit the canonical passing receipt')
receipt['connection_identity_digest'] = identity_digest
receipt['tls_encryption_required'] = tls_mode in {'require', 'verify-ca', 'verify-full'}
receipt['tls_ca_chain_verified'] = tls_mode in {'verify-ca', 'verify-full'}
receipt['tls_hostname_verified'] = tls_mode == 'verify-full'
receipt['destination_policy'] = destination_policy
print(json.dumps(receipt, separators=(',', ':'), sort_keys=True))
PY
