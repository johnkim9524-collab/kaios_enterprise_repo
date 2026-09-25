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

query = [
    (key, value)
    for key, value in original_query
    if key.lower() not in {'host', 'hostaddr', 'port', 'connect_timeout', 'sslmode'}
]
query.append(('sslmode', ssl_mode))
query.append(('hostaddr', '127.0.0.1'))
query.append(('connect_timeout', '10'))

# Use libpq's keyword/value format for the tunneled connection.  Keeping the
# certificate/DNS identity in `host` while binding the socket explicitly with
# `hostaddr` is supported by libpq and avoids relying on URI-authority plus
# query-parameter precedence.  Values are single-quoted and escaped so the
# credential is never passed as a process argument or interpreted by a shell.
def conninfo_value(value):
    return "'" + str(value).replace('\\', '\\\\').replace("'", "\\'") + "'"

connection_values = [
    ('host', host),
    ('hostaddr', '127.0.0.1'),
    ('port', str(local_port)),
    ('dbname', urllib.parse.unquote(parts.path.lstrip('/'))),
]
if parts.username is not None:
    connection_values.append(('user', urllib.parse.unquote(parts.username)))
if parts.password is not None:
    connection_values.append(('password', urllib.parse.unquote(parts.password)))
connection_values.extend(query)
tunneled = ' '.join(
    f'{key}={conninfo_value(value)}' for key, value in connection_values
)

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

network_diagnostic_path="$runtime_root/network-diagnostic.json"
"${SSH[@]}" "$KAIOS_STAGING_SSH_USER@$KAIOS_STAGING_SSH_HOST" \
  python3 - "$database_host" "$database_port" > "$network_diagnostic_path" <<'PY'
import errno
import hashlib
import ipaddress
import json
import socket
import struct
import subprocess
import sys

host, port_text = sys.argv[1:]
port = int(port_text)
canonical_host = host.lower().rstrip('.')


def digest(value):
    return 'sha256:' + hashlib.sha256(value.encode()).hexdigest()


def address_class(address):
    parsed = ipaddress.ip_address(address)
    if parsed.is_loopback:
        return 'LOOPBACK'
    if parsed.is_link_local:
        return 'LINK_LOCAL'
    if parsed.is_private:
        return 'PRIVATE'
    if parsed.is_global:
        return 'GLOBAL'
    return 'RESERVED_OR_UNSPECIFIED'


def connect_result(family, sockaddr, timeout=5):
    sock = socket.socket(family, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect(sockaddr)
        return 'CONNECTED'
    except TimeoutError:
        return 'TIMEOUT'
    except ConnectionRefusedError:
        return 'CONNECTION_REFUSED'
    except OSError as error:
        if error.errno in {errno.ENETUNREACH, errno.EHOSTUNREACH}:
            return 'NO_ROUTE'
        if error.errno == errno.ETIMEDOUT:
            return 'TIMEOUT'
        if error.errno == errno.ECONNREFUSED:
            return 'CONNECTION_REFUSED'
        return f'OS_ERROR_{error.errno if error.errno is not None else "UNKNOWN"}'
    finally:
        sock.close()


def postgres_ssl_request_result(family, sockaddr, timeout=5):
    sock = socket.socket(family, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect(sockaddr)
        sock.sendall(struct.pack('!II', 8, 80877103))
        response = sock.recv(1)
        if response == b'S':
            return 'SSL_SUPPORTED'
        if response == b'N':
            return 'SSL_NOT_SUPPORTED'
        if response == b'':
            return 'CONNECTION_CLOSED_WITHOUT_RESPONSE'
        return 'UNEXPECTED_PROTOCOL_RESPONSE'
    except TimeoutError:
        return 'TIMEOUT'
    except ConnectionRefusedError:
        return 'CONNECTION_REFUSED'
    except OSError as error:
        if error.errno in {errno.ENETUNREACH, errno.EHOSTUNREACH}:
            return 'NO_ROUTE'
        if error.errno == errno.ETIMEDOUT:
            return 'TIMEOUT'
        if error.errno == errno.ECONNREFUSED:
            return 'CONNECTION_REFUSED'
        return f'OS_ERROR_{error.errno if error.errno is not None else "UNKNOWN"}'
    finally:
        sock.close()


def route_present(family_flag):
    result = subprocess.run(
        ['ip', family_flag, 'route', 'show', 'default'],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    return result.returncode == 0 and bool(result.stdout.strip())


def control_plane_egress():
    try:
        with socket.create_connection(('api.digitalocean.com', 443), timeout=5):
            return 'CONNECTED'
    except TimeoutError:
        return 'TIMEOUT'
    except OSError as error:
        if error.errno in {errno.ENETUNREACH, errno.EHOSTUNREACH}:
            return 'NO_ROUTE'
        if error.errno == errno.ECONNREFUSED:
            return 'CONNECTION_REFUSED'
        return f'OS_ERROR_{error.errno if error.errno is not None else "UNKNOWN"}'


diagnostic = {
    'id': 'kidults-postgres-network-diagnostic-v1',
    'mode': 'READ_ONLY',
    'endpoint_identity_digest': digest(canonical_host),
    'endpoint_label_class': 'PRIVATE_LABEL' if canonical_host.startswith('private-') else 'PUBLIC_LABEL',
    'port': port,
    'dns': {'state': 'UNKNOWN', 'answer_count': 0, 'families': [], 'answer_classes': [], 'answer_digests': []},
    'tcp_25060': {'state': 'UNKNOWN', 'attempts': []},
    'postgres_ssl_request': {'state': 'NOT_ATTEMPTED', 'attempts': []},
    'routing': {
        'ipv4_default_route_present': route_present('-4'),
        'ipv6_default_route_present': route_present('-6'),
        'digitalocean_control_plane_443': control_plane_egress(),
    },
    'remote_mutation_performed': False,
    'credential_value_emitted': False,
}

try:
    answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
except socket.gaierror as error:
    diagnostic['dns'] = {
        'state': 'FAILED',
        'failure_class': f'GAI_{error.errno if error.errno is not None else "UNKNOWN"}',
        'answer_count': 0,
        'families': [],
        'answer_classes': [],
        'answer_digests': [],
    }
    diagnostic['tcp_25060']['state'] = 'NOT_ATTEMPTED_DNS_FAILED'
    diagnostic['root_cause_class'] = 'DNS_RESOLUTION_FAILURE'
else:
    unique = []
    seen = set()
    for family, _socktype, _protocol, _canonical, sockaddr in answers:
        address = sockaddr[0]
        key = (family, address)
        if family not in {socket.AF_INET, socket.AF_INET6} or key in seen:
            continue
        seen.add(key)
        unique.append((family, address, sockaddr))

    attempts = []
    protocol_attempts = []
    for family, address, sockaddr in unique:
        attempt = {
            'family': 'IPv4' if family == socket.AF_INET else 'IPv6',
            'address_class': address_class(address),
            'address_digest': digest(address),
            'result': connect_result(family, sockaddr),
        }
        attempts.append(attempt)
        if attempt['result'] == 'CONNECTED':
            protocol_attempts.append({
                'family': attempt['family'],
                'address_class': attempt['address_class'],
                'address_digest': attempt['address_digest'],
                'result': postgres_ssl_request_result(family, sockaddr),
            })
    families = sorted({item['family'] for item in attempts})
    classes = sorted({item['address_class'] for item in attempts})
    diagnostic['dns'] = {
        'state': 'RESOLVED' if attempts else 'NO_USABLE_ADDRESSES',
        'answer_count': len(attempts),
        'families': families,
        'answer_classes': classes,
        'answer_digests': sorted(item['address_digest'] for item in attempts),
    }
    diagnostic['tcp_25060']['attempts'] = attempts
    diagnostic['postgres_ssl_request']['attempts'] = protocol_attempts
    results = {item['result'] for item in attempts}
    if 'CONNECTED' in results:
        state = 'CONNECTED'
        protocol_results = {item['result'] for item in protocol_attempts}
        if protocol_results & {'SSL_SUPPORTED', 'SSL_NOT_SUPPORTED'}:
            protocol_state = 'RESPONDED'
            root = 'POSTGRES_PROTOCOL_REACHABLE'
        elif 'TIMEOUT' in protocol_results:
            protocol_state = 'TIMEOUT'
            root = 'POSTGRES_PROTOCOL_RESPONSE_TIMEOUT'
        elif 'CONNECTION_CLOSED_WITHOUT_RESPONSE' in protocol_results:
            protocol_state = 'CONNECTION_CLOSED_WITHOUT_RESPONSE'
            root = 'POSTGRES_PROTOCOL_CONNECTION_CLOSED'
        else:
            protocol_state = 'OTHER_PROTOCOL_ERROR'
            root = 'POSTGRES_PROTOCOL_UNCLASSIFIED_RESPONSE'
        diagnostic['postgres_ssl_request']['state'] = protocol_state
    elif 'TIMEOUT' in results:
        state = 'TIMEOUT'
        root = ('DESTINATION_SPECIFIC_TIMEOUT' if
                diagnostic['routing']['digitalocean_control_plane_443'] == 'CONNECTED'
                else 'GENERAL_EGRESS_OR_ROUTE_FAILURE')
    elif results == {'CONNECTION_REFUSED'}:
        state = 'CONNECTION_REFUSED'
        root = 'DESTINATION_REACHABLE_SERVICE_NOT_ACCEPTING'
    elif 'NO_ROUTE' in results:
        state = 'NO_ROUTE'
        root = 'ROUTING_FAILURE'
    else:
        state = 'OTHER_NETWORK_ERROR'
        root = 'UNCLASSIFIED_NETWORK_ERROR'
    diagnostic['tcp_25060']['state'] = state
    diagnostic['root_cause_class'] = root

print(json.dumps(diagnostic, separators=(',', ':'), sort_keys=True))
PY

emit_failure_receipt() {
  local exit_code="$1"
  python3 - "$mode" "$exit_code" "$network_diagnostic_path" <<'PY'
import json
import os
import sys
from pathlib import Path

mode, exit_code_text, diagnostic_path = sys.argv[1:]
exit_code = int(exit_code_text)
diagnostic = json.loads(Path(diagnostic_path).read_text(encoding='utf-8'))
failure_class = {
    64: "VERIFIER_CONFIGURATION",
    66: "VERIFIER_INPUT_MISSING",
    69: "VERIFIER_DEPENDENCY_MISSING",
    70: "POSTGRES_CONNECTION",
}.get(exit_code, "VERIFIER_EXECUTION")
print(json.dumps({
    "status": "FAIL",
    "environment": "STAGING",
    "mode": mode,
    "failure_class": failure_class,
    "verifier_exit_code": exit_code,
    "verifier_completed": False,
    "network_diagnostic": diagnostic,
    "source_ref": os.environ.get("GITHUB_REF") or None,
    "source_sha": os.environ.get("GITHUB_SHA") or None,
    "event_name": os.environ.get("GITHUB_EVENT_NAME") or None,
    "run_id": int(os.environ["GITHUB_RUN_ID"]) if os.environ.get("GITHUB_RUN_ID", "").isdigit() else None,
    "run_attempt": int(os.environ["GITHUB_RUN_ATTEMPT"]) if os.environ.get("GITHUB_RUN_ATTEMPT", "").isdigit() else None,
    "production_touch": False,
    "public_touch": False,
    "g5_touch": False,
    "credential_value_emitted_by_receipt": False,
    "pitr_proven": False,
}, separators=(",", ":"), sort_keys=True))
PY
}

network_tcp_state="$(python3 - "$network_diagnostic_path" <<'PY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))['tcp_25060']['state'])
PY
)"
network_protocol_state="$(python3 - "$network_diagnostic_path" <<'PY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))['postgres_ssl_request']['state'])
PY
)"
if [[ "$network_tcp_state" != 'CONNECTED' || "$network_protocol_state" != 'RESPONDED' ]]; then
  echo "POSTGRES_CONNECTION: read-only preflight classified TCP=${network_tcp_state} PostgreSQL-protocol=${network_protocol_state}" >&2
  emit_failure_receipt 70
  exit 70
fi

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
  source) export KAIOS_POSTGRES_DSN="$(<"$runtime_root/tunneled_dsn")" ;;
  restore) export KAIOS_POSTGRES_PITR_RESTORE_DSN="$(<"$runtime_root/tunneled_dsn")" ;;
esac

set +e
bash "$verifier" > "$runtime_root/verifier.json"
verifier_rc=$?
set -e
if (( verifier_rc != 0 )); then
  emit_failure_receipt "$verifier_rc"
  exit "$verifier_rc"
fi

python3 - "$runtime_root/verifier.json" "$runtime_root/connection_identity_digest" "$runtime_root/tls_mode" "$runtime_root/destination_policy" "$network_diagnostic_path" <<'PY'
import json
import re
import sys
from pathlib import Path

receipt_path = Path(sys.argv[1])
receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
identity_digest = Path(sys.argv[2]).read_text(encoding='utf-8')
tls_mode = Path(sys.argv[3]).read_text(encoding='utf-8')
destination_policy = Path(sys.argv[4]).read_text(encoding='utf-8')
network_diagnostic = json.loads(Path(sys.argv[5]).read_text(encoding='utf-8'))
if not re.fullmatch(r'sha256:[a-f0-9]{64}', identity_digest):
    raise SystemExit('invalid connection identity digest')
if receipt.get('status') != 'PASS' or receipt.get('environment') != 'STAGING':
    raise SystemExit('verifier did not emit the canonical passing receipt')
receipt['connection_identity_digest'] = identity_digest
receipt['tls_encryption_required'] = tls_mode in {'require', 'verify-ca', 'verify-full'}
receipt['tls_ca_chain_verified'] = tls_mode in {'verify-ca', 'verify-full'}
receipt['tls_hostname_verified'] = tls_mode == 'verify-full'
receipt['destination_policy'] = destination_policy
receipt['network_diagnostic'] = network_diagnostic
print(json.dumps(receipt, separators=(',', ':'), sort_keys=True))
PY
