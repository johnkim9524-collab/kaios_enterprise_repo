"""Bounded ledger component; not deployed or registered as a Lambda handler.

Dependencies are existing DynamoDB/KMS clients and protected role configuration.
No credentials, GitHub merge operation, IAM expansion or caller-verified flags.
The caller workloads remain responsible for authenticating current GitHub/S3
evidence. This component independently verifies signatures and fences writes.
"""
import base64
import hashlib
import json
import re
from datetime import datetime, timezone


INCIDENT = {
    'repository': 'johnkim9524-collab/kaios_enterprise_repo',
    'repository_id': '1281328888', 'pull_request': 2555,
    'original_generation': 'pr-2555-6a88733e40fc42290053-12cede9977fcc0d7',
    'original_run_id': '37123641239',
    'original_base_sha': 'c09474e218fb2220b58645f883f9ef3a1a4e957b',
    'original_head_sha': '6a88733e40fc42290053f5a0cac7a0f2d9878776',
    'original_tree_sha': '52785d48a1d71aa1ccb3cfc48d452469881a8cd4',
    'original_merge_sha': 'ad1bae34fd785cea4aecb00046ca0c5a7323b085',
    'original_nonce_digest': 'sha256:12cede9977fcc0d7319fb1aa015588d2edc0770c1ef9665dad93cee6ba7f50cc',
}
ROLES = ('ACCOUNTABLE_TRACK_AGENT', 'KPMO', 'INDEPENDENT_VERIFIER')
HOLD = {'production': 'HOLD', 'public': 'HOLD', 'g5': 'HOLD'}
SHA = re.compile(r'^[0-9a-f]{40}$')
RUN = re.compile(r'^[1-9][0-9]{0,19}$')
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value):
    return 'sha256:' + hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def require(condition, code):
    if not condition:
        raise ValueError(code)


def epoch(value):
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z', value), 'RECOVERY_TIMESTAMP')
    return datetime.fromisoformat(value[:-1] + '+00:00').timestamp()


def validate_request(request, now, fresh=True):
    require(isinstance(request, dict), 'RECOVERY_REQUEST')
    source = request.get('source_sha', '')
    require(isinstance(source, str) and SHA.fullmatch(source), 'RECOVERY_SOURCE_SHA')
    core = {
        'id': 'kidults-postmerge-terminal-recovery-request-v1', 'version': '1.0.0',
        'operation': 'POSTMERGE_TERMINAL_RECOVERY_ONLY', **INCIDENT,
        'source_sha': source, 'issued_at': request.get('issued_at'),
        'expires_at': request.get('expires_at'), **HOLD,
    }
    expected = {**core, 'recovery_generation': 'postmerge-2555-' + digest(core)[7:39]}
    require(canonical(request) == canonical(expected), 'RECOVERY_REQUEST_BINDING')
    issued, expires = epoch(request['issued_at']), epoch(request['expires_at'])
    require(0 < expires - issued <= 1800, 'RECOVERY_REQUEST_LIFETIME')
    if fresh:
        require(issued <= now < expires, 'RECOVERY_AUTHORITY_EXPIRED')
    return digest(request)


def validate_evidence(evidence, request):
    require(isinstance(evidence, dict), 'RECOVERY_EXACT_MAIN_EVIDENCE')
    require(evidence.get('state') == 'VERIFIED_PASS'
            and evidence.get('source_sha') == request['source_sha'], 'RECOVERY_EXACT_MAIN_EVIDENCE')
    for node in [evidence] + [evidence.get(k, {}) for k in
                            ('push_suite', 'canonical_truth', 'sentinel', 'success_authority_gate')]:
        require(all(node.get(k) == v for k, v in HOLD.items()), 'RECOVERY_HOLD_BOUNDARY')
        require(node.get('source_sha') == request['source_sha']
                and node.get('state') == 'VERIFIED_PASS', 'RECOVERY_EVIDENCE_IDENTITY')
    for name in ('push_suite', 'canonical_truth', 'sentinel', 'success_authority_gate'):
        node = evidence[name]
        require(RUN.fullmatch(str(node.get('run_id', '')))
                and DIGEST.fullmatch(str(node.get('receipt_digest', ''))), 'RECOVERY_EVIDENCE_IDENTITY')
    push, sentinel = evidence['push_suite'], evidence['sentinel']
    require(type(push.get('required_success_count')) is int and push['required_success_count'] == 6
            and type(push.get('required_failure_count')) is int and push['required_failure_count'] == 0,
            'RECOVERY_PUSH_SUITE')
    producers = sentinel.get('producers')
    require(isinstance(producers, list) and len(producers) == 4
            and all(isinstance(p, dict) and p.get('state') == 'VERIFIED_PASS' for p in producers)
            and sorted(p.get('id', '') for p in producers) == ['CANONICAL_TRUTH', 'REQUIREMENT', 'RESERVE', 'SHADOW']
            and sentinel.get('failed_producers') == [] and sentinel.get('waiting_producers') == [],
            'RECOVERY_SENTINEL_CORE_FOUR')


def validate_snapshot(snapshot, request, now):
    require(isinstance(snapshot, dict), 'RECOVERY_EVIDENCE_SNAPSHOT')
    evidence = snapshot.get('evidence', {})
    validate_evidence(evidence, request)
    selected_at = snapshot.get('selected_at')
    require(epoch(request['issued_at']) <= epoch(selected_at) < epoch(request['expires_at'])
            and epoch(selected_at) <= now, 'RECOVERY_SNAPSHOT_TIME_BINDING')
    core = {'id': 'kidults-postmerge-recovery-evidence-snapshot-v1', 'version': '1.0.0',
            'source_sha': request['source_sha'], 'selected_at': selected_at, 'evidence': evidence,
            'scope': 'ORIGINAL_LANDING_TERMINAL_RECOVERY_ONLY_NOT_WHOLE_PLATFORM', **HOLD}
    require(canonical(snapshot) == canonical({**core, 'snapshot_digest': digest(core)}), 'RECOVERY_SNAPSHOT_BINDING')
    require(len(canonical(snapshot).encode('utf-8')) <= 49152, 'RECOVERY_PAYLOAD_BOUND')


def validate_terminal(terminal, request, run_id):
    require(isinstance(terminal, dict), 'RECOVERY_TERMINAL')
    require(isinstance(run_id, str) and RUN.fullmatch(run_id)
            and run_id != INCIDENT['original_run_id'], 'RECOVERY_RUN_ID')
    evidence = terminal.get('evidence', {})
    validate_evidence(evidence, request)
    core = {
        'id': 'kidults-postmerge-terminal-recovery-receipt-v1', 'version': '1.0.0',
        'state': 'RECOVERED_CONSUMED_TERMINAL',
        'proof_scope': 'ORIGINAL_LANDING_TERMINAL_RECOVERY_ONLY_NOT_WHOLE_PLATFORM',
        'request': request, 'original_reservation_owner_run_id': INCIDENT['original_run_id'],
        'recovery_run_id': run_id, 'exact_recovery_main_sha': request['source_sha'],
        'original_merge_sha': INCIDENT['original_merge_sha'], 'evidence': evidence,
        'reservation_state': 'CONSUMED', 'merge_performed': False,
        'authority_renewed': False, 'promotion_eligible': False, **HOLD,
    }
    require(canonical(terminal) == canonical({**core, 'receipt_digest': digest(core)}),
            'RECOVERY_TERMINAL_BINDING')
    require(len(canonical(terminal).encode('utf-8')) <= 49152, 'RECOVERY_PAYLOAD_BOUND')


class RecoveryLedger:
    def __init__(self, *, ddb, kms, table, role_config, finalizer_config, receipt_key_arn, now=None):
        self.ddb, self.kms, self.table = ddb, kms, table
        self.roles, self.finalizer = role_config, finalizer_config
        require(isinstance(receipt_key_arn, str) and re.fullmatch(
            r'arn:aws:kms:ap-northeast-2:528314240275:key/[A-Za-z0-9-]+', receipt_key_arn), 'RECOVERY_RECEIPT_KEY_CONFIG')
        self.receipt_key_arn = receipt_key_arn
        self.now = now or (lambda: datetime.now(timezone.utc).timestamp())
        require(set(role_config) == set(ROLES), 'RECOVERY_ROLE_CONFIG')
        for field in ('workload_id', 'signing_key_arn', 'environment'):
            require(all(isinstance(v.get(field), str) and v[field] for v in role_config.values()),
                    'RECOVERY_ROLE_CONFIG')
            require(len({v[field] for v in role_config.values()}) == 3, 'RECOVERY_SIGNER_COLLISION')
        require(all(isinstance(finalizer_config.get(k), str) and finalizer_config[k]
                    for k in ('workload_id', 'signing_key_arn', 'environment')), 'RECOVERY_FINALIZER_CONFIG')
        require(finalizer_config['signing_key_arn'] not in {v['signing_key_arn'] for v in role_config.values()},
                'RECOVERY_SIGNER_COLLISION')

    @staticmethod
    def original_key():
        return {'pk': {'S': 'RESERVE#' + INCIDENT['original_generation']},
                'sk': {'S': 'NONCE#' + INCIDENT['original_nonce_digest']}}

    def get(self, key):
        return self.ddb.get_item(TableName=self.table, Key=key, ConsistentRead=True).get('Item', {})

    def reservation(self, request, state=None):
        item = self.get(self.original_key())
        require(item.get('run_id', {}).get('S') == INCIDENT['original_run_id']
                and item.get('head_sha', {}).get('S') == INCIDENT['original_head_sha'], 'RECOVERY_RESERVATION_BINDING')
        if state:
            require(item.get('state', {}).get('S') == state, 'RECOVERY_RESERVATION_STATE')
        pinned = item.get('recovery_request_json', {}).get('S')
        require(pinned is None or pinned == canonical(request), 'RECOVERY_ROOT_REQUEST_CONFLICT')
        return item

    def verify(self, event, config):
        require(set(event) == {'envelope', 'signature_b64'}, 'RECOVERY_SIGNED_EVENT_FIELDS')
        envelope = event['envelope']
        require(isinstance(envelope, dict) and envelope.get('workload') == config, 'RECOVERY_WORKLOAD_BINDING')
        try:
            signature = base64.b64decode(event['signature_b64'], validate=True)
        except (ValueError, TypeError) as error:
            raise ValueError('RECOVERY_SIGNATURE_ENCODING') from error
        result = self.kms.verify(KeyId=config['signing_key_arn'],
                                 Message=hashlib.sha256(canonical(envelope).encode('utf-8')).digest(),
                                 MessageType='DIGEST', Signature=signature, SigningAlgorithm='ECDSA_SHA_256')
        require(result.get('SignatureValid') is True, 'RECOVERY_SIGNATURE_INVALID')
        return envelope

    def approval(self, event, fresh=True):
        envelope = event.get('envelope', {})
        role = envelope.get('role')
        require(role in self.roles, 'RECOVERY_ROLE_FORBIDDEN')
        envelope = self.verify(event, self.roles[role])
        require(set(envelope) == {'id', 'action', 'request', 'request_digest', 'role', 'decision',
                                 'approval_run_id', 'approval_run_attempt', 'workload', 'evidence_digest', 'evidence_snapshot'},
                'RECOVERY_APPROVAL_FIELDS')
        require(envelope['id'] == 'kidults-postmerge-recovery-approval-v1'
                and envelope['action'] == 'CREATE_RECOVERY_APPROVAL' and envelope['decision'] == 'APPROVED'
                and type(envelope['approval_run_attempt']) is int and envelope['approval_run_attempt'] == 1
                and isinstance(envelope['approval_run_id'], str) and RUN.fullmatch(envelope['approval_run_id'])
                and DIGEST.fullmatch(str(envelope['evidence_digest'])), 'RECOVERY_APPROVAL_BINDING')
        require(validate_request(envelope['request'], self.now(), fresh) == envelope['request_digest'],
                'RECOVERY_REQUEST_DIGEST')
        validate_snapshot(envelope['evidence_snapshot'], envelope['request'], self.now())
        require(envelope['evidence_digest'] == digest(envelope['evidence_snapshot']['evidence']), 'RECOVERY_SNAPSHOT_EVIDENCE_DIGEST')
        return envelope

    def create_approval(self, event):
        envelope = self.approval(event)
        request = envelope['request']
        item = self.reservation(request, 'RESERVED')
        snapshot_json = canonical(envelope['evidence_snapshot'])
        require(item.get('recovery_evidence_snapshot_json', {}).get('S') in (None, snapshot_json), 'RECOVERY_PINNED_SNAPSHOT_CONFLICT')
        # Pin the incident once; no fresh generations after expiry or interruption.
        if 'recovery_request_json' not in item:
            self.ddb.update_item(TableName=self.table, Key=self.original_key(),
                UpdateExpression='SET recovery_request_json=:request, recovery_evidence_snapshot_json=:snapshot',
                ConditionExpression='#s=:reserved AND run_id=:owner AND head_sha=:head AND attribute_not_exists(recovery_request_json)',
                ExpressionAttributeNames={'#s': 'state'}, ExpressionAttributeValues={
                    ':request': {'S': canonical(request)}, ':snapshot': {'S': snapshot_json}, ':reserved': {'S': 'RESERVED'},
                    ':owner': {'S': INCIDENT['original_run_id']}, ':head': {'S': INCIDENT['original_head_sha']}})
        key = {'pk': {'S': 'AUTH#' + request['recovery_generation']},
               'sk': {'S': 'ROLE#' + envelope['role']}}
        prior = self.get(key)
        if prior:
            prior_envelope = self.approval(json.loads(prior.get('signed_event_json', {}).get('S', '{}')))
            require(canonical(prior_envelope) == canonical(envelope), 'RECOVERY_APPROVAL_CONFLICT')
            return {'state': 'EXISTING_SIGNED_RECOVERY_APPROVAL', 'write_performed': False}
        self.ddb.put_item(TableName=self.table, Item={**key, 'signed_event_json': {'S': canonical(event)}},
                          ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)')
        return {'state': 'SIGNED_RECOVERY_APPROVAL_STORED', 'write_performed': True}

    def read_context(self, event):
        envelope = event.get('envelope', {})
        config = self.roles.get(envelope.get('role')) if 'role' in envelope else self.finalizer
        require(config is not None, 'RECOVERY_ROLE_FORBIDDEN')
        envelope = self.verify(event, config)
        expected_fields = {'id', 'action', 'request', 'request_digest', 'run_id', 'workload'}
        if 'role' in envelope:
            expected_fields.add('role')
        require(set(envelope) == expected_fields
                and envelope['id'] == 'kidults-postmerge-recovery-context-v1'
                and envelope['action'] == 'READ_POSTMERGE_RECOVERY_CONTEXT'
                and isinstance(envelope['run_id'], str) and RUN.fullmatch(envelope['run_id']),
                'RECOVERY_READ_CONTEXT_BINDING')
        request = envelope['request']
        require(validate_request(request, self.now(), False) == envelope['request_digest'], 'RECOVERY_REQUEST_DIGEST')
        item = self.reservation(request)
        require(item.get('state', {}).get('S') in ('RESERVED', 'CONSUMED'), 'RECOVERY_RESERVATION_STATE')
        # Deliberately no approval/consumption side effect from an expired read.
        return {'state': 'SIGNED_RECOVERY_CONTEXT_READ', 'reservation': item, 'write_performed': False}

    def read_authority(self, event):
        envelope = self.finalizer_envelope(event, 'READ_RECOVERY_AUTHORITY', [], True)
        request = envelope['request']
        reservation = self.reservation(request, 'RESERVED')
        pinned_snapshot = reservation.get('recovery_evidence_snapshot_json', {}).get('S')
        require(pinned_snapshot is not None, 'RECOVERY_SNAPSHOT_UNPINNED')
        roles, evidence_digests, run_ids = [], set(), set()
        for role in ROLES:
            row = self.get({'pk': {'S': 'AUTH#' + request['recovery_generation']}, 'sk': {'S': 'ROLE#' + role}})
            require('signed_event_json' in row, 'RECOVERY_THREE_ROLE_QUORUM')
            approval = self.approval(json.loads(row['signed_event_json']['S']))
            require(approval['role'] == role and approval['request'] == request, 'RECOVERY_QUORUM_BINDING')
            require(canonical(approval['evidence_snapshot']) == pinned_snapshot, 'RECOVERY_PINNED_SNAPSHOT_CONFLICT')
            run_ids.add(approval['approval_run_id'])
            evidence_digests.add(approval['evidence_digest'])
            roles.append({'role': role, **self.roles[role], 'signature_verified_by_ledger': True,
                          'request_digest': envelope['request_digest'], 'expires_at': request['expires_at']})
        require(len(run_ids) == 3 and envelope['run_id'] not in run_ids, 'RECOVERY_APPROVAL_RUN_COLLISION')
        require(len(evidence_digests) == 1, 'RECOVERY_QUORUM_BINDING')
        return {'backend': 'AUTHENTICATED_SIGNED_LEDGER_V1', 'operation': request['operation'],
                'request_digest': envelope['request_digest'], 'recovery_generation': request['recovery_generation'],
                'evidence_digest': next(iter(evidence_digests)), 'roles': roles, 'write_performed': False}

    def finalizer_envelope(self, event, action, extras, fresh):
        envelope = self.verify(event, self.finalizer)
        require(set(envelope) == {'id', 'action', 'request', 'request_digest', 'run_id', 'workload'} | set(extras),
                'RECOVERY_FINALIZER_FIELDS')
        require(envelope['id'] == 'kidults-postmerge-recovery-finalizer-v1' and envelope['action'] == action,
                'RECOVERY_ACTION_FORBIDDEN')
        require(validate_request(envelope['request'], self.now(), fresh) == envelope['request_digest'],
                'RECOVERY_REQUEST_DIGEST')
        require(isinstance(envelope['run_id'], str) and RUN.fullmatch(envelope['run_id'])
                and envelope['run_id'] != INCIDENT['original_run_id'], 'RECOVERY_RUN_ID')
        return envelope

    def consume(self, event):
        envelope = self.finalizer_envelope(event, 'CONSUME_RECOVERY_RESERVATION', ['terminal'], True)
        request, terminal = envelope['request'], envelope['terminal']
        validate_terminal(terminal, request, envelope['run_id'])
        item = self.reservation(request, 'RESERVED')
        require(item.get('recovery_request_json', {}).get('S') == canonical(request), 'RECOVERY_ROOT_UNPINNED')
        pinned_snapshot = item.get('recovery_evidence_snapshot_json', {}).get('S')
        require(pinned_snapshot is not None, 'RECOVERY_SNAPSHOT_UNPINNED')
        require(json.loads(pinned_snapshot)['evidence'] == terminal['evidence'], 'RECOVERY_PINNED_TERMINAL_EVIDENCE')
        approvals = []
        for role in ROLES:
            row = self.get({'pk': {'S': 'AUTH#' + request['recovery_generation']}, 'sk': {'S': 'ROLE#' + role}})
            require('signed_event_json' in row, 'RECOVERY_THREE_ROLE_QUORUM')
            approval = self.approval(json.loads(row['signed_event_json']['S']))
            require(approval['role'] == role and approval['request'] == request
                    and approval['evidence_digest'] == digest(terminal['evidence']), 'RECOVERY_QUORUM_BINDING')
            require(canonical(approval['evidence_snapshot']) == pinned_snapshot, 'RECOVERY_PINNED_SNAPSHOT_CONFLICT')
            approvals.append(approval)
        require(len({a['approval_run_id'] for a in approvals}) == 3, 'RECOVERY_APPROVAL_RUN_COLLISION')
        require(envelope['run_id'] not in {a['approval_run_id'] for a in approvals}, 'RECOVERY_FINALIZER_RUN_COLLISION')
        values = {':reserved': {'S': 'RESERVED'}, ':consumed': {'S': 'CONSUMED'},
                  ':owner': {'S': INCIDENT['original_run_id']}, ':head': {'S': INCIDENT['original_head_sha']},
                  ':request': {'S': canonical(request)}, ':merge': {'S': INCIDENT['original_merge_sha']},
                  ':generation': {'S': request['recovery_generation']}, ':run': {'S': envelope['run_id']},
                  ':terminal': {'S': canonical(terminal)}, ':digest': {'S': terminal['receipt_digest']}, ':pending': {'S': 'PENDING'}}
        result = self.ddb.update_item(TableName=self.table, Key=self.original_key(),
            UpdateExpression='SET #s=:consumed, merge_sha=:merge, recovery_generation=:generation, recovery_run_id=:run, recovery_terminal_json=:terminal, recovery_terminal_digest=:digest, recovery_seal_state=:pending',
            ConditionExpression='#s=:reserved AND run_id=:owner AND head_sha=:head AND recovery_request_json=:request AND attribute_not_exists(recovery_terminal_digest)',
            ExpressionAttributeNames={'#s': 'state'}, ExpressionAttributeValues=values, ReturnValues='ALL_NEW')
        attrs = result.get('Attributes', {})
        require(attrs.get('state', {}).get('S') == 'CONSUMED'
                and attrs.get('run_id', {}).get('S') == INCIDENT['original_run_id']
                and attrs.get('recovery_terminal_digest', {}).get('S') == terminal['receipt_digest'], 'RECOVERY_CONSUME_READBACK')
        return {'state': 'RECOVERY_RESERVATION_CONSUMED', 'original_owner_preserved': True}

    def acknowledge(self, event):
        envelope = self.finalizer_envelope(event, 'ACK_RECOVERY_IMMUTABLE_RECEIPT', ['terminal_digest', 'immutable'], False)
        request, immutable = envelope['request'], envelope['immutable']
        item = self.reservation(request, 'CONSUMED')
        terminal = json.loads(item.get('recovery_terminal_json', {}).get('S', '{}'))
        validate_terminal(terminal, request, item.get('recovery_run_id', {}).get('S'))
        require(envelope['terminal_digest'] == terminal['receipt_digest']
                == item.get('recovery_terminal_digest', {}).get('S'), 'RECOVERY_ACK_DIGEST')
        key = 'receipts/' + INCIDENT['original_generation'] + '/postmerge-recovery-v1/' + INCIDENT['original_merge_sha'] + '.json'
        require(isinstance(immutable, dict) and set(immutable) == {'key', 'version_id', 'receipt_digest', 'object_lock_mode',
                    'checksum_sha256', 'retain_until', 'encryption_key_arn'}, 'RECOVERY_IMMUTABLE_FIELDS')
        require(immutable['key'] == key and immutable['receipt_digest'] == terminal['receipt_digest']
                and immutable['object_lock_mode'] == 'COMPLIANCE' and isinstance(immutable['version_id'], str)
                and 0 < len(immutable['version_id']) <= 1024 and immutable['checksum_sha256'] == digest(terminal)
                and immutable['encryption_key_arn'] == self.receipt_key_arn, 'RECOVERY_IMMUTABLE_BINDING')
        # Retention is measured from the original payload, not a retried ack time.
        issued = datetime.fromtimestamp(epoch(request['issued_at']), timezone.utc)
        anniversary = issued.replace(year=issued.year + 10, day=min(issued.day, 28) if issued.month == 2 else issued.day)
        require(epoch(immutable['retain_until']) >= anniversary.timestamp(), 'RECOVERY_RETENTION')
        stored = item.get('recovery_immutable_json', {}).get('S')
        if item.get('recovery_seal_state', {}).get('S') == 'VERIFIED':
            require(stored == canonical(immutable), 'RECOVERY_ACK_CONFLICT')
            return {'state': 'EXISTING_RECOVERY_IMMUTABLE_ACK', 'write_performed': False}
        self.ddb.update_item(TableName=self.table, Key=self.original_key(),
            UpdateExpression='SET recovery_seal_state=:verified, recovery_immutable_json=:immutable',
            ConditionExpression='#s=:consumed AND run_id=:owner AND head_sha=:head AND recovery_terminal_digest=:digest AND recovery_seal_state=:pending AND attribute_not_exists(recovery_immutable_json)',
            ExpressionAttributeNames={'#s': 'state'}, ExpressionAttributeValues={
                ':verified': {'S': 'VERIFIED'}, ':immutable': {'S': canonical(immutable)},
                ':consumed': {'S': 'CONSUMED'}, ':owner': {'S': INCIDENT['original_run_id']},
                ':head': {'S': INCIDENT['original_head_sha']}, ':digest': {'S': terminal['receipt_digest']}, ':pending': {'S': 'PENDING'}})
        return {'state': 'RECOVERY_IMMUTABLE_ACK_STORED', 'write_performed': True}
