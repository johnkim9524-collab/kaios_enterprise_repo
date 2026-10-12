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
ORIGINAL_TERMINAL_REPAIR_CASE = {'pull_request': 2655, 'merge_sha': 'd1b801ebf75dfc2b582c6381771f8194016328ca', 'original_run_id': '38132692877', 'original_run_attempt': 1}
ORIGINAL_TERMINAL_REPAIR_ARCHIVE = {'artifact_id': 11700046124, 'archive_digest': 'sha256:b29d657aabd33895864a838dd84b836579a3febd9a4bd1299437580578f07ab4'}
ORIGINAL_TERMINAL_NULL_REFS = [38132692877, 11700046124, ORIGINAL_TERMINAL_REPAIR_ARCHIVE['archive_digest']]


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


def validate_original_terminal_repair_request(r, now, fresh=True):
    request_digest = validate_request(r, now, fresh)
    require(all(r.get(k) == v for k, v in ORIGINAL_TERMINAL_REPAIR_CASE.items()), 'ORIGINAL_REPAIR_INCIDENT')
    return request_digest


def validate_evidence(e, r):
    # Facts, not authorization booleans. Three protected signers authenticate
    # these native references independently; schema alone proves no runtime.
    legacy_fields = {'repository', 'source_sha', 'pull_request', 'merge_sha', 'head_sha', 'head_tree_sha', 'merge_parents', 'merged_at', 'original_run', 'checks'} | set(HOLD)
    failure_fields = legacy_fields | {'evidence_profile', 'original_archive'}
    require(isinstance(e, dict) and set(e) in (legacy_fields, failure_fields), 'EVIDENCE_FIELDS')
    require(all(e[k] == r[k] for k in ('repository', 'source_sha', 'pull_request', 'merge_sha', 'head_sha', 'head_tree_sha')) and all(e[k] == v for k, v in HOLD.items()), 'EVIDENCE_BINDING')
    require(e['merge_parents'] == [r['base_sha'], r['head_sha']], 'MERGE_GRAPH')
    require(epoch(e['merged_at']) <= epoch(r['issued_at']), 'MERGE_TIME')
    n = e['original_run']
    require(isinstance(n, dict) and set(n) == {'run_id', 'run_attempt', 'source_sha', 'status', 'conclusion'} and n['run_id'] == r['original_run_id'] and type(n['run_attempt']) is int and n['run_attempt'] == 1 and n['source_sha'] == r['base_sha'] and n['status'] == 'completed' and n['conclusion'] in ('cancelled', 'failure', 'timed_out'), 'ORIGINAL_NATIVE_RUN')
    checks = e['checks']
    normal_kinds = {'REQUIRED_PUSH_SUITE', 'CANONICAL_TRUTH', 'SENTINEL', 'SUCCESS_AUTHORITY_GATE'}
    failed_assurance_kinds = {'REQUIRED_PUSH_SUITE', 'CANONICAL_TRUTH', 'SENTINEL', 'TERMINAL_NULL_ASSURANCE_FAILURE'}
    failure_profile = e.get('evidence_profile') == 'TERMINAL_NULL_ASSURANCE_FAILURE_V1'
    require(not ('evidence_profile' in e and not failure_profile), 'EVIDENCE_PROFILE')
    allowed_kinds = failed_assurance_kinds if failure_profile else normal_kinds
    require(isinstance(checks, list) and len(checks) == 4 and {x.get('kind') for x in checks if isinstance(x, dict)} == allowed_kinds, 'CHECKS')
    if failure_profile:
        archive = e.get('original_archive')
        require(isinstance(archive, dict) and set(archive) == {'artifact_id','archive_digest'}
            and type(archive['artifact_id']) is int and archive['artifact_id'] > 0
            and isinstance(archive['archive_digest'], str) and DIGEST.fullmatch(archive['archive_digest']), 'ORIGINAL_REPAIR_ARCHIVE')
    for c in checks:
        expected_conclusion = 'failure' if failure_profile and c.get('kind') == 'TERMINAL_NULL_ASSURANCE_FAILURE' else 'success'
        base = {'kind', 'run_id', 'run_attempt', 'source_sha', 'conclusion', 'artifact_id', 'archive_digest', 'receipt_digest'}
        terminal_null = failure_profile and c.get('kind') == 'TERMINAL_NULL_ASSURANCE_FAILURE'
        require(set(c) == (base | {'terminal_null_evidence_refs'} if terminal_null else base)
            and isinstance(c['run_id'], str) and RUN.fullmatch(c['run_id']) and type(c['run_attempt']) is int and c['run_attempt'] == 1
            and c['source_sha'] == r['source_sha'] and c['conclusion'] == expected_conclusion and type(c['artifact_id']) is int and c['artifact_id'] > 0
            and all(isinstance(c[k], str) and DIGEST.fullmatch(c[k]) for k in ('archive_digest', 'receipt_digest'))
            and (not terminal_null or c['terminal_null_evidence_refs'] == [int(r['original_run_id']), e['original_archive']['artifact_id'], e['original_archive']['archive_digest']]), 'CHECK_BINDING')
    require(len({c['run_id'] for c in checks}) == 4 and len({c['artifact_id'] for c in checks}) == 4, 'CHECK_COLLISION')
    return digest(e)


def validate_original_terminal_repair_terminal(t, r, evidence_digest):
    request_digest = validate_original_terminal_repair_request(r, 0, False)
    fields = {'id','version','state','lifecycle_state','authority_scope','original_reservation_transition','request_digest','evidence_digest','original_run_id','original_head_sha','original_merge_sha','original_state','original_terminal_present','actual_authority_granted','platform_closure','production','public','g5','created_at','repair_digest'}
    transition = {'id':'kidults-original-reservation-transition-v1','from_state':'RESERVED','to_state':'CONSUMED',
        'ledger_key':{'pk':'RESERVE#' + r['original_generation'],'sk':'NONCE#' + r['nonce_digest']},
        'conditional_cas':True,'merge_sha':r['merge_sha']}
    require(isinstance(t, dict) and set(t) == fields and t['id'] == 'kidults-original-reservation-terminal-repair-v1'
        and t['version'] == '1.0.0' and t['state'] == 'ORIGINAL_TERMINAL_DEBT_ONLY'
        and t['lifecycle_state'] == 'ORIGINAL_RESERVATION_TERMINATED_RECOVERY_ONLY'
        and t['authority_scope'] == 'ORIGINAL_TERMINAL_DEBT_ONLY' and t['original_reservation_transition'] == transition
        and t['request_digest'] == request_digest and t['evidence_digest'] == evidence_digest
        and t['original_run_id'] == r['original_run_id'] and t['original_head_sha'] == r['head_sha']
        and t['original_merge_sha'] == r['merge_sha'] and t['original_state'] == 'RESERVED'
        and t['original_terminal_present'] is False and t['actual_authority_granted'] is False and t['platform_closure'] is False
        and all(t[k] == 'HOLD' for k in ('production','public','g5')), 'ORIGINAL_REPAIR_TERMINAL')
    epoch(t['created_at'])
    require(t['repair_digest'] == digest({k:v for k,v in t.items() if k != 'repair_digest'}), 'ORIGINAL_REPAIR_TERMINAL_DIGEST')
    return t['repair_digest']


def validate_original_terminal(t, r=None):
    fields = set('id version state binding quorum_digest workloads lifecycle durable_reservation merge postmerge production public g5 usb_copy_a created_at receipt_digest'.split())
    require(isinstance(t, dict) and set(t) == fields and t['id'] == 'kidults-autonomous-internal-landing-terminal-receipt-v1' and t['version'] == '1.0.0' and t['state'] == 'RECEIPT_SEALED', 'ORIGINAL_TERMINAL_FIELDS')
    require(t['receipt_digest'] == digest({k: v for k, v in t.items() if k != 'receipt_digest'}) and len(canonical(t).encode()) <= 49152, 'ORIGINAL_TERMINAL_DIGEST')
    b, remote = t['binding'], t['durable_reservation'].get('remote_binding', {})
    require(isinstance(b, dict) and b.get('repository') == 'johnkim9524-collab/kaios_enterprise_repo' and str(b.get('repository_id')) == '1281328888' and type(b.get('pull_request')) is int and b['pull_request'] > 0 and b['pull_request'] != 1677, 'ORIGINAL_TERMINAL_QUARANTINE')
    require(all(isinstance(b.get(k), str) and SHA.fullmatch(b[k]) for k in ('base_sha', 'head_sha', 'head_tree_sha')), 'ORIGINAL_TERMINAL_SHA')
    require(all(t[k] == 'HOLD' for k in ('production', 'public', 'g5')) and t['postmerge'].get('state') == 'VERIFIED_PASS', 'ORIGINAL_TERMINAL_HOLD')
    require(t['durable_reservation'].get('state') == 'CONSUMED' and t['durable_reservation'].get('conditional_write') is True and remote.get('contract_version') == '3.0.0' and remote.get('action') == 'CONSUME_RESERVATION' and remote.get('state') == 'CONSUMED' and remote.get('conditional_write') is True, 'ORIGINAL_TERMINAL_CONSUMPTION')
    require(remote.get('authorization_generation') == b.get('authorization_generation') and remote.get('nonce_digest') == b.get('nonce_digest') and remote.get('head_sha') == b['head_sha'] and isinstance(remote.get('run_id'), str) and RUN.fullmatch(remote['run_id']), 'ORIGINAL_TERMINAL_REMOTE_TUPLE')
    require(isinstance(t['merge'], dict) and t['merge'].get('merge_sha') == remote.get('merge_sha') and t['merge'].get('main_sha') == remote['merge_sha'] and SHA.fullmatch(remote['merge_sha']) and t['merge'].get('head_sha') == b['head_sha'] and t['merge'].get('tree_sha') == b['head_tree_sha'], 'ORIGINAL_TERMINAL_MERGE')
    require(t['durable_reservation'].get('ledger_key') == {'pk': 'RESERVE#' + b['authorization_generation'], 'sk': 'NONCE#' + b['nonce_digest']}, 'ORIGINAL_TERMINAL_KEY')
    epoch(t['created_at'])
    if r:
        require(all(b.get(k) == r[k] for k in ('repository', 'pull_request', 'base_sha', 'head_sha', 'head_tree_sha')) and str(b['repository_id']) == r['repository_id'] and b['authorization_generation'] == r['original_generation'] and b['nonce_digest'] == r['nonce_digest'] and remote['run_id'] == r['original_run_id'] and remote['merge_sha'] == r['merge_sha'], 'ORIGINAL_TERMINAL_REQUEST')
    return t['receipt_digest']


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

    def validate_repair_ack(self, o, r, terminal):
        require(isinstance(o, dict) and set(o) == {'bucket','key','version_id','sha256','retention_mode','retain_until','encryption_key_arn'}
            and o['bucket'] == self.bucket and o['key'] == 'receipts/' + r['original_generation'] + '/original-reservation-terminal-repair/' + r['merge_sha'] + '.json'
            and isinstance(o['version_id'], str) and 0 < len(o['version_id']) <= 1024 and o['sha256'] == digest(terminal)
            and o['retention_mode'] == 'COMPLIANCE' and o['encryption_key_arn'] == self.receipt_key
            and epoch(o['retain_until']) >= retention_horizon(terminal['created_at']), 'ORIGINAL_REPAIR_ACK_OBJECT')
        return o

    def validate_repair_row(self, row, r):
        validate_original_terminal_repair_request(r, self.now(), False)
        require(row.get('state', {}).get('S') == 'CONSUMED' and row.get('run_id', {}).get('S') == r['original_run_id']
            and row.get('head_sha', {}).get('S') == r['head_sha'] and row.get('merge_sha', {}).get('S') == r['merge_sha']
            and row.get('repair_request', {}).get('S') == canonical(r), 'ORIGINAL_REPAIR_STORED_REQUEST')
        evidence = json.loads(row.get('repair_evidence', {}).get('S', '{}'))
        ed = row.get('repair_evidence_digest', {}).get('S')
        require(validate_evidence(evidence, r) == ed and evidence.get('evidence_profile') == 'TERMINAL_NULL_ASSURANCE_FAILURE_V1',
            'ORIGINAL_REPAIR_STORED_EVIDENCE')
        terminal = json.loads(row.get('repair_terminal_json', {}).get('S', '{}'))
        td = validate_original_terminal_repair_terminal(terminal, r, ed)
        require(row.get('repair_terminal_digest', {}).get('S') == td, 'ORIGINAL_REPAIR_STORED_TERMINAL_DIGEST')
        ack = json.loads(row['repair_immutable_ack']['S']) if 'repair_immutable_ack' in row else None
        if ack is not None:
            self.validate_repair_ack(ack, r, terminal)
        return evidence, ed, terminal, td, ack

    def get(self, key):
        return self.ddb.get_item(TableName=self.table, Key=key, ConsistentRead=True).get('Item', {})

    def consume_original_terminal(self, event):
        # Forward-only original finalizer contract. Existing core remains byte
        # preserved; terminal and original consumption commit in ONE CAS.
        fields = set('action authorization_generation nonce_digest run_id head_sha merge_sha terminal finalizer_workload_id finalizer_environment signing_key_arn signature_b64'.split())
        require(isinstance(event, dict) and set(event) == fields and event['action'] in ('CONSUME_RESERVATION', 'READ_ORIGINAL_CONSUMED_TERMINAL'), 'ORIGINAL_CONSUME_FIELDS')
        require(event['finalizer_workload_id'] == self.finalizer['workload_id'] and event['finalizer_environment'] == self.finalizer['environment'] and event['signing_key_arn'] == self.finalizer['signing_key_arn'], 'ORIGINAL_FINALIZER')
        core = {k: v for k, v in event.items() if k != 'signature_b64'}
        signature = base64.b64decode(event['signature_b64'], validate=True)
        require(self.kms.verify(KeyId=self.finalizer['signing_key_arn'], Message=hashlib.sha256(canonical(core).encode()).digest(), MessageType='DIGEST', Signature=signature, SigningAlgorithm='ECDSA_SHA_256').get('SignatureValid') is True, 'ORIGINAL_SIGNATURE')
        t = event['terminal']; terminal_digest = validate_original_terminal(t)
        b, remote = t['binding'], t['durable_reservation']['remote_binding']
        require(all(remote[k] == event[k] for k in ('authorization_generation', 'nonce_digest', 'run_id', 'head_sha', 'merge_sha')) and epoch(t['created_at']) <= self.now(), 'ORIGINAL_CONSUME_BINDING')
        key = {'pk': {'S': 'RESERVE#' + b['authorization_generation']}, 'sk': {'S': 'NONCE#' + b['nonce_digest']}}
        row = self.get(key)
        if event['action'] == 'CONSUME_RESERVATION':
            require(not any(k in row for k in ('repair_terminal_json', 'repair_terminal_digest', 'repair_immutable_ack')),
                    'ORIGINAL_REPAIR_IS_NOT_SUCCESS_TERMINAL')
            # Authoritative role rows were signature-verified on creation by
            # the unchanged core; recompute their exact persisted quorum.
            approvals = []
            for role in ROLES:
                approval = self.get({'pk': {'S': 'AUTH#' + b['authorization_generation']}, 'sk': {'S': 'ROLE#' + role}})
                raw = base64.b64decode(approval.get('envelope', {}).get('S', ''), validate=True).decode()
                a = json.loads(raw)
                require(digest(a) == approval.get('envelope_digest', {}).get('S') and all(a.get(k) == v for k, v in b.items())
                        and all(a.get('workload', {}).get(k) == self.roles[role][k] for k in ('signing_key_arn', 'workload_id', 'environment')), 'ORIGINAL_PERSISTED_QUORUM')
                approvals.append(a)
            require(len({a['workload']['run_id'] for a in approvals}) == 3 and t['quorum_digest'] == 'sha256:' + hashlib.sha256('\n'.join(sorted(digest(a) for a in approvals)).encode()).hexdigest(), 'ORIGINAL_QUORUM_DIGEST')
            expected_workloads = [{'role': role, 'stable_id': a['workload']['workload_id'], 'signing_key_arn': a['workload']['signing_key_arn']} for role, a in zip(ROLES, approvals)]
            require(t['workloads'] == expected_workloads, 'ORIGINAL_WORKLOADS')
            require(row.get('state', {}).get('S') == 'RESERVED', 'ORIGINAL_ALREADY_CONSUMED_NO_RETRY')
            values = {':reserved': {'S': 'RESERVED'}, ':consumed': {'S': 'CONSUMED'}, ':run': {'S': event['run_id']}, ':head': {'S': event['head_sha']}, ':merge': {'S': event['merge_sha']}, ':terminal': {'S': canonical(t)}, ':digest': {'S': terminal_digest}}
            result = self.ddb.update_item(TableName=self.table, Key=key, UpdateExpression='SET #state=:consumed, merge_sha=:merge, original_terminal_json=:terminal, original_terminal_digest=:digest', ConditionExpression='#state=:reserved AND run_id=:run AND head_sha=:head AND attribute_not_exists(original_terminal_json) AND attribute_not_exists(ir_request)', ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues=values, ReturnValues='ALL_NEW')
            row = result.get('Attributes', {})
        require(all(row.get(k, {}).get('S') == v for k, v in {'pk': key['pk']['S'], 'sk': key['sk']['S'], 'run_id': event['run_id'], 'head_sha': event['head_sha'], 'merge_sha': event['merge_sha'], 'state': 'CONSUMED', 'original_terminal_json': canonical(t), 'original_terminal_digest': terminal_digest}.items()), 'ORIGINAL_CONSUME_READBACK')
        return {'ok': True, 'contract_version': '3.0.0', 'action': 'CONSUME_RESERVATION', 'authorization_generation': b['authorization_generation'], 'nonce_digest': b['nonce_digest'], 'run_id': event['run_id'], 'head_sha': b['head_sha'], 'merge_sha': event['merge_sha'], 'state': 'CONSUMED', 'conditional_write': True, 'pk': key['pk']['S'], 'sk': key['sk']['S'], 'terminal_digest': terminal_digest, 'terminal': t, 'write_performed': event['action'] == 'CONSUME_RESERVATION'}

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
        if 'ir_request' in row:
            evidence = json.loads(row.get('ir_evidence', {}).get('S', '{}'))
            require(validate_evidence(evidence, r) == row.get('ir_evidence_digest', {}).get('S'), 'STORED_EVIDENCE_DIGEST')
            require('evidence_profile' not in evidence, 'NORMAL_RECOVERY_FAILURE_EVIDENCE_FORBIDDEN')
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
        # The shared schema also validates the distinct failure-only terminal
        # profile. It must never authorize ordinary reservation consumption,
        # including when persisted approvals are revalidated for a quorum.
        require('evidence_profile' not in e['evidence'], 'NORMAL_RECOVERY_FAILURE_EVIDENCE_FORBIDDEN')
        require(isinstance(e['approval_run_id'], str) and RUN.fullmatch(e['approval_run_id']) and e['approval_run_id'] != e['request']['original_run_id'] and type(e['approval_run_attempt']) is int and e['approval_run_attempt'] == 1, 'APPROVAL_RUN')
        return e

    @staticmethod
    def failure_approval_key(request_digest, role):
        return {'pk': {'S': 'AUTH#FAILURE_ASSURANCE#' + request_digest}, 'sk': {'S': 'ROLE#' + role}}

    @staticmethod
    def failure_object_key(request):
        return 'receipts/' + request['original_generation'] + '/interrupted-postmerge-failure-assurance-v1/' + request['merge_sha'] + '.json'

    def failure_approval(self, event, fresh=True):
        role = event.get('envelope', {}).get('role')
        require(role in self.roles, 'FAILURE_ROLE')
        e = self.verify(event, self.roles[role])
        fields = {'action', 'request', 'request_digest', 'evidence', 'evidence_digest', 'role', 'approval_run_id', 'approval_run_attempt', 'workload'}
        require(set(e) == fields and e['action'] == 'APPROVE_FAILED_ASSURANCE_TERMINAL_RECOVERY', 'FAILURE_APPROVAL_FIELDS')
        require(validate_request(e['request'], self.now(), fresh) == e['request_digest']
                and e['evidence'].get('evidence_profile') == 'TERMINAL_NULL_ASSURANCE_FAILURE_V1'
                and validate_evidence(e['evidence'], e['request']) == e['evidence_digest'], 'FAILURE_APPROVAL_DIGEST')
        require(isinstance(e['approval_run_id'], str) and RUN.fullmatch(e['approval_run_id'])
                and e['approval_run_id'] != e['request']['original_run_id']
                and type(e['approval_run_attempt']) is int and e['approval_run_attempt'] == 1, 'FAILURE_APPROVAL_RUN')
        return e

    @staticmethod
    def original_repair_approval_key(request_digest, role):
        return {'pk': {'S': 'AUTH#ORIGINAL_TERMINAL_REPAIR#' + request_digest}, 'sk': {'S': 'ROLE#' + role}}

    def create_original_terminal_repair_approval(self, event):
        role = event.get('envelope', {}).get('role')
        require(role in self.roles, 'ORIGINAL_REPAIR_ROLE')
        e = self.verify(event, self.roles[role])
        fields = {'action', 'request', 'request_digest', 'evidence', 'evidence_digest', 'role',
                  'approval_run_id', 'approval_run_attempt', 'workload'}
        require(set(e) == fields and e['action'] == 'APPROVE_RESERVED_ORIGINAL_TERMINAL_REPAIR', 'ORIGINAL_REPAIR_APPROVAL_FIELDS')
        r, evidence = e['request'], e['evidence']
        require(validate_original_terminal_repair_request(r, self.now(), True) == e['request_digest']
                and evidence.get('evidence_profile') == 'TERMINAL_NULL_ASSURANCE_FAILURE_V1'
                and evidence.get('original_archive') == ORIGINAL_TERMINAL_REPAIR_ARCHIVE
                and validate_evidence(evidence, r) == e['evidence_digest'], 'ORIGINAL_REPAIR_EVIDENCE')
        require(isinstance(e['approval_run_id'], str) and RUN.fullmatch(e['approval_run_id'])
                and e['approval_run_id'] != r['original_run_id'] and type(e['approval_run_attempt']) is int
                and e['approval_run_attempt'] == 1, 'ORIGINAL_REPAIR_APPROVAL_RUN')
        row = self.get(self.key(r))
        require(row.get('state', {}).get('S') == 'RESERVED' and row.get('run_id', {}).get('S') == r['original_run_id']
                and row.get('head_sha', {}).get('S') == r['head_sha']
                and not any(k in row for k in ('original_terminal_json', 'original_terminal_digest', 'original_immutable_ack',
                    'repair_terminal_json', 'repair_terminal_digest', 'repair_immutable_ack',
                    'ir_request', 'ir_terminal', 'failure_request')), 'ORIGINAL_REPAIR_RESERVED_ONLY')
        require(row.get('repair_request', {}).get('S') in (None, canonical(r))
                and row.get('repair_evidence_digest', {}).get('S') in (None, e['evidence_digest']), 'ORIGINAL_REPAIR_PIN_CONFLICT')
        if 'repair_request' not in row:
            try:
                self.ddb.update_item(TableName=self.table, Key=self.key(r),
                    UpdateExpression='SET repair_request=:request, repair_evidence=:body, repair_evidence_digest=:digest',
                    ConditionExpression='#state=:reserved AND run_id=:original AND head_sha=:head AND attribute_not_exists(repair_request) AND attribute_not_exists(original_terminal_json) AND attribute_not_exists(ir_request)',
                    ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues={
                        ':reserved': {'S': 'RESERVED'}, ':original': {'S': r['original_run_id']}, ':head': {'S': r['head_sha']},
                        ':request': {'S': canonical(r)}, ':body': {'S': canonical(evidence)}, ':digest': {'S': e['evidence_digest']}})
            except Exception:
                row = self.get(self.key(r))
                require(row.get('repair_request', {}).get('S') == canonical(r)
                        and row.get('repair_evidence_digest', {}).get('S') == e['evidence_digest'], 'ORIGINAL_REPAIR_PIN_UNKNOWN_NO_RETRY')
        key = self.original_repair_approval_key(e['request_digest'], role); prior = self.get(key)
        if prior:
            require(prior.get('signed_event', {}).get('S') == canonical(event), 'ORIGINAL_REPAIR_APPROVAL_CONFLICT')
            return {'state': 'EXISTING_ORIGINAL_TERMINAL_REPAIR_APPROVAL', 'write_performed': False}
        try:
            self.ddb.put_item(TableName=self.table, Item={**key, 'signed_event': {'S': canonical(event)}},
                              ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)')
        except Exception:
            prior = self.get(key)
            require(prior.get('signed_event', {}).get('S') == canonical(event), 'ORIGINAL_REPAIR_APPROVAL_UNKNOWN_NO_RETRY')
            return {'state': 'EXISTING_ORIGINAL_TERMINAL_REPAIR_APPROVAL', 'write_performed': False}
        return {'state': 'ORIGINAL_TERMINAL_REPAIR_APPROVAL_STORED', 'write_performed': True}

    def read_original_terminal_repair_context(self, event):
        e = event.get('envelope', {}); role = e.get('role')
        require(role in self.roles or role == 'FINALIZER', 'ORIGINAL_REPAIR_CONTEXT_ROLE')
        self.verify(event, self.finalizer if role == 'FINALIZER' else self.roles[role])
        require(set(e) == {'action','request','request_digest','role','run_id','run_attempt','workload'}
                and e['action'] == 'READ_RESERVED_ORIGINAL_TERMINAL_REPAIR_CONTEXT', 'ORIGINAL_REPAIR_CONTEXT_FIELDS')
        r = e['request']; rd = validate_original_terminal_repair_request(r, self.now(), False)
        require(rd == e['request_digest'] and isinstance(e['run_id'], str) and RUN.fullmatch(e['run_id'])
                and e['run_id'] != r['original_run_id'] and type(e['run_attempt']) is int and e['run_attempt'] == 1, 'ORIGINAL_REPAIR_CONTEXT_BINDING')
        row = self.get(self.key(r))
        if not row: return {'state':'ORIGINAL_RESERVATION_MISSING','write_performed':False}
        require(row.get('run_id',{}).get('S') == r['original_run_id'] and row.get('head_sha',{}).get('S') == r['head_sha'], 'ORIGINAL_REPAIR_CONTEXT_OWNER')
        if row.get('state',{}).get('S') == 'CONSUMED' and 'repair_terminal_json' not in row:
            return {'state':'ORIGINAL_RESERVATION_NOT_RESERVED','write_performed':False}
        if 'repair_terminal_json' in row:
            evidence, ed, terminal, _, ack = self.validate_repair_row(row, r)
            return {'state':'ORIGINAL_TERMINAL_DEBT_ONLY','request':r,'terminal':terminal,
                    'evidence':evidence,'evidence_digest':ed,
                    'approvals':[],'immutable_ack':ack,
                    'write_performed':False}
        require(row.get('state',{}).get('S') == 'RESERVED' and row.get('merge_sha',{}).get('S') in (None,r['merge_sha'])
                and not any(k in row for k in ('original_terminal_json','original_terminal_digest','original_immutable_ack','ir_request','ir_terminal')),
                'ORIGINAL_REPAIR_CONTEXT_RESERVED')
        pinned = json.loads(row['repair_request']['S']) if 'repair_request' in row else None
        evidence = json.loads(row['repair_evidence']['S']) if 'repair_evidence' in row else None
        ed = row.get('repair_evidence_digest',{}).get('S')
        if pinned: require(pinned == r and evidence is not None and validate_evidence(evidence,r) == ed, 'ORIGINAL_REPAIR_CONTEXT_PIN')
        approvals=[]
        for candidate_role in ROLES:
            prior=self.get(self.original_repair_approval_key(rd,candidate_role))
            if prior:
                packet=json.loads(prior['signed_event']['S']); a=self.verify(packet,self.roles[candidate_role])
                require(a.get('action') == 'APPROVE_RESERVED_ORIGINAL_TERMINAL_REPAIR' and a.get('request') == r
                        and a.get('request_digest') == rd and a.get('evidence_digest') == ed and a.get('evidence') == evidence
                        and a.get('role') == candidate_role, 'ORIGINAL_REPAIR_CONTEXT_APPROVAL')
                approvals.append(a)
        require(len({a['approval_run_id'] for a in approvals}) == len(approvals), 'ORIGINAL_REPAIR_CONTEXT_RUN_COLLISION')
        return {'state':'ORIGINAL_TERMINAL_REPAIR_PENDING','request':pinned,'evidence':evidence,'evidence_digest':ed,
                'approvals':approvals,'terminal':None,'immutable_ack':None,'write_performed':False}

    def finalize_original_terminal_repair(self, event):
        e = self.authenticate(event, 'FINALIZE_RESERVED_ORIGINAL_TERMINAL_REPAIR', ('terminal', 'evidence_digest'), fresh=False)
        r, terminal = e['request'], e['terminal']; validate_original_terminal_repair_request(r, self.now(), False); row = self.get(self.key(r))
        evidence = json.loads(row.get('repair_evidence', {}).get('S', '{}'))
        ed = row.get('repair_evidence_digest', {}).get('S')
        require(row.get('repair_request', {}).get('S') == canonical(r) and ed == e['evidence_digest']
                and validate_evidence(evidence, r) == ed, 'ORIGINAL_REPAIR_EVIDENCE_PIN')
        approvals = []
        for candidate_role in ROLES:
            prior = self.get(self.original_repair_approval_key(e['request_digest'], candidate_role))
            require(prior.get('signed_event', {}).get('S'), 'ORIGINAL_REPAIR_QUORUM')
            packet = json.loads(prior['signed_event']['S']); a = self.verify(packet, self.roles[candidate_role])
            require(a.get('action') == 'APPROVE_RESERVED_ORIGINAL_TERMINAL_REPAIR' and a.get('role') == candidate_role
                    and a.get('request') == r and a.get('request_digest') == e['request_digest']
                    and a.get('evidence_digest') == ed and a.get('evidence') == evidence, 'ORIGINAL_REPAIR_APPROVAL_BINDING')
            approvals.append(a)
        require(len({a['approval_run_id'] for a in approvals}) == 3, 'ORIGINAL_REPAIR_QUORUM_RUN_COLLISION')
        validate_original_terminal_repair_terminal(terminal, r, ed)
        if 'repair_terminal_json' in row:
            _, _, stored_terminal, _, _ = self.validate_repair_row(row, r)
            require(canonical(stored_terminal) == canonical(terminal),
                    'ORIGINAL_REPAIR_TERMINAL_CONFLICT')
            return {'state':'ORIGINAL_TERMINAL_DEBT_ONLY','terminal':terminal,'terminal_digest':terminal['repair_digest'],
                    'write_performed':False,'actual_authority_granted':False,'promotion_eligible':False}
        require(row.get('state', {}).get('S') == 'RESERVED' and row.get('run_id', {}).get('S') == r['original_run_id']
                and row.get('head_sha', {}).get('S') == r['head_sha'] and row.get('merge_sha', {}).get('S') in (None, r['merge_sha'])
                and not any(k in row for k in ('original_terminal_json','original_terminal_digest','original_immutable_ack',
                    'repair_terminal_json','repair_terminal_digest','ir_request','ir_terminal')), 'ORIGINAL_REPAIR_STATE')
        result = self.ddb.update_item(TableName=self.table, Key=self.key(r),
            UpdateExpression='SET #state=:consumed, merge_sha=:merge, repair_terminal_json=:terminal, repair_terminal_digest=:digest',
            ConditionExpression='#state=:reserved AND run_id=:original AND head_sha=:head AND attribute_not_exists(repair_terminal_json) AND attribute_not_exists(original_terminal_json) AND attribute_not_exists(ir_request)',
            ExpressionAttributeNames={'#state':'state'}, ExpressionAttributeValues={':reserved':{'S':'RESERVED'}, ':consumed':{'S':'CONSUMED'},
                ':original':{'S':r['original_run_id']}, ':head':{'S':r['head_sha']}, ':merge':{'S':r['merge_sha']},
                ':terminal':{'S':canonical(terminal)}, ':digest':{'S':terminal['repair_digest']}}, ReturnValues='ALL_NEW')
        saved = result.get('Attributes', {})
        require(saved.get('state',{}).get('S') == 'CONSUMED' and saved.get('repair_terminal_json',{}).get('S') == canonical(terminal)
                and saved.get('repair_terminal_digest',{}).get('S') == terminal['repair_digest'], 'ORIGINAL_REPAIR_READBACK')
        return {'state':'ORIGINAL_TERMINAL_DEBT_ONLY','terminal':terminal,'terminal_digest':terminal['repair_digest'],
                'write_performed':True,'actual_authority_granted':False,'promotion_eligible':False}

    def acknowledge_original_terminal_repair(self, event):
        e = self.authenticate(event, 'ACK_ORIGINAL_TERMINAL_REPAIR_IMMUTABLE', ('object','evidence_digest'), fresh=False)
        r = e['request']; validate_original_terminal_repair_request(r, self.now(), False); row = self.get(self.key(r))
        evidence, ed, terminal, td, _ = self.validate_repair_row(row, r)
        require(e['evidence_digest'] == ed, 'ORIGINAL_REPAIR_ACK_EVIDENCE_BINDING')
        o = e['object']
        self.validate_repair_ack(o, r, terminal)
        if 'repair_immutable_ack' in row:
            require(row['repair_immutable_ack']['S'] == canonical(o), 'ORIGINAL_REPAIR_ACK_CONFLICT')
            return {'state':'ORIGINAL_TERMINAL_REPAIR_IMMUTABLE_ACKNOWLEDGED','write_performed':False}
        saved = self.ddb.update_item(TableName=self.table, Key=self.key(r),
            UpdateExpression='SET repair_immutable_ack=:object',
            ConditionExpression='#state=:consumed AND run_id=:original AND repair_terminal_digest=:digest AND attribute_not_exists(repair_immutable_ack)',
            ExpressionAttributeNames={'#state':'state'}, ExpressionAttributeValues={':consumed':{'S':'CONSUMED'},
                ':original':{'S':r['original_run_id']}, ':digest':{'S':td}, ':object':{'S':canonical(o)}}, ReturnValues='ALL_NEW').get('Attributes', {})
        require(saved.get('repair_immutable_ack', {}).get('S') == canonical(o)
                and saved.get('repair_terminal_digest', {}).get('S') == td, 'ORIGINAL_REPAIR_ACK_READBACK')
        return {'state':'ORIGINAL_TERMINAL_REPAIR_IMMUTABLE_ACKNOWLEDGED','write_performed':True}

    def failure_context(self, event):
        e = event.get('envelope', {}); role = e.get('role')
        require(role in self.roles or role == 'FINALIZER', 'FAILURE_CONTEXT_ROLE')
        self.verify(event, self.finalizer if role == 'FINALIZER' else self.roles[role])
        require(set(e) == {'action', 'request', 'request_digest', 'role', 'run_id', 'run_attempt', 'workload'}
                and e['action'] == 'READ_FAILED_ASSURANCE_TERMINAL_CONTEXT', 'FAILURE_CONTEXT_FIELDS')
        r = e['request']
        require(validate_request(r, self.now(), False) == e['request_digest']
                and isinstance(e['run_id'], str) and RUN.fullmatch(e['run_id'])
                and e['run_id'] != r['original_run_id'] and type(e['run_attempt']) is int and e['run_attempt'] == 1, 'FAILURE_CONTEXT_BINDING')
        row = self.get(self.key(r))
        if not row:
            return {'state': 'ORIGINAL_RESERVATION_MISSING', 'write_performed': False}
        require(row.get('state', {}).get('S') == 'CONSUMED' and row.get('run_id', {}).get('S') == r['original_run_id']
                and row.get('head_sha', {}).get('S') == r['head_sha'] and row.get('merge_sha', {}).get('S') == r['merge_sha'
                ] and not any(k in row for k in ('original_terminal_json', 'original_terminal_digest', 'original_immutable_ack',
                    'ir_request', 'ir_terminal', 'ir_terminal_digest', 'ir_immutable_ack')), 'FAILURE_TERMINAL_NULL_ONLY')
        pinned = json.loads(row['failure_request']['S']) if 'failure_request' in row else None
        evidence = json.loads(row['failure_evidence']['S']) if 'failure_evidence' in row else None
        if pinned:
            require(pinned == r and evidence is not None
                    and validate_evidence(evidence, pinned) == row.get('failure_evidence_digest', {}).get('S'), 'FAILURE_CONTEXT_PIN')
        approvals = []
        for candidate_role in ROLES:
            prior = self.get(self.failure_approval_key(e['request_digest'], candidate_role))
            if prior:
                a = self.failure_approval(json.loads(prior['signed_event']['S']), fresh=False)
                require(a['role'] == candidate_role and a['request_digest'] == e['request_digest']
                        and a['evidence_digest'] == row.get('failure_evidence_digest', {}).get('S'), 'FAILURE_CONTEXT_APPROVAL')
                approvals.append(a)
        require(len({a['approval_run_id'] for a in approvals}) == len(approvals), 'FAILURE_CONTEXT_RUN_COLLISION')
        if 'failure_terminal' in row:
            terminal = json.loads(row['failure_terminal']['S'])
            require(row.get('failure_terminal_digest', {}).get('S') == digest(terminal)
                    and pinned == r and evidence is not None and terminal.get('request_digest') == e['request_digest']
                    and terminal.get('evidence_digest') == row.get('failure_evidence_digest', {}).get('S')
                    and terminal.get('original_state') == 'CONSUMED' and terminal.get('original_terminal_present') is False
                    and terminal.get('actual_authority_granted') is False and terminal.get('platform_closure') is False
                    and all(terminal.get(k) == v for k, v in HOLD.items()), 'FAILURE_TERMINAL_DIGEST')
            return {'state': 'FAILURE_ASSURANCE_TERMINAL_ALREADY_RECORDED', 'request': pinned, 'evidence': evidence,
                    'terminal': terminal, 'evidence_digest': row.get('failure_evidence_digest', {}).get('S'),
                    'approvals': approvals,
                    'immutable_ack': json.loads(row['failure_immutable_ack']['S']) if 'failure_immutable_ack' in row else None,
                    'write_performed': False}
        require(not any(k in row for k in ('failure_terminal_digest', 'failure_immutable_ack')), 'FAILURE_TERMINAL_PARTIAL_WRITE')
        return {'state': 'FAILURE_ASSURANCE_TERMINAL_PENDING', 'request': pinned, 'evidence': evidence,
                'evidence_digest': row.get('failure_evidence_digest', {}).get('S'), 'approvals': approvals,
                'terminal': None, 'immutable_ack': None, 'write_performed': False}

    def create_failure_approval(self, event):
        e = self.failure_approval(event); r = e['request']; row = self.get(self.key(r))
        require(row.get('state', {}).get('S') == 'CONSUMED' and row.get('run_id', {}).get('S') == r['original_run_id']
                and row.get('head_sha', {}).get('S') == r['head_sha'] and row.get('merge_sha', {}).get('S') == r['merge_sha'
                ] and 'original_terminal_json' not in row and 'original_terminal_digest' not in row
                and 'original_immutable_ack' not in row and 'repair_terminal_json' not in row
                and 'repair_terminal_digest' not in row and 'repair_immutable_ack' not in row
                and 'ir_terminal' not in row and 'ir_terminal_digest' not in row
                and 'ir_immutable_ack' not in row and 'ir_request' not in row and 'failure_terminal' not in row
                and 'failure_terminal_digest' not in row and 'failure_immutable_ack' not in row, 'FAILURE_TERMINAL_NULL_ONLY')
        require(row.get('failure_request', {}).get('S') in (None, canonical(r)), 'FAILURE_REQUEST_CONFLICT')
        require(row.get('failure_evidence_digest', {}).get('S') in (None, e['evidence_digest']), 'FAILURE_EVIDENCE_CONFLICT')
        if 'failure_request' not in row:
            try:
                self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET failure_request=:request, failure_evidence_digest=:evidence, failure_evidence=:body',
                    ConditionExpression='#state=:consumed AND run_id=:original AND head_sha=:head AND merge_sha=:merge AND attribute_not_exists(original_terminal_json) AND attribute_not_exists(original_terminal_digest) AND attribute_not_exists(original_immutable_ack) AND attribute_not_exists(ir_terminal) AND attribute_not_exists(ir_terminal_digest) AND attribute_not_exists(ir_immutable_ack) AND attribute_not_exists(ir_request) AND attribute_not_exists(failure_terminal) AND attribute_not_exists(failure_terminal_digest) AND attribute_not_exists(failure_immutable_ack) AND attribute_not_exists(failure_request)',
                    ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues={':request': {'S': canonical(r)}, ':evidence': {'S': e['evidence_digest']}, ':body': {'S': canonical(e['evidence'])}, ':consumed': {'S': 'CONSUMED'}, ':original': {'S': r['original_run_id']}, ':head': {'S': r['head_sha']}, ':merge': {'S': r['merge_sha']}})
            except Exception:
                row = self.get(self.key(r))
                require(row.get('failure_request', {}).get('S') == canonical(r)
                        and row.get('failure_evidence_digest', {}).get('S') == e['evidence_digest'], 'FAILURE_PIN_UNKNOWN_NO_RETRY')
        key = self.failure_approval_key(e['request_digest'], e['role']); prior = self.get(key)
        if prior:
            require(canonical(self.failure_approval(json.loads(prior['signed_event']['S']), fresh=False)) == canonical(e), 'FAILURE_APPROVAL_CONFLICT')
            return {'state': 'EXISTING_FAILURE_ASSURANCE_APPROVAL', 'write_performed': False}
        try:
            self.ddb.put_item(TableName=self.table, Item={**key, 'signed_event': {'S': canonical(event)}},
                              ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)')
        except Exception:
            # A lost response or concurrent exact writer is settled by a
            # consistent read of the immutable approval row. Never reissue.
            prior = self.get(key)
            require(prior.get('signed_event', {}).get('S') == canonical(event), 'FAILURE_APPROVAL_UNKNOWN_NO_RETRY')
            return {'state': 'EXISTING_FAILURE_ASSURANCE_APPROVAL', 'write_performed': False}
        return {'state': 'FAILURE_ASSURANCE_APPROVAL_STORED', 'write_performed': True}

    def finalize_failure_terminal(self, event):
        e = self.authenticate(event, 'FINALIZE_FAILED_ASSURANCE_TERMINAL_RECOVERY', ('terminal', 'evidence_digest'), fresh=False)
        r = e['request']; row = self.get(self.key(r)); t = e['terminal']
        require(row.get('state', {}).get('S') == 'CONSUMED' and row.get('run_id', {}).get('S') == r['original_run_id']
                and row.get('head_sha', {}).get('S') == r['head_sha'] and row.get('merge_sha', {}).get('S') == r['merge_sha'
                ] and row.get('failure_request', {}).get('S') == canonical(r)
                and row.get('failure_evidence_digest', {}).get('S') == e['evidence_digest']
                and not any(k in row for k in ('original_terminal_json', 'original_terminal_digest', 'original_immutable_ack',
                    'ir_request', 'ir_terminal', 'ir_terminal_digest', 'ir_immutable_ack')), 'FAILURE_FINALIZER_CONTEXT')
        evidence = json.loads(row['failure_evidence']['S'])
        require(validate_evidence(evidence, r) == e['evidence_digest'], 'FAILURE_FINALIZER_EVIDENCE')
        runs = set()
        for role in ROLES:
            approval = self.failure_approval(json.loads(self.get(self.failure_approval_key(e['request_digest'], role)).get('signed_event', {}).get('S', '{}')))
            require(approval['role'] == role and approval['request_digest'] == e['request_digest']
                    and approval['evidence_digest'] == e['evidence_digest'], 'FAILURE_FINALIZER_QUORUM')
            runs.add(approval['approval_run_id'])
        require(len(runs) == 3 and e['run_id'] not in runs, 'FAILURE_FINALIZER_RUN_COLLISION')
        terminal_fields = {'id', 'state', 'request_digest', 'evidence_digest', 'recovery_run_id', 'source_sha', 'merge_sha',
                           'original_state', 'original_terminal_present', 'actual_authority_granted', 'platform_closure'} | set(HOLD)
        require(isinstance(t, dict) and set(t) == terminal_fields
                and t['id'] == 'kidults-interrupted-failure-assurance-terminal-v1'
                and t['state'] == 'RECOVERED_FAILURE_ASSURANCE_TERMINAL_ONLY'
                and t['request_digest'] == e['request_digest'] and t['evidence_digest'] == e['evidence_digest']
                and t['recovery_run_id'] == e['run_id'] and t['source_sha'] == r['source_sha'] and t['merge_sha'] == r['merge_sha']
                and t['original_state'] == 'CONSUMED' and t['original_terminal_present'] is False
                and t['actual_authority_granted'] is False and t['platform_closure'] is False
                and all(t.get(k) == v for k, v in HOLD.items()), 'FAILURE_TERMINAL')
        if 'failure_terminal' in row:
            require(row['failure_terminal']['S'] == canonical(t), 'FAILURE_TERMINAL_CONFLICT')
            return {'state': 'FAILURE_ASSURANCE_TERMINAL_RECONCILED', 'terminal_digest': digest(t), 'write_performed': False}
        result = self.ddb.update_item(TableName=self.table, Key=self.key(r),
            UpdateExpression='SET failure_terminal=:terminal, failure_terminal_digest=:digest',
            ConditionExpression='#state=:consumed AND run_id=:original AND head_sha=:head AND merge_sha=:merge AND failure_request=:request AND failure_evidence_digest=:evidence AND attribute_not_exists(original_terminal_json) AND attribute_not_exists(original_terminal_digest) AND attribute_not_exists(original_immutable_ack) AND attribute_not_exists(ir_request) AND attribute_not_exists(ir_terminal) AND attribute_not_exists(ir_terminal_digest) AND attribute_not_exists(ir_immutable_ack) AND attribute_not_exists(failure_terminal) AND attribute_not_exists(failure_terminal_digest) AND attribute_not_exists(failure_immutable_ack)',
            ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues={':consumed': {'S': 'CONSUMED'}, ':original': {'S': r['original_run_id']}, ':head': {'S': r['head_sha']}, ':merge': {'S': r['merge_sha']}, ':request': {'S': canonical(r)}, ':evidence': {'S': e['evidence_digest']}, ':terminal': {'S': canonical(t)}, ':digest': {'S': digest(t)}}, ReturnValues='ALL_NEW')
        attrs = result.get('Attributes', {})
        require(attrs.get('state', {}).get('S') == 'CONSUMED' and attrs.get('run_id', {}).get('S') == r['original_run_id']
                and attrs.get('merge_sha', {}).get('S') == r['merge_sha'] and attrs.get('failure_terminal', {}).get('S') == canonical(t)
                and attrs.get('failure_terminal_digest', {}).get('S') == digest(t), 'FAILURE_TERMINAL_READBACK')
        return {'state': 'FAILURE_ASSURANCE_TERMINAL_RECORDED', 'terminal_digest': digest(t), 'write_performed': True}

    def acknowledge_failure_terminal(self, event):
        e = self.authenticate(event, 'ACK_FAILED_ASSURANCE_TERMINAL_IMMUTABLE', ('object',), fresh=False)
        r = e['request']; row = self.get(self.key(r)); o = e['object']
        require(row.get('state', {}).get('S') == 'CONSUMED' and row.get('run_id', {}).get('S') == r['original_run_id'
                ] and row.get('failure_request', {}).get('S') == canonical(r) and 'failure_terminal' in row, 'FAILURE_ACK_CONTEXT')
        t = json.loads(row['failure_terminal']['S']); td = row['failure_terminal_digest']['S']
        require(td == digest(t) and isinstance(o, dict) and set(o) == {'bucket', 'key', 'version_id', 'sha256', 'retention_mode', 'retain_until', 'encryption_key_arn'}
                and o['bucket'] == self.bucket and o['key'] == self.failure_object_key(r) and isinstance(o['version_id'], str)
                and 0 < len(o['version_id']) <= 1024 and o['sha256'] == td and o['retention_mode'] == 'COMPLIANCE'
                and o['encryption_key_arn'] == self.receipt_key and epoch(o['retain_until']) >= retention_horizon(r['issued_at']), 'FAILURE_IMMUTABLE_BINDING')
        if 'failure_immutable_ack' in row:
            require(row['failure_immutable_ack']['S'] == canonical(o), 'FAILURE_IMMUTABLE_CONFLICT')
            return {'state': 'FAILURE_ASSURANCE_IMMUTABLE_ACKNOWLEDGED', 'write_performed': False}
        self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET failure_immutable_ack=:object',
            ConditionExpression='#state=:consumed AND run_id=:original AND failure_request=:request AND failure_terminal_digest=:digest AND attribute_not_exists(failure_immutable_ack)',
            ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues={':consumed': {'S': 'CONSUMED'}, ':original': {'S': r['original_run_id']}, ':request': {'S': canonical(r)}, ':digest': {'S': td}, ':object': {'S': canonical(o)}}, ReturnValues='ALL_NEW')
        require(self.get(self.key(r)).get('failure_immutable_ack', {}).get('S') == canonical(o), 'FAILURE_IMMUTABLE_ACK_READBACK')
        return {'state': 'FAILURE_ASSURANCE_IMMUTABLE_ACKNOWLEDGED', 'write_performed': True}

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

    def read_context(self, event):
        # Existing signed workload, exact original reservation Get only.
        e = event.get('envelope', {})
        role = e.get('role')
        require(role in self.roles or role == 'FINALIZER', 'CONTEXT_ROLE')
        self.verify(event, self.finalizer if role == 'FINALIZER' else self.roles[role])
        require(set(e) == {'action', 'request', 'request_digest', 'role', 'run_id', 'run_attempt', 'workload'} and e['action'] == 'READ_MERGED_RECOVERY_CONTEXT', 'CONTEXT_FIELDS')
        r = e['request']
        require(validate_request(r, self.now(), False) == e['request_digest'] and isinstance(e['run_id'], str) and RUN.fullmatch(e['run_id']) and e['run_id'] != r['original_run_id'] and type(e['run_attempt']) is int and e['run_attempt'] == 1, 'CONTEXT_BINDING')
        row = self.get(self.key(r))
        if not row:
            return {'state': 'ORIGINAL_RESERVATION_MISSING', 'write_performed': False}
        require(row.get('run_id', {}).get('S') == r['original_run_id'] and row.get('head_sha', {}).get('S') == r['head_sha'] and row.get('state', {}).get('S') in ('RESERVED', 'CONSUMED'), 'CONTEXT_RESERVATION')
        if row['state']['S'] == 'CONSUMED' and 'ir_request' not in row:
            if 'repair_terminal_json' in row:
                evidence, ed, terminal, _, ack = self.validate_repair_row(row, r)
                return {'state': 'ORIGINAL_TERMINAL_DEBT_ONLY', 'terminal': terminal,
                        'request': r, 'evidence': evidence, 'evidence_digest': ed, 'immutable_ack': ack,
                        'write_performed': False}
            if 'original_terminal_json' in row:
                terminal = json.loads(row['original_terminal_json']['S'])
                require(validate_original_terminal(terminal, r) == row.get('original_terminal_digest', {}).get('S') and row.get('merge_sha', {}).get('S') == r['merge_sha'], 'ORIGINAL_STORED_TERMINAL')
                return {'state': 'ORIGINAL_CONSUMED_TERMINAL_ARCHIVE_PENDING', 'terminal': terminal, 'immutable_ack': json.loads(row['original_immutable_ack']['S']) if 'original_immutable_ack' in row else None, 'write_performed': False}
            return {'state': 'ORIGINAL_CORE_CONSUMED_ARCHIVE_RECONCILIATION_REQUIRED', 'write_performed': False}
        pinned = json.loads(row['ir_request']['S']) if 'ir_request' in row else None
        if pinned:
            validate_request(pinned, self.now(), False)
            require(all(pinned[k] == r[k] for k in REQUEST_FIELDS - {'source_sha', 'issued_at', 'expires_at'}), 'CONTEXT_ORIGINAL_IDENTITY')
        approval = None
        if pinned and role in self.roles:
            prior = self.get({'pk': {'S': 'AUTH#POSTMERGE#' + digest(pinned)}, 'sk': {'S': 'ROLE#' + role}})
            if prior:
                approval = self.approval(json.loads(prior['signed_event']['S']), fresh=False)
                require(approval['role'] == role and approval['request_digest'] == digest(pinned) and approval['evidence_digest'] == row.get('ir_evidence_digest', {}).get('S'), 'CONTEXT_APPROVAL')
        evidence = json.loads(row['ir_evidence']['S']) if 'ir_evidence' in row else None
        if evidence:
            require(pinned is not None and validate_evidence(evidence, pinned) == row.get('ir_evidence_digest', {}).get('S'), 'CONTEXT_EVIDENCE')
            require('evidence_profile' not in evidence, 'NORMAL_RECOVERY_FAILURE_EVIDENCE_FORBIDDEN')
        candidate_approvals = []
        candidate_evidence = None
        for candidate_role in ROLES:
            prior = self.get({'pk': {'S': 'AUTH#POSTMERGE#' + digest(r)}, 'sk': {'S': 'ROLE#' + candidate_role}})
            if prior:
                a = self.approval(json.loads(prior['signed_event']['S']), fresh=False)
                require(a['role'] == candidate_role and a['request_digest'] == digest(r), 'CONTEXT_CANDIDATE_APPROVAL')
                if candidate_evidence is None:
                    candidate_evidence = a['evidence']
                require(canonical(candidate_evidence) == canonical(a['evidence']), 'CONTEXT_CANDIDATE_EVIDENCE')
                candidate_approvals.append(a)
        require(len({a['approval_run_id'] for a in candidate_approvals}) == len(candidate_approvals), 'CONTEXT_CANDIDATE_COLLISION')
        return {'state': row['state']['S'], 'request': pinned, 'evidence': evidence, 'approval': approval, 'candidate_approvals': candidate_approvals, 'candidate_evidence': candidate_evidence, 'immutable_ack': json.loads(row['ir_immutable_ack']['S']) if 'ir_immutable_ack' in row else None, 'write_performed': False}

    def create_approval(self, event):
        e = self.approval(event); r = e['request']; row = self.get(self.key(r))
        staged = row.get('ir_request', {}).get('S') not in (None, canonical(r))
        if staged:
            self.supersession_context(r)
        else:
            row = self.reservation(r)
            require(row['state']['S'] == 'RESERVED', 'ALREADY_CONSUMED')
            if 'ir_request' not in row:
                self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET ir_request=:request, ir_evidence_digest=:evidence, ir_evidence=:body', ConditionExpression='#state=:reserved AND run_id=:original AND head_sha=:head AND attribute_not_exists(ir_request)', ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues={':request': {'S': canonical(r)}, ':evidence': {'S': e['evidence_digest']}, ':body': {'S': canonical(e['evidence'])}, ':reserved': {'S': 'RESERVED'}, ':original': {'S': r['original_run_id']}, ':head': {'S': r['head_sha']}})
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
        values = {':reserved': {'S': 'RESERVED'}, ':original': {'S': r['original_run_id']}, ':head': {'S': r['head_sha']}, ':old': {'S': canonical(old)}, ':old_evidence': row['ir_evidence_digest'], ':request': {'S': canonical(r)}, ':evidence': {'S': e['evidence_digest']}, ':body': {'S': canonical(new['evidence'])}, ':count': {'N': str(count + 1)}}
        if count: values[':oldcount'] = {'N': str(count)}
        if 'ir_lease_until' in row:
            condition += ' AND ir_lease_until<=:now'
            values[':now'] = {'N': str(self.now())}
        else:
            condition += ' AND attribute_not_exists(ir_lease_until)'
        result = self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET ir_request=:request, ir_evidence_digest=:evidence, ir_evidence=:body, ir_supersessions=:count', ConditionExpression='#state=:reserved AND run_id=:original AND head_sha=:head AND ir_request=:old AND ir_evidence_digest=:old_evidence AND attribute_not_exists(ir_terminal) AND attribute_not_exists(ir_terminal_digest) AND ' + condition, ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues=values, ReturnValues='ALL_NEW')
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

    def acknowledge_original(self, event):
        e = self.authenticate(event, 'ACK_ORIGINAL_TERMINAL_IMMUTABLE', ('object',), fresh=False)
        r = e['request']; row = self.get(self.key(r))
        require(row.get('state', {}).get('S') == 'CONSUMED' and row.get('run_id', {}).get('S') == r['original_run_id'] and row.get('head_sha', {}).get('S') == r['head_sha'] and row.get('merge_sha', {}).get('S') == r['merge_sha'] and 'ir_request' not in row, 'ORIGINAL_ACK_RESERVATION')
        t = json.loads(row.get('original_terminal_json', {}).get('S', '{}'))
        require(validate_original_terminal(t, r) == row.get('original_terminal_digest', {}).get('S'), 'ORIGINAL_ACK_TERMINAL')
        envelope = {'id': 'kidults-autonomous-internal-landing-immutable-envelope-v1', 'version': '1.0.0', 'receipt': t, 'receipt_sha256': digest(t), 'production': 'HOLD', 'public': 'HOLD', 'g5': 'HOLD'}
        body_digest = 'sha256:' + hashlib.sha256((canonical(envelope) + '\n').encode()).hexdigest()
        o = e['object']
        require(isinstance(o, dict) and set(o) == {'bucket', 'key', 'version_id', 'sha256', 'retention_mode', 'retain_until', 'encryption_key_arn'} and o['bucket'] == self.bucket and o['key'] == 'receipts/' + r['original_generation'] + '/' + r['merge_sha'] + '/terminal.json' and isinstance(o['version_id'], str) and 0 < len(o['version_id']) <= 1024 and o['sha256'] == body_digest and o['retention_mode'] == 'COMPLIANCE' and o['encryption_key_arn'] == self.receipt_key and epoch(o['retain_until']) >= retention_horizon(t['created_at']), 'ORIGINAL_ACK_OBJECT')
        if 'original_immutable_ack' in row:
            require(row['original_immutable_ack']['S'] == canonical(o), 'ORIGINAL_ACK_CONFLICT')
            return {'state': 'ORIGINAL_IMMUTABLE_ACKNOWLEDGED', 'write_performed': False}
        saved = self.ddb.update_item(TableName=self.table, Key=self.key(r), UpdateExpression='SET original_immutable_ack=:object', ConditionExpression='#state=:consumed AND run_id=:original AND original_terminal_digest=:digest AND attribute_not_exists(original_immutable_ack)', ExpressionAttributeNames={'#state': 'state'}, ExpressionAttributeValues={':consumed': {'S': 'CONSUMED'}, ':original': {'S': r['original_run_id']}, ':digest': {'S': t['receipt_digest']}, ':object': {'S': canonical(o)}}, ReturnValues='ALL_NEW').get('Attributes', {})
        require(all(saved.get(k) == row.get(k) for k in ('pk', 'sk', 'state', 'run_id', 'head_sha', 'merge_sha', 'original_terminal_digest', 'original_terminal_json')) and saved.get('original_immutable_ack', {}).get('S') == canonical(o), 'ORIGINAL_ACK_READBACK')
        return {'state': 'ORIGINAL_IMMUTABLE_ACKNOWLEDGED', 'write_performed': True}
