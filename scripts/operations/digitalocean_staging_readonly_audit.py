from __future__ import annotations

import json
import hashlib
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


def digest(value: str) -> str:
    return 'sha256:' + hashlib.sha256(value.encode('utf-8')).hexdigest()


def postgres_database_inventory(
    token: str,
    droplet_id: str,
    staging_public_ip: str,
    staging_private_ip: str,
    droplet_tags: list[str],
) -> dict:
    try:
        payload = api_get('https://api.digitalocean.com/v2/databases?per_page=200', token)
    except urllib.error.HTTPError as error:
        return {
            'state': 'CONTROL_PLANE_READ_UNAVAILABLE',
            'failure_class': f'HTTP_{error.code}',
            'postgres_cluster_count': None,
            'clusters': [],
        }

    databases = payload.get('databases')
    if not isinstance(databases, list):
        return {
            'state': 'CONTROL_PLANE_RESPONSE_INVALID',
            'failure_class': 'DATABASES_NOT_LIST',
            'postgres_cluster_count': None,
            'clusters': [],
        }

    clusters = []
    for database in databases:
        if database.get('engine') != 'pg':
            continue
        database_id = str(database.get('id') or '')
        public_host = str(database.get('connection', {}).get('host') or '').lower().rstrip('.')
        private_host = str(database.get('private_connection', {}).get('host') or '').lower().rstrip('.')
        firewall_state = 'NOT_QUERIED_ID_MISSING'
        rules: list[dict] = []
        if database_id:
            try:
                firewall_payload = api_get(
                    'https://api.digitalocean.com/v2/databases/'
                    + urllib.parse.quote(database_id, safe='')
                    + '/firewall',
                    token,
                )
                raw_rules = firewall_payload.get('rules')
                if isinstance(raw_rules, list):
                    rules = raw_rules
                    firewall_state = 'READ'
                else:
                    firewall_state = 'RESPONSE_INVALID'
            except urllib.error.HTTPError as error:
                firewall_state = f'HTTP_{error.code}'

        matched_rule_classes = []
        rule_classes: dict[str, int] = {}
        for rule in rules:
            rule_type = str(rule.get('type') or 'unknown')
            value = str(rule.get('value') or '')
            rule_classes[rule_type] = rule_classes.get(rule_type, 0) + 1
            if rule_type == 'ip_addr' and value in {staging_public_ip, staging_private_ip}:
                matched_rule_classes.append('STAGING_IP')
            elif rule_type == 'droplet' and value == droplet_id:
                matched_rule_classes.append('STAGING_DROPLET')
            elif rule_type == 'tag' and value in droplet_tags:
                matched_rule_classes.append('STAGING_DROPLET_TAG')

        clusters.append({
            'cluster_identity_digest': digest(database_id) if database_id else None,
            'public_endpoint_digest': digest(public_host) if public_host else None,
            'private_endpoint_digest': digest(private_host) if private_host else None,
            'public_endpoint_present': bool(public_host),
            'private_endpoint_present': bool(private_host),
            'status': database.get('status'),
            'region': database.get('region'),
            'engine': database.get('engine'),
            'version': database.get('version'),
            'port': database.get('connection', {}).get('port'),
            'private_network_bound': bool(database.get('private_network_uuid')),
            'trusted_sources': {
                'state': firewall_state,
                'rule_count': len(rules),
                'rule_classes': rule_classes,
                'staging_source_admitted': bool(matched_rule_classes),
                'matched_rule_classes': sorted(set(matched_rule_classes)),
            },
        })

    return {
        'state': 'READ',
        'postgres_cluster_count': len(clusters),
        'online_postgres_cluster_count': sum(cluster.get('status') == 'online' for cluster in clusters),
        'clusters': clusters,
    }


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
    database_inventory = postgres_database_inventory(
        token,
        droplet_id,
        expected_public_ip,
        expected_private_ip,
        observed['tags'],
    )

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
        'managed_postgres': database_inventory,
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
