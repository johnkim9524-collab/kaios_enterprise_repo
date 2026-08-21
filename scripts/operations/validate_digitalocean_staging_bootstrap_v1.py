from __future__ import annotations
import json
from pathlib import Path

CONTRACT = Path('coordination/kidults/runtime/digitalocean-staging-bootstrap-contract-v1.json')


def main() -> int:
    c = json.loads(CONTRACT.read_text(encoding='utf-8'))
    errors = []
    if c.get('environment') != 'STAGING': errors.append('environment must be STAGING')
    p = c.get('bootstrap_policy', {})
    required_true = ['idempotent','versioned','audited','staging_only']
    for key in required_true:
        if p.get(key) is not True: errors.append(f'{key} must be true')
    required_false = ['production_touch','production_id_reuse','production_ip_reuse','production_credential_reuse']
    for key in required_false:
        if p.get(key) is not False: errors.append(f'{key} must be false')
    prohibited = set(c.get('prohibited', []))
    for item in ['PRODUCTION_DEPLOY','PRODUCTION_RESTART','PRODUCTION_FIREWALL_MUTATION','PRODUCTION_DNS_MUTATION','PRODUCTION_DATABASE_WRITE','RAW_PROVIDER_INGESTION','REAL_BUSINESS_WORKLOAD','G5_PROMOTION']:
        if item not in prohibited: errors.append(f'missing prohibited action: {item}')
    pre = set(c.get('required_preconditions', []))
    for item in ['READ_ONLY_BINDING_PASS','DEDICATED_STAGING_SSH_CREDENTIAL_PRESENT','EXACT_HOST_FINGERPRINT_PINNED','BOOTSTRAP_SCRIPT_DIGEST_PINNED','ROLLBACK_TARGET_DECLARED']:
        if item not in pre: errors.append(f'missing precondition: {item}')
    if c.get('production') != 'HOLD': errors.append('production must remain HOLD')
    if c.get('g5') != 'EXPLICIT_APPROVAL_REQUIRED': errors.append('g5 must remain explicit approval')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(json.dumps({
        'suite':'DIGITALOCEAN_STAGING_BOOTSTRAP_SAFETY_V1',
        'result':'PASS',
        'bootstrap_performed':False,
        'credential_admitted':False,
        'production_touch':False,
        'production':'HOLD',
        'g5':'EXPLICIT_APPROVAL_REQUIRED'
    }, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
