from __future__ import annotations

import re
from pathlib import Path

WORKFLOW = Path('.github/workflows/digitalocean-staging-bootstrap-exec.yml')

REQUIRED_MARKERS = [
    'workflow_dispatch:',
    "group: kidults-digitalocean-staging-bootstrap",
    'cancel-in-progress: false',
    "if: github.ref == 'refs/heads/main'",
    'runs-on: ubuntu-24.04',
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    'ref: ${{ github.sha }}',
    'persist-credentials: false',
    'EXPECTED_SHA: ${{ github.sha }}',
    'test "$ACTUAL_SHA" = "$EXPECTED_SHA"',
    'actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7',
    'SSH_PRIVATE_KEY_B64: ${{ secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 }}',
    'test -n "$SSH_PRIVATE_KEY_B64"',
    "printf '%s' \"$SSH_PRIVATE_KEY_B64\" | base64 --decode",
    'ssh-keygen -y -f "$RUNNER_TEMP/ssh/id_ed25519" >/dev/null',
    'unset SSH_PRIVATE_KEY_B64',
    'ssh-keyscan -T 10 -t ed25519 "$HOST"',
    'test "$OBSERVED" = "$EXPECTED_FINGERPRINT"',
    '-o BatchMode=yes',
    '-o IdentitiesOnly=yes',
    '-o ConnectTimeout=10',
    '-o HostKeyAlgorithms=ssh-ed25519',
    '-o StrictHostKeyChecking=yes',
    '-o UserKnownHostsFile="$RUNNER_TEMP/ssh/known_hosts"',
    'kidults-staging@"$HOST"',
    "'whoami'",
    '"kidults-staging"',
    "'hostname'",
    '"ih-staging-01"',
    "grep -F \"10.104.0.3\"",
    "'bash -s -- ih-staging-01 165.232.175.45 10.104.0.3' < scripts/operations/digitalocean_staging_userspace_bootstrap_v1.sh",
    "assert r['environment']=='STAGING'",
    "assert r['production_touch'] is False",
    "assert r['raw_provider_ingestion'] is False",
    "assert r['real_business_workload'] is False",
    "assert r['g5']=='HOLD'",
    "assert h['status']=='OK' and h['production'] is False",
    'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f # v6.0.0',
]

REQUIRED_COUNTS = {
    "if: github.ref == 'refs/heads/main'": 2,
    'runs-on: ubuntu-24.04': 2,
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1': 2,
    'ref: ${{ github.sha }}': 2,
    'persist-credentials: false': 2,
    'EXPECTED_SHA: ${{ github.sha }}': 2,
    'test "$ACTUAL_SHA" = "$EXPECTED_SHA"': 2,
    '-o BatchMode=yes': 3,
    '-o IdentitiesOnly=yes': 3,
    '-o ConnectTimeout=10': 3,
    '-o HostKeyAlgorithms=ssh-ed25519': 3,
    '-o StrictHostKeyChecking=yes': 3,
    '-o UserKnownHostsFile="$RUNNER_TEMP/ssh/known_hosts"': 3,
    'kidults-staging@"$HOST"': 6,
}

FORBIDDEN_MARKERS = [
    'pull_request:',
    'runs-on: ubuntu-latest',
    'actions/checkout@v',
    'actions/setup-python@v',
    'actions/upload-artifact@v',
    'secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY }}',
    'sudo ',
    'apt-get ',
    'apt install ',
    'systemctl enable ',
    'systemctl start ',
]


def validate(text: str) -> list[str]:
    errors: list[str] = []
    for marker in REQUIRED_MARKERS:
        if marker not in text:
            errors.append(f'missing executable workflow guard: {marker}')
    for marker, expected in REQUIRED_COUNTS.items():
        observed = text.count(marker)
        if observed != expected:
            errors.append(f'executable workflow guard count drift: {marker}: expected {expected}, observed {observed}')
    for marker in FORBIDDEN_MARKERS:
        if marker in text:
            errors.append(f'forbidden executable workflow capability present: {marker}')

    # The private key must be step-scoped to the materialization step, not job-scoped.
    bootstrap_match = re.search(r'\n  bootstrap:\n(?P<body>.*?)(?:\n  [A-Za-z0-9_-]+:\n|\Z)', text, flags=re.S)
    if not bootstrap_match:
        errors.append('bootstrap job block missing')
    else:
        bootstrap = bootstrap_match.group('body')
        prefix = bootstrap.split('    steps:', 1)[0]
        if 'SSH_PRIVATE_KEY_B64' in prefix:
            errors.append('STAGING SSH private key must not be job-scoped')
        key_step = re.search(
            r'- name: Materialize and validate dedicated STAGING key\n(?P<body>.*?)(?:\n      - name:|\n      - uses:|\Z)',
            bootstrap,
            flags=re.S,
        )
        if not key_step or 'SSH_PRIVATE_KEY_B64: ${{ secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 }}' not in key_step.group('body'):
            errors.append('STAGING SSH private key must be scoped to key materialization step')
    return errors


def mutation_selftest(text: str) -> int:
    cases = 0
    undetected: list[str] = []
    for marker in REQUIRED_MARKERS:
        mutated = text.replace(marker, '__REMOVED_GUARD__', 1)
        cases += 1
        if not validate(mutated):
            undetected.append(f'required:{marker}')
    for marker in FORBIDDEN_MARKERS:
        mutated = text + f'\n# mutation\n{marker}\n'
        cases += 1
        if not validate(mutated):
            undetected.append(f'forbidden:{marker}')

    # Explicit secret-scope mutation: hoist the key into the bootstrap job env.
    mutated = text.replace(
        '      EXPECTED_FINGERPRINT: ${{ vars.KIDULTS_STAGING_HOST_FINGERPRINT }}',
        '      EXPECTED_FINGERPRINT: ${{ vars.KIDULTS_STAGING_HOST_FINGERPRINT }}\n'
        '      SSH_PRIVATE_KEY_B64: ${{ secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 }}',
        1,
    )
    cases += 1
    if not validate(mutated):
        undetected.append('secret-scope:job-level-hoist')

    if undetected:
        raise SystemExit('workflow mutation self-test false-green: ' + ', '.join(undetected))
    return cases


def main() -> int:
    text = WORKFLOW.read_text(encoding='utf-8')
    errors = validate(text)
    if errors:
        raise SystemExit('\n'.join(errors))
    cases = mutation_selftest(text)
    print(
        'PASS executable STAGING bootstrap workflow boundary: '
        f'{len(REQUIRED_MARKERS)} required guards, {len(REQUIRED_COUNTS)} count-sensitive guards, '
        f'{len(FORBIDDEN_MARKERS)} forbidden capabilities, {cases} mutation cases; '
        'workflow_dispatch-only; explicit main ref; Ubuntu24; immutable action SHAs; exact source proof; '
        'persisted checkout credentials disabled; STAGING private key step-scoped; concurrent mutation serialized; '
        'Production/G5 unchanged'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
