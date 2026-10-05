#!/usr/bin/env python3
"""Protected-main, secret-free adversarial verifier for a candidate tunnel helper."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def verify(candidate: Path) -> None:
    helper = candidate / 'scripts/staging/run-postgres-verifier-through-ssh-tunnel.sh'
    if not helper.is_file() or helper.is_symlink():
        raise RuntimeError('candidate tunnel helper unavailable')
    cases = [
        'host=elsewhere', 'hostaddr=127.0.0.2', 'port=5432',
        'dbname=other', 'user=other', 'password=other',
        'connect_timeout=0', 'service=other', 'servicefile=/tmp/other',
        'passfile=/tmp/other', 'options=-cfoo', 'sslrootcert=/tmp/other',
        'sslcert=/tmp/other', 'sslkey=/tmp/other', 'user=',
        'USER=other', '%75ser=other', 'sslmode=verify-full&sslmode=require',
        'sslmode=disable', 'sslmode=verify-full&user=other&user=again',
    ]
    with tempfile.TemporaryDirectory(prefix='kidults-independent-tunnel-') as temporary:
        root = Path(temporary)
        binaries = root / 'bin'
        binaries.mkdir()
        marker = root / 'external-invocation'
        for name in ('ssh', 'psql', 'pg_isready'):
            tool = binaries / name
            tool.write_text('#!/bin/sh\ntouch "' + str(marker) + '"\nexit 0\n')
            tool.chmod(0o755)
        key, known_hosts, verifier = (root / name for name in ('key', 'known_hosts', 'verifier'))
        for path in (key, known_hosts, verifier):
            path.write_text('fixture\n')
        runner = root / 'runner'
        runner.mkdir()
        for mode in ('source', 'restore'):
            for index, query in enumerate(cases):
                marker.unlink(missing_ok=True)
                secret = f'independent-private-marker-{mode}-{index}'
                uri = ('postgresql://authority-user:' + secret +
                       '@source.db.ondigitalocean.com:25060/kaios?sslmode=verify-full&' + query)
                env = os.environ.copy()
                env.update({
                    'PATH': str(binaries) + os.pathsep + env.get('PATH', ''),
                    'RUNNER_TEMP': str(runner),
                    'KAIOS_ENVIRONMENT': 'staging',
                    'KAIOS_PRODUCTION_PROMOTION_AUTHORIZED': 'false',
                    'KAIOS_STAGING_SSH_HOST': '165.232.175.45',
                    'KAIOS_STAGING_SSH_USER': 'kidults-staging',
                    'KAIOS_STAGING_SSH_KEY_PATH': str(key),
                    'KAIOS_STAGING_SSH_KNOWN_HOSTS_PATH': str(known_hosts),
                    'KAIOS_SOURCE_VERIFIER_PATH': str(verifier),
                    'KAIOS_RESTORE_VERIFIER_PATH': str(verifier),
                    'KAIOS_POSTGRES_DSN': uri,
                    'KAIOS_POSTGRES_PITR_RESTORE_DSN': uri,
                    'KAIOS_PITR_BEFORE_MARKER': 'before',
                    'KAIOS_PITR_AFTER_MARKER': 'after',
                    'KAIOS_PITR_BEFORE_MARKER_DIGEST': 'sha256:' + 'a' * 64,
                    'KAIOS_PITR_AFTER_MARKER_DIGEST': 'sha256:' + 'b' * 64,
                    'KAIOS_PITR_TARGET_TIME': '2026-09-25T00:00:00Z',
                })
                result = subprocess.run(['bash', str(helper), mode], cwd=candidate,
                                        env=env, capture_output=True, timeout=12)
                output = result.stdout + result.stderr
                if (result.returncode == 0 or marker.exists() or
                        any(runner.iterdir()) or secret.encode() in output or uri.encode() in output):
                    raise RuntimeError(f'negative case failed: mode={mode} case={index}')
    print(json.dumps({
        'state': 'PASS', 'cases': len(cases) * 2,
        'candidate_head': subprocess.check_output(['git', '-C', str(candidate), 'rev-parse', 'HEAD'], text=True).strip(),
        'protected_verifier_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'ready_or_merge_performed': False,
    }, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: verify-staging-tunnel-independent-v1.py CANDIDATE_CHECKOUT')
    verify(Path(sys.argv[1]).resolve())
