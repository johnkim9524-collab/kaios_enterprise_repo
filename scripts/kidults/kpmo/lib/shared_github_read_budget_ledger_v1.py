"""Signed shared-budget operations through the existing protected writer."""
import base64
import hashlib
import json
import re

REPOSITORY = 'johnkim9524-collab/kaios_enterprise_repo'
REPOSITORY_ID = '1281328888'
CONTRACT = 'kidults-shared-github-read-budget-v1'
ROLES = ('ACCOUNTABLE_TRACK_AGENT', 'KPMO', 'INDEPENDENT_VERIFIER', 'READ_RESUME')
HEX64 = re.compile(r'^[a-f0-9]{64}$')
SHA = re.compile(r'^[a-f0-9]{40}$')
RUN = re.compile(r'^[1-9][0-9]{0,15}$')
QUOTA_OWNER = re.compile(r'^[A-Za-z0-9_-]{1,80}$')
READ_RESUME_WORKFLOW_REFS = {
    REPOSITORY + '/.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml@refs/heads/main',
    REPOSITORY + '/.github/workflows/kpmo-authorization-read-resume-observer-v1.yml@refs/heads/main',
}


def require(value, code):
    if not value:
        raise ValueError('SHARED_GITHUB_READ_BUDGET_' + code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def validate_scope(scope):
    require(isinstance(scope, dict) and set(scope) == {'repository', 'resource', 'quota_owner_id'}, 'SCOPE_FIELDS')
    require(scope['repository'] == REPOSITORY and scope['resource'] == 'core'
            and isinstance(scope['quota_owner_id'], str) and QUOTA_OWNER.fullmatch(scope['quota_owner_id']), 'SCOPE')
    return scope


def validate_configuration(configuration, scope):
    require(isinstance(configuration, dict) and set(configuration) == {'scope', 'capacity', 'windowMs', 'maxConcurrent', 'leaseMs'}, 'CONFIG_FIELDS')
    require(configuration['scope'] == scope, 'CONFIG_SCOPE')
    capacity, window_ms = configuration['capacity'], configuration['windowMs']
    max_concurrent, lease_ms = configuration['maxConcurrent'], configuration['leaseMs']
    require(type(capacity) is int and 1 <= capacity <= 600
            and type(window_ms) is int and 60000 <= window_ms <= 3600000
            and type(max_concurrent) is int and 1 <= max_concurrent <= 4
            and type(lease_ms) is int and 1000 <= lease_ms <= 60000, 'CONFIG')
    return digest(configuration)


def validate_row(row, scope, config_digest):
    fields = {'version', 'scope_digest', 'config_digest', 'window_start', 'spent', 'blocked_until', 'operations', 'observed_at'}
    require(isinstance(row, dict) and set(row) == fields, 'ROW_FIELDS')
    require(type(row['version']) is int and row['version'] > 0
            and row['scope_digest'] == digest(scope) and row['config_digest'] == config_digest, 'ROW_BINDING')
    require(all(type(row[k]) is int and row[k] >= 0 for k in ('window_start', 'spent', 'blocked_until', 'observed_at')), 'ROW_COUNTER')
    operations = row['operations']
    require(isinstance(operations, dict) and len(operations) <= 1000, 'ROW_OPERATIONS')
    for operation_id, operation in operations.items():
        require(isinstance(operation_id, str) and HEX64.fullmatch(operation_id)
                and isinstance(operation, dict)
                and set(operation) == {'binding', 'expires_at', 'fence', 'state'}
                and isinstance(operation['binding'], str) and HEX64.fullmatch(operation['binding'])
                and type(operation['expires_at']) is int and operation['expires_at'] >= 0
                and type(operation['fence']) is int and 0 < operation['fence'] <= row['version']
                and operation['state'] in ('ACTIVE', 'COMPLETED'), 'ROW_OPERATION')
    return row


class Ledger:
    def __init__(self, *, ddb, kms, table, role_config):
        require(set(role_config) == set(ROLES), 'ROLE_CONFIG')
        require(all(set(role_config[role]) == {'workload_id', 'signing_key_arn', 'environment'}
                    and all(isinstance(v, str) and v for v in role_config[role].values()) for role in ROLES), 'WORKLOAD_CONFIG')
        require(len({role_config[role]['signing_key_arn'] for role in ROLES}) == len(ROLES)
                and len({role_config[role]['workload_id'] for role in ROLES}) == len(ROLES), 'WORKLOAD_COLLISION')
        self.ddb, self.kms, self.table, self.roles = ddb, kms, table, role_config

    def handle(self, event):
        require(isinstance(event, dict) and set(event) == {'envelope', 'signature_b64'}, 'SIGNED_FIELDS')
        envelope = event['envelope']
        require(isinstance(envelope, dict), 'ENVELOPE')
        role = envelope.get('role')
        require(role in ROLES, 'ROLE')
        config = self.roles[role]
        require(envelope.get('workload') == config, 'WORKLOAD')
        try:
            signature = base64.b64decode(event['signature_b64'], validate=True)
        except (ValueError, TypeError) as error:
            raise ValueError('SHARED_GITHUB_READ_BUDGET_SIGNATURE_ENCODING') from error
        require(self.kms.verify(KeyId=config['signing_key_arn'],
                                Message=hashlib.sha256(canonical(envelope).encode('utf-8')).digest(),
                                MessageType='DIGEST', Signature=signature,
                                SigningAlgorithm='ECDSA_SHA_256').get('SignatureValid') is True, 'SIGNATURE')

        action = envelope.get('action')
        base_fields = {'action', 'contract', 'repository', 'repository_id', 'scope', 'configuration', 'key',
                       'role', 'workload', 'run_id', 'run_attempt', 'source_sha', 'workflow_ref'}
        require(action in ('READ', 'COMPARE_AND_SWAP') and envelope.get('contract') == CONTRACT
                and envelope.get('repository') == REPOSITORY and envelope.get('repository_id') == REPOSITORY_ID, 'BINDING')
        require(isinstance(envelope.get('run_id'), str) and RUN.fullmatch(envelope['run_id'])
                and type(envelope.get('run_attempt')) is int and 1 <= envelope['run_attempt'] <= 100
                and isinstance(envelope.get('source_sha'), str) and SHA.fullmatch(envelope['source_sha'])
                and isinstance(envelope.get('workflow_ref'), str)
                and (envelope['workflow_ref'] in READ_RESUME_WORKFLOW_REFS
                     if role == 'READ_RESUME' else envelope['workflow_ref'].startswith(REPOSITORY + '/.github/workflows/')), 'RUN_BINDING')
        scope = validate_scope(envelope.get('scope'))
        config_digest = validate_configuration(envelope.get('configuration'), scope)
        key = 'GITHUB_READ_BUDGET#' + digest(scope)
        require(envelope.get('key') == key, 'KEY')
        fields = base_fields if action == 'READ' else base_fields | {'expected_version', 'next'}
        require(set(envelope) == fields, 'ACTION_FIELDS')
        # The AUTH# prefix is already the bounded namespace granted to the
        # existing ledger writer and to the three workload roles for queries.
        ddb_key = {'pk': {'S': 'AUTH#' + key}, 'sk': {'S': 'V1'}}
        if action == 'READ':
            item = self.ddb.get_item(TableName=self.table, Key=ddb_key, ConsistentRead=True).get('Item')
            if item is None:
                return {'action': action, 'key': key, 'row': None}
            require(item.get('pk', {}).get('S') == ddb_key['pk']['S'] and item.get('sk', {}).get('S') == 'V1'
                    and isinstance(item.get('budget_json', {}).get('S'), str), 'STORED_ROW')
            row = validate_row(json.loads(item['budget_json']['S']), scope, config_digest)
            require(item.get('budget_version', {}).get('N') == str(row['version']), 'STORED_VERSION')
            return {'action': action, 'key': key, 'row': row}

        expected = envelope.get('expected_version')
        row = validate_row(envelope.get('next'), scope, config_digest)
        require(type(expected) is int and expected >= 0 and row['version'] == expected + 1, 'CAS_VERSION')
        item = {'pk': ddb_key['pk'], 'sk': ddb_key['sk'], 'budget_version': {'N': str(row['version'])},
                'budget_json': {'S': canonical(row)}}
        try:
            if expected == 0:
                self.ddb.put_item(TableName=self.table, Item=item,
                                  ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)')
            else:
                self.ddb.update_item(TableName=self.table, Key=ddb_key,
                                     UpdateExpression='SET budget_version=:next, budget_json=:body',
                                     ConditionExpression='budget_version=:expected',
                                     ExpressionAttributeValues={':next': item['budget_version'], ':body': item['budget_json'],
                                                                ':expected': {'N': str(expected)}})
        except Exception as error:
            code = getattr(error, 'response', {}).get('Error', {}).get('Code', '')
            if code == 'ConditionalCheckFailedException' or 'ConditionalCheckFailedException' in str(error):
                return {'action': action, 'key': key, 'state': 'CONFLICT'}
            raise
        return {'action': action, 'key': key, 'state': 'COMMITTED', 'version': row['version']}
