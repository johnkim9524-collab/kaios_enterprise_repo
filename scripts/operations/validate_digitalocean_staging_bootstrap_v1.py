from __future__ import annotations

import copy
import json
from pathlib import Path

CONTRACT = Path('coordination/kidults/runtime/digitalocean-staging-bootstrap-contract-v1.json')
REQUIRED_TRUE = ['idempotent', 'versioned', 'audited', 'staging_only']
REQUIRED_FALSE = ['production_touch', 'production_id_reuse', 'production_ip_reuse', 'production_credential_reuse']
REQUIRED_PROHIBITED = [
    'PRODUCTION_DEPLOY',
    'PRODUCTION_RESTART',
    'PRODUCTION_FIREWALL_MUTATION',
    'PRODUCTION_DNS_MUTATION',
    'PRODUCTION_DATABASE_WRITE',
    'RAW_PROVIDER_INGESTION',
    'REAL_BUSINESS_WORKLOAD',
    'G5_PROMOTION',
]
REQUIRED_PRECONDITIONS = [
    'READ_ONLY_BINDING_PASS',
    'DEDICATED_STAGING_SSH_CREDENTIAL_PRESENT',
    'EXACT_HOST_FINGERPRINT_PINNED',
    'BOOTSTRAP_SCRIPT_DIGEST_PINNED',
    'ROLLBACK_TARGET_DECLARED',
]


def validate_contract(c: dict) -> list[str]:
    errors: list[str] = []
    if c.get('environment') != 'STAGING':
        errors.append('environment must be STAGING')

    p = c.get('bootstrap_policy', {})
    for key in REQUIRED_TRUE:
        if p.get(key) is not True:
            errors.append(f'{key} must be true')
    for key in REQUIRED_FALSE:
        if p.get(key) is not False:
            errors.append(f'{key} must be false')

    prohibited = set(c.get('prohibited', []))
    for item in REQUIRED_PROHIBITED:
        if item not in prohibited:
            errors.append(f'missing prohibited action: {item}')

    pre = set(c.get('required_preconditions', []))
    for item in REQUIRED_PRECONDITIONS:
        if item not in pre:
            errors.append(f'missing precondition: {item}')

    if c.get('production') != 'HOLD':
        errors.append('production must remain HOLD')
    if c.get('g5') != 'EXPLICIT_APPROVAL_REQUIRED':
        errors.append('g5 must remain explicit approval')
    return errors


def assert_mutation_selftest(c: dict) -> int:
    mutations: list[tuple[str, dict]] = []

    m = copy.deepcopy(c)
    m['environment'] = 'PRODUCTION'
    mutations.append(('environment', m))

    for key in REQUIRED_TRUE:
        m = copy.deepcopy(c)
        m.setdefault('bootstrap_policy', {})[key] = False
        mutations.append((f'bootstrap_policy.{key}', m))

    for key in REQUIRED_FALSE:
        m = copy.deepcopy(c)
        m.setdefault('bootstrap_policy', {})[key] = True
        mutations.append((f'bootstrap_policy.{key}', m))

    for item in REQUIRED_PROHIBITED:
        m = copy.deepcopy(c)
        m['prohibited'] = [x for x in m.get('prohibited', []) if x != item]
        mutations.append((f'prohibited.{item}', m))

    for item in REQUIRED_PRECONDITIONS:
        m = copy.deepcopy(c)
        m['required_preconditions'] = [x for x in m.get('required_preconditions', []) if x != item]
        mutations.append((f'precondition.{item}', m))

    m = copy.deepcopy(c)
    m['production'] = 'APPROVED'
    mutations.append(('production', m))

    m = copy.deepcopy(c)
    m['g5'] = 'APPROVED'
    mutations.append(('g5', m))

    undetected = [name for name, mutated in mutations if not validate_contract(mutated)]
    if undetected:
        raise SystemExit('mutation self-test false-green: ' + ', '.join(undetected))
    return len(mutations)


def main() -> int:
    c = json.loads(CONTRACT.read_text(encoding='utf-8'))
    errors = validate_contract(c)
    if errors:
        raise SystemExit('\n'.join(errors))

    mutation_cases = assert_mutation_selftest(c)
    print(json.dumps({
        'suite': 'DIGITALOCEAN_STAGING_BOOTSTRAP_SAFETY_V1',
        'result': 'PASS',
        'bootstrap_performed': False,
        'credential_admitted': False,
        'production_touch': False,
        'mutation_selftest': 'PASS',
        'mutation_cases_detected': mutation_cases,
        'production': 'HOLD',
        'g5': 'EXPLICIT_APPROVAL_REQUIRED'
    }, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
