from __future__ import annotations

from pathlib import Path

WORKFLOW = Path('.github/workflows/digitalocean-staging-bootstrap-exec.yml')

REQUIRED_MARKERS = [
    'workflow_dispatch:',
    "if: github.event_name == 'workflow_dispatch'",
    'SSH_PRIVATE_KEY_B64: ${{ secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 }}',
    'test -n "$SSH_PRIVATE_KEY_B64"',
    "printf '%s' \"$SSH_PRIVATE_KEY_B64\" | base64 --decode",
    'ssh-keygen -y -f "$RUNNER_TEMP/ssh/id_ed25519" >/dev/null',
    'ssh-keyscan -t ed25519 "$HOST"',
    'test "$OBSERVED" = "$EXPECTED_FINGERPRINT"',
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
]

FORBIDDEN_MARKERS = [
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
    for marker in FORBIDDEN_MARKERS:
        if marker in text:
            errors.append(f'forbidden executable workflow capability present: {marker}')
    if text.count("if: github.event_name == 'workflow_dispatch'") != 1:
        errors.append('bootstrap remote mutation gate must be exactly one workflow_dispatch condition')
    if 'pull_request:' not in text:
        errors.append('PR control validation trigger must remain present')
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
    mutated = text.replace("if: github.event_name == 'workflow_dispatch'", 'if: always()', 1)
    cases += 1
    if not validate(mutated):
        undetected.append('workflow_dispatch_condition')
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
        f'{len(REQUIRED_MARKERS)} required guards, {len(FORBIDDEN_MARKERS)} forbidden capabilities, '
        f'{cases} mutation cases; remote mutation workflow_dispatch-only; Production/G5 unchanged'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
