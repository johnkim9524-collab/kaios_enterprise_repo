"""Verify the existing STAGING tunnel using a bounded, TLS, read-only transaction."""
import json
import os
import subprocess
from datetime import datetime, timezone

SQL = "BEGIN READ ONLY; SET LOCAL statement_timeout = '5s'; SELECT json_build_object('read_only', current_setting('transaction_read_only'), 'tls', (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid())); ROLLBACK;"


def probe(run=subprocess.run, env=None):
    env = os.environ if env is None else env
    report = {
        'receipt_id': 'managed-postgres-readonly-probe-v1',
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'environment': 'STAGING', 'status': 'FAIL',
        'state': 'CONFIGURATION_REJECTED',
        'connection_scope': 'MANAGED_POSTGRES_THROUGH_PINNED_STAGING_SSH',
        'managed_postgres_connection_verified': False,
        'transaction_read_only_verified': False, 'tls_session_verified': False,
        'mutation_performed': False, 'provider_call_performed': False,
        'promotion_authorized': False, 'production_touch': False,
        'public_touch': False, 'g5_touch': False,
    }
    if (env.get('KAIOS_ENVIRONMENT') != 'staging'
            or env.get('KAIOS_PRODUCTION_PROMOTION_AUTHORIZED') != 'false'
            or not env.get('KAIOS_POSTGRES_DSN')):
        return report
    child_env = {k: v for k, v in env.items() if not k.startswith('PG') and k != 'KAIOS_POSTGRES_DSN'}
    child_env.update(PGDATABASE=env['KAIOS_POSTGRES_DSN'], PGCONNECT_TIMEOUT='5',
                     PGPASSFILE='/dev/null', PGSERVICEFILE='/dev/null',
                     PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=5000')
    try:
        result = run(['psql', '--no-psqlrc', '--no-password', '--quiet', '--tuples-only',
                      '--no-align', '--set=ON_ERROR_STOP=1', '--command', SQL],
                     env=child_env, capture_output=True, text=True, timeout=15)
        report['exit_code'] = result.returncode
        report['state'] = 'MANAGED_CONNECTION_NOT_VERIFIED'
        if result.returncode == 0:
            try:
                value = json.loads(result.stdout)
            except (ValueError, TypeError):
                report['state'] = 'READ_ONLY_RESPONSE_INVALID'
            else:
                if isinstance(value, dict):
                    report['transaction_read_only_verified'] = value.get('read_only') == 'on'
                    report['tls_session_verified'] = value.get('tls') is True
                if report['transaction_read_only_verified'] and report['tls_session_verified']:
                    report.update(status='PASS', state='MANAGED_READ_ONLY_VERIFIED',
                                  managed_postgres_connection_verified=True)
    except subprocess.TimeoutExpired:
        report['state'] = 'MANAGED_CONNECTION_TIMEOUT'
    except OSError:
        report['state'] = 'CLIENT_EXECUTION_FAILED'
    return report


if __name__ == '__main__':
    receipt = probe()
    print(json.dumps(receipt, separators=(',', ':')))
    raise SystemExit(0 if receipt['status'] == 'PASS' else 1)
