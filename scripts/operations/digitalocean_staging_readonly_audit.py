from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def api_get(url: str, token: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={'Accept': 'application/json', 'Authorization': f'Bearer {token}'},
        method='GET',
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode('utf-8'))


def ip_by_type(networks: dict, ip_type: str) -> str | None:
    for item in networks.get('v4', []):
        if item.get('type') == ip_type:
            return item.get('ip_address')
    return None


def main() -> int:
    token = os.getenv('DIGITALOCEAN_READ_TOKEN')
    droplet_id = os.getenv('DIGITALOCEAN_STAGING_DROPLET_ID')
    expected_public_ip = os.getenv('KIDULTS_STAGING_PUBLIC_IP')
    expected_private_ip = os.getenv('KIDULTS_STAGING_PRIVATE_IP')
    if not token:
        fail('DIGITALOCEAN_READ_TOKEN is required')
    if not droplet_id:
        fail('DIGITALOCEAN_STAGING_DROPLET_ID is required')
    if not expected_public_ip or not expected_private_ip:
        fail('KIDULTS_STAGING_PUBLIC_IP and KIDULTS_STAGING_PRIVATE_IP are required')

    url = f"https://api.digitalocean.com/v2/droplets/{urllib.parse.quote(droplet_id, safe='')}"
    try:
        payload = api_get(url, token)
    except urllib.error.HTTPError as error:
        fail(f'DigitalOcean API returned HTTP {error.code}')

    droplet = payload.get('droplet', {})
    public_ip = ip_by_type(droplet.get('networks', {}), 'public')
    private_ip = ip_by_type(droplet.get('networks', {}), 'private')
    observed = {
        'id': str(droplet.get('id')),
        'name': droplet.get('name'),
        'status': droplet.get('status'),
        'region': droplet.get('region', {}).get('slug'),
        'size': droplet.get('size_slug'),
        'image_distribution': droplet.get('image', {}).get('distribution'),
        'image_name': droplet.get('image', {}).get('name'),
        'public_ipv4': public_ip,
        'private_ipv4': private_ip,
        'locked': droplet.get('locked'),
        'tags': droplet.get('tags', []),
    }

    expected = {
        'id': droplet_id,
        'name': 'ih-staging-01',
        'region': 'sgp1',
        'size': 's-1vcpu-1gb',
        'status': 'active',
        'public_ipv4': expected_public_ip,
        'private_ipv4': expected_private_ip,
    }
    errors: list[str] = []
    for key, value in expected.items():
        if observed.get(key) != value:
            errors.append(f'{key}: expected={value!r} observed={observed.get(key)!r}')
    if observed.get('locked') is True:
        errors.append('droplet is locked')

    report = {
        'audit_id': 'digitalocean-staging-readonly-audit-v1',
        'generated_at': utc_now(),
        'mode': 'READ_ONLY',
        'governing_issue': 899,
        'expected': expected,
        'observed': observed,
        'result': 'PASS' if not errors else 'FAIL',
        'errors': errors,
        'mutation_performed': False,
        'bootstrap_performed': False,
        'production_resource_touched': False,
        'production': 'HOLD',
        'g5': 'EXPLICIT_APPROVAL_REQUIRED',
    }
    output_dir = Path(os.getenv('KIDULTS_STAGING_AUDIT_OUTPUT', 'artifacts/digitalocean-staging-readonly-audit'))
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / 'digitalocean-staging-readonly-audit.json'
    output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'result': report['result'], 'observed': observed, 'mutation_performed': False}, indent=2))
    if errors:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
