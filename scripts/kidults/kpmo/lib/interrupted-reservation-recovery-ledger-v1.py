"""Undeployed merged-only ledger adapter. Protected native-evidence producers
must authenticate GitHub/S3 facts before signing. No GitHub, mint, or IAM API.
Original reservation identity is immutable; leases only fence terminal recovery.
"""
import base64
import hashlib
import json
import re
import time
from datetime import datetime
import calendar

ROLES = ('ACCOUNTABLE_TRACK_AGENT', 'KPMO', 'INDEPENDENT_VERIFIER')
HOLD = dict(production='HOLD', public='HOLD', g5='HOLD', provider_activation='HOLD')
SHA = re.compile(r'^[a-f0-9]{40}$')
DIGEST = re.compile(r'^sha256:[a-f0-9]{64}$')
RUN = re.compile(r'^[1-9][0-9]{0,15}$')
REQUEST_FIELDS = set(('id version repository repository_id pull_request base_sha head_sha head_tree_sha merge_sha source_sha original_run_id original_run_attempt original_generation nonce_digest issued_at expires_at').split()) | set(HOLD)


def require(value, code):
    if not value:
        raise ValueError('INTERRUPTED_RECOVERY_' + code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value):
    return 'sha256:' + hashlib.sha256(canonical(value).encode()).hexdigest()


def epoch(value):
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z', value), 'TIMESTAMP')
    return datetime.fromisoformat(value[:-1] + '+00:00').timestamp()


def retention_horizon(issued_at):
    # Fixed request-bound calendar horizon, stable across archive retries.
    epoch(issued_at)
    issued = datetime.fromisoformat(issued_at[:-1] + '+00:00')
    year = issued.year + 10
    day = min(issued.day, calendar.monthrange(year, issued.month)[1])
    return issued.replace(year=year, day=day).timestamp()


def validate_request(r, now, fresh=True):
    require(isinstance(r, dict) and set(r) == REQUEST_FIELDS, 'REQUEST_FIELDS')
    require(r['id'] == 'kidults-interrupted-reservation-postmerge-request-v1' and r['version'] == '1.0.0', 'REQUEST_VERSION')
    require(r['repository'] == 'johnkim9524-collab/kaios_enterprise_repo' and r['repository_id'] == '1281328888', 'REPOSITORY')
    require(type(r['pull_request']) is int and r['pull_request'] > 0 and r['pull_request'] != 1677, 'QUARANTINE')
    require(all(isinstance(r[k], str) and SHA.fullmatch(r[k]) for k in ('base_sha', 'head_sha', 'head_tree_sha', 'merge_sha', 'source_sha')), 'SHA')
    require(isinstance(r['original_run_id'], str) and RUN.fullmatch(r['original_run_id']) and type(r['original_run_attempt']) is int and r['original_run_attempt'] == 1, 'ORIGINAL_RUN')
    require(isinstance(r['original_generation'], str) and re.fullmatch(r'[A-Za-z0-9_.:-]{12,160}', r['original_generation']) and isinstance(r['nonce_digest'], str) and DIGEST.fullmatch(r['nonce_digest']), 'ORIGINAL_KEY')
    require(all(r[k] == v for k, v in HOLD.items()), 'HOLD')
    issued, expires = epoch(r['issued_at']), epoch(r['expires_at'])
    require(0 < expires - issued <= 1800 and (not fresh or issued <= now < expires), 'REQUEST_EXPIRED')
    return digest(r)


def validate_evidence(e, r):
    # Facts, not authorization booleans. Three protected signers authenticate
    # these native references independently; schema alone proves no runtime.
    require(isinstance(e, dict) and set(e) == {'repository', 'source_sha', 'pull_request', 'merge_sha', 'head_sha', 'head_tree_sha', 'merge_parents', 'merged_at', 'original_run', 'checks'} | set(HOLD), 'EVIDENCE_FIELDS')
    require(all(e[k] == r[k] for k in ('repository', 'source_sha', 'pull_request', 'merge_sha', 'head_sha', 'head_tree_sha')) and all(e[k] == v for k, v in HOLD.items()), 'EVIDENCE_BINDING')
    require(e['merge_parents'] == [r['base_sha'], r['head_sha']], 'MERGE_GRAPH')
    require(epoch(e['merged_at']) <= epoch(r['issued_at']), 'MERGE_TIME')
    n = e['original_run']
    require(isinstance(n, dict) and set(n) == {'run_id', 'run_attempt', 'source_sha', 'status', 'conclusion'} and n['run_id'] == r['original_run_id'] and type(n['run_attempt']) is int and n['run_attempt'] == 1 and n['source_sha'] == r['base_sha'] and n['status'] == 'completed' and n['conclusion'] in ('cancelled', 'failure', 'timed_out'), 'ORIGINAL_NATIVE_RUN')
    checks = e['checks']
    require(isinstance(checks, list) and len(checks) == 4 and {x.get('kind') for x in checks if isinstance(x, dict)} == {'REQUIRED_PUSH_SUITE', 'CANONICAL_TRUTH', 'SENTINEL', 'SUCCESS_AUTHORITY_GATE'}, 'CHECKS')
    for c in checks:
        require(set(c) == {'kind', 'run_id', 'run_attempt', 'source_sha', 'conclusion', 'artifact_id', 'archive_digest', 'receipt_digest'} and isinstance(c['run_id'], str) and RUN.fullmatch(c['run_id']) and type(c['run_attempt']) is int and c['run_attempt'] == 1 and c['source_sha'] == r['source_sha'] and c['conclusion'] == 'success' and type(c['artifact_id']) is int and c['artifact_id'] > 0 and all(isinstance(c[k], str) and DIGEST.fullmatch(c[k]) for k in ('archive_digest', 'receipt_digest')), 'CHECK_BINDING')
    return digest(e)


class InterruptedReservationRecoveryLedger:
    def __init__(self, *, ddb, kms, table, role_config, finalizer_config, receipt_bucket, receipt_key_arn, now=time.time):
        require(set(role_config) == set(ROLES) and isinstance(receipt_bucket, str) and receipt_bucket and isinstance(receipt_key_arn, str) and re.fullmatch(r'arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key/[A-Za-z0-9-]+', receipt_key_arn), 'CONFIG')
        configs = [role_config[r] for r in ROLES] + [finalizer_config]
        require(all(set(c) == {'workload_id', 'signing_key_arn', 'environment'} and all(isinstance(v, str) and v for v in c.values()) for c in configs), 'WORKLOAD_CONFIG')
        require(len({c['signing_key_arn'] for c in configs}) == 4 and len({c['workload_id'] for c in configs}) == 4, 'SIGNER_COLLISION')
        self.ddb, self.kms, self.table, self.roles, self.finalizer = ddb, kms, table, role_config, finalizer_config
        self.bucket, self.now, self.receipt_key = receipt_bucket, now, receipt_key_arn

    @staticmethod
    def key(r):
        return {'pk': {'S': 'RESERVE#' + r['original_generation']}, 'sk': {'S': 'NONCE#' + r['nonce_digest']}}

    def get(self, key):
        return self.ddb.get_item(TableName=self.table, Key=key, ConsistentRead=True).get('Item', {})

    def verify(self, event, config):
        require(isinstance(event, dict) and set(event) == {'envelope', 'signature_b64'}, 'SIGNED_FIELDS')
        e = event['envelope']
        require(isinstance(e, dict) and e.get('workload') == config, 'WORKLOAD')
        try:
            signature = base64.b64decode(event['signature_b64'], validate=True)
        except (ValueError, TypeError) as error:
            raise ValueError('INTERRUPTED_RECOVERY_SIGNATURE_ENCODING') from error
        require(self.kms.verify(KeyId=config['signing_key_arn'], Message=hashlib.sha256(canonical(e).encode()).digest(), MessageType='DIGEST', Signature=signature, SigningAlgorithm='ECDSA_SHA_256').get('SignatureValid') is True, 'SIGNATURE')
        return e

    def reservation(self, r):
        row = self.get(self.key(r))
        require(row.get('run_id', {}).get('S') == r['original_run_id'] and row.get('head_sha', {}).get('S') == r['head_sha'] and row.get('state', {}).get('S') in ('RESERVED', 'CONSUMED'), 'RESERVATION')
        require(row.get('ir_request', {}).get('S') in (None, canonical(r)), 'PINNED_REQUEST')
        if row['state']['S'] == 'CONSUMED':
            require(row.get('ir_request', {}).get('S') == canonical(r) and 'ir_terminal' in row, 'UNBOUND_CONSUMED')
            require(row.get('ir_terminal_digest', {}).get('S') == digest(json.loads(row['ir_terminal']['S'])), 'STORED_TERMINAL_DIGEST')
        return row

    def approval(self, event, fresh=True):
        role = event.get('envelope', {}).get('role')
        require(role in self.roles, 'ROLE')
        e = self.verify(event, self.roles[role])
        require(set(e) == {'action', 'request', 'request_digest', 'evidence', 'evidence_digest', 'role', 'approval_run_id', 'approval_run_attempt', 'workload'} and e['action'] == 'APPROVE_MERGED_RESERVATION_RECOVERY', 'APPROVAL_FIELDS')
        require(validate_request(e['request'], self.now(), fresh) == e['request_digest'] and validate_evidence(e['evidence'], e['request']) == e['evidence_digest'], 'APPROVAL_DIGEST')
        require(isinstance(e['approval_run_id'], str) and RUN.fullmatch(e['approval_run_id']) and e['approval_run_id'] != e['request']['original_run_id'] and type(e['approval_run_attempt']) is int and e['approval_run_attempt'] == 1, 'APPROVAL_RUN')
        return e

    def supersession_context(self, r):
        # New request is only staged; no authority until the original row CAS.
        row = self.get(self.key(r))
        require(row.get('state', {}).get('S') == 'RESERVED' and row.get('run_id', {}).get('S') == r['original_run_id'] and row.get('head_sha', {}).get('S') == r['head_sha'] and 'ir_terminal' not in row and 'ir_terminal_digest' not in row, 'SUPERSESSION_RESERVATION')
        require('ir_request' in row, 'SUPERSESSION_PIN_MISSING')
        old = json.loads(row['ir_request']['S'])
        validate_request(old, self.now(), False)
        require(epoch(old['expires_at']) <= self.now() and float(row.get('ir_lease_until', {}).get('N', '0')) <= self.now(), 'SUPERSESSION_NOT_QUIESCENT')
        immutable = REQUEST_FIELDS - {'issued_at', 'expires_at', 'source_sha'}
        require(all(r[k] == old[k] for k in immutable) and r != old and epoch(r['issued_at']) >= epoch(old['expires_at']), 'SUPERSESSION_ORIGINAL_IDENTITY')
        count = int(row.get('ir_supersessions', {}).get('N', '0'))
        require(0 <= count < 2 and str(count) == row.get('ir_supersessions', {}).get('N', '0'), 'SUPERSESSION_BUDGET')
        old_runs = set()
        for role in ROLES:
            key = {'pk': {'S': 'AUTH#POSTMERGE#' + digest(old)}, 'sk': {'S': 'ROLE#' + role}}
            signed_old = json.loads(self.get(key).get('signed_event', {}).get('S', '{}'))
            approval = self.approval(signed_old, fresh=False)
            require(approval['role'] == role and approval['request_digest'] == digest(old) and approval['evidence_digest'] == row.get('ir_evidence_digest', {}).get('S'), 'SUPERSESSION_OLD_SIGNATURE')
            old_runs.add(approval['approval_run_id'])
        require(len(old_runs) == 3, 'SUPERSESSION_OLD_QUORUM')
        return row, old, count, old_runs

    def create_approval(self, event):
        e = self.approval(event); r = e['request']; row = self.get(self.key(r))
        staged = row.get('ir_request', {}).get('S') not in (None, canonical(r))
        if staged:
            self.supersession_context(r)
        else:
            row = self.reservation(r)
            require(row['state']['S'] == 'RESERVED', 'ALREADY_CONSUMED')
            if 'ir_request' not in row:
                self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET ir_request=:request, ir_evidence_digest=:evidence', ConditionExpression='#state=:reserved AND run_id=:original AND head_sha=:head AND attribute_not_exists(ir_request)', ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues={':request': {'S': canonical(r)}, ':evidence': {'S': e['evidence_digest']}, ':reserved': {'S': 'RESERVED'}, ':original': {'S': r['original_run_id']}, ':head': {'S': r['head_sha']}})
            row = self.reservation(r)
            require(row['ir_evidence_digest']['S'] == e['evidence_digest'], 'EVIDENCE_CONFLICT')
        key = {'pk': {'S': 'AUTH#POSTMERGE#' + e['request_digest']}, 'sk': {'S': 'ROLE#' + e['role']}}
        prior = self.get(key)
        if prior:
            require(canonical(self.approval(json.loads(prior.get('signed_event', {}).get('S', '{}')))) == canonical(e), 'APPROVAL_CONFLICT')
            return {'state': 'EXISTING_APPROVAL'}
        self.ddb.put_item(TableName=self.table, Item={**key, 'signed_event': {'S': canonical(event)}}, ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)')
        return {'state': 'APPROVAL_STORED'}

    def authenticate(self, event, action, extra=(), fresh=True):
        e = self.verify(event, self.finalizer)
        require(set(e) == {'action', 'request', 'request_digest', 'run_id', 'run_attempt', 'workload'} | set(extra) and e['action'] == action, 'FINALIZER_FIELDS')
        require(validate_request(e['request'], self.now(), fresh) == e['request_digest'] and isinstance(e['run_id'], str) and RUN.fullmatch(e['run_id']) and e['run_id'] != e['request']['original_run_id'] and type(e['run_attempt']) is int and e['run_attempt'] == 1, 'FINALIZER_BINDING')
        return e

    def quorum(self, e, row):
        runs = set()
        for role in ROLES:
            key = {'pk': {'S': 'AUTH#POSTMERGE#' + e['request_digest']}, 'sk': {'S': 'ROLE#' + role}}
            a = self.approval(json.loads(self.get(key).get('signed_event', {}).get('S', '{}')))
            require(a['role'] == role and a['request_digest'] == e['request_digest'] and a['evidence_digest'] == row.get('ir_evidence_digest', {}).get('S'), 'QUORUM')
            runs.add(a['approval_run_id'])
        require(len(runs) == 3 and e['run_id'] not in runs, 'QUORUM_RUN_COLLISION')

    def supersede(self, event):
        e = self.authenticate(event, 'SUPERSEDE_EXPIRED_MERGED_RECOVERY', ('expected_old_request_digest', 'evidence_digest'))
        r = e['request']; row, old, count, old_runs = self.supersession_context(r)
        require(e['expected_old_request_digest'] == digest(old) and isinstance(e['evidence_digest'], str) and DIGEST.fullmatch(e['evidence_digest']), 'SUPERSESSION_DIGEST')
        self.quorum(e, {'ir_evidence_digest': {'S': e['evidence_digest']}})
        for role in ROLES:
            new = self.approval(json.loads(self.get({'pk': {'S': 'AUTH#POSTMERGE#' + e['request_digest']}, 'sk': {'S': 'ROLE#' + role}})['signed_event']['S']))
            require(new['approval_run_id'] not in old_runs, 'SUPERSESSION_FRESH_ROLE_RUN')
        condition = 'attribute_not_exists(ir_supersessions)' if count == 0 else 'ir_supersessions=:oldcount'
        values = {':reserved': {'S': 'RESERVED'}, ':original': {'S': r['original_run_id']}, ':head': {'S': r['head_sha']}, ':old': {'S': canonical(old)}, ':old_evidence': row['ir_evidence_digest'], ':request': {'S': canonical(r)}, ':evidence': {'S': e['evidence_digest']}, ':count': {'N': str(count + 1)}}
        if count: values[':oldcount'] = {'N': str(count)}
        if 'ir_lease_until' in row:
            condition += ' AND ir_lease_until<=:now'
            values[':now'] = {'N': str(self.now())}
        else:
            condition += ' AND attribute_not_exists(ir_lease_until)'
        result = self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET ir_request=:request, ir_evidence_digest=:evidence, ir_supersessions=:count', ConditionExpression='#state=:reserved AND run_id=:original AND head_sha=:head AND ir_request=:old AND ir_evidence_digest=:old_evidence AND attribute_not_exists(ir_terminal) AND attribute_not_exists(ir_terminal_digest) AND ' + condition, ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues=values, ReturnValues='ALL_NEW')
        attrs = result.get('Attributes', {})
        require(attrs.get('run_id', {}).get('S') == r['original_run_id'] and attrs.get('head_sha', {}).get('S') == r['head_sha'] and all(attrs.get(k) == v for k, v in self.key(r).items()) and attrs.get('state', {}).get('S') == 'RESERVED' and attrs.get('ir_request', {}).get('S') == canonical(r) and attrs.get('ir_evidence_digest', {}).get('S') == e['evidence_digest'] and attrs.get('ir_supersessions', {}).get('N') == str(count + 1), 'SUPERSESSION_READBACK')
        return {'state': 'POSTMERGE_RECOVERY_REQUEST_SUPERSEDED_NOT_LANDING_AUTHORITY', 'request_digest': e['request_digest'], 'evidence_digest': e['evidence_digest'], 'supersessions': count + 1, 'original_run_id': r['original_run_id']}

    def claim(self, event):
        e = self.authenticate(event, 'CLAIM_MERGED_RECOVERY', ('expected_revision', 'lease_seconds'))
        r = e['request']; row = self.reservation(r); self.quorum(e, row)
        require(row['state']['S'] == 'RESERVED', 'ALREADY_CONSUMED')
        now = self.now(); revision = int(row.get('ir_revision', {}).get('N', '0'))
        require(type(e['expected_revision']) is int and e['expected_revision'] == revision and type(e['lease_seconds']) is int and 1 <= e['lease_seconds'] <= 120, 'LEASE_REQUEST')
        require(float(row.get('ir_lease_until', {}).get('N', '0')) <= now, 'LEASE_ACTIVE')
        until = min(now + e['lease_seconds'], epoch(r['expires_at']))
        values = {':request': {'S': canonical(r)}, ':reserved': {'S': 'RESERVED'}, ':original': {'S': r['original_run_id']}, ':head': {'S': r['head_sha']}, ':run': {'S': e['run_id']}, ':revision': {'N': str(revision + 1)}, ':until': {'N': str(until)}}
        condition = 'attribute_not_exists(ir_revision)' if revision == 0 else 'ir_revision=:previous AND ir_lease_until<=:now'
        if revision:
            values[':previous'] = {'N': str(revision)}
            values[':now'] = {'N': str(now)}
        result = self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET ir_execution_run=:run, ir_revision=:revision, ir_lease_until=:until', ConditionExpression='#state=:reserved AND run_id=:original AND head_sha=:head AND ir_request=:request AND ' + condition, ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues=values, ReturnValues='ALL_NEW')
        observed = result.get('Attributes', {})
        require(observed.get('ir_execution_run', {}).get('S') == e['run_id'] and observed.get('ir_revision', {}).get('N') == str(revision + 1) and observed.get('run_id', {}).get('S') == r['original_run_id'] and observed.get('state', {}).get('S') == 'RESERVED' and observed.get('head_sha', {}).get('S') == r['head_sha'] and observed.get('ir_request', {}).get('S') == canonical(r) and observed.get('ir_lease_until', {}).get('N') == str(until), 'LEASE_READBACK')
        return {'state': 'TERMINAL_RECOVERY_LEASE_ONLY', 'revision': revision + 1, 'lease_until': until, 'original_run_id': r['original_run_id']}

    def read(self, event):
        e = self.authenticate(event, 'READ_MERGED_RECOVERY', fresh=False)
        row = self.reservation(e['request'])
        return {'state': row['state']['S'], 'request_digest': e['request_digest'], 'evidence_digest': row.get('ir_evidence_digest', {}).get('S'), 'supersessions': int(row.get('ir_supersessions', {}).get('N', '0')), 'original_run_id': row['run_id']['S'], 'revision': int(row.get('ir_revision', {}).get('N', '0')), 'terminal': json.loads(row['ir_terminal']['S']) if 'ir_terminal' in row else None, 'immutable_ack': json.loads(row['ir_immutable_ack']['S']) if 'ir_immutable_ack' in row else None}

    def consume(self, event):
        e = self.authenticate(event, 'CONSUME_MERGED_RECOVERY', ('revision', 'terminal'), fresh=False)
        r = e['request']; row = self.reservation(r); terminal = e['terminal']
        require(isinstance(terminal, dict) and set(terminal) == {'id', 'state', 'request_digest', 'evidence_digest', 'recovery_run_id', 'revision', 'merge_sha', 'head_sha'} | set(HOLD) and terminal['id'] == 'kidults-interrupted-reservation-terminal-v1' and terminal['state'] == 'VERIFIED_PASS' and terminal['request_digest'] == e['request_digest'] and terminal['evidence_digest'] == row.get('ir_evidence_digest', {}).get('S') and terminal['recovery_run_id'] == e['run_id'] and type(e['revision']) is int and type(terminal['revision']) is int and terminal['revision'] == e['revision'] and terminal['merge_sha'] == r['merge_sha'] and terminal['head_sha'] == r['head_sha'] and all(terminal[k] == v for k, v in HOLD.items()), 'TERMINAL')
        if row['state']['S'] == 'CONSUMED':
            require(row.get('ir_terminal', {}).get('S') == canonical(terminal) and row.get('merge_sha', {}).get('S') == r['merge_sha'], 'CONSUMED_CONFLICT')
            return {'state': 'CONSUMED', 'terminal_digest': digest(terminal), 'write_performed': False}
        validate_request(r, self.now()); self.quorum(e, row)
        values = {':reserved': {'S': 'RESERVED'}, ':consumed': {'S': 'CONSUMED'}, ':original': {'S': r['original_run_id']}, ':head': {'S': r['head_sha']}, ':request': {'S': canonical(r)}, ':run': {'S': e['run_id']}, ':revision': {'N': str(e['revision'])}, ':now': {'N': str(self.now())}, ':merge': {'S': r['merge_sha']}, ':terminal': {'S': canonical(terminal)}, ':digest': {'S': digest(terminal)}}
        result = self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET #state=:consumed, merge_sha=:merge, ir_terminal=:terminal, ir_terminal_digest=:digest', ConditionExpression='#state=:reserved AND run_id=:original AND head_sha=:head AND ir_request=:request AND ir_execution_run=:run AND ir_revision=:revision AND ir_lease_until>:now AND attribute_not_exists(ir_terminal)', ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues=values, ReturnValues='ALL_NEW')
        attrs = result.get('Attributes', {})
        require(attrs.get('state', {}).get('S') == 'CONSUMED' and attrs.get('run_id', {}).get('S') == r['original_run_id'] and attrs.get('head_sha', {}).get('S') == r['head_sha'] and attrs.get('merge_sha', {}).get('S') == r['merge_sha'] and attrs.get('ir_terminal', {}).get('S') == canonical(terminal) and attrs.get('ir_terminal_digest', {}).get('S') == digest(terminal), 'CONSUME_READBACK')
        return {'state': 'CONSUMED', 'terminal_digest': digest(terminal), 'write_performed': True}

    def acknowledge(self, event):
        e = self.authenticate(event, 'ACK_MERGED_RECOVERY_IMMUTABLE', ('object',), fresh=False)
        r = e['request']; row = self.reservation(r); o = e['object']
        require(row['state']['S'] == 'CONSUMED' and isinstance(o, dict) and set(o) == {'bucket', 'key', 'version_id', 'sha256', 'retention_mode', 'retain_until', 'encryption_key_arn'} and o['bucket'] == self.bucket and o['key'] == 'receipts/' + r['original_generation'] + '/interrupted-postmerge-v1/' + r['merge_sha'] + '.json' and isinstance(o['version_id'], str) and 0 < len(o['version_id']) <= 1024 and o['sha256'] == row.get('ir_terminal_digest', {}).get('S') and o['retention_mode'] == 'COMPLIANCE' and o['encryption_key_arn'] == self.receipt_key and epoch(o['retain_until']) >= retention_horizon(r['issued_at']), 'IMMUTABLE_BINDING')
        if 'ir_immutable_ack' in row:
            require(row['ir_immutable_ack']['S'] == canonical(o), 'IMMUTABLE_CONFLICT')
            return {'state': 'IMMUTABLE_ACKNOWLEDGED', 'write_performed': False}
        self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET ir_immutable_ack=:object', ConditionExpression='#state=:consumed AND run_id=:original AND ir_terminal_digest=:digest AND attribute_not_exists(ir_immutable_ack)', ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues={':consumed': {'S': 'CONSUMED'}, ':original': {'S': r['original_run_id']}, ':digest': {'S': o['sha256']}, ':object': {'S': canonical(o)}}, ReturnValues='ALL_NEW')
        require(self.get(self.key(r)).get('ir_immutable_ack', {}).get('S') == canonical(o), 'ACK_READBACK')
        return {'state': 'IMMUTABLE_ACKNOWLEDGED', 'write_performed': True}
