"""Bounded local PostgreSQL discovery; emits no connection strings or command output."""
import json
import os
import shutil
import socket
import subprocess
from datetime import datetime, timezone

SQL = "BEGIN READ ONLY; SET LOCAL statement_timeout = '5s'; SELECT current_setting('transaction_read_only'); ROLLBACK;"


def probe(run=subprocess.run, which=shutil.which, hostname=socket.gethostname, env=None):
    env = os.environ if env is None else env
    identity_ok = hostname() == 'ih-staging-01' and env.get('USER') == 'kidults-staging'
    report = {
        'receipt_id': 'staging-postgres-readonly-probe-v1',
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'identity_verified': identity_ok,
        'psql_present': bool(which('psql')),
        'pg_isready_present': bool(which('pg_isready')),
        'connection_scope': 'LOCAL_PEER_POSTGRES_ONLY',
        'managed_postgres_connection_verified': False,
        'mutation_performed': False,
        'provider_call_performed': False,
        'promotion_authorized': False,
        'production': 'HOLD',
        'state': 'IDENTITY_REJECTED' if not identity_ok else 'CLIENT_MISSING',
    }
    if not identity_ok or not report['psql_present']:
        return report
    # Drop inherited libpq connection settings, credentials and startup overrides.
    child_env = {k: v for k, v in env.items() if not k.startswith('PG')}
    child_env.update(PGCONNECT_TIMEOUT='5', PGPASSFILE='/dev/null', PGSERVICEFILE='/dev/null')
    try:
        result = run(['psql', '--no-psqlrc', '--no-password', '--host=/var/run/postgresql',
                      '--dbname=postgres', '--quiet', '--tuples-only', '--no-align',
                      '--set=ON_ERROR_STOP=1', '--command', SQL],
                     env=child_env, capture_output=True, text=True, timeout=10)
        report['state'] = 'LOCAL_READ_ONLY_VERIFIED' if result.returncode == 0 and result.stdout.strip() == 'on' else 'LOCAL_CONNECTION_NOT_VERIFIED'
        report['exit_code'] = result.returncode
    except subprocess.TimeoutExpired:
        report['state'] = 'LOCAL_CONNECTION_TIMEOUT'
    except OSError:
        report['state'] = 'LOCAL_CLIENT_EXECUTION_FAILED'
    return report


if __name__ == '__main__':
    receipt = probe()
    print(json.dumps(receipt, separators=(',', ':')))
    raise SystemExit(0 if receipt['identity_verified'] else 1)
